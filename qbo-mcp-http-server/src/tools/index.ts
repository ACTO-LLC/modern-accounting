/**
 * QBO MCP Tool definitions and handlers
 *
 * Uses dynamic entity discovery - no hardcoded entity lists.
 * Entity types and find methods are auto-discovered from the node-quickbooks prototype.
 */

import { z } from 'zod';
import {
    getAuthenticatedClient,
    isSessionConnected,
    getSessionInfo,
    createClientFromTokens,
    queryAllPaginated,
    getEntityCount
} from '../quickbooks-client.js';
import QuickBooks from 'node-quickbooks';

/**
 * Get QuickBooks client - uses stateless tokens if provided, otherwise session-based
 */
async function getClient(sessionId: string, context: any): Promise<QuickBooks> {
    if (context.statelessAuth) {
        const { accessToken, realmId } = context.statelessAuth;
        return createClientFromTokens(accessToken, realmId);
    }
    return getAuthenticatedClient(sessionId);
}

// Tool response type
export interface ToolResponse<T> {
    result: T | null;
    isError: boolean;
    error: string | null;
}

// ============================================================================
// Dynamic Entity Discovery
// ============================================================================

/**
 * Entity metadata derived from node-quickbooks prototype.
 * Maps entity type (e.g., "Customer") to its find method and response key.
 */
interface EntityMeta {
    entityType: string;      // Singular PascalCase: "Customer", "JournalEntry"
    findMethod: string;      // e.g., "findCustomers", "findJournalEntries"
    description: string;     // Human-readable name
}

/**
 * Derive singular entity type from a find method name.
 * e.g., "findCustomers" -> "Customer", "findJournalEntries" -> "JournalEntry"
 */
function singularize(plural: string): string {
    if (plural.endsWith('ies')) {
        return plural.slice(0, -3) + 'y';   // JournalEntries -> JournalEntry, TaxAgencies -> TaxAgency
    }
    if (plural.endsWith('sses')) {
        return plural.slice(0, -2);          // Classes -> Class
    }
    if (plural.endsWith('s')) {
        return plural.slice(0, -1);          // Customers -> Customer, Purchases -> Purchase
    }
    return plural;
}

/**
 * Convert PascalCase to human-readable name.
 * e.g., "JournalEntry" -> "Journal Entry", "BillPayment" -> "Bill Payment"
 */
