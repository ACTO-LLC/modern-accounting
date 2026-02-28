/**
 * Analyze QBO Invoices for Migration
 *
 * Pulls all invoices from QBO (2025+) and compares against MA to find missing ones.
 * Dumps full QBO invoice data to JSON for inspection.
 *
 * Usage:
 *   node scripts/analyze-qbo-invoices.js
 *
 * Requires:
 *   SQL_CONNECTION_STRING - Production SQL connection string
 *     (or will prompt for connection details)
 *
 * What it does:
 *   1. Reads QBO OAuth tokens from production QBOConnections table
 *   2. Fetches all QBO invoices with TxnDate >= 2025-01-01
 *   3. Fetches all QBO payments
 *   4. Reads existing MA invoices with SourceSystem='QBO'
 *   5. Compares and reports what's missing
 *   6. Dumps QBO data to scripts/output/ for inspection
 */

const sql = require('mssql');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================================
// Helpers
// ============================================================================

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => { rl.close(); resolve(answer); });
    });
}

function parseConnectionString(connectionString) {
    const parts = {};
    for (const part of connectionString.split(';')) {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key.trim().toLowerCase()] = valueParts.join('=').trim();
        }
    }

    let server = parts['server'] || parts['data source'] || 'localhost';
    let port = 1433;
    if (server.startsWith('tcp:')) server = server.substring(4);
    if (server.includes(',')) {
        const [host, portStr] = server.split(',');
        server = host;
        port = parseInt(portStr, 10);
    }

    return {
        server, port,
        database: parts['database'] || parts['initial catalog'] || 'AccountingDB',
        user: parts['user id'] || parts['uid'] || 'sa',
        password: parts['password'] || parts['pwd'] || '',
        options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
    };
}

/**
 * Refresh QBO access token using refresh token
 */
async function refreshQboToken(pool, qboConn) {
    const clientId = process.env.QBO_CLIENT_ID;
    const clientSecret = process.env.QBO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('QBO_CLIENT_ID and QBO_CLIENT_SECRET env vars required for token refresh');
    }

    console.log('  Refreshing QBO access token...');
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(qboConn.RefreshToken)}`;

    return new Promise((resolve, reject) => {
        const req = https.request('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Token refresh failed (${res.statusCode}): ${data}`));
                    return;
                }
                try {
                    const tokens = JSON.parse(data);
                    const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

                    // Update database
                    await pool.request()
                        .input('token', sql.NVarChar, tokens.access_token)
                        .input('refresh', sql.NVarChar, tokens.refresh_token || qboConn.RefreshToken)
                        .input('expiry', sql.DateTime2, newExpiry)
                        .input('id', sql.NVarChar, qboConn.Id)
                        .query(`UPDATE QBOConnections
                                SET AccessToken = @token, RefreshToken = @refresh,
                                    TokenExpiry = @expiry, LastUsedAt = GETUTCDATE(), UpdatedAt = GETUTCDATE()
                                WHERE Id = @id`);

                    console.log(`  Token refreshed, new expiry: ${newExpiry.toISOString()}\n`);
                    resolve(tokens.access_token);
                } catch (e) {
                    reject(new Error(`Failed to parse token response: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Make a QBO API call
 */
function qboApiCall(realmId, accessToken, queryString) {
    const encoded = encodeURIComponent(queryString);
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encoded}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 401) {
                    reject(new Error('TOKEN_EXPIRED'));
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`QBO API returned ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse QBO response: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
    });
}

/**
 * Fetch all records with pagination from QBO
 */
