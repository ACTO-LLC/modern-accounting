import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAIClient(
    process.env.AZURE_OPENAI_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
);

const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Enhanced system prompt with accounting knowledge
const systemPrompt = `You are an expert accounting assistant for a modern accounting application. You help users with:

1. DATA QUERIES: Answer questions about their invoices, customers, vendors, bills, journal entries, bank transactions, and financial reports. Always use the available tools to fetch real data - never make up numbers or records.

2. ACCOUNTING GUIDANCE: Explain accounting concepts, help categorize expenses, explain the difference between account types, and provide best practices based on GAAP principles.

3. PROACTIVE INSIGHTS: When data shows issues (overdue invoices, upcoming due dates, unusual patterns), proactively mention them to help the user.

IMPORTANT RULES:
- Always use tools to fetch data. Never fabricate financial information.
- When uncertain, say "I'm not entirely sure, but..." or "Based on the available data..."
- Format currency as $X,XXX.XX
- Include clickable links formatted as [text](link) when referring to specific records
- For general accounting guidance (not about user's specific data), answer based on GAAP principles

ACCOUNT TYPES:
- Asset (1xxx): Cash, Bank, Accounts Receivable, Inventory, Equipment
- Liability (2xxx): Accounts Payable, Credit Cards, Loans, Accrued Expenses
- Equity (3xxx): Owner's Equity, Retained Earnings
- Revenue (4xxx): Sales, Service Income, Interest Income
- Expense (5xxx-9xxx): Rent, Utilities, Office Supplies, Payroll, etc.

COMMON EXPENSE CATEGORIES:
- Mobile phone bill -> Telephone Expense or Utilities
- Office supplies -> Office Supplies
- Travel -> Travel Expense
- Meals with clients -> Meals & Entertainment (50% deductible)
- Software subscriptions -> Software/Technology Expense
- Professional services -> Professional Fees
- Bank fees -> Bank Service Charges
- Insurance -> Insurance Expense`;