function humanize(name: string): string {
    return name.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * Auto-discover available QBO entities from the node-quickbooks prototype.
 * Scans for all find* methods and derives entity metadata.
 */
function discoverEntities(): Map<string, EntityMeta> {
    const entityMap = new Map<string, EntityMeta>();
    const proto = Object.getOwnPropertyNames(QuickBooks.prototype);

    // Skip these - they're not queryable entities
    const skipMethods = new Set([
        'findPreferenceses',   // Malformed in library, and Preferences is a singleton
        'findCompanyInfos',    // Singleton - use getCompanyInfo instead
    ]);

    for (const method of proto) {
        if (!method.startsWith('find') || skipMethods.has(method)) continue;

        const plural = method.slice(4); // Remove "find" prefix
        const entityType = singularize(plural);

        entityMap.set(entityType.toLowerCase(), {
            entityType,
            findMethod: method,
            description: humanize(entityType)
        });
    }

    return entityMap;
}

// Build entity map at module load time
const ENTITY_MAP = discoverEntities();

/**
 * Look up entity metadata by name (case-insensitive).
 */
function getEntityMeta(entityName: string): EntityMeta | undefined {
    return ENTITY_MAP.get(entityName.toLowerCase());
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const tools = [
    {
        name: 'qbo_get_connection_status',
        description: 'Check if the current session is connected to QuickBooks Online and get company info',
        schema: z.object({}),
        handler: async (sessionId: string, _args: any) => {
            const connected = isSessionConnected(sessionId);
            const session = getSessionInfo(sessionId);
            return {
                content: [{
                    type: 'text' as const,
                    text: JSON.stringify({
                        connected,
                        realmId: session?.realmId,
                        companyName: session?.companyName,
                        tokenExpiry: session?.tokenExpiry
                    })
                }]
            };
        }
    },
    {
        name: 'qbo_list_entities',
        description: 'List all available QBO entity types that can be queried. Returns entity names, find methods, and descriptions. Use this to discover what data can be exported or queried from QuickBooks Online.',
        schema: z.object({}),
        handler: async (_sessionId: string, _args: any) => {
            const entities = Array.from(ENTITY_MAP.values()).map(e => ({
                entity: e.entityType,
                description: e.description
            }));

            // Sort alphabetically
            entities.sort((a, b) => a.entity.localeCompare(b.entity));

            return {
                content: [{
                    type: 'text' as const,
                    text: `Available QBO entities (${entities.length}): ${entities.map(e => e.entity).join(', ')}`
                }],
                data: entities
            };
        }
    },
    {
        name: 'qbo_query',
        description: 'Query any QuickBooks Online entity type. Use qbo_list_entities to see available types. Supports filtering, pagination, and fetchAll for complete data export. Examples: entity="Customer", entity="Purchase", entity="Deposit", entity="Invoice".',
        schema: z.object({
            entity: z.string().describe('The QBO entity type to query (e.g., Customer, Vendor, Invoice, Purchase, Deposit, Transfer, JournalEntry)'),
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional().describe('Filter criteria as field/value/operator objects'),
            limit: z.number().optional().describe('Max records per request (default 1000)'),
            offset: z.number().optional().describe('Pagination offset'),
            fetchAll: z.boolean().optional().describe('Set to true to fetch ALL records with automatic pagination')
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { entity, criteria = [], fetchAll, limit } = args.params || {};

                if (!entity) {
                    return {
                        content: [{ type: 'text' as const, text: 'Error: entity parameter is required. Use qbo_list_entities to see available types.' }],
                        isError: true
                    };
                }

                const meta = getEntityMeta(entity);
                if (!meta) {
                    const available = Array.from(ENTITY_MAP.values()).map(e => e.entityType).sort().join(', ');
                    return {
                        content: [{ type: 'text' as const, text: `Error: Unknown entity "${entity}". Available entities: ${available}` }],
                        isError: true
                    };
                }

                // fetchAll mode: paginate through all records
                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, meta.entityType, meta.findMethod, criteria
                    );

                    // Derive columns from first record
                    const columns = records.length > 0 ? Object.keys(records[0]) : [];

                    return {
                        content: [
                            { type: 'text' as const, text: `Found ${totalCount} ${meta.description.toLowerCase()} records (fetched all with pagination). Columns: ${columns.slice(0, 15).join(', ')}${columns.length > 15 ? '...' : ''}` }
                        ],
                        data: records,
                        totalCount
                    };
                }

                // Single query with limit/offset
                const { offset = 0 } = args.params || {};
                const searchCriteria: any = {
                    limit: limit || 1000,
                    offset: offset
                };

                if (Array.isArray(criteria)) {
                    criteria.forEach((c: any) => {
                        if (c.field && c.value !== undefined) {
                            searchCriteria[c.field] = c.value;
                        }
                    });
                }

                const result = await new Promise<any>((resolve, reject) => {
                    (qb as any)[meta.findMethod](searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const records = result?.QueryResponse?.[meta.entityType] || [];

                // Get total count to detect truncation
                let totalCount = records.length;
                if (records.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, meta.findMethod);
                }

                // Derive columns from first record
                const columns = records.length > 0 ? Object.keys(records[0]) : [];

                // Show first few records as preview (all fields, not cherry-picked)
                const preview = records.slice(0, 5).map((r: any) => {
                    // Show a compact summary of each record
                    const summary: Record<string, any> = {};
                    for (const key of columns.slice(0, 10)) {
                        const val = r[key];
                        // Flatten refs for readability
                        if (val && typeof val === 'object' && 'name' in val) {
                            summary[key] = val.name;
                        } else if (Array.isArray(val)) {
                            summary[key] = `[${val.length} items]`;
                        } else {
                            summary[key] = val;
                        }
                    }
                    return summary;
                });

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${records.length} ${meta.description.toLowerCase()} records${totalCount > records.length ? ` (${totalCount} total, use fetchAll=true for all)` : ''}. Columns: ${columns.slice(0, 15).join(', ')}${columns.length > 15 ? '...' : ''}` },
                        ...preview.map((p: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify(p)
                        }))
                    ],
                    data: records,
                    totalCount,
                    truncated: records.length < totalCount
                };

                return response;
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error querying ${args.params?.entity || 'entity'}: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_get_trial_balance',
        description: 'Get trial balance from QuickBooks Online - returns all accounts with their current balances for opening balance journal entry creation.',
        schema: z.object({}),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);

                const accountMeta = getEntityMeta('Account')!;

                // Fetch all accounts with pagination
                const { records: accounts } = await queryAllPaginated(
                    qb, accountMeta.entityType, accountMeta.findMethod, []
                );

                // Account types that have normal DEBIT balances
                const debitNormalTypes = [
                    'Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset',
                    'Expense', 'Other Expense', 'Cost of Goods Sold'
                ];

                // Account types that have normal CREDIT balances
                const creditNormalTypes = [
                    'Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability',
                    'Equity', 'Income', 'Other Income'
                ];

                let totalDebits = 0;
                let totalCredits = 0;
                const trialBalanceLines: any[] = [];

                for (const account of accounts) {
                    const balance = parseFloat(account.CurrentBalance) || 0;
                    if (Math.abs(balance) < 0.01) continue;

                    const accountType = account.AccountType || '';
                    const isDebitNormal = debitNormalTypes.some(t => accountType.includes(t));
                    const isCreditNormal = creditNormalTypes.some(t => accountType.includes(t));

                    let debit = 0;
                    let credit = 0;

                    if (isDebitNormal) {
                        if (balance > 0) {
                            debit = balance;
                            totalDebits += balance;
                        } else {
                            credit = Math.abs(balance);
                            totalCredits += Math.abs(balance);
                        }
                    } else if (isCreditNormal) {
                        if (balance > 0) {
                            credit = balance;
                            totalCredits += balance;
                        } else {
                            debit = Math.abs(balance);
                            totalDebits += Math.abs(balance);
                        }
                    } else {
                        if (balance > 0) {
                            debit = balance;
                            totalDebits += balance;
                        } else {
                            credit = Math.abs(balance);
                            totalCredits += Math.abs(balance);
                        }
                    }

                    trialBalanceLines.push({
                        qboId: account.Id,
                        name: account.Name,
                        accountNumber: account.AcctNum || null,
                        accountType: account.AccountType,
                        accountSubType: account.AccountSubType,
                        currentBalance: balance,
                        debit: debit,
                        credit: credit,
                        normalBalance: isDebitNormal ? 'Debit' : (isCreditNormal ? 'Credit' : 'Unknown')
                    });
                }

                // Sort by account type then name
                trialBalanceLines.sort((a, b) => {
                    const typeOrder = ['Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset',
                        'Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability',
                        'Equity', 'Income', 'Other Income', 'Expense', 'Other Expense', 'Cost of Goods Sold'];
                    const aIdx = typeOrder.findIndex(t => a.accountType?.includes(t));
                    const bIdx = typeOrder.findIndex(t => b.accountType?.includes(t));
                    if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
                    return (a.name || '').localeCompare(b.name || '');
                });

                const outOfBalance = Math.abs(totalDebits - totalCredits);
                const isBalanced = outOfBalance < 0.01;

                const result = {
                    accountCount: trialBalanceLines.length,
                    totalDebits: Math.round(totalDebits * 100) / 100,
                    totalCredits: Math.round(totalCredits * 100) / 100,
                    isBalanced,
                    outOfBalanceAmount: Math.round(outOfBalance * 100) / 100,
                    lines: trialBalanceLines
                };

                return {
                    content: [{
                        type: 'text' as const,
                        text: `Trial Balance: ${trialBalanceLines.length} accounts with non-zero balances. ` +
                            `Total Debits: $${totalDebits.toFixed(2)}, Total Credits: $${totalCredits.toFixed(2)}. ` +
                            (isBalanced ? 'BALANCED' : `OUT OF BALANCE by $${outOfBalance.toFixed(2)}`)
                    }],
                    data: result
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error getting trial balance: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_report_trial_balance',
        description: 'Get Trial Balance REPORT from QuickBooks Online as of a specific date. This uses the Reports API (not account balances) and provides proper historical balances including Retained Earnings.',
        schema: z.object({
            as_of_date: z.string().optional().describe('Date in YYYY-MM-DD format. If not provided, uses current date.'),
            date_macro: z.string().optional().describe('Preset date like "Last Year", "Last Month", etc. Use instead of as_of_date.')
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { as_of_date, date_macro } = args.params || {};

                const reportOptions: any = {};
                if (as_of_date) {
                    reportOptions.start_date = '2000-01-01';
                    reportOptions.end_date = as_of_date;
                } else if (date_macro) {
                    reportOptions.date_macro = date_macro;
                } else {
                    reportOptions.date_macro = 'All';
                }

                console.log('[TrialBalance] Options:', JSON.stringify(reportOptions));
                const result = await new Promise<any>((resolve, reject) => {
                    (qb as any).reportTrialBalance(reportOptions, (err: any, data: any) => {
                        if (err) {
                            console.error('[TrialBalance] Error:', err);
                            reject(err);
                        } else {
                            console.log('[TrialBalance] Raw response keys:', Object.keys(data || {}));
                            console.log('[TrialBalance] Header:', JSON.stringify(data?.Header || {}));
                            resolve(data);
                        }
                    });
                });

                const header = result?.Header || {};
                const columns = result?.Columns?.Column || [];

                let rows = result?.Rows?.Row || [];
                console.log('[TrialBalance] Raw Rows:', JSON.stringify(result?.Rows || {}).substring(0, 2000));

                const flattenedRows: any[] = [];
                for (const row of rows) {
                    if (row.Rows?.Row) {
                        for (const nestedRow of row.Rows.Row) {
                            flattenedRows.push(nestedRow);
                        }
                    } else if (row.ColData) {
                        flattenedRows.push(row);
                    }
                    if (row.Summary) {
                        flattenedRows.push({ Summary: row.Summary, type: row.type });
                    }
                }
                rows = flattenedRows;

                console.log('[TrialBalance] Flattened rows count:', rows.length);
                if (rows.length > 0) {
                    console.log('[TrialBalance] First row:', JSON.stringify(rows[0]).substring(0, 500));
                }

                const lines: any[] = [];
                let totalDebits = 0;
                let totalCredits = 0;

                for (const row of rows) {
                    if (row.ColData && Array.isArray(row.ColData)) {
                        const colData = row.ColData;
                        const name = colData[0]?.value || '';
                        const qboId = colData[0]?.id || null;
                        const debitStr = colData[1]?.value || '';
                        const creditStr = colData[2]?.value || '';
                        const debit = parseFloat(debitStr) || 0;
                        const credit = parseFloat(creditStr) || 0;

                        if (name && name !== 'TOTAL' && (debit !== 0 || credit !== 0)) {
                            lines.push({ qboId, name, debit, credit });
                            totalDebits += debit;
                            totalCredits += credit;
                        } else if (name === 'TOTAL') {
                            lines.push({ name: 'TOTAL', debit, credit, isTotal: true });
                        }
                    } else if (row.Summary?.ColData) {
                        const colData = row.Summary.ColData;
                        const name = colData[0]?.value || 'TOTAL';
                        const debit = parseFloat(colData[1]?.value) || 0;
                        const credit = parseFloat(colData[2]?.value) || 0;
                        lines.push({ name, debit, credit, isTotal: true });
                    }
                }

                const reportDate = header.EndPeriod || header.ReportBasis || 'Unknown';
                const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

                const reportData = {
                    reportDate,
                    reportName: header.ReportName || 'Trial Balance',
                    currency: header.Currency || 'USD',
                    totalDebits: Math.round(totalDebits * 100) / 100,
                    totalCredits: Math.round(totalCredits * 100) / 100,
                    isBalanced,
                    outOfBalance: Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100,
                    lineCount: lines.filter(l => !l.isTotal).length,
                    lines
                };

                return {
                    content: [{
                        type: 'text' as const,
                        text: `Trial Balance Report as of ${reportDate}: ${reportData.lineCount} accounts. ` +
                            `Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}. ` +
                            (isBalanced ? 'BALANCED' : `OUT OF BALANCE by $${reportData.outOfBalance.toFixed(2)}`)
                    }],
                    data: reportData
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error getting trial balance report: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_analyze_for_migration',
        description: 'Analyze QuickBooks data and provide summary for migration planning. Returns accurate counts for all entity types.',
        schema: z.object({}),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const session = args.statelessAuth ? null : getSessionInfo(sessionId);

                // Key entities to count for migration analysis
                const migrationEntities = [
                    'Customer', 'Vendor', 'Account', 'Item', 'Employee',
                    'Invoice', 'Estimate', 'Bill', 'Payment', 'BillPayment',
                    'JournalEntry', 'Purchase', 'Deposit', 'Transfer',
                    'CreditMemo', 'SalesReceipt', 'RefundReceipt', 'VendorCredit'
                ];

                // Get counts dynamically
                const counts: Record<string, number> = {};
                const countPromises = migrationEntities.map(async (entityName) => {
                    const meta = getEntityMeta(entityName);
                    if (!meta) return;
                    try {
                        const count = await getEntityCount(qb, meta.findMethod);
                        counts[entityName] = count;
                    } catch {
                        counts[entityName] = 0;
                    }
                });
                await Promise.all(countPromises);

                // Get unpaid invoice total
                let unpaidTotal = 0;
                let unpaidCount = 0;
                try {
                    const invoiceMeta = getEntityMeta('Invoice')!;
                    const unpaidResult = await new Promise<any>((resolve, reject) => {
                        (qb as any)[invoiceMeta.findMethod]([{ field: 'Balance', value: '0', operator: '>' }], (err: any, data: any) => {
                            if (err) reject(err);
                            else resolve(data);
                        });
                    });
                    const unpaidInvoices = unpaidResult?.QueryResponse?.Invoice || [];
                    unpaidCount = unpaidInvoices.length;
                    unpaidTotal = unpaidInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.Balance) || 0), 0);
                } catch (e) {
                    // Ignore errors for unpaid calculation
                }

                const summary = {
                    companyName: session?.companyName || (args.statelessAuth ? 'Connected via token' : 'Unknown'),
                    realmId: session?.realmId || args.statelessAuth?.realmId,
                    entities: counts,
                    financials: {
                        unpaidInvoices: unpaidCount,
                        unpaidTotal: unpaidTotal
                    },
                    recommendation: 'Migrate in order: 1) Chart of Accounts, 2) Customers & Vendors, 3) Items, 4) Open Invoices & Bills'
                };

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify(summary, null, 2)
                    }],
                    data: summary
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error analyzing QBO data: ${error.message}` }],
                    isError: true
                };
            }
        }
    }
];

// Get tool by name
export function getTool(name: string) {
    return tools.find(t => t.name === name);
}
