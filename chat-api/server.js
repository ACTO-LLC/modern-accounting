import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import axios from 'axios';
import { randomUUID } from 'crypto';
import multer from 'multer';
import Scribe from 'scribe.js-ocr';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    migrateCustomers,
    migrateVendors,
    migrateAccounts,
    migrateInvoices
} from './migration/executor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const uploadDir = path.join(__dirname, 'uploads');

// Initialize upload directory
async function initializeUploadDir() {
    try {
        await fs.mkdir(uploadDir, { recursive: true });
        console.log('Upload directory initialized');
    } catch (error) {
        console.error('Failed to create upload directory:', error);
    }
}

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        // Ensure directory exists before storing files
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            console.error('Failed to create upload directory:', error);
            cb(error, uploadDir);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { 
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5 // Max 5 files per request
    },
    fileFilter: (req, file, cb) => {
        // Security: Validate file type by MIME type
        // NOTE: For production, consider adding:
        // - Virus scanning (e.g., ClamAV)
        // - Content validation (verify file headers match MIME type)
        // - More restrictive file size limits per file type
        const allowedTypes = [
            'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
            'application/pdf',
            'text/csv', 'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'));
        }
    }
});

const client = new OpenAIClient(
    process.env.AZURE_OPENAI_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
);

const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
const DAB_MCP_URL = process.env.DAB_MCP_URL || 'http://localhost:5000/mcp';
const QBO_MCP_URL = process.env.QBO_MCP_URL || 'http://localhost:8001';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// ============================================================================
// MCP Client for DAB
// ============================================================================

class DabMcpClient {
    constructor(mcpUrl) {
        this.mcpUrl = mcpUrl;
        this.sessionId = null;
        this.requestId = 0;
        this.initialized = false;
    }

    // Parse SSE response from DAB MCP
    parseSSEResponse(data) {
        const lines = data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    return JSON.parse(line.substring(6));
                } catch (e) {
                    console.error('Failed to parse SSE data:', e);
                }
            }
        }
        return null;
    }

    async initialize() {
        if (this.initialized) return true;

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'chat-api', version: '1.0.0' }
            }
        };

        try {
            const response = await axios.post(this.mcpUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                transformResponse: [(data) => data] // Keep as raw string
            });

            const parsed = this.parseSSEResponse(response.data);
            if (parsed?.result) {
                // Get session ID from response headers
                this.sessionId = response.headers['mcp-session-id'];
                this.initialized = true;
                console.log('MCP initialized, session:', this.sessionId);
                return true;
            }
            return false;
        } catch (error) {
            console.error('MCP initialization failed:', error.message);
            return false;
        }
    }

    async callTool(toolName, args = {}, retryOnSessionError = true) {
        await this.initialize();

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        };

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.sessionId) {
                headers['Mcp-Session-Id'] = this.sessionId;
            }

            const response = await axios.post(this.mcpUrl, payload, {
                headers,
                transformResponse: [(data) => data] // Keep as raw string
            });

            const parsed = this.parseSSEResponse(response.data);
            if (!parsed) {
                console.error(`No valid response for ${toolName}`);
                return { error: 'Invalid response' };
            }

            if (parsed.error) {
                // Check for session errors and retry
                if (parsed.error.code === -32001 && retryOnSessionError) {
                    console.log('Session expired, reinitializing...');
                    this.initialized = false;
                    this.sessionId = null;
                    return this.callTool(toolName, args, false);
                }
                console.error(`MCP error for ${toolName}:`, parsed.error);
                return { error: parsed.error.message };
            }

            // Parse the result - DAB returns content array with text
            const result = parsed.result;
            if (result?.content?.[0]?.text) {
                return JSON.parse(result.content[0].text);
            }
            return result;
        } catch (error) {
            // Also retry on 404 (session not found)
            if (error.response?.status === 404 && retryOnSessionError) {
                console.log('Session not found (404), reinitializing...');
                this.initialized = false;
                this.sessionId = null;
                return this.callTool(toolName, args, false);
            }
            console.error(`MCP call failed for ${toolName}:`, error.message);
            return { error: error.message };
        }
    }

    // Entity operations
    async describeEntities(options = {}) {
        return this.callTool('describe_entities', options);
    }

    async readRecords(entity, options = {}) {
        return this.callTool('read_records', { entity, ...options });
    }

    async createRecord(entity, data) {
        return this.callTool('create_record', { entity, data });
    }

    async updateRecord(entity, keys, fields) {
        return this.callTool('update_record', { entity, keys, fields });
    }

    async deleteRecord(entity, keys) {
        return this.callTool('delete_record', { entity, keys });
    }
}

// Create MCP client instance
const mcp = new DabMcpClient(DAB_MCP_URL);

// ============================================================================
// QBO MCP Client
// ============================================================================

class QboMcpClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.mcpUrl = `${baseUrl}/mcp`;
        this.sessionId = null;
        this.requestId = 0;
        this.initialized = false;
    }

    // Parse SSE response
    parseSSEResponse(data) {
        const lines = data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    return JSON.parse(line.substring(6));
                } catch (e) {
                    console.error('Failed to parse QBO SSE data:', e);
                }
            }
        }
        return null;
    }

    async initialize() {
        if (this.initialized) return true;

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'chat-api-qbo', version: '1.0.0' }
            }
        };

        try {
            const response = await axios.post(this.mcpUrl, payload, {
                headers: { 'Content-Type': 'application/json' },
                transformResponse: [(data) => data]
            });

            const parsed = this.parseSSEResponse(response.data);
            if (parsed?.result) {
                this.sessionId = response.headers['mcp-session-id'];
                this.initialized = true;
                console.log('QBO MCP initialized, session:', this.sessionId);
                return true;
            }
            return false;
        } catch (error) {
            console.error('QBO MCP initialization failed:', error.message);
            return false;
        }
    }

    async callTool(toolName, args = {}, qboSessionId, retryOnSessionError = true) {
        await this.initialize();

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'tools/call',
            params: { name: toolName, arguments: args }
        };

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
            if (qboSessionId) headers['X-QBO-Session-Id'] = qboSessionId;

            const response = await axios.post(this.mcpUrl, payload, {
                headers,
                transformResponse: [(data) => data]
            });

            const parsed = this.parseSSEResponse(response.data);
            if (!parsed) return { error: 'Invalid response' };

            if (parsed.error) {
                if (parsed.error.code === -32001 && retryOnSessionError) {
                    this.initialized = false;
                    this.sessionId = null;
                    return this.callTool(toolName, args, qboSessionId, false);
                }
                return { error: parsed.error.message };
            }

            // Parse result
            const result = parsed.result;
            if (result?.content?.[0]?.text) {
                try {
                    return JSON.parse(result.content[0].text);
                } catch {
                    return { text: result.content[0].text };
                }
            }
            return result;
        } catch (error) {
            if (error.response?.status === 404 && retryOnSessionError) {
                this.initialized = false;
                this.sessionId = null;
                return this.callTool(toolName, args, qboSessionId, false);
            }
            return { error: error.message };
        }
    }

    // OAuth helpers - call the QBO MCP server's OAuth endpoints
    async getConnectionStatus(qboSessionId) {
        try {
            const response = await axios.get(`${this.baseUrl}/oauth/status/${qboSessionId}`);
            return response.data;
        } catch (error) {
            return { connected: false, error: error.message };
        }
    }

    async initiateOAuth(qboSessionId, redirectUrl) {
        try {
            const response = await axios.post(`${this.baseUrl}/oauth/connect`, {
                sessionId: qboSessionId,
                redirectUrl
            });
            return response.data;
        } catch (error) {
            return { error: error.message };
        }
    }

    async disconnect(qboSessionId) {
        try {
            const response = await axios.post(`${this.baseUrl}/oauth/disconnect`, {
                sessionId: qboSessionId
            });
            return response.data;
        } catch (error) {
            return { error: error.message };
        }
    }

    // QBO-specific tool wrappers
    async analyzeForMigration(qboSessionId) {
        return this.callTool('qbo_analyze_for_migration', {}, qboSessionId);
    }

    async searchCustomers(qboSessionId, criteria = {}) {
        return this.callTool('qbo_search_customers', criteria, qboSessionId);
    }

    async searchInvoices(qboSessionId, criteria = {}) {
        return this.callTool('qbo_search_invoices', criteria, qboSessionId);
    }

    async searchVendors(qboSessionId, criteria = {}) {
        return this.callTool('qbo_search_vendors', criteria, qboSessionId);
    }

    async searchAccounts(qboSessionId, criteria = {}) {
        return this.callTool('qbo_search_accounts', criteria, qboSessionId);
    }

    async searchBills(qboSessionId, criteria = {}) {
        return this.callTool('qbo_search_bills', criteria, qboSessionId);
    }
}

// Create QBO MCP client instance
const qboMcp = new QboMcpClient(QBO_MCP_URL);

// ============================================================================
// System Prompt and Tools
// ============================================================================

const systemPrompt = `You are an expert accounting assistant for a modern accounting application called ACTO. You help users with:

1. ONBOARDING NEW USERS: Handle these common onboarding responses:
   - "Yes, from QuickBooks" or mentions QBO: Check qbo_get_status. If not connected, say "Great! Click the 'Connect to QuickBooks' button above to securely link your account. Once connected, I'll analyze your data and help you migrate." If connected, use qbo_analyze_migration to show what can be migrated.
   - "Yes, from another platform" or Xero/FreshBooks/Wave: Say "I can help! While I don't have direct integration yet, you can export your data as CSV files and I'll help you import them. What would you like to start with - customers, chart of accounts, or invoices?"
   - "Starting fresh" or new business: Say "Exciting! Let's set up your books. I recommend starting with your Chart of Accounts. Would you like me to create a standard chart of accounts for your business type, or do you have specific accounts in mind?"

2. DATA QUERIES: Answer questions about their invoices, customers, vendors, bills, journal entries, bank transactions, and financial reports. Always use the available tools to fetch real data - never make up numbers or records.

3. ACCOUNTING GUIDANCE: Explain accounting concepts, help categorize expenses, explain the difference between account types, and provide best practices based on GAAP principles.

4. PROACTIVE INSIGHTS: When data shows issues (overdue invoices, upcoming due dates, unusual patterns), proactively mention them to help the user.

4. FILE PROCESSING: When users upload images or documents, extract information and take action:
   - Business cards: Extract contact info and offer to create customer/vendor records
   - Receipts: Extract merchant, amount, date, and suggest categorization
   - Bank statements: Identify account info and offer to create accounts in COA
   - Credit card statements: Auto-detect card issuer and create liability accounts
   - Invoices from vendors: Extract vendor info and amounts

IMPORTANT RULES:
- Always use tools to fetch data. Never fabricate financial information.
- When uncertain, say "I'm not entirely sure, but..." or "Based on the available data..."
- Format currency as $X,XXX.XX
- Include clickable links formatted as [text](link) when referring to specific records
- For general accounting guidance (not about user's specific data), answer based on GAAP principles
- When you can confidently extract info from a file and take action (create account, customer, vendor), do it automatically and inform the user afterward
- Only ask for confirmation when there's ambiguity (e.g., "Is this a customer or vendor?")

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
- Insurance -> Insurance Expense

AUTO-CREATION GUIDELINES:
- Bank statements: Create bank account automatically, mention what was created
- Credit cards: Create liability account automatically with last 4 digits
- Business cards: Always ask "Customer or Vendor?" before creating
- Receipts: If expense category doesn't exist in COA, offer to create it
- Do first, confirm after - reduce clicks to zero where possible

QUICKBOOKS ONLINE MIGRATION:
You can help users migrate from QuickBooks Online to this platform. Use the qbo_ tools when users ask about:
- Migrating from QuickBooks
- Importing data from QBO
- Connecting their QuickBooks account
- Comparing their QBO data with this system

When a user mentions QuickBooks or migration:
1. First use qbo_get_status to check if they're connected
2. If not connected, explain they need to click "Connect to QuickBooks" button
3. Once connected, use qbo_analyze_migration to show what data can be migrated
4. Guide them through migration in this order: Accounts -> Customers/Vendors -> Invoices/Bills

MIGRATION TOOLS:
You have access to migration tools to actually migrate data:
- migrate_accounts: Migrate chart of accounts (DO THIS FIRST)
- migrate_customers: Migrate customer records
- migrate_vendors: Migrate vendor records
- migrate_invoices: Migrate invoices (requires customers first)

MIGRATION BEST PRACTICES:
1. Always show the analysis first (qbo_analyze_migration) before offering to migrate
2. Ask for confirmation before running migration tools
3. Migrate in order: Accounts -> Customers & Vendors -> Invoices
4. Report results clearly: "Created X, Skipped Y (already exist), Z errors"
5. If errors occur, explain what went wrong and offer to retry
6. Celebrate successful migrations with positive feedback!

Migration conversation example:
User: "I want to migrate from QuickBooks"
Assistant: [Check qbo_get_status] "I see you're connected to 'ABC Company' on QuickBooks! Let me analyze your data..."
Assistant: [Call qbo_analyze_migration] "You have:
- 50 accounts in your chart of accounts
- 150 customers ($47,000 in unpaid invoices)
- 25 vendors
- 533 invoices

Would you like me to start the migration? I recommend starting with your chart of accounts."

User: "Yes, migrate everything"
Assistant: [Call migrate_accounts] "Chart of accounts migration complete: 48 created, 2 skipped (system defaults).
Now migrating customers..."
[Call migrate_customers] "Customers migrated: 150 created.
Now migrating invoices..."
[Call migrate_invoices with unpaid_only: true] "Invoices migrated: 23 unpaid invoices worth $47,000 created.

Your QuickBooks data is now in ACTO! You can continue tracking those $47,000 in unpaid invoices right here."`;



