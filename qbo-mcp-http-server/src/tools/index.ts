/**
 * QBO MCP Tool definitions and handlers
 */

import { z } from 'zod';
import { getAuthenticatedClient, isSessionConnected, getSessionInfo } from '../quickbooks-client.js';

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
        description: 'Search customers in QuickBooks Online',
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
                const qb = await getAuthenticatedClient(sessionId);
                const { criteria = [], fetchAll, ...options } = args.params || {};
                const searchCriteria = buildSearchCriteria(criteria, options);

                const result = await new Promise<any>((resolve, reject) => {
                    qb.findCustomers(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const customers = result?.QueryResponse?.Customer || [];

                // For migration, include raw data
                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${customers.length} customers` },
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
                    ]
                };

                if (fetchAll) {
                    response.data = customers;
                }

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
        description: 'Search invoices in QuickBooks Online',
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
                const qb = await getAuthenticatedClient(sessionId);
                const { criteria = [], fetchAll, ...options } = args.params || {};
                const searchCriteria = buildSearchCriteria(criteria, options);

                const result = await new Promise<any>((resolve, reject) => {
                    qb.findInvoices(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const invoices = result?.QueryResponse?.Invoice || [];

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${invoices.length} invoices` },
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
                    ]
                };

                if (fetchAll) {
                    response.data = invoices;
                }

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
        description: 'Search vendors in QuickBooks Online',
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
                const qb = await getAuthenticatedClient(sessionId);
                const { criteria = [], fetchAll, ...options } = args.params || {};
                const searchCriteria = buildSearchCriteria(criteria, options);

                const result = await new Promise<any>((resolve, reject) => {
                    qb.findVendors(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const vendors = result?.QueryResponse?.Vendor || [];

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${vendors.length} vendors` },
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
                    ]
                };

                if (fetchAll) {
                    response.data = vendors;
                }

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
        description: 'Search chart of accounts in QuickBooks Online',
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
                const qb = await getAuthenticatedClient(sessionId);
                const { criteria = [], fetchAll, ...options } = args.params || {};
                const searchCriteria = buildSearchCriteria(criteria, options);

                const result = await new Promise<any>((resolve, reject) => {
                    qb.findAccounts(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const accounts = result?.QueryResponse?.Account || [];

                const response: any = {
                    content: [
                        { type: 'text' as const, text: `Found ${accounts.length} accounts` },
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
                    ]
                };

                if (fetchAll) {
                    response.data = accounts;
                }

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
        description: 'Search bills in QuickBooks Online',
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
                const qb = await getAuthenticatedClient(sessionId);
                const { criteria = [], ...options } = args.params || {};
                const searchCriteria = buildSearchCriteria(criteria, options);

                const result = await new Promise<any>((resolve, reject) => {
                    qb.findBills(searchCriteria, (err: any, data: any) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });

                const bills = result?.QueryResponse?.Bill || [];
                return {
                    content: [
                        { type: 'text' as const, text: `Found ${bills.length} bills` },
                        ...bills.map((b: any) => ({
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
                    ]
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
        name: 'qbo_analyze_for_migration',
        description: 'Analyze QuickBooks data and provide summary for migration planning',
        schema: z.object({}),
        handler: async (sessionId: string, _args: any) => {
            try {
                const qb = await getAuthenticatedClient(sessionId);
                const session = getSessionInfo(sessionId);

                // Fetch counts for each entity type
                const fetchCount = async (method: string): Promise<number> => {
                    return new Promise((resolve, reject) => {
                        (qb as any)[method]({ count: true }, (err: any, data: any) => {
                            if (err) reject(err);
                            else resolve(data?.QueryResponse?.totalCount || 0);
                        });
                    });
                };

                // Fetch all in parallel
                const [customerCount, invoiceCount, vendorCount, accountCount, billCount] = await Promise.all([
                    fetchCount('findCustomers').catch(() => 0),
                    fetchCount('findInvoices').catch(() => 0),
                    fetchCount('findVendors').catch(() => 0),
                    fetchCount('findAccounts').catch(() => 0),
                    fetchCount('findBills').catch(() => 0)
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
                    companyName: session?.companyName || 'Unknown',
                    realmId: session?.realmId,
                    entities: {
                        customers: customerCount,
                        invoices: invoiceCount,
                        vendors: vendorCount,
                        accounts: accountCount,
                        bills: billCount
                    },
                    financials: {
                        unpaidInvoices: unpaidCount,
                        unpaidTotal: unpaidTotal
                    },
                    recommendation: 'Migrate in order: 1) Chart of Accounts, 2) Customers & Vendors, 3) Open Invoices & Bills'
                };

                return {
                    content: [{
                        type: 'text' as const,
                        text: JSON.stringify(summary, null, 2)
                    }]
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
