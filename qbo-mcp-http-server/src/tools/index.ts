/**
 * QBO MCP Tool definitions and handlers
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

// Build QuickBooks search criteria from advanced filters
function buildSearchCriteria(criteria: any[], options: any = {}): any {
    if (!criteria || criteria.length === 0) {
        return { ...options };
    }

    // Check if using advanced format
    const first = criteria[0];
    if (typeof first === 'object' && 'field' in first) {
        return [...criteria, ...Object.entries(options).map(([key, value]) => ({ field: key, value }))];
    }

    // Simple key/value format
    return criteria.reduce((acc: Record<string, any>, item: any) => {
        if (item.key && item.value !== undefined) {
            acc[item.key] = item.value;
        }
        return acc;
    }, { ...options });
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
        name: 'qbo_search_customers',
        description: 'Search customers in QuickBooks Online. Use fetchAll=true to get ALL customers with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            offset: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                // If fetchAll is true, use pagination to get ALL records
                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Customer', 'findCustomers', criteria
                    );

                    return {
                        content: [
                            { type: 'text' as const, text: `Found ${totalCount} customers (fetched all with pagination)` }
                        ],
                        data: records,
                        totalCount
                    };
                }

                // Otherwise, single query with limit/offset for batch support
                const { offset = 0 } = args.params || {};
                const searchCriteria: any = {
                    limit: limit || 1000,
                    offset: offset
                };

                // Add filter criteria if provided
                if (Array.isArray(criteria)) {
                    criteria.forEach((c: any) => {
                        if (c.field && c.value !== undefined) {
                            searchCriteria[c.field] = c.value;
                        }
                    });
                }

                const result = await new Promise<any>((resolve, reject) => {
                    qb.findCustomers(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const customers = result?.QueryResponse?.Customer || [];

                // Get total count to detect truncation
                let totalCount = customers.length;
                if (customers.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findCustomers');
                }

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${customers.length} customers${totalCount > customers.length ? ` (${totalCount} total, use fetchAll=true for all)` : ''}` },
                        ...customers.slice(0, 10).map((c: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: c.Id,
                                DisplayName: c.DisplayName,
                                CompanyName: c.CompanyName,
                                PrimaryEmailAddr: c.PrimaryEmailAddr?.Address,
                                PrimaryPhone: c.PrimaryPhone?.FreeFormNumber,
                                Balance: c.Balance,
                                Active: c.Active
                            })
                        }))
                    ],
                    data: customers,  // Always include raw data for migration batching
                    totalCount,
                    truncated: customers.length < totalCount
                };

                return response;
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_search_invoices',
        description: 'Search invoices in QuickBooks Online. Use fetchAll=true to get ALL invoices with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            offset: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                // If fetchAll is true, use pagination to get ALL records
                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Invoice', 'findInvoices', criteria
                    );

                    return {
                        content: [
                            { type: 'text' as const, text: `Found ${totalCount} invoices (fetched all with pagination)` }
                        ],
                        data: records,
                        totalCount
                    };
                }

                // Otherwise, single query with limit/offset for batch support
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
                    qb.findInvoices(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const invoices = result?.QueryResponse?.Invoice || [];

                let totalCount = invoices.length;
                if (invoices.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findInvoices');
                }

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${invoices.length} invoices${totalCount > invoices.length ? ` (${totalCount} total, use fetchAll=true for all)` : ''}` },
                        ...invoices.slice(0, 10).map((inv: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: inv.Id,
                                DocNumber: inv.DocNumber,
                                CustomerRef: inv.CustomerRef,
                                TxnDate: inv.TxnDate,
                                DueDate: inv.DueDate,
                                TotalAmt: inv.TotalAmt,
                                Balance: inv.Balance
                            })
                        }))
                    ],
                    data: invoices,
                    totalCount,
                    truncated: invoices.length < totalCount
                };

                return response;
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_search_vendors',
        description: 'Search vendors in QuickBooks Online. Use fetchAll=true to get ALL vendors with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                // If fetchAll is true, use pagination to get ALL records
                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Vendor', 'findVendors', criteria
                    );

                    return {
                        content: [
                            { type: 'text' as const, text: `Found ${totalCount} vendors (fetched all with pagination)` }
                        ],
                        data: records,
                        totalCount
                    };
                }

                // Otherwise, single query with limit/offset for batch support
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
                    qb.findVendors(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const vendors = result?.QueryResponse?.Vendor || [];

                let totalCount = vendors.length;
                if (vendors.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findVendors');
                }

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${vendors.length} vendors${totalCount > vendors.length ? ` (${totalCount} total, use fetchAll=true for all)` : ''}` },
                        ...vendors.slice(0, 10).map((v: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: v.Id,
                                DisplayName: v.DisplayName,
                                CompanyName: v.CompanyName,
                                PrimaryEmailAddr: v.PrimaryEmailAddr?.Address,
                                PrimaryPhone: v.PrimaryPhone?.FreeFormNumber,
                                Balance: v.Balance,
                                Active: v.Active,
                                Vendor1099: v.Vendor1099
                            })
                        }))
                    ],
                    data: vendors,
                    totalCount,
                    truncated: vendors.length < totalCount
                };

                return response;
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_search_accounts',
        description: 'Search chart of accounts in QuickBooks Online. Use fetchAll=true to get ALL accounts with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                // If fetchAll is true, use pagination to get ALL records
                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Account', 'findAccounts', criteria
                    );

                    return {
                        content: [
                            { type: 'text' as const, text: `Found ${totalCount} accounts (fetched all with pagination)` }
                        ],
                        data: records,
                        totalCount
                    };
                }

                // Otherwise, single query with limit/offset for batch support
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
                    qb.findAccounts(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const accounts = result?.QueryResponse?.Account || [];

                let totalCount = accounts.length;
                if (accounts.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findAccounts');
                }

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${accounts.length} accounts${totalCount > accounts.length ? ` (${totalCount} total, use fetchAll=true for all)` : ''}` },
                        ...accounts.slice(0, 10).map((acc: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: acc.Id,
                                Name: acc.Name,
                                AcctNum: acc.AcctNum,
                                AccountType: acc.AccountType,
                                AccountSubType: acc.AccountSubType,
                                CurrentBalance: acc.CurrentBalance,
                                Active: acc.Active
                            })
                        }))
                    ],
                    data: accounts,
                    totalCount,
                    truncated: accounts.length < totalCount
                };

                return response;
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_search_bills',
        description: 'Search bills in QuickBooks Online. Use fetchAll=true to get ALL bills with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                // If fetchAll is true, use pagination to get ALL records
                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Bill', 'findBills', criteria
                    );

                    return {
                        content: [
                            { type: 'text' as const, text: `Found ${totalCount} bills (fetched all with pagination)` }
                        ],
                        data: records,
                        totalCount
                    };
                }

                // Otherwise, single query with limit/offset for batch support
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
                    qb.findBills(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const bills = result?.QueryResponse?.Bill || [];

                let totalCount = bills.length;
                if (bills.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findBills');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${bills.length} bills${totalCount > bills.length ? ` (${totalCount} total, use fetchAll=true for all)` : ''}` },
                        ...bills.slice(0, 10).map((b: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: b.Id,
                                DocNumber: b.DocNumber,
                                VendorRef: b.VendorRef,
                                TxnDate: b.TxnDate,
                                DueDate: b.DueDate,
                                TotalAmt: b.TotalAmt,
                                Balance: b.Balance
                            })
                        }))
                    ],
                    data: bills,
                    totalCount,
                    truncated: bills.length < totalCount
                };
            } catch (error: any) {
                return {
                    content: [{ type: 'text' as const, text: `Error: ${error.message}` }],
                    isError: true
                };
            }
        }
    },
    {
        name: 'qbo_search_items',
        description: 'Search items (products & services) in QuickBooks Online. Use fetchAll=true to get ALL items with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Item', 'findItems', criteria
                    );
                    return {
                        content: [{ type: 'text' as const, text: `Found ${totalCount} items (fetched all with pagination)` }],
                        data: records,
                        totalCount
                    };
                }

                const searchCriteria = buildSearchCriteria(criteria, { limit: limit || 1000 });
                const result = await new Promise<any>((resolve, reject) => {
                    qb.findItems(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const items = result?.QueryResponse?.Item || [];
                let totalCount = items.length;
                if (items.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findItems');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${items.length} items${totalCount > items.length ? ` (${totalCount} total)` : ''}` },
                        ...items.slice(0, 10).map((i: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: i.Id, Name: i.Name, Type: i.Type, Active: i.Active,
                                UnitPrice: i.UnitPrice, Description: i.Description
                            })
                        }))
                    ],
                    totalCount,
                    truncated: items.length < totalCount
                };
            } catch (error: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
            }
        }
    },
    {
        name: 'qbo_search_employees',
        description: 'Search employees in QuickBooks Online. Use fetchAll=true to get ALL employees with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Employee', 'findEmployees', criteria
                    );
                    return {
                        content: [{ type: 'text' as const, text: `Found ${totalCount} employees (fetched all with pagination)` }],
                        data: records,
                        totalCount
                    };
                }

                const searchCriteria = buildSearchCriteria(criteria, { limit: limit || 1000 });
                const result = await new Promise<any>((resolve, reject) => {
                    qb.findEmployees(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const employees = result?.QueryResponse?.Employee || [];
                let totalCount = employees.length;
                if (employees.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findEmployees');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${employees.length} employees${totalCount > employees.length ? ` (${totalCount} total)` : ''}` },
                        ...employees.slice(0, 10).map((e: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: e.Id, DisplayName: e.DisplayName, GivenName: e.GivenName,
                                FamilyName: e.FamilyName, Active: e.Active,
                                PrimaryEmailAddr: e.PrimaryEmailAddr?.Address
                            })
                        }))
                    ],
                    totalCount,
                    truncated: employees.length < totalCount
                };
            } catch (error: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
            }
        }
    },
    {
        name: 'qbo_search_estimates',
        description: 'Search estimates in QuickBooks Online. Use fetchAll=true to get ALL estimates with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Estimate', 'findEstimates', criteria
                    );
                    return {
                        content: [{ type: 'text' as const, text: `Found ${totalCount} estimates (fetched all with pagination)` }],
                        data: records,
                        totalCount
                    };
                }

                const searchCriteria = buildSearchCriteria(criteria, { limit: limit || 1000 });
                const result = await new Promise<any>((resolve, reject) => {
                    qb.findEstimates(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const estimates = result?.QueryResponse?.Estimate || [];
                let totalCount = estimates.length;
                if (estimates.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findEstimates');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${estimates.length} estimates${totalCount > estimates.length ? ` (${totalCount} total)` : ''}` },
                        ...estimates.slice(0, 10).map((e: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: e.Id, DocNumber: e.DocNumber, CustomerRef: e.CustomerRef,
                                TxnDate: e.TxnDate, ExpirationDate: e.ExpirationDate,
                                TotalAmt: e.TotalAmt, TxnStatus: e.TxnStatus
                            })
                        }))
                    ],
                    totalCount,
                    truncated: estimates.length < totalCount
                };
            } catch (error: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
            }
        }
    },
    {
        name: 'qbo_search_journal_entries',
        description: 'Search journal entries in QuickBooks Online. Use fetchAll=true to get ALL journal entries with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'JournalEntry', 'findJournalEntries', criteria
                    );
                    return {
                        content: [{ type: 'text' as const, text: `Found ${totalCount} journal entries (fetched all with pagination)` }],
                        data: records,
                        totalCount
                    };
                }

                const searchCriteria = buildSearchCriteria(criteria, { limit: limit || 1000 });
                const result = await new Promise<any>((resolve, reject) => {
                    qb.findJournalEntries(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const entries = result?.QueryResponse?.JournalEntry || [];
                let totalCount = entries.length;
                if (entries.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findJournalEntries');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${entries.length} journal entries${totalCount > entries.length ? ` (${totalCount} total)` : ''}` },
                        ...entries.slice(0, 10).map((je: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: je.Id, DocNumber: je.DocNumber, TxnDate: je.TxnDate,
                                TotalAmt: je.TotalAmt, Adjustment: je.Adjustment,
                                LineCount: je.Line?.length || 0
                            })
                        }))
                    ],
                    totalCount,
                    truncated: entries.length < totalCount
                };
            } catch (error: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
            }
        }
    },
    {
        name: 'qbo_search_payments',
        description: 'Search customer payments in QuickBooks Online. Use fetchAll=true to get ALL payments with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Payment', 'findPayments', criteria
                    );
                    return {
                        content: [{ type: 'text' as const, text: `Found ${totalCount} payments (fetched all with pagination)` }],
                        data: records,
                        totalCount
                    };
                }

                const searchCriteria = buildSearchCriteria(criteria, { limit: limit || 1000 });
                const result = await new Promise<any>((resolve, reject) => {
                    qb.findPayments(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const payments = result?.QueryResponse?.Payment || [];
                let totalCount = payments.length;
                if (payments.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findPayments');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${payments.length} payments${totalCount > payments.length ? ` (${totalCount} total)` : ''}` },
                        ...payments.slice(0, 10).map((p: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: p.Id, PaymentRefNum: p.PaymentRefNum, CustomerRef: p.CustomerRef,
                                TxnDate: p.TxnDate, TotalAmt: p.TotalAmt,
                                DepositToAccountRef: p.DepositToAccountRef
                            })
                        }))
                    ],
                    totalCount,
                    truncated: payments.length < totalCount
                };
            } catch (error: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
            }
        }
    },
    {
        name: 'qbo_search_bill_payments',
        description: 'Search bill payments (vendor payments) in QuickBooks Online. Use fetchAll=true to get ALL bill payments with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'BillPayment', 'findBillPayments', criteria
                    );
                    return {
                        content: [{ type: 'text' as const, text: `Found ${totalCount} bill payments (fetched all with pagination)` }],
                        data: records,
                        totalCount
                    };
                }

                const searchCriteria = buildSearchCriteria(criteria, { limit: limit || 1000 });
                const result = await new Promise<any>((resolve, reject) => {
                    qb.findBillPayments(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const billPayments = result?.QueryResponse?.BillPayment || [];
                let totalCount = billPayments.length;
                if (billPayments.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findBillPayments');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${billPayments.length} bill payments${totalCount > billPayments.length ? ` (${totalCount} total)` : ''}` },
                        ...billPayments.slice(0, 10).map((bp: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: bp.Id, DocNumber: bp.DocNumber, VendorRef: bp.VendorRef,
                                TxnDate: bp.TxnDate, TotalAmt: bp.TotalAmt, PayType: bp.PayType
                            })
                        }))
                    ],
                    totalCount,
                    truncated: billPayments.length < totalCount
                };
            } catch (error: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
            }
        }
    },
    {
        name: 'qbo_search_purchases',
        description: 'Search purchases (expenses, checks) in QuickBooks Online. Use fetchAll=true to get ALL purchases with automatic pagination.',
        schema: z.object({
            criteria: z.array(z.object({
                field: z.string(),
                value: z.union([z.string(), z.boolean(), z.number()]),
                operator: z.enum(['=', '<', '>', '<=', '>=', 'LIKE', 'IN']).optional()
            })).optional(),
            limit: z.number().optional(),
            fetchAll: z.boolean().optional()
        }),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const { criteria = [], fetchAll, limit } = args.params || {};

                if (fetchAll) {
                    const { records, totalCount } = await queryAllPaginated(
                        qb, 'Purchase', 'findPurchases', criteria
                    );
                    return {
                        content: [{ type: 'text' as const, text: `Found ${totalCount} purchases (fetched all with pagination)` }],
                        data: records,
                        totalCount
                    };
                }

                const searchCriteria = buildSearchCriteria(criteria, { limit: limit || 1000 });
                const result = await new Promise<any>((resolve, reject) => {
                    qb.findPurchases(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const purchases = result?.QueryResponse?.Purchase || [];
                let totalCount = purchases.length;
                if (purchases.length >= (limit || 1000)) {
                    totalCount = await getEntityCount(qb, 'findPurchases');
                }

                return {
                    content: [
                        { type: 'text' as const, text: `Found ${purchases.length} purchases${totalCount > purchases.length ? ` (${totalCount} total)` : ''}` },
                        ...purchases.slice(0, 10).map((p: any) => ({
                            type: 'text' as const,
                            text: JSON.stringify({
                                Id: p.Id, DocNumber: p.DocNumber, TxnDate: p.TxnDate,
                                TotalAmt: p.TotalAmt, PaymentType: p.PaymentType,
                                AccountRef: p.AccountRef, EntityRef: p.EntityRef
                            })
                        }))
                    ],
                    totalCount,
                    truncated: purchases.length < totalCount
                };
            } catch (error: any) {
                return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
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

                // Fetch all accounts with pagination
                const { records: accounts } = await queryAllPaginated(
                    qb, 'Account', 'findAccounts', []
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
                    if (Math.abs(balance) < 0.01) continue; // Skip zero-balance accounts

                    const accountType = account.AccountType || '';
                    const isDebitNormal = debitNormalTypes.some(t => accountType.includes(t));
                    const isCreditNormal = creditNormalTypes.some(t => accountType.includes(t));

                    // Determine debit/credit amounts based on normal balance and actual balance sign
                    let debit = 0;
                    let credit = 0;

                    if (isDebitNormal) {
                        // For debit-normal accounts: positive balance = debit, negative = credit
                        if (balance > 0) {
                            debit = balance;
                            totalDebits += balance;
                        } else {
                            credit = Math.abs(balance);
                            totalCredits += Math.abs(balance);
                        }
                    } else if (isCreditNormal) {
                        // For credit-normal accounts: positive balance = credit, negative = debit
                        if (balance > 0) {
                            credit = balance;
                            totalCredits += balance;
                        } else {
                            debit = Math.abs(balance);
                            totalDebits += Math.abs(balance);
                        }
                    } else {
                        // Unknown type - treat positive as debit
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
        name: 'qbo_analyze_for_migration',
        description: 'Analyze QuickBooks data and provide summary for migration planning. Returns accurate counts for all entity types.',
        schema: z.object({}),
        handler: async (sessionId: string, args: any) => {
            try {
                const qb = await getClient(sessionId, args);
                const session = args.statelessAuth ? null : getSessionInfo(sessionId);

                // Fetch counts for each entity type using the count helper
                const [
                    customerCount, invoiceCount, vendorCount, accountCount, billCount,
                    itemCount, employeeCount, estimateCount, journalEntryCount,
                    paymentCount, billPaymentCount, purchaseCount
                ] = await Promise.all([
                    getEntityCount(qb, 'findCustomers').catch(() => 0),
                    getEntityCount(qb, 'findInvoices').catch(() => 0),
                    getEntityCount(qb, 'findVendors').catch(() => 0),
                    getEntityCount(qb, 'findAccounts').catch(() => 0),
                    getEntityCount(qb, 'findBills').catch(() => 0),
                    getEntityCount(qb, 'findItems').catch(() => 0),
                    getEntityCount(qb, 'findEmployees').catch(() => 0),
                    getEntityCount(qb, 'findEstimates').catch(() => 0),
                    getEntityCount(qb, 'findJournalEntries').catch(() => 0),
                    getEntityCount(qb, 'findPayments').catch(() => 0),
                    getEntityCount(qb, 'findBillPayments').catch(() => 0),
                    getEntityCount(qb, 'findPurchases').catch(() => 0)
                ]);

                // Get unpaid invoice total
                let unpaidTotal = 0;
                let unpaidCount = 0;
                try {
                    const unpaidResult = await new Promise<any>((resolve, reject) => {
                        qb.findInvoices([{ field: 'Balance', value: '0', operator: '>' }], (err: any, data: any) => {
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
                    entities: {
                        customers: customerCount,
                        vendors: vendorCount,
                        accounts: accountCount,
                        items: itemCount,
                        employees: employeeCount,
                        invoices: invoiceCount,
                        estimates: estimateCount,
                        bills: billCount,
                        payments: paymentCount,
                        billPayments: billPaymentCount,
                        journalEntries: journalEntryCount,
                        purchases: purchaseCount
                    },
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