// Tool definitions
const tools = [
    {
        type: 'function',
        function: {
            name: 'query_invoices',
            description: 'Query invoices with optional filters for customer name, status, date range, and amounts. Use this for questions like "show invoices", "what did we bill X", "overdue invoices", etc.',
            parameters: {
                type: 'object',
                properties: {
                    customer_name: { type: 'string', description: 'Filter by customer name (partial match)' },
                    status: { type: 'string', enum: ['Draft', 'Sent', 'Paid', 'Overdue'], description: 'Filter by invoice status' },
                    date_from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                    date_to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                    min_amount: { type: 'number', description: 'Minimum total amount' },
                    max_amount: { type: 'number', description: 'Maximum total amount' },
                    limit: { type: 'number', description: 'Max results to return (default 10)' },
                    sort_by: { type: 'string', enum: ['date', 'amount', 'due_date'], description: 'Sort field' },
                    sort_order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_customers',
            description: 'Query customers with analytics. Use for questions like "who are my top customers", "customers with unpaid invoices", "inactive customers".',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Filter by customer name (partial match)' },
                    has_unpaid_invoices: { type: 'boolean', description: 'Only customers with unpaid invoices' },
                    top_by_revenue: { type: 'number', description: 'Return top N customers by total revenue' },
                    limit: { type: 'number', description: 'Max results to return (default 10)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_bills',
            description: 'Query bills/expenses from vendors. Use for questions about expenses, vendor payments, bills due.',
            parameters: {
                type: 'object',
                properties: {
                    vendor_name: { type: 'string', description: 'Filter by vendor name' },
                    status: { type: 'string', enum: ['Draft', 'Open', 'Partial', 'Paid', 'Overdue'], description: 'Filter by bill status' },
                    date_from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                    date_to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                    limit: { type: 'number', description: 'Max results to return (default 10)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_financial_summary',
            description: 'Get a financial summary including total revenue, expenses, and outstanding amounts for a period.',
            parameters: {
                type: 'object',
                properties: {
                    period: {
                        type: 'string',
                        enum: ['this_month', 'last_month', 'this_quarter', 'this_year', 'last_year'],
                        description: 'Time period for summary'
                    }
                },
                required: ['period']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_overdue_items',
            description: 'Get overdue invoices and bills, plus items due soon. Use for questions about cash flow, collections, or overdue accounts.',
            parameters: {
                type: 'object',
                properties: {
                    days_overdue: { type: 'number', description: 'Minimum days overdue (default 0)' },
                    include_upcoming: { type: 'boolean', description: 'Include items due in next 7 days' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_account_chart',
            description: 'Get chart of accounts or find specific accounts by type or name.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'], description: 'Filter by account type' },
                    search: { type: 'string', description: 'Search by account name' },
                    active_only: { type: 'boolean', description: 'Only return active accounts (default true)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_all',
            description: 'Search across customers, invoices, and journal entries by keyword.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search term' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'copy_invoice',
            description: 'Create a copy of an existing invoice by its invoice number.',
            parameters: {
                type: 'object',
                properties: {
                    invoice_number: { type: 'string', description: 'Invoice number to copy' }
                },
                required: ['invoice_number']
            }
        }
    }
];

// Helper functions
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getDateRange(period) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3);

    switch (period) {
        case 'this_month':
            return {
                start: new Date(year, month, 1).toISOString().split('T')[0],
                end: new Date(year, month + 1, 0).toISOString().split('T')[0]
            };
        case 'last_month':
            return {
                start: new Date(year, month - 1, 1).toISOString().split('T')[0],
                end: new Date(year, month, 0).toISOString().split('T')[0]
            };
        case 'this_quarter':
            return {
                start: new Date(year, quarter * 3, 1).toISOString().split('T')[0],
                end: new Date(year, quarter * 3 + 3, 0).toISOString().split('T')[0]
            };
        case 'this_year':
            return {
                start: new Date(year, 0, 1).toISOString().split('T')[0],
                end: new Date(year, 11, 31).toISOString().split('T')[0]
            };
        case 'last_year':
            return {
                start: new Date(year - 1, 0, 1).toISOString().split('T')[0],
                end: new Date(year - 1, 11, 31).toISOString().split('T')[0]
            };
        default:
            return {
                start: new Date(year, month, 1).toISOString().split('T')[0],
                end: now.toISOString().split('T')[0]
            };
    }
}

function getTodayISO() {
    return new Date().toISOString().split('T')[0];
}

function getDateInDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

// Tool execution functions
async function executeQueryInvoices(params) {
    try {
        const filters = [];
        let orderBy = '$orderby=IssueDate desc';

        if (params.status) {
            if (params.status === 'Overdue') {
                filters.push(`Status ne 'Paid'`);
                filters.push(`DueDate lt ${getTodayISO()}`);
            } else {
                filters.push(`Status eq '${params.status}'`);
            }
        }
        if (params.date_from) filters.push(`IssueDate ge ${params.date_from}`);
        if (params.date_to) filters.push(`IssueDate le ${params.date_to}`);
        if (params.min_amount) filters.push(`TotalAmount ge ${params.min_amount}`);
        if (params.max_amount) filters.push(`TotalAmount le ${params.max_amount}`);

        if (params.sort_by === 'amount') {
            orderBy = `$orderby=TotalAmount ${params.sort_order || 'desc'}`;
        } else if (params.sort_by === 'due_date') {
            orderBy = `$orderby=DueDate ${params.sort_order || 'asc'}`;
        }

        let url = `${DAB_API_URL}/invoices`;
        const queryParams = [];
        if (filters.length > 0) queryParams.push(`$filter=${filters.join(' and ')}`);
        queryParams.push(orderBy);
        queryParams.push(`$top=${params.limit || 10}`);
        url += '?' + queryParams.join('&');

        const response = await axios.get(url);
        let invoices = response.data.value || [];

        // If filtering by customer name, we need to fetch customers and filter
        if (params.customer_name) {
            const custResponse = await axios.get(
                `${DAB_API_URL}/customers?$filter=contains(tolower(Name), '${params.customer_name.toLowerCase()}')`
            );
            const customerIds = (custResponse.data.value || []).map(c => c.Id);
            if (customerIds.length > 0) {
                const custFilter = customerIds.map(id => `CustomerId eq ${id}`).join(' or ');
                const filteredUrl = `${DAB_API_URL}/invoices?$filter=(${custFilter})${filters.length > 0 ? ' and ' + filters.join(' and ') : ''}&${orderBy}&$top=${params.limit || 10}`;
                const filteredResponse = await axios.get(filteredUrl);
                invoices = filteredResponse.data.value || [];
            } else {
                invoices = [];
            }
        }

        // Fetch customer names for display
        const customerIds = [...new Set(invoices.map(inv => inv.CustomerId))];
        let customerMap = {};
        if (customerIds.length > 0) {
            try {
                const custResponse = await axios.get(`${DAB_API_URL}/customers`);
                customerMap = (custResponse.data.value || []).reduce((acc, c) => {
                    acc[c.Id] = c.Name;
                    return acc;
                }, {});
            } catch (e) { /* ignore */ }
        }

        const today = new Date();
        return {
            success: true,
            count: invoices.length,
            invoices: invoices.map(inv => {
                const dueDate = new Date(inv.DueDate);
                const isOverdue = dueDate < today && inv.Status !== 'Paid';
                return {
                    number: inv.InvoiceNumber,
                    customer: customerMap[inv.CustomerId] || 'Unknown Customer',
                    issueDate: inv.IssueDate,
                    dueDate: inv.DueDate,
                    amount: formatCurrency(inv.TotalAmount),
                    status: isOverdue ? 'Overdue' : inv.Status,
                    daysOverdue: isOverdue ? Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)) : 0,
                    link: `${APP_URL}/invoices/${inv.Id}/edit`
                };
            })
        };
    } catch (error) {
        console.error('Query invoices error:', error.message);
        return { success: false, error: error.message };
    }
}

async function executeQueryCustomers(params) {
    try {
        let url = `${DAB_API_URL}/customers`;
        const filters = [];

        if (params.name) {
            filters.push(`contains(tolower(Name), '${params.name.toLowerCase()}')`);
        }

        if (filters.length > 0) {
            url += `?$filter=${filters.join(' and ')}`;
        }

        const response = await axios.get(url);
        let customers = response.data.value || [];

        // Fetch invoice data for each customer to calculate revenue
        const invoicesResponse = await axios.get(`${DAB_API_URL}/invoices`);
        const invoices = invoicesResponse.data.value || [];

        // Calculate totals per customer
        const customerStats = {};
        invoices.forEach(inv => {
            if (!customerStats[inv.CustomerId]) {
                customerStats[inv.CustomerId] = { totalRevenue: 0, unpaidAmount: 0, invoiceCount: 0 };
            }
            customerStats[inv.CustomerId].totalRevenue += Number(inv.TotalAmount) || 0;
            customerStats[inv.CustomerId].invoiceCount++;
            if (inv.Status !== 'Paid') {
                customerStats[inv.CustomerId].unpaidAmount += Number(inv.TotalAmount) || 0;
            }
        });

        // Enrich customers with stats
        customers = customers.map(c => ({
            ...c,
            totalRevenue: customerStats[c.Id]?.totalRevenue || 0,
            unpaidAmount: customerStats[c.Id]?.unpaidAmount || 0,
            invoiceCount: customerStats[c.Id]?.invoiceCount || 0
        }));

        // Filter by unpaid invoices if requested
        if (params.has_unpaid_invoices) {
            customers = customers.filter(c => c.unpaidAmount > 0);
        }

        // Sort by revenue and limit to top N if requested
        if (params.top_by_revenue) {
            customers.sort((a, b) => b.totalRevenue - a.totalRevenue);
            customers = customers.slice(0, params.top_by_revenue);
        }

        // Apply general limit
        customers = customers.slice(0, params.limit || 10);

        return {
            success: true,
            count: customers.length,
            customers: customers.map(c => ({
                name: c.Name,
                email: c.Email,
                phone: c.Phone,
                totalRevenue: formatCurrency(c.totalRevenue),
                unpaidAmount: formatCurrency(c.unpaidAmount),
                invoiceCount: c.invoiceCount,
                link: `${APP_URL}/customers`
            }))
        };
    } catch (error) {
        console.error('Query customers error:', error.message);
        return { success: false, error: error.message };
    }
}

async function executeQueryBills(params) {
    try {
        const filters = [];

        if (params.status) {
            if (params.status === 'Overdue') {
                filters.push(`Status ne 'Paid'`);
                filters.push(`DueDate lt ${getTodayISO()}`);
            } else {
                filters.push(`Status eq '${params.status}'`);
            }
        }
        if (params.date_from) filters.push(`BillDate ge ${params.date_from}`);
        if (params.date_to) filters.push(`BillDate le ${params.date_to}`);

        let url = `${DAB_API_URL}/bills`;
        if (filters.length > 0) {
            url += `?$filter=${filters.join(' and ')}&$top=${params.limit || 10}`;
        } else {
            url += `?$top=${params.limit || 10}`;
        }

        const response = await axios.get(url);
        let bills = response.data.value || [];

        // Fetch vendor names
        const vendorResponse = await axios.get(`${DAB_API_URL}/vendors`);
        const vendorMap = (vendorResponse.data.value || []).reduce((acc, v) => {
            acc[v.Id] = v.Name;
            return acc;
        }, {});

        // Filter by vendor name if specified
        if (params.vendor_name) {
            const vendorIds = Object.entries(vendorMap)
                .filter(([_, name]) => name.toLowerCase().includes(params.vendor_name.toLowerCase()))
                .map(([id]) => id);
            bills = bills.filter(b => vendorIds.includes(b.VendorId));
        }

        const today = new Date();
        return {
            success: true,
            count: bills.length,
            bills: bills.map(b => {
                const dueDate = new Date(b.DueDate);
                const isOverdue = dueDate < today && b.Status !== 'Paid';
                return {
                    number: b.BillNumber,
                    vendor: vendorMap[b.VendorId] || 'Unknown Vendor',
                    billDate: b.BillDate,
                    dueDate: b.DueDate,
                    amount: formatCurrency(b.TotalAmount),
                    amountPaid: formatCurrency(b.AmountPaid),
                    balance: formatCurrency((b.TotalAmount || 0) - (b.AmountPaid || 0)),
                    status: isOverdue ? 'Overdue' : b.Status,
                    link: `${APP_URL}/bills/${b.Id}/edit`
                };
            })
        };
    } catch (error) {
        console.error('Query bills error:', error.message);
        return { success: false, error: error.message };
    }
}

async function executeGetFinancialSummary(params) {
    try {
        const { start, end } = getDateRange(params.period);

        // Get invoices for the period
        const invoicesResponse = await axios.get(
            `${DAB_API_URL}/invoices?$filter=IssueDate ge ${start} and IssueDate le ${end}`
        );
        const invoices = invoicesResponse.data.value || [];

        // Get bills for the period
        const billsResponse = await axios.get(
            `${DAB_API_URL}/bills?$filter=BillDate ge ${start} and BillDate le ${end}`
        );
        const bills = billsResponse.data.value || [];

        // Calculate totals
        const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.TotalAmount) || 0), 0);
        const totalExpenses = bills.reduce((sum, b) => sum + (Number(b.TotalAmount) || 0), 0);
        const paidRevenue = invoices.filter(inv => inv.Status === 'Paid')
            .reduce((sum, inv) => sum + (Number(inv.TotalAmount) || 0), 0);
        const unpaidRevenue = totalRevenue - paidRevenue;
        const paidExpenses = bills.filter(b => b.Status === 'Paid')
            .reduce((sum, b) => sum + (Number(b.TotalAmount) || 0), 0);
        const unpaidExpenses = totalExpenses - paidExpenses;

        return {
            success: true,
            period: params.period,
            dateRange: { start, end },
            revenue: {
                total: formatCurrency(totalRevenue),
                paid: formatCurrency(paidRevenue),
                outstanding: formatCurrency(unpaidRevenue),
                invoiceCount: invoices.length
            },
            expenses: {
                total: formatCurrency(totalExpenses),
                paid: formatCurrency(paidExpenses),
                outstanding: formatCurrency(unpaidExpenses),
                billCount: bills.length
            },
            netIncome: formatCurrency(totalRevenue - totalExpenses),
            cashFlow: formatCurrency(paidRevenue - paidExpenses)
        };
    } catch (error) {
        console.error('Financial summary error:', error.message);
        return { success: false, error: error.message };
    }
}

async function executeGetOverdueItems(params) {
    try {
        const today = getTodayISO();
        const results = { overdueInvoices: [], overdueBills: [], upcomingInvoices: [], upcomingBills: [] };

        // Get overdue invoices
        const overdueInvResponse = await axios.get(
            `${DAB_API_URL}/invoices?$filter=Status ne 'Paid' and DueDate lt ${today}&$orderby=DueDate asc`
        );
        const overdueInvoices = overdueInvResponse.data.value || [];

        // Get overdue bills
        const overdueBillsResponse = await axios.get(
            `${DAB_API_URL}/bills?$filter=Status ne 'Paid' and DueDate lt ${today}&$orderby=DueDate asc`
        );
        const overdueBills = overdueBillsResponse.data.value || [];

        // Filter by days overdue if specified
        const minDaysOverdue = params.days_overdue || 0;
        const todayDate = new Date();

        // Fetch customer and vendor names
        const custResponse = await axios.get(`${DAB_API_URL}/customers`);
        const customerMap = (custResponse.data.value || []).reduce((acc, c) => { acc[c.Id] = c.Name; return acc; }, {});
        const vendorResponse = await axios.get(`${DAB_API_URL}/vendors`);
        const vendorMap = (vendorResponse.data.value || []).reduce((acc, v) => { acc[v.Id] = v.Name; return acc; }, {});

        results.overdueInvoices = overdueInvoices
            .map(inv => {
                const dueDate = new Date(inv.DueDate);
                const daysOverdue = Math.floor((todayDate - dueDate) / (1000 * 60 * 60 * 24));
                return {
                    number: inv.InvoiceNumber,
                    customer: customerMap[inv.CustomerId] || 'Unknown',
                    amount: formatCurrency(inv.TotalAmount),
                    dueDate: inv.DueDate,
                    daysOverdue,
                    link: `${APP_URL}/invoices/${inv.Id}/edit`
                };
            })
            .filter(inv => inv.daysOverdue >= minDaysOverdue);

        results.overdueBills = overdueBills
            .map(bill => {
                const dueDate = new Date(bill.DueDate);
                const daysOverdue = Math.floor((todayDate - dueDate) / (1000 * 60 * 60 * 24));
                return {
                    number: bill.BillNumber,
                    vendor: vendorMap[bill.VendorId] || 'Unknown',
                    amount: formatCurrency(bill.TotalAmount),
                    dueDate: bill.DueDate,
                    daysOverdue,
                    link: `${APP_URL}/bills/${bill.Id}/edit`
                };
            })
            .filter(bill => bill.daysOverdue >= minDaysOverdue);

        // Get upcoming items (due in next 7 days)
        if (params.include_upcoming) {
            const nextWeek = getDateInDays(7);

            const upcomingInvResponse = await axios.get(
                `${DAB_API_URL}/invoices?$filter=Status eq 'Sent' and DueDate ge ${today} and DueDate le ${nextWeek}&$orderby=DueDate asc`
            );
            results.upcomingInvoices = (upcomingInvResponse.data.value || []).map(inv => ({
                number: inv.InvoiceNumber,
                customer: customerMap[inv.CustomerId] || 'Unknown',
                amount: formatCurrency(inv.TotalAmount),
                dueDate: inv.DueDate,
                link: `${APP_URL}/invoices/${inv.Id}/edit`
            }));

            const upcomingBillsResponse = await axios.get(
                `${DAB_API_URL}/bills?$filter=Status ne 'Paid' and DueDate ge ${today} and DueDate le ${nextWeek}&$orderby=DueDate asc`
            );
            results.upcomingBills = (upcomingBillsResponse.data.value || []).map(bill => ({
                number: bill.BillNumber,
                vendor: vendorMap[bill.VendorId] || 'Unknown',
                amount: formatCurrency(bill.TotalAmount),
                dueDate: bill.DueDate,
                link: `${APP_URL}/bills/${bill.Id}/edit`
            }));
        }

        return {
            success: true,
            summary: {
                overdueInvoiceCount: results.overdueInvoices.length,
                overdueInvoiceTotal: formatCurrency(overdueInvoices.reduce((sum, inv) => sum + (Number(inv.TotalAmount) || 0), 0)),
                overdueBillCount: results.overdueBills.length,
                overdueBillTotal: formatCurrency(overdueBills.reduce((sum, b) => sum + (Number(b.TotalAmount) || 0), 0)),
                upcomingInvoiceCount: results.upcomingInvoices.length,
                upcomingBillCount: results.upcomingBills.length
            },
            ...results
        };
    } catch (error) {
        console.error('Overdue items error:', error.message);
        return { success: false, error: error.message };
    }
}

async function executeGetAccountChart(params) {
    try {
        let url = `${DAB_API_URL}/accounts`;
        const filters = [];

        if (params.type) {
            filters.push(`Type eq '${params.type}'`);
        }
        if (params.active_only !== false) {
            filters.push(`IsActive eq true`);
        }
        if (params.search) {
            filters.push(`contains(tolower(Name), '${params.search.toLowerCase()}')`);
        }

        if (filters.length > 0) {
            url += `?$filter=${filters.join(' and ')}&$orderby=Code asc`;
        } else {
            url += '?$orderby=Code asc';
        }

        const response = await axios.get(url);
        const accounts = response.data.value || [];

        return {
            success: true,
            count: accounts.length,
            accounts: accounts.map(acc => ({
                code: acc.Code,
                name: acc.Name,
                type: acc.Type,
                subtype: acc.Subtype,
                description: acc.Description,
                isActive: acc.IsActive
            }))
        };
    } catch (error) {
        console.error('Account chart error:', error.message);
        return { success: false, error: error.message };
    }
}

async function executeSearchAll(params) {
    try {
        const query = params.query;
        const results = { customers: [], invoices: [], journalEntries: [] };

        try {
            const custResponse = await axios.get(
                `${DAB_API_URL}/customers?$filter=contains(tolower(Name), '${query.toLowerCase()}')`
            );
            results.customers = (custResponse.data.value || []).map(c => ({
                id: c.Id,
                name: c.Name,
                email: c.Email,
                link: `${APP_URL}/customers`
            }));
        } catch (e) { /* ignore */ }

        try {
            const invResponse = await axios.get(
                `${DAB_API_URL}/invoices?$filter=contains(InvoiceNumber, '${query}')`
            );
            results.invoices = (invResponse.data.value || []).map(inv => ({
                id: inv.Id,
                number: inv.InvoiceNumber,
                amount: formatCurrency(inv.TotalAmount),
                status: inv.Status,
                link: `${APP_URL}/invoices/${inv.Id}/edit`
            }));
        } catch (e) { /* ignore */ }

        try {
            const jeResponse = await axios.get(
                `${DAB_API_URL}/journalentries?$filter=contains(Reference, '${query}') or contains(Description, '${query}')`
            );
            results.journalEntries = (jeResponse.data.value || []).map(je => ({
                id: je.Id,
                reference: je.Reference,
                description: je.Description,
                date: je.TransactionDate,
                link: `${APP_URL}/journal-entries`
            }));
        } catch (e) { /* ignore */ }

        const totalResults = results.customers.length + results.invoices.length + results.journalEntries.length;

        return {
            success: true,
            query,
            totalResults,
            results
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeCopyInvoice(params) {
    try {
        const response = await axios.get(
            `${DAB_API_URL}/invoices?$filter=InvoiceNumber eq '${params.invoice_number}'`
        );
        if (!response.data.value || response.data.value.length === 0) {
            return { success: false, error: `Invoice ${params.invoice_number} not found` };
        }
        const source = response.data.value[0];
        const newInvoice = {
            InvoiceNumber: `${source.InvoiceNumber}-COPY-${Date.now()}`,
            CustomerId: source.CustomerId,
            TotalAmount: source.TotalAmount,
            IssueDate: new Date().toISOString().split('T')[0],
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            Status: 'Draft'
        };
        const createResponse = await axios.post(`${DAB_API_URL}/invoices`, newInvoice);
        const newId = createResponse.data.Id || createResponse.data.value?.[0]?.Id;
        return {
            success: true,
            message: `Created ${newInvoice.InvoiceNumber}`,
            invoice: {
                id: newId,
                number: newInvoice.InvoiceNumber,
                amount: formatCurrency(newInvoice.TotalAmount),
                link: `${APP_URL}/invoices/${newId}/edit`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Function dispatcher
async function executeFunction(name, args) {
    switch (name) {
        case 'query_invoices':
            return executeQueryInvoices(args);
        case 'query_customers':
            return executeQueryCustomers(args);
        case 'query_bills':
            return executeQueryBills(args);
        case 'get_financial_summary':
            return executeGetFinancialSummary(args);
        case 'get_overdue_items':
            return executeGetOverdueItems(args);
        case 'get_account_chart':
            return executeGetAccountChart(args);
        case 'search_all':
            return executeSearchAll(args);
        case 'copy_invoice':
            return executeCopyInvoice(args);
        default:
            return { success: false, error: `Unknown function: ${name}` };
    }
}

// Uncertainty detection
function detectUncertainty(content) {
    const uncertainPhrases = [
        "i'm not sure",
        "i don't have access",
        "i cannot find",
        "not entirely certain",
        "may not be accurate",
        "could not retrieve",
        "based on limited data",
        "no results found",
        "unable to find"
    ];
    const lowerContent = content.toLowerCase();
    return uncertainPhrases.some(phrase => lowerContent.includes(phrase));
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history = [] } = req.body;
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            { role: 'user', content: message }
        ];

        let response = await client.getChatCompletions(deploymentName, messages, { tools, toolChoice: 'auto' });
        let responseMessage = response.choices[0].message;
        let toolUsed = null;

        // Handle tool calls (support multiple rounds)
        let iterations = 0;
        const maxIterations = 3;

        while (responseMessage.toolCalls && responseMessage.toolCalls.length > 0 && iterations < maxIterations) {
            iterations++;
            messages.push(responseMessage);

            // Execute all tool calls
            for (const toolCall of responseMessage.toolCalls) {
                let functionArgs = {};
                try {
                    functionArgs = JSON.parse(toolCall.function.arguments);
                } catch (e) {
                    console.error('Parse error:', e);
                }

                toolUsed = toolCall.function.name;
                const functionResult = await executeFunction(toolCall.function.name, functionArgs);
                messages.push({ role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(functionResult) });
            }

            response = await client.getChatCompletions(deploymentName, messages, { tools, toolChoice: 'auto' });
            responseMessage = response.choices[0].message;
        }

        const content = responseMessage.content || '';
        res.json({
            response: content,
            isUncertain: detectUncertainty(content),
            toolUsed
        });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process chat request', details: error.message });
    }
});

// Insights endpoint for proactive alerts
app.get('/api/insights', async (req, res) => {
    try {
        const insights = [];
        const today = getTodayISO();
        const nextThreeDays = getDateInDays(3);

        // Check overdue invoices
        try {
            const overdueResponse = await axios.get(
                `${DAB_API_URL}/invoices?$filter=Status ne 'Paid' and DueDate lt ${today}`
            );
            const overdueInvoices = overdueResponse.data.value || [];
            if (overdueInvoices.length > 0) {
                const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + (Number(inv.TotalAmount) || 0), 0);
                insights.push({
                    type: 'overdue_invoices',
                    severity: 'warning',
                    title: 'Overdue Invoices',
                    message: `You have ${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? 's' : ''} overdue totaling ${formatCurrency(totalOverdue)}`,
                    action: { label: 'View Invoices', path: '/invoices' }
                });
            }
        } catch (e) { /* ignore */ }

        // Check upcoming due dates
        try {
            const upcomingResponse = await axios.get(
                `${DAB_API_URL}/invoices?$filter=Status eq 'Sent' and DueDate ge ${today} and DueDate le ${nextThreeDays}`
            );
            const upcomingInvoices = upcomingResponse.data.value || [];
            if (upcomingInvoices.length > 0) {
                insights.push({
                    type: 'upcoming_due',
                    severity: 'info',
                    title: 'Upcoming Due Dates',
                    message: `${upcomingInvoices.length} invoice${upcomingInvoices.length > 1 ? 's' : ''} due in the next 3 days`,
                    action: { label: 'Review', path: '/invoices' }
                });
            }
        } catch (e) { /* ignore */ }

        // Check pending bank transactions
        try {
            const pendingResponse = await axios.get(
                `${DAB_API_URL}/banktransactions?$filter=Status eq 'Pending'`
            );
            const pendingTransactions = pendingResponse.data.value || [];
            if (pendingTransactions.length > 0) {
                insights.push({
                    type: 'pending_review',
                    severity: 'info',
                    title: 'Transactions Need Review',
                    message: `${pendingTransactions.length} bank transaction${pendingTransactions.length > 1 ? 's' : ''} awaiting review`,
                    action: { label: 'Review Now', path: '/review' }
                });
            }
        } catch (e) { /* ignore */ }

        res.json({ insights });
    } catch (error) {
        console.error('Insights error:', error);
        res.status(500).json({ error: 'Failed to fetch insights', details: error.message });
    }
});

const PORT = process.env.PORT || 7071;
app.listen(PORT, () => {
    console.log(`Chat API running on http://localhost:${PORT}`);
    console.log(`Deployment: ${deploymentName}`);
    console.log(`DAB API URL: ${DAB_API_URL}`);
});