async function qboFetchAll(realmId, accessToken, entityType, whereClause = '') {
    const allRecords = [];
    const pageSize = 1000;
    let startPosition = 1;
    let hasMore = true;

    while (hasMore) {
        const query = `SELECT * FROM ${entityType}${whereClause} MAXRESULTS ${pageSize} STARTPOSITION ${startPosition}`;
        console.log(`  Fetching ${entityType} (offset ${startPosition})...`);

        const result = await qboApiCall(realmId, accessToken, query);
        const records = result?.QueryResponse?.[entityType] || [];
        allRecords.push(...records);

        if (records.length < pageSize) {
            hasMore = false;
        } else {
            startPosition += pageSize;
        }
    }

    return allRecords;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('==============================================');
    console.log('QBO Invoice Analysis for Migration');
    console.log('==============================================\n');

    // 1. Connect to production SQL
    let connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) {
        console.log('SQL_CONNECTION_STRING not set. Please provide connection details:');
        const server = await prompt('Server (e.g., sql-modern-accounting-prod.database.windows.net): ');
        const database = await prompt('Database [AccountingDB]: ') || 'AccountingDB';
        const user = await prompt('User: ');
        const password = await prompt('Password: ');
        connectionString = `Server=tcp:${server},1433;Database=${database};User ID=${user};Password=${password};Encrypt=true;TrustServerCertificate=false;`;
    }

    const config = parseConnectionString(connectionString);
    console.log(`Connecting to ${config.server}/${config.database}...`);
    const pool = await sql.connect(config);
    console.log('Connected.\n');

    try {
        // 2. Get QBO connection (tokens)
        console.log('--- Step 1: Get QBO Connection ---');
        const qboResult = await pool.request().query(
            `SELECT TOP 1 Id, RealmId, AccessToken, RefreshToken, TokenExpiry, CompanyName
             FROM QBOConnections
             WHERE IsActive = 1
             ORDER BY LastUsedAt DESC`
        );

        if (qboResult.recordset.length === 0) {
            console.error('No active QBO connection found in production database.');
            return;
        }

        const qboConn = qboResult.recordset[0];
        console.log(`  Company: ${qboConn.CompanyName}`);
        console.log(`  RealmId: ${qboConn.RealmId}`);
        console.log(`  Token Expiry: ${qboConn.TokenExpiry}`);

        let accessToken = qboConn.AccessToken;
        const tokenExpiry = new Date(qboConn.TokenExpiry + 'Z');
        if (tokenExpiry < new Date()) {
            console.warn(`\n  Token expired at ${tokenExpiry.toISOString()}`);
            accessToken = await refreshQboToken(pool, qboConn);
        } else {
            console.log(`  Token valid for ${Math.round((tokenExpiry - new Date()) / 60000)} more minutes.\n`);
        }

        // 3. Fetch QBO invoices (2025+)
        console.log('--- Step 2: Fetch QBO Invoices (2025+) ---');
        const qboInvoices = await qboFetchAll(
            qboConn.RealmId,
            accessToken,
            'Invoice',
            ` WHERE TxnDate >= '2025-01-01'`
        );
        console.log(`  Found ${qboInvoices.length} QBO invoices from 2025+\n`);

        // 4. Fetch QBO payments
        console.log('--- Step 3: Fetch QBO Payments (2025+) ---');
        const qboPayments = await qboFetchAll(
            qboConn.RealmId,
            accessToken,
            'Payment',
            ` WHERE TxnDate >= '2025-01-01'`
        );
        console.log(`  Found ${qboPayments.length} QBO payments from 2025+\n`);

        // 5. Get existing MA invoices with QBO source
        console.log('--- Step 4: Check Existing MA Invoices ---');
        const maResult = await pool.request().query(
            `SELECT Id, InvoiceNumber, SourceSystem, SourceId, TotalAmount, Status, IssueDate
             FROM Invoices
             WHERE SourceSystem = 'QBO'
             ORDER BY InvoiceNumber`
        );
        const maInvoices = maResult.recordset;
        console.log(`  Found ${maInvoices.length} MA invoices with SourceSystem='QBO'\n`);

        // Also get all MA invoices to check by invoice number
        const maAllResult = await pool.request().query(
            `SELECT Id, InvoiceNumber, SourceSystem, SourceId, TotalAmount, Status, IssueDate
             FROM Invoices
             ORDER BY InvoiceNumber`
        );
        const maAllInvoices = maAllResult.recordset;
        console.log(`  Found ${maAllInvoices.length} total MA invoices\n`);

        // 6. Compare
        console.log('--- Step 5: Analysis ---\n');

        // Build lookup sets
        const maSourceIds = new Set(maInvoices.map(i => i.SourceId));
        const maInvoiceNumbers = new Set(maAllInvoices.map(i => i.InvoiceNumber));

        const missing = [];
        const existing = [];

        for (const inv of qboInvoices) {
            const qboId = inv.Id;
            const docNumber = inv.DocNumber || '';
            const balance = parseFloat(inv.Balance) || 0;
            const total = parseFloat(inv.TotalAmt) || 0;

            if (maSourceIds.has(qboId) || maSourceIds.has(String(qboId))) {
                existing.push({ qboId, docNumber, total, balance, status: 'matched_by_source_id' });
            } else if (maInvoiceNumbers.has(docNumber)) {
                existing.push({ qboId, docNumber, total, balance, status: 'matched_by_invoice_number' });
            } else {
                missing.push(inv);
            }
        }

        console.log(`  QBO invoices (2025+):      ${qboInvoices.length}`);
        console.log(`  Already in MA (by ID):     ${existing.filter(e => e.status === 'matched_by_source_id').length}`);
        console.log(`  Already in MA (by number): ${existing.filter(e => e.status === 'matched_by_invoice_number').length}`);
        console.log(`  MISSING from MA:           ${missing.length}`);
        console.log();

        // Payment analysis
        const paidInFull = missing.filter(inv => (parseFloat(inv.Balance) || 0) === 0);
        const unpaid = missing.filter(inv => (parseFloat(inv.Balance) || 0) > 0);
        const partiallyPaid = missing.filter(inv => {
            const balance = parseFloat(inv.Balance) || 0;
            const total = parseFloat(inv.TotalAmt) || 0;
            return balance > 0 && balance < total;
        });

        console.log('  --- Payment Status of Missing Invoices ---');
        console.log(`  Paid in full (Balance=0): ${paidInFull.length}`);
        console.log(`  Unpaid/partial:           ${unpaid.length}`);
        if (partiallyPaid.length > 0) {
            console.log(`  (Partially paid):         ${partiallyPaid.length}`);
            for (const inv of partiallyPaid) {
                console.log(`    ${inv.DocNumber}: Total=$${inv.TotalAmt}, Balance=$${inv.Balance}`);
            }
        }
        console.log();

        // Analyze tax line items
        console.log('  --- Tax Line Item Analysis ---');
        let invoicesWithTaxLine = 0;
        let invoicesWithoutTaxLine = 0;
        const taxLinePatterns = new Map();

        for (const inv of missing) {
            const lines = inv.Line || [];
            const taxLines = lines.filter(l =>
                l.DetailType === 'SalesItemLineDetail' &&
                (
                    (l.Description || '').toLowerCase().includes('tax') ||
                    (l.SalesItemLineDetail?.ItemRef?.name || '').toLowerCase().includes('tax')
                )
            );

            if (taxLines.length > 0) {
                invoicesWithTaxLine++;
                for (const tl of taxLines) {
                    const itemName = tl.SalesItemLineDetail?.ItemRef?.name || tl.Description || 'Unknown';
                    const amount = tl.Amount || 0;
                    const key = itemName;
                    if (!taxLinePatterns.has(key)) {
                        taxLinePatterns.set(key, { name: itemName, count: 0, amounts: [] });
                    }
                    taxLinePatterns.get(key).count++;
                    taxLinePatterns.get(key).amounts.push(amount);
                }
            } else {
                invoicesWithoutTaxLine++;
            }
        }

        console.log(`  Invoices WITH tax line items:    ${invoicesWithTaxLine}`);
        console.log(`  Invoices WITHOUT tax line items: ${invoicesWithoutTaxLine}`);
        if (taxLinePatterns.size > 0) {
            console.log('  Tax line patterns found:');
            for (const [key, info] of taxLinePatterns) {
                console.log(`    "${info.name}" - used ${info.count} times, amounts: ${info.amounts.map(a => '$' + a).join(', ')}`);
            }
        }
        console.log();

        // List missing invoices
        if (missing.length > 0) {
            console.log('  --- Missing Invoices Detail ---');
            const totalMissing = missing.reduce((sum, inv) => sum + (parseFloat(inv.TotalAmt) || 0), 0);
            console.log(`  Total value: $${totalMissing.toFixed(2)}\n`);

            for (const inv of missing) {
                const lines = (inv.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail');
                const balance = parseFloat(inv.Balance) || 0;
                const paid = balance === 0 ? 'PAID' : `BALANCE: $${balance}`;
                const customer = inv.CustomerRef?.name || 'Unknown';
                console.log(`  ${inv.DocNumber || '(no number)'} | ${inv.TxnDate} | ${customer} | $${inv.TotalAmt} | ${paid} | ${lines.length} lines`);
            }
            console.log();
        }

        // Referenced customers analysis
        console.log('  --- Referenced Customers ---');
        const customerRefs = new Map();
        for (const inv of missing) {
            const ref = inv.CustomerRef;
            if (ref) {
                customerRefs.set(ref.value, ref.name);
            }
        }
        console.log(`  Unique customers: ${customerRefs.size}`);

        // Check which customers exist in MA
        if (customerRefs.size > 0) {
            const customerIds = Array.from(customerRefs.keys());
            const maCustomerResult = await pool.request().query(
                `SELECT Id, Name, SourceSystem, SourceId
                 FROM Customers
                 WHERE SourceSystem = 'QBO' AND SourceId IN (${customerIds.map(id => `'${id}'`).join(',')})`
            );
            const maCustomers = maCustomerResult.recordset;
            const maCustomerSourceIds = new Set(maCustomers.map(c => c.SourceId));

            const missingCustomers = [];
            for (const [id, name] of customerRefs) {
                if (!maCustomerSourceIds.has(id) && !maCustomerSourceIds.has(String(id))) {
                    missingCustomers.push({ id, name });
                }
            }

            console.log(`  Already in MA: ${maCustomers.length}`);
            console.log(`  Missing from MA: ${missingCustomers.length}`);
            if (missingCustomers.length > 0) {
                for (const c of missingCustomers) {
                    console.log(`    QBO#${c.id}: ${c.name}`);
                }
            }
        }
        console.log();

        // Referenced products/items
        console.log('  --- Referenced Products/Services ---');
        const itemRefs = new Map();
        for (const inv of missing) {
            for (const line of (inv.Line || [])) {
                const itemRef = line.SalesItemLineDetail?.ItemRef;
                if (itemRef) {
                    itemRefs.set(itemRef.value, itemRef.name);
                }
            }
        }
        console.log(`  Unique items: ${itemRefs.size}`);

        if (itemRefs.size > 0) {
            const itemIds = Array.from(itemRefs.keys());
            const maItemResult = await pool.request().query(
                `SELECT Id, Name, SourceSystem, SourceId
                 FROM ProductsServices
                 WHERE SourceSystem = 'QBO' AND SourceId IN (${itemIds.map(id => `'${id}'`).join(',')})`
            );
            const maItems = maItemResult.recordset;
            const maItemSourceIds = new Set(maItems.map(i => i.SourceId));

            const missingItems = [];
            for (const [id, name] of itemRefs) {
                if (!maItemSourceIds.has(id) && !maItemSourceIds.has(String(id))) {
                    missingItems.push({ id, name });
                }
            }

            console.log(`  Already in MA: ${maItems.length}`);
            console.log(`  Missing from MA: ${missingItems.length}`);
            if (missingItems.length > 0) {
                for (const item of missingItems) {
                    console.log(`    QBO#${item.id}: ${item.name}`);
                }
            }
        }
        console.log();

        // 7. Dump data to files
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().split('T')[0];

        // All QBO invoices (2025+)
        const invoiceFile = path.join(outputDir, `qbo-invoices-2025-plus-${timestamp}.json`);
        fs.writeFileSync(invoiceFile, JSON.stringify(qboInvoices, null, 2));
        console.log(`Saved: ${invoiceFile} (${qboInvoices.length} invoices)`);

        // Missing invoices only
        const missingFile = path.join(outputDir, `qbo-invoices-missing-${timestamp}.json`);
        fs.writeFileSync(missingFile, JSON.stringify(missing, null, 2));
        console.log(`Saved: ${missingFile} (${missing.length} invoices)`);

        // QBO payments
        const paymentFile = path.join(outputDir, `qbo-payments-2025-plus-${timestamp}.json`);
        fs.writeFileSync(paymentFile, JSON.stringify(qboPayments, null, 2));
        console.log(`Saved: ${paymentFile} (${qboPayments.length} payments)`);

        // MA existing invoices
        const maFile = path.join(outputDir, `ma-invoices-qbo-source-${timestamp}.json`);
        fs.writeFileSync(maFile, JSON.stringify(maAllInvoices, null, 2));
        console.log(`Saved: ${maFile} (${maAllInvoices.length} invoices)`);

        console.log('\n==============================================');
        console.log('Analysis complete. Review the JSON files in scripts/output/');
        console.log('==============================================');

    } finally {
        await pool.close();
    }
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});
