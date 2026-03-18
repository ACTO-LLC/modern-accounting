#!/usr/bin/env node
/**
 * One-time sync: Pull QBO transaction categorizations into MA bank transactions.
 *
 * Matches QBO Purchases to MA BankTransactions by date + absolute amount,
 * then sets ApprovedAccountId from the QBO expense account mapping.
 *
 * Usage:
 *   node scripts/sync-qbo-categorizations.js [--dry-run] [--verbose]
 *
 * Requires:
 *   - QBO MCP server running at localhost:8001 with tokens injected
 *   - SQL connection (uses chat-api/.env or env vars)
 */

const sql = require(require('path').resolve(__dirname, '..', 'chat-api', 'node_modules', 'mssql'));
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const QBO_MCP_URL = 'http://localhost:8001';
const CUTOFF_DATE = '2026-02-23';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// ── QBO MCP Client ──────────────────────────────────────────────────────────
let mcpSessionId = null;

async function mcpInit() {
    const resp = await fetch(`${QBO_MCP_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sync-script', version: '1.0' } }
        })
    });
    mcpSessionId = resp.headers.get('mcp-session-id');
    if (!mcpSessionId) throw new Error('Failed to get MCP session ID');
    console.log(`  MCP session: ${mcpSessionId}`);
}

async function mcpQuery(entity, criteria, fetchAll = false) {
    const resp = await fetch(`${QBO_MCP_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'MCP-Session-Id': mcpSessionId },
        body: JSON.stringify({
            jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
            params: { name: 'qbo_query', arguments: { entity, criteria, fetchAll } }
        })
    });
    const text = await resp.text();
    // Parse SSE response — records may be in result.data array or result.content[0].text
    const lines = text.split('\n').filter(l => l.startsWith('data: '));
    for (const line of lines) {
        try {
            const parsed = JSON.parse(line.replace('data: ', ''));
            // Check for data array first (fetchAll responses)
            if (parsed.result?.data && Array.isArray(parsed.result.data)) {
                return parsed.result.data;
            }
            if (parsed.result?.content?.[0]?.text) {
                return parsed.result.content[0].text;
            }
        } catch { /* skip */ }
    }
    return '';
}

function parseQboRecords(text) {
    // The MCP returns a header line then JSON objects on separate lines
    const records = [];
    const jsonRegex = /\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}/g;
    // Split by top-level JSON objects more carefully
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start >= 0) {
                try {
                    records.push(JSON.parse(text.substring(start, i + 1)));
                } catch { /* skip malformed */ }
                start = -1;
            }
        }
    }
    return records;
}