const tools = [
    {
        type: 'function',
        function: {
            name: 'query_invoices',
            description: 'Query invoices with optional filters for customer name, status, date range, and amounts.',
            parameters: {
                type: 'object',
                properties: {
                    customer_name: { type: 'string', description: 'Filter by customer name (partial match)' },
                    status: { type: 'string', enum: ['Draft', 'Sent', 'Paid', 'Overdue'], description: 'Filter by invoice status' },
                    date_from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                    date_to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                    min_amount: { type: 'number', description: 'Minimum total amount' },
                    max_amount: { type: 'number', description: 'Maximum total amount' },
                    limit: { type: 'number', description: 'Max results to return (default 10)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'query_customers',
            description: 'Query customers with analytics. Use for questions like "who are my top customers", "customers with unpaid invoices".',
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
            description: 'Query bills/expenses from vendors.',
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
            description: 'Get overdue invoices and bills, plus items due soon.',
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
                    search: { type: 'string', description: 'Search by account name' }
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
    },
    {
        type: 'function',
        function: {
            name: 'create_customer',
            description: 'Create a new customer record with contact information.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Customer/Company name' },
                    email: { type: 'string', description: 'Email address' },
                    phone: { type: 'string', description: 'Phone number' },
                    address: { type: 'string', description: 'Full address' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_vendor',
            description: 'Create a new vendor record with contact information.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Vendor/Company name' },
                    email: { type: 'string', description: 'Email address' },
                    phone: { type: 'string', description: 'Phone number' },
                    address: { type: 'string', description: 'Full address' },
                    is_1099_vendor: { type: 'boolean', description: 'Whether this is a 1099 vendor' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_account',
            description: 'Create a new account in the chart of accounts.',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Account code (e.g., 1000, 5100)' },
                    name: { type: 'string', description: 'Account name' },
                    type: {
                        type: 'string',
                        enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'],
                        description: 'Account type'
                    },
                    subtype: { type: 'string', description: 'Account subtype' },
                    description: { type: 'string', description: 'Account description' }
                },
                required: ['code', 'name', 'type']
            }
        }
    },
    // ========== QuickBooks Online Tools ==========
    {
        type: 'function',
        function: {
            name: 'qbo_get_status',
            description: 'Check if connected to QuickBooks Online and get company info. Use this first when user asks about QBO or migration.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_analyze_migration',
            description: 'Analyze QuickBooks Online data for migration. Returns counts of customers, invoices, vendors, accounts, and bills with migration recommendations.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_search_customers',
            description: 'Search customers in QuickBooks Online.',
            parameters: {
                type: 'object',
                properties: {
                    display_name: { type: 'string', description: 'Filter by display name' },
                    active: { type: 'boolean', description: 'Filter by active status' },
                    fetch_all: { type: 'boolean', description: 'Fetch all customers (for migration)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_search_invoices',
            description: 'Search invoices in QuickBooks Online.',
            parameters: {
                type: 'object',
                properties: {
                    customer_name: { type: 'string', description: 'Filter by customer name' },
                    fetch_all: { type: 'boolean', description: 'Fetch all invoices (for migration)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_search_vendors',
            description: 'Search vendors in QuickBooks Online.',
            parameters: {
                type: 'object',
                properties: {
                    display_name: { type: 'string', description: 'Filter by display name' },
                    active: { type: 'boolean', description: 'Filter by active status' },
                    fetch_all: { type: 'boolean', description: 'Fetch all vendors (for migration)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_search_accounts',
            description: 'Search chart of accounts in QuickBooks Online.',
            parameters: {
                type: 'object',
                properties: {
                    account_type: { type: 'string', description: 'Filter by account type (Bank, Expense, Income, etc.)' },
                    active: { type: 'boolean', description: 'Filter by active status' },
                    fetch_all: { type: 'boolean', description: 'Fetch all accounts (for migration)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_search_bills',
            description: 'Search bills in QuickBooks Online.',
            parameters: {
                type: 'object',
                properties: {
                    vendor_name: { type: 'string', description: 'Filter by vendor name' },
                    fetch_all: { type: 'boolean', description: 'Fetch all bills (for migration)' }
                }
            }
        }
    },
    // ========== Migration Tools ==========
    {
        type: 'function',
        function: {
            name: 'migrate_customers',
            description: 'Migrate customers from QuickBooks Online to ACTO. Call this after confirming migration with user.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of customers to migrate (for testing). Omit to migrate all.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_vendors',
            description: 'Migrate vendors from QuickBooks Online to ACTO.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of vendors to migrate (for testing). Omit to migrate all.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_accounts',
            description: 'Migrate chart of accounts from QuickBooks Online to ACTO. Should be done FIRST before other entities.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of accounts to migrate (for testing). Omit to migrate all.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_invoices',
            description: 'Migrate invoices from QuickBooks Online to ACTO. Requires customers to be migrated first.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of invoices to migrate (for testing). Omit to migrate all.' },
                    unpaid_only: { type: 'boolean', description: 'Only migrate unpaid/open invoices' }
                }
            }
        }
    }
];

// ============================================================================
// Helper Functions
// ============================================================================

function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    return `$${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Use full ISO datetime format for DAB/OData compatibility
function getTodayDate() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString();
}

function getDateInDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
}

function getDateRange(period) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3);

    const toDate = (d) => {
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
    };

    switch (period) {
        case 'this_month':
            return { start: toDate(new Date(year, month, 1)), end: toDate(new Date(year, month + 1, 0)) };
        case 'last_month':
            return { start: toDate(new Date(year, month - 1, 1)), end: toDate(new Date(year, month, 0)) };
        case 'this_quarter':
            return { start: toDate(new Date(year, quarter * 3, 1)), end: toDate(new Date(year, quarter * 3 + 3, 0)) };
        case 'this_year':
            return { start: toDate(new Date(year, 0, 1)), end: toDate(new Date(year, 11, 31)) };
        case 'last_year':
            return { start: toDate(new Date(year - 1, 0, 1)), end: toDate(new Date(year - 1, 11, 31)) };
        default:
            return { start: toDate(new Date(year, month, 1)), end: toDate(now) };
    }
}

// ============================================================================
// Tool Execution Functions (using MCP)
// ============================================================================

async function executeQueryInvoices(params) {
    try {
        const filters = [];
        const today = getTodayDate();

        if (params.status) {
            if (params.status === 'Overdue') {
                filters.push(`Status ne 'Paid' and DueDate lt ${today}`);
            } else {
                filters.push(`Status eq '${params.status}'`);
            }
        }
        if (params.date_from) filters.push(`IssueDate ge ${params.date_from}`);
        if (params.date_to) filters.push(`IssueDate le ${params.date_to}`);
        if (params.min_amount) filters.push(`TotalAmount ge ${params.min_amount}`);
        if (params.max_amount) filters.push(`TotalAmount le ${params.max_amount}`);
        if (params.customer_name) {
            filters.push(`contains(CustomerName, '${params.customer_name}')`);
        }

        const mcpOptions = {
            first: params.limit || 10,
            orderby: ['IssueDate desc']
        };
        if (filters.length > 0) {
            mcpOptions.filter = filters.join(' and ');
        }

        const result = await mcp.readRecords('invoices', mcpOptions);
        if (result.error) {
            return { success: false, error: result.error };
        }

        const invoices = result.result?.value || [];
        const todayDate = new Date();

        return {
            success: true,
            count: invoices.length,
            invoices: invoices.map(inv => {
                const dueDate = new Date(inv.DueDate);
                const isOverdue = dueDate < todayDate && inv.Status !== 'Paid';
                return {
                    number: inv.InvoiceNumber,
                    customer: inv.CustomerName || 'Unknown Customer',
                    issueDate: inv.IssueDate,
                    dueDate: inv.DueDate,
                    amount: formatCurrency(inv.TotalAmount),
                    status: isOverdue ? 'Overdue' : inv.Status,
                    daysOverdue: isOverdue ? Math.floor((todayDate - dueDate) / (1000 * 60 * 60 * 24)) : 0,
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
        const mcpOptions = { first: 100 };
        if (params.name) {
            mcpOptions.filter = `contains(Name, '${params.name}')`;
        }

        const custResult = await mcp.readRecords('customers', mcpOptions);
        if (custResult.error) {
            return { success: false, error: custResult.error };
        }

        let customers = custResult.result?.value || [];

        // Get all invoices to calculate revenue
        const invResult = await mcp.readRecords('invoices', { first: 1000 });
        const invoices = invResult.result?.value || [];

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
        const today = getTodayDate();

        if (params.status) {
            if (params.status === 'Overdue') {
                filters.push(`Status ne 'Paid' and DueDate lt ${today}`);
            } else {
                filters.push(`Status eq '${params.status}'`);
            }
        }
        if (params.date_from) filters.push(`BillDate ge ${params.date_from}`);
        if (params.date_to) filters.push(`BillDate le ${params.date_to}`);
        if (params.vendor_name) {
            filters.push(`contains(VendorName, '${params.vendor_name}')`);
        }

        const mcpOptions = { first: params.limit || 10 };
        if (filters.length > 0) {
            mcpOptions.filter = filters.join(' and ');
        }

        const result = await mcp.readRecords('bills', mcpOptions);
        if (result.error) {
            return { success: false, error: result.error };
        }

        const bills = result.result?.value || [];
        const todayDate = new Date();

        return {
            success: true,
            count: bills.length,
            bills: bills.map(b => {
                const dueDate = new Date(b.DueDate);
                const isOverdue = dueDate < todayDate && b.Status !== 'Paid';
                return {
                    number: b.BillNumber,
                    vendor: b.VendorName || 'Unknown Vendor',
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
        const invResult = await mcp.readRecords('invoices', {
            filter: `IssueDate ge ${start} and IssueDate le ${end}`,
            first: 1000
        });
        const invoices = invResult.result?.value || [];

        // Get bills for the period
        const billResult = await mcp.readRecords('bills', {
            filter: `BillDate ge ${start} and BillDate le ${end}`,
            first: 1000
        });
        const bills = billResult.result?.value || [];

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
        const today = getTodayDate();
        const results = { overdueInvoices: [], overdueBills: [], upcomingInvoices: [], upcomingBills: [] };

        // Get overdue invoices
        const overdueInvResult = await mcp.readRecords('invoices', {
            filter: `Status ne 'Paid' and DueDate lt ${today}`,
            orderby: ['DueDate asc'],
            first: 100
        });
        const overdueInvoices = overdueInvResult.result?.value || [];

        // Get overdue bills
        const overdueBillsResult = await mcp.readRecords('bills', {
            filter: `Status ne 'Paid' and DueDate lt ${today}`,
            orderby: ['DueDate asc'],
            first: 100
        });
        const overdueBills = overdueBillsResult.result?.value || [];

        const minDaysOverdue = params.days_overdue || 0;
        const todayDate = new Date();

        results.overdueInvoices = overdueInvoices
            .map(inv => {
                const dueDate = new Date(inv.DueDate);
                const daysOverdue = Math.floor((todayDate - dueDate) / (1000 * 60 * 60 * 24));
                return {
                    number: inv.InvoiceNumber,
                    customer: inv.CustomerName || 'Unknown',
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
                    vendor: bill.VendorName || 'Unknown',
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

            const upcomingInvResult = await mcp.readRecords('invoices', {
                filter: `Status eq 'Sent' and DueDate ge ${today} and DueDate le ${nextWeek}`,
                orderby: ['DueDate asc'],
                first: 100
            });
            results.upcomingInvoices = (upcomingInvResult.result?.value || []).map(inv => ({
                number: inv.InvoiceNumber,
                customer: inv.CustomerName || 'Unknown',
                amount: formatCurrency(inv.TotalAmount),
                dueDate: inv.DueDate,
                link: `${APP_URL}/invoices/${inv.Id}/edit`
            }));

            const upcomingBillsResult = await mcp.readRecords('bills', {
                filter: `Status ne 'Paid' and DueDate ge ${today} and DueDate le ${nextWeek}`,
                orderby: ['DueDate asc'],
                first: 100
            });
            results.upcomingBills = (upcomingBillsResult.result?.value || []).map(bill => ({
                number: bill.BillNumber,
                vendor: bill.VendorName || 'Unknown',
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
        const filters = [];

        if (params.type) {
            filters.push(`Type eq '${params.type}'`);
        }
        if (params.search) {
            filters.push(`contains(Name, '${params.search}')`);
        }

        const mcpOptions = {
            orderby: ['Code asc'],
            first: 100
        };
        if (filters.length > 0) {
            mcpOptions.filter = filters.join(' and ');
        }

        const result = await mcp.readRecords('accounts', mcpOptions);
        if (result.error) {
            return { success: false, error: result.error };
        }

        const accounts = result.result?.value || [];

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

        // Search customers
        const custResult = await mcp.readRecords('customers', {
            filter: `contains(Name, '${query}')`,
            first: 10
        });
        results.customers = (custResult.result?.value || []).map(c => ({
            id: c.Id,
            name: c.Name,
            email: c.Email,
            link: `${APP_URL}/customers`
        }));

        // Search invoices
        const invResult = await mcp.readRecords('invoices', {
            filter: `contains(InvoiceNumber, '${query}')`,
            first: 10
        });
        results.invoices = (invResult.result?.value || []).map(inv => ({
            id: inv.Id,
            number: inv.InvoiceNumber,
            amount: formatCurrency(inv.TotalAmount),
            status: inv.Status,
            link: `${APP_URL}/invoices/${inv.Id}/edit`
        }));

        // Search journal entries
        const jeResult = await mcp.readRecords('journalentries', {
            filter: `contains(Reference, '${query}')`,
            first: 10
        });
        results.journalEntries = (jeResult.result?.value || []).map(je => ({
            id: je.Id,
            reference: je.Reference,
            description: je.Description,
            date: je.TransactionDate,
            link: `${APP_URL}/journal-entries`
        }));

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
        // Find the source invoice
        const findResult = await mcp.readRecords('invoices', {
            filter: `InvoiceNumber eq '${params.invoice_number}'`,
            first: 1
        });

        const invoices = findResult.result?.value || [];
        if (invoices.length === 0) {
            return { success: false, error: `Invoice ${params.invoice_number} not found` };
        }

        const source = invoices[0];
        const newInvoiceData = {
            InvoiceNumber: `${source.InvoiceNumber}-COPY-${Date.now()}`,
            CustomerId: source.CustomerId,
            TotalAmount: source.TotalAmount,
            IssueDate: new Date().toISOString().split('T')[0],
            DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            Status: 'Draft'
        };

        const createResult = await mcp.createRecord('invoices', newInvoiceData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `Created ${newInvoiceData.InvoiceNumber}`,
            invoice: {
                id: newId,
                number: newInvoiceData.InvoiceNumber,
                amount: formatCurrency(newInvoiceData.TotalAmount),
                link: `${APP_URL}/invoices/${newId}/edit`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeCreateCustomer(params) {
    try {
        const customerData = {
            Name: params.name,
            Email: params.email || null,
            Phone: params.phone || null,
            BillingAddress: params.address || null
        };

        const createResult = await mcp.createRecord('customers', customerData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `Created customer '${params.name}'`,
            customer: {
                id: newId,
                name: params.name,
                email: params.email,
                phone: params.phone,
                address: params.address,
                link: `${APP_URL}/customers`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeCreateVendor(params) {
    try {
        const vendorData = {
            Name: params.name,
            Email: params.email || null,
            Phone: params.phone || null,
            Address: params.address || null,
            Is1099Vendor: params.is_1099_vendor || false
        };

        const createResult = await mcp.createRecord('vendors', vendorData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `Created vendor '${params.name}'`,
            vendor: {
                id: newId,
                name: params.name,
                email: params.email,
                phone: params.phone,
                address: params.address,
                is1099: params.is_1099_vendor,
                link: `${APP_URL}/vendors`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeCreateAccount(params) {
    try {
        const accountData = {
            Code: params.code,
            Name: params.name,
            Type: params.type,
            Subtype: params.subtype || null,
            Description: params.description || null,
            IsActive: true
        };

        const createResult = await mcp.createRecord('accounts', accountData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `Created account ${params.code} - ${params.name}`,
            account: {
                id: newId,
                code: params.code,
                name: params.name,
                type: params.type,
                link: `${APP_URL}/chart-of-accounts`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// QBO Tool Execution Functions
// ============================================================================

// Track current QBO session for tool calls (set from chat request context)
let currentQboSessionId = null;

function setCurrentQboSession(sessionId) {
    currentQboSessionId = sessionId;
}

async function executeQboGetStatus() {
    if (!currentQboSessionId) {
        return {
            success: true,
            connected: false,
            message: 'Not connected to QuickBooks Online. Use the "Connect to QuickBooks" button to connect.'
        };
    }

    try {
        const status = await qboMcp.getConnectionStatus(currentQboSessionId);
        return {
            success: true,
            connected: status.connected,
            companyName: status.companyName,
            realmId: status.realmId,
            message: status.connected
                ? `Connected to QuickBooks Online company: ${status.companyName}`
                : 'Not connected to QuickBooks Online. Use the "Connect to QuickBooks" button to connect.'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboAnalyzeMigration() {
    if (!currentQboSessionId) {
        return {
            success: false,
            error: 'Not connected to QuickBooks Online. Please connect first.',
            needsAuth: true
        };
    }

    try {
        const status = await qboMcp.getConnectionStatus(currentQboSessionId);
        if (!status.connected) {
            return {
                success: false,
                error: 'Not connected to QuickBooks Online. Please connect first.',
                needsAuth: true
            };
        }

        const analysis = await qboMcp.analyzeForMigration(currentQboSessionId);
        return {
            success: true,
            ...analysis
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchCustomers(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const criteria = {};
        if (params.display_name) {
            criteria.criteria = [{ field: 'DisplayName', value: params.display_name, operator: 'LIKE' }];
        }
        if (params.active !== undefined) {
            criteria.criteria = criteria.criteria || [];
            criteria.criteria.push({ field: 'Active', value: params.active });
        }
        if (params.fetch_all) {
            criteria.fetchAll = true;
        }

        const result = await qboMcp.searchCustomers(currentQboSessionId, criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchInvoices(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const criteria = {};
        if (params.fetch_all) {
            criteria.fetchAll = true;
        }

        const result = await qboMcp.searchInvoices(currentQboSessionId, criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchVendors(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const criteria = {};
        if (params.display_name) {
            criteria.criteria = [{ field: 'DisplayName', value: params.display_name, operator: 'LIKE' }];
        }
        if (params.active !== undefined) {
            criteria.criteria = criteria.criteria || [];
            criteria.criteria.push({ field: 'Active', value: params.active });
        }
        if (params.fetch_all) {
            criteria.fetchAll = true;
        }

        const result = await qboMcp.searchVendors(currentQboSessionId, criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchAccounts(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const criteria = {};
        if (params.account_type) {
            criteria.criteria = [{ field: 'AccountType', value: params.account_type }];
        }
        if (params.active !== undefined) {
            criteria.criteria = criteria.criteria || [];
            criteria.criteria.push({ field: 'Active', value: params.active });
        }
        if (params.fetch_all) {
            criteria.fetchAll = true;
        }

        const result = await qboMcp.searchAccounts(currentQboSessionId, criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchBills(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const criteria = {};
        if (params.fetch_all) {
            criteria.fetchAll = true;
        }

        const result = await qboMcp.searchBills(currentQboSessionId, criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Migration Tool Execution Functions
// ============================================================================

// Store migration ID maps across tool calls within a session
const migrationIdMaps = new Map();

function getMigrationIdMap(sessionId) {
    if (!migrationIdMaps.has(sessionId)) {
        migrationIdMaps.set(sessionId, {
            customers: {},
            vendors: {},
            accounts: {},
            invoices: {}
        });
    }
    return migrationIdMaps.get(sessionId);
}

async function executeMigrateCustomers(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        // Check QBO connection
        const status = await qboMcp.getConnectionStatus(currentQboSessionId);
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch customers from QBO
        const qboResult = await qboMcp.searchCustomers(currentQboSessionId, { fetchAll: true });
        if (qboResult.error) {
            return { success: false, error: `Failed to fetch QBO customers: ${qboResult.error}` };
        }

        // Parse QBO response - the result contains content array with text items
        let qboCustomers = [];
        if (qboResult.content) {
            // Find the count message and individual customer records
            for (const item of qboResult.content) {
                if (item.text && !item.text.startsWith('Found')) {
                    try {
                        const customer = JSON.parse(item.text);
                        qboCustomers.push(customer);
                    } catch (e) {
                        // Not a JSON customer record
                    }
                }
            }
        }

        // Apply limit if specified
        if (params.limit && params.limit > 0) {
            qboCustomers = qboCustomers.slice(0, params.limit);
        }

        if (qboCustomers.length === 0) {
            return { success: true, message: 'No customers found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration
        const result = await migrateCustomers(qboCustomers, mcp);

        // Store ID map for subsequent migrations
        const idMaps = getMigrationIdMap(currentQboSessionId);
        Object.assign(idMaps.customers, result.idMap);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} customers migrated, ${result.skipped} skipped`,
            migrated: result.migrated,
            skipped: result.skipped,
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5), // Limit error details
            details: result.details.slice(0, 10) // Limit details shown
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateVendors(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const status = await qboMcp.getConnectionStatus(currentQboSessionId);
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch vendors from QBO
        const qboResult = await qboMcp.searchVendors(currentQboSessionId, { fetchAll: true });
        if (qboResult.error) {
            return { success: false, error: `Failed to fetch QBO vendors: ${qboResult.error}` };
        }

        // Parse QBO response
        let qboVendors = [];
        if (qboResult.content) {
            for (const item of qboResult.content) {
                if (item.text && !item.text.startsWith('Found')) {
                    try {
                        const vendor = JSON.parse(item.text);
                        qboVendors.push(vendor);
                    } catch (e) {
                        // Not a JSON vendor record
                    }
                }
            }
        }

        if (params.limit && params.limit > 0) {
            qboVendors = qboVendors.slice(0, params.limit);
        }

        if (qboVendors.length === 0) {
            return { success: true, message: 'No vendors found to migrate', migrated: 0, skipped: 0 };
        }

        const result = await migrateVendors(qboVendors, mcp);

        const idMaps = getMigrationIdMap(currentQboSessionId);
        Object.assign(idMaps.vendors, result.idMap);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} vendors migrated, ${result.skipped} skipped`,
            migrated: result.migrated,
            skipped: result.skipped,
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateAccounts(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const status = await qboMcp.getConnectionStatus(currentQboSessionId);
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch accounts from QBO
        const qboResult = await qboMcp.searchAccounts(currentQboSessionId, { fetchAll: true });
        if (qboResult.error) {
            return { success: false, error: `Failed to fetch QBO accounts: ${qboResult.error}` };
        }

        // Parse QBO response
        let qboAccounts = [];
        if (qboResult.content) {
            for (const item of qboResult.content) {
                if (item.text && !item.text.startsWith('Found')) {
                    try {
                        const account = JSON.parse(item.text);
                        qboAccounts.push(account);
                    } catch (e) {
                        // Not a JSON account record
                    }
                }
            }
        }

        if (params.limit && params.limit > 0) {
            qboAccounts = qboAccounts.slice(0, params.limit);
        }

        if (qboAccounts.length === 0) {
            return { success: true, message: 'No accounts found to migrate', migrated: 0, skipped: 0 };
        }

        const result = await migrateAccounts(qboAccounts, mcp);

        const idMaps = getMigrationIdMap(currentQboSessionId);
        Object.assign(idMaps.accounts, result.idMap);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} accounts migrated, ${result.skipped} skipped`,
            migrated: result.migrated,
            skipped: result.skipped,
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateInvoices(params) {
    if (!currentQboSessionId) {
        return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
    }

    try {
        const status = await qboMcp.getConnectionStatus(currentQboSessionId);
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Check if customers have been migrated
        const idMaps = getMigrationIdMap(currentQboSessionId);
        if (Object.keys(idMaps.customers).length === 0) {
            return {
                success: false,
                error: 'Customers must be migrated before invoices. Run migrate_customers first.'
            };
        }

        // Fetch invoices from QBO
        const qboResult = await qboMcp.searchInvoices(currentQboSessionId, { fetchAll: true });
        if (qboResult.error) {
            return { success: false, error: `Failed to fetch QBO invoices: ${qboResult.error}` };
        }

        // Parse QBO response
        let qboInvoices = [];
        if (qboResult.content) {
            for (const item of qboResult.content) {
                if (item.text && !item.text.startsWith('Found')) {
                    try {
                        const invoice = JSON.parse(item.text);
                        qboInvoices.push(invoice);
                    } catch (e) {
                        // Not a JSON invoice record
                    }
                }
            }
        }

        // Filter to unpaid only if requested
        if (params.unpaid_only) {
            qboInvoices = qboInvoices.filter(inv => {
                const balance = parseFloat(inv.Balance) || 0;
                return balance > 0;
            });
        }

        if (params.limit && params.limit > 0) {
            qboInvoices = qboInvoices.slice(0, params.limit);
        }

        if (qboInvoices.length === 0) {
            return { success: true, message: 'No invoices found to migrate', migrated: 0, skipped: 0 };
        }

        const result = await migrateInvoices(qboInvoices, mcp, idMaps.customers);

        Object.assign(idMaps.invoices, result.idMap);

        // Calculate total value migrated
        const totalValue = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} invoices migrated, ${result.skipped} skipped`,
            migrated: result.migrated,
            skipped: result.skipped,
            totalValue: formatCurrency(totalValue),
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Function Dispatcher
// ============================================================================

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
        case 'create_customer':
            return executeCreateCustomer(args);
        case 'create_vendor':
            return executeCreateVendor(args);
        case 'create_account':
            return executeCreateAccount(args);
        // QBO Tools
        case 'qbo_get_status':
            return executeQboGetStatus();
        case 'qbo_analyze_migration':
            return executeQboAnalyzeMigration();
        case 'qbo_search_customers':
            return executeQboSearchCustomers(args);
        case 'qbo_search_invoices':
            return executeQboSearchInvoices(args);
        case 'qbo_search_vendors':
            return executeQboSearchVendors(args);
        case 'qbo_search_accounts':
            return executeQboSearchAccounts(args);
        case 'qbo_search_bills':
            return executeQboSearchBills(args);
        // Migration Tools
        case 'migrate_customers':
            return executeMigrateCustomers(args);
        case 'migrate_vendors':
            return executeMigrateVendors(args);
        case 'migrate_accounts':
            return executeMigrateAccounts(args);
        case 'migrate_invoices':
            return executeMigrateInvoices(args);
        default:
            return { success: false, error: `Unknown function: ${name}` };
    }
}

// ============================================================================
// Uncertainty Detection
// ============================================================================

function detectUncertainty(content) {
    const uncertainPhrases = [
        "i'm not sure", "i don't have access", "i cannot find",
        "not entirely certain", "may not be accurate", "could not retrieve",
        "based on limited data", "no results found", "unable to find"
    ];
    const lowerContent = content.toLowerCase();
    return uncertainPhrases.some(phrase => lowerContent.includes(phrase));
}

// ============================================================================
// File Processing Helpers
// ============================================================================

async function extractTextFromImage(filePath) {
    try {
        // Initialize Scribe with default settings
        const scribe = new Scribe.createScheduler({
            errorHandler: (err) => console.error('Scribe OCR error:', err)
        });
        
        // Import the image
        await scribe.importFiles([filePath]);
        
        // Recognize text
        await scribe.recognize();
        
        // Extract text
        const text = await scribe.exportData('text');
        
        // Terminate scheduler
        await scribe.terminate();
        
        return text;
    } catch (error) {
        console.error('OCR error:', error);
        return null;
    }
}

async function extractTextFromPDF(filePath) {
    try {
        // Initialize Scribe for PDF
        const scribe = new Scribe.createScheduler({
            errorHandler: (err) => console.error('Scribe PDF error:', err)
        });
        
        // Import the PDF
        await scribe.importFiles([filePath]);
        
        // Recognize text (handles both native text and scanned PDFs)
        await scribe.recognize();
        
        // Extract text
        const text = await scribe.exportData('text');
        
        // Terminate scheduler
        await scribe.terminate();
        
        return text;
    } catch (error) {
        console.error('PDF extraction error:', error);
        return null;
    }
}

async function processUploadedFile(file) {
    const result = {
        fileId: randomUUID(),
        fileName: file.originalname,
        fileType: file.mimetype,
        filePath: file.path,
        fileSize: file.size,
        extractedText: null,
        metadata: {}
    };

    // Extract text from images using OCR
    if (file.mimetype.startsWith('image/')) {
        result.extractedText = await extractTextFromImage(file.path);
        result.metadata.ocrProcessed = true;
    }
    
    // Extract text from PDFs (native text or scanned)
    if (file.mimetype === 'application/pdf') {
        result.extractedText = await extractTextFromPDF(file.path);
        result.metadata.pdfProcessed = true;
    }

    // Read file as base64 for vision API (images only)
    if (file.mimetype.startsWith('image/')) {
        const fileBuffer = await fs.readFile(file.path);
        result.base64Data = fileBuffer.toString('base64');
    }

    return result;
}

// ============================================================================
// API Endpoints
// ============================================================================

// ============================================================================
// QBO OAuth Endpoints
// ============================================================================

// Store for QBO sessions (in production, use database)
const qboSessions = new Map();

// Generate or get QBO session ID from request
function getQboSessionId(req) {
    // Use a header or generate a new one based on client identifier
    let sessionId = req.headers['x-qbo-session-id'];
    if (!sessionId) {
        // Could also use cookies or auth token as identifier
        sessionId = req.headers['x-client-id'] || randomUUID();
    }
    return sessionId;
}

// Initiate QBO OAuth flow
app.post('/api/qbo/connect', async (req, res) => {
    try {
        const sessionId = getQboSessionId(req);
        const redirectUrl = req.body.redirectUrl || APP_URL;

        const result = await qboMcp.initiateOAuth(sessionId, redirectUrl);

        if (result.error) {
            return res.status(500).json({ error: result.error });
        }

        // Store session mapping
        qboSessions.set(sessionId, { createdAt: new Date() });

        res.json({
            success: true,
            authUrl: result.authUrl,
            sessionId: sessionId
        });
    } catch (error) {
        console.error('QBO connect error:', error);
        res.status(500).json({ error: 'Failed to initiate QBO connection' });
    }
});

// QBO OAuth callback (proxy to QBO MCP server)
app.get('/api/qbo/callback', async (req, res) => {
    // The QBO MCP server handles the callback directly
    // This route is here in case we want to handle it in chat-api instead
    const callbackUrl = `${QBO_MCP_URL}/oauth/callback?${new URLSearchParams(req.query).toString()}`;
    res.redirect(callbackUrl);
});

// Get QBO connection status
app.get('/api/qbo/status', async (req, res) => {
    try {
        const sessionId = getQboSessionId(req);
        const status = await qboMcp.getConnectionStatus(sessionId);

        res.json({
            sessionId,
            ...status
        });
    } catch (error) {
        console.error('QBO status error:', error);
        res.status(500).json({ error: 'Failed to get QBO status' });
    }
});

// Disconnect QBO
app.post('/api/qbo/disconnect', async (req, res) => {
    try {
        const sessionId = getQboSessionId(req);
        const result = await qboMcp.disconnect(sessionId);

        // Clear local session
        qboSessions.delete(sessionId);

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('QBO disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect QBO' });
    }
});

// Analyze QBO data for migration
app.get('/api/qbo/analyze', async (req, res) => {
    try {
        const sessionId = getQboSessionId(req);

        // Check connection first
        const status = await qboMcp.getConnectionStatus(sessionId);
        if (!status.connected) {
            return res.status(400).json({
                error: 'Not connected to QuickBooks',
                needsAuth: true
            });
        }

        const analysis = await qboMcp.analyzeForMigration(sessionId);
        res.json(analysis);
    } catch (error) {
        console.error('QBO analyze error:', error);
        res.status(500).json({ error: 'Failed to analyze QBO data' });
    }
});

// ============================================================================
// File Endpoints
// ============================================================================

// File upload endpoint
app.post('/api/chat/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileInfo = await processUploadedFile(req.file);
        
        res.json({
            success: true,
            file: {
                fileId: fileInfo.fileId,
                fileName: fileInfo.fileName,
                fileType: fileInfo.fileType,
                fileSize: fileInfo.fileSize,
                extractedText: fileInfo.extractedText,
                metadata: fileInfo.metadata
            }
        });
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ error: 'Failed to process file', details: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message, history = [], attachments = [] } = req.body;

        // Set QBO session ID for tool execution (from request header)
        const qboSessionId = getQboSessionId(req);
        setCurrentQboSession(qboSessionId);

        // Build user message content
        let userContent = message;
        
        // If there are image attachments, use vision model with multi-modal content
        const userMessage = { role: 'user', content: userContent };
        
        // Add attachment context to message if present
        if (attachments && attachments.length > 0) {
            const attachmentContext = attachments.map(att => {
                let context = `\n\n[Attached file: ${att.fileName} (${att.fileType})]`;
                if (att.extractedText) {
                    context += `\nExtracted text:\n${att.extractedText}`;
                }
                return context;
            }).join('');
            userContent += attachmentContext;
            userMessage.content = userContent;
        }
        
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(msg => ({ role: msg.role, content: msg.content })),
            userMessage
        ];

        let response = await client.getChatCompletions(deploymentName, messages, { tools, toolChoice: 'auto' });
        let responseMessage = response.choices[0].message;
        let toolUsed = null;

        let iterations = 0;
        const maxIterations = 3;

        while (responseMessage.toolCalls && responseMessage.toolCalls.length > 0 && iterations < maxIterations) {
            iterations++;
            messages.push(responseMessage);

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
        res.status(500).json({ 
            error: 'I had trouble processing your request. This might be a temporary issue.',
            details: error.message,
            retryable: true 
        });
    }
});

app.get('/api/insights', async (req, res) => {
    try {
        const insights = [];
        const today = getTodayDate();
        const nextThreeDays = getDateInDays(3);

        // Check overdue invoices
        const overdueResult = await mcp.readRecords('invoices', {
            filter: `Status ne 'Paid' and DueDate lt ${today}`,
            first: 100
        });
        const overdueInvoices = overdueResult.result?.value || [];
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

        // Check upcoming due dates
        const upcomingResult = await mcp.readRecords('invoices', {
            filter: `Status eq 'Sent' and DueDate ge ${today} and DueDate le ${nextThreeDays}`,
            first: 100
        });
        const upcomingInvoices = upcomingResult.result?.value || [];
        if (upcomingInvoices.length > 0) {
            insights.push({
                type: 'upcoming_due',
                severity: 'info',
                title: 'Upcoming Due Dates',
                message: `${upcomingInvoices.length} invoice${upcomingInvoices.length > 1 ? 's' : ''} due in the next 3 days`,
                action: { label: 'Review', path: '/invoices' }
            });
        }

        // Check pending bank transactions
        const pendingResult = await mcp.readRecords('banktransactions', {
            filter: `Status eq 'Pending'`,
            first: 100
        });
        const pendingTransactions = pendingResult.result?.value || [];
        if (pendingTransactions.length > 0) {
            insights.push({
                type: 'pending_review',
                severity: 'info',
                title: 'Transactions Need Review',
                message: `${pendingTransactions.length} bank transaction${pendingTransactions.length > 1 ? 's' : ''} awaiting review`,
                action: { label: 'Review Now', path: '/review' }
            });
        }

        res.json({ insights });
    } catch (error) {
        console.error('Insights error:', error);
        res.status(500).json({ error: 'Failed to fetch insights', details: error.message });
    }
});

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 7071;

// Initialize and start server
async function startServer() {
    await initializeUploadDir();
    
    app.listen(PORT, () => {
        console.log(`Chat API running on http://localhost:${PORT}`);
        console.log(`Deployment: ${deploymentName}`);
        console.log(`DAB MCP URL: ${DAB_MCP_URL}`);
    });
}

startServer();