// ── SQL Connection ──────────────────────────────────────────────────────────
async function getSqlPool() {
    // Try to load from chat-api/.env
    const envPath = path.resolve(__dirname, '..', 'chat-api', '.env');
    try {
        const envContent = require('fs').readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
            const match = line.match(/^([^#=]+)=(.+)$/);
            if (match) process.env[match[1].trim()] = process.env[match[1].trim()] || match[2].trim();
        }
    } catch { /* use existing env */ }

    // Use same connection as switch-mcp reads from .mcp.json
    const mcpJsonPath = path.resolve(__dirname, '..', '.mcp.json');
    const mcpConfig = JSON.parse(require('fs').readFileSync(mcpJsonPath, 'utf-8'));
    const env = mcpConfig.mcpServers?.mssql?.env || {};

    let server = env.MSSQL_HOST || 'localhost,14330';
    let port = 1433;
    if (server.includes(',')) {
        const [s, p] = server.split(',');
        server = s;
        port = parseInt(p, 10);
    }

    return sql.connect({
        server,
        port,
        database: env.MSSQL_DATABASE || 'AccountingDB',
        user: env.MSSQL_USER || 'sa',
        password: env.MSSQL_PASSWORD || 'StrongPassword123',
        options: {
            encrypt: true,
            trustServerCertificate: server === 'localhost' || server === '127.0.0.1'
        },
        requestTimeout: 60000
    });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n=== Sync QBO Categorizations → MA Bank Transactions ===`);
    console.log(`  Cutoff date: ${CUTOFF_DATE}`);
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

    // 1. Connect to QBO MCP
    console.log('1. Connecting to QBO MCP...');
    await mcpInit();

    // 2. Connect to SQL
    console.log('2. Connecting to SQL...');
    const pool = await getSqlPool();
    console.log('  Connected.\n');

    // 3. Load MA account mapping (QBO SourceId → MA Account Id)
    console.log('3. Loading account mapping (QBO → MA)...');
    const accountResult = await pool.request().query(`
        SELECT Id, Code, Name, SourceId FROM Accounts WHERE SourceId IS NOT NULL
    `);
    const accountMap = {};  // QBO account id → MA account id
    for (const row of accountResult.recordset) {
        accountMap[row.SourceId] = { id: row.Id, code: row.Code, name: row.Name };
    }
    console.log(`  ${Object.keys(accountMap).length} accounts with QBO mapping.\n`);

    // 4. Load uncategorized MA bank transactions through cutoff
    console.log('4. Loading uncategorized MA bank transactions...');
    const btResult = await pool.request().query(`
        SELECT Id, TransactionDate, Amount, Description, Merchant, Status,
               ApprovedAccountId, SuggestedAccountId, SourceAccountId
        FROM BankTransactions
        WHERE TransactionDate <= '${CUTOFF_DATE}'
          AND ApprovedAccountId IS NULL
          AND Status = 'Pending'
        ORDER BY TransactionDate, Amount
    `);
    const bankTxns = btResult.recordset;
    console.log(`  ${bankTxns.length} uncategorized transactions.\n`);

    if (bankTxns.length === 0) {
        console.log('  Nothing to sync!');
        await pool.close();
        return;
    }

    // 5. Build a lookup index for MA transactions: date+amount → [transactions]
    //    Amount in MA may be negative (debits) or positive (credits)
    const btIndex = {};
    for (const bt of bankTxns) {
        const date = bt.TransactionDate instanceof Date
            ? bt.TransactionDate.toISOString().slice(0, 10)
            : String(bt.TransactionDate).slice(0, 10);
        const absAmt = Math.abs(parseFloat(bt.Amount)).toFixed(2);
        const key = `${date}|${absAmt}`;
        if (!btIndex[key]) btIndex[key] = [];
        btIndex[key].push(bt);
    }

    // 6. Fetch QBO Purchases through cutoff date
    console.log('5. Fetching QBO Purchases...');
    const purchaseResult = await mcpQuery('Purchase', [
        { field: 'TxnDate', operator: '<=', value: CUTOFF_DATE }
    ], true);
    const purchases = Array.isArray(purchaseResult) ? purchaseResult : parseQboRecords(purchaseResult);
    console.log(`  ${purchases.length} QBO purchases fetched.\n`);

    // 7. Match and build updates
    console.log('6. Matching QBO purchases → MA bank transactions...');
    let matched = 0, skipped = 0, noAccount = 0, noMatch = 0;
    const updates = [];

    for (const purchase of purchases) {
        const txnDate = purchase.TxnDate;
        const totalAmt = parseFloat(purchase.TotalAmt || 0).toFixed(2);
        const key = `${txnDate}|${totalAmt}`;

        // Find matching MA bank transaction
        const candidates = btIndex[key];
        if (!candidates || candidates.length === 0) {
            noMatch++;
            if (VERBOSE) console.log(`  NO MATCH: ${txnDate} $${totalAmt}`);
            continue;
        }

        // Get the expense account from QBO Line items
        let expenseAccountQboId = null;
        const lines = purchase.Line || [];
        for (const line of lines) {
            const detail = line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail;
            if (detail?.AccountRef?.value) {
                expenseAccountQboId = detail.AccountRef.value;
                break;  // Use first line's account
            }
        }

        if (!expenseAccountQboId) {
            skipped++;
            if (VERBOSE) console.log(`  NO EXPENSE ACCT: QBO ${purchase.Id} ${txnDate} $${totalAmt}`);
            continue;
        }

        const maAccount = accountMap[expenseAccountQboId];
        if (!maAccount) {
            noAccount++;
            if (VERBOSE) console.log(`  UNMAPPED ACCT: QBO account ${expenseAccountQboId} for ${txnDate} $${totalAmt}`);
            continue;
        }

        // Take the first unmatched candidate
        const bt = candidates.shift();
        if (candidates.length === 0) delete btIndex[key];

        updates.push({
            bankTxnId: bt.Id,
            approvedAccountId: maAccount.id,
            approvedCategory: maAccount.name,
            date: txnDate,
            amount: totalAmt,
            accountCode: maAccount.code,
            accountName: maAccount.name
        });
        matched++;
    }

    console.log(`\n  Results:`);
    console.log(`    Matched:          ${matched}`);
    console.log(`    No MA match:      ${noMatch}`);
    console.log(`    No expense acct:  ${skipped}`);
    console.log(`    Unmapped account: ${noAccount}`);
    console.log();

    if (updates.length === 0) {
        console.log('  No updates to apply.');
        await pool.close();
        return;
    }

    // 8. Apply updates
    if (DRY_RUN) {
        console.log(`7. DRY RUN — would update ${updates.length} bank transactions:`);
        for (const u of updates.slice(0, 20)) {
            console.log(`    ${u.date} $${u.amount} → ${u.accountCode} ${u.accountName}`);
        }
        if (updates.length > 20) console.log(`    ... and ${updates.length - 20} more`);
    } else {
        console.log(`7. Applying ${updates.length} updates...`);
        let applied = 0;
        for (const u of updates) {
            await pool.request()
                .input('id', sql.UniqueIdentifier, u.bankTxnId)
                .input('accountId', sql.UniqueIdentifier, u.approvedAccountId)
                .input('category', sql.NVarChar, u.approvedCategory)
                .query(`
                    UPDATE BankTransactions
                    SET ApprovedAccountId = @accountId,
                        ApprovedCategory = @category,
                        Status = 'Approved',
                        ReviewedDate = GETUTCDATE()
                    WHERE Id = @id AND ApprovedAccountId IS NULL
                `);
            applied++;
            if (applied % 50 === 0) process.stdout.write(`  ${applied}/${updates.length}\r`);
        }
        console.log(`  Done. ${applied} transactions updated.`);
    }

    await pool.close();
    console.log('\nComplete!\n');
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
});
