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
    migrateProducts,
    migrateAccounts,
    migrateInvoices,
    migrateBills,
    migratePayments,
    migrateBillPayments,
    migrateJournalEntries
} from './migration/db-executor.js';
import { qboAuth } from './qbo-auth.js';
import { plaidService } from './plaid-service.js';
import { plaidSync } from './plaid-sync.js';
import { plaidScheduler } from './plaid-scheduler.js';
import { journalEntryService, ACCOUNT_TYPES } from './journal-entry-service.js';
import { mcpManager } from './mcp-client.js';
import githubRoutes from './src/routes/github.js';
import deploymentsRouter from './src/routes/deployments.js';
import usersRouter from './src/routes/users.js';
import { validateJWT, optionalJWT, requireRole, requirePermission, requireMFA } from './src/middleware/auth.js';
import { resolveTenant, optionalTenant } from './src/middleware/tenant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ============================================================================
// Retry Logic and Validation Helpers for AI API Calls
// ============================================================================

/**
 * Sleep utility for exponential backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds (default: 10000)
 * @returns {Promise<any>}
 */
async function withRetry(fn, options = {}) {
    const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = options;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries) {
                // Calculate exponential backoff delay: baseDelay * 2^attempt
                const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
                console.warn(`AI API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, error.message);
                await sleep(delay);
            }
        }
    }

    // All retries exhausted
    throw lastError;
}

/**
 * Valid values for priority field
 */
const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

/**
 * Valid values for featureType field
 */
const VALID_FEATURE_TYPES = ['Feature', 'Bug', 'Enhancement', 'Refactor'];

/**
 * Default values for extracted intent
 */
const DEFAULT_INTENT = {
    priority: 'Medium',
    featureType: 'Enhancement'
};

/**
 * Validate and normalize the extracted intent from AI response
 * Ensures priority and featureType have valid values
 * @param {Object|null} intent - Extracted intent object
 * @returns {Object|null} - Validated intent or null
 */
function validateExtractedIntent(intent) {
    if (!intent || typeof intent !== 'object') {
        return null;
    }

    const validated = { ...intent };

    // Validate and normalize priority
    if (validated.priority) {
        // Try to match the priority (case-insensitive)
        const normalizedPriority = validated.priority.toString().trim();
        const matchedPriority = VALID_PRIORITIES.find(
            p => p.toLowerCase() === normalizedPriority.toLowerCase()
        );

        if (matchedPriority) {
            validated.priority = matchedPriority;
        } else {
            console.warn(`Invalid priority value "${validated.priority}", using default: ${DEFAULT_INTENT.priority}`);
            validated.priority = DEFAULT_INTENT.priority;
        }
    } else {
        validated.priority = DEFAULT_INTENT.priority;
    }

    // Validate and normalize featureType
    if (validated.featureType) {
        // Try to match the featureType (case-insensitive)
        const normalizedType = validated.featureType.toString().trim();
        const matchedType = VALID_FEATURE_TYPES.find(
            t => t.toLowerCase() === normalizedType.toLowerCase()
        );

        if (matchedType) {
            validated.featureType = matchedType;
        } else {
            // Try mapping common variations
            const typeMapping = {
                'new-feature': 'Feature',
                'new feature': 'Feature',
                'bug-fix': 'Bug',
                'bugfix': 'Bug',
                'fix': 'Bug',
                'improvement': 'Enhancement',
                'enhance': 'Enhancement'
            };

            const mappedType = typeMapping[normalizedType.toLowerCase()];
            if (mappedType) {
                validated.featureType = mappedType;
            } else {
                console.warn(`Invalid featureType value "${validated.featureType}", using default: ${DEFAULT_INTENT.featureType}`);
                validated.featureType = DEFAULT_INTENT.featureType;
            }
        }
    } else {
        validated.featureType = DEFAULT_INTENT.featureType;
    }

    return validated;
}

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// Authentication & Authorization Middleware
// ============================================================================
// Public routes (no auth required):
// - Health checks, OAuth callbacks, webhook endpoints
// Protected routes use validateJWT + resolveTenant middleware

// Health check endpoint (no auth)
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// User management API routes (auth required)
app.use('/api/users', validateJWT, resolveTenant, usersRouter);

// GitHub/PR workflow API routes
app.use('/api/github', githubRoutes);

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

// Azure OpenAI client - only initialize if credentials are available
const client = process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY
    ? new OpenAIClient(
        process.env.AZURE_OPENAI_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
    )
    : null;

if (client) {
    console.log('Azure OpenAI client initialized');
} else {
    console.warn('Azure OpenAI not configured. AI features will be limited.');
}

const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
const DAB_MCP_URL = process.env.DAB_MCP_URL || 'http://localhost:5000/mcp';
const QBO_MCP_URL = process.env.QBO_MCP_URL || 'http://localhost:8001/mcp';
const DAB_REST_URL = process.env.DAB_REST_URL || 'http://localhost:5000/api';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Initialize MCP servers
mcpManager.addServer('dab', DAB_MCP_URL);
mcpManager.addServer('qbo', QBO_MCP_URL);

// Dynamic tools discovered from MCP servers (populated at startup)
let dynamicTools = [];

// ============================================================================
// REST Client for DAB (used for onboarding tools - more reliable than MCP)
// ============================================================================

class DabRestClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async get(entity, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.filter) params.append('$filter', options.filter);
            if (options.orderby) params.append('$orderby', Array.isArray(options.orderby) ? options.orderby.join(',') : options.orderby);
            if (options.select) params.append('$select', options.select);
            if (options.first) params.append('$first', options.first.toString());

            const url = `${this.baseUrl}/${entity}${params.toString() ? '?' + params.toString() : ''}`;
            const response = await axios.get(url);
            return { success: true, value: response.data.value || [] };
        } catch (error) {
            console.error(`REST GET ${entity} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async getById(entity, id) {
        try {
            const url = `${this.baseUrl}/${entity}/Id/${id}`;
            const response = await axios.get(url);
            return { success: true, value: response.data };
        } catch (error) {
            console.error(`REST GET ${entity}/${id} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async create(entity, data) {
        try {
            const response = await axios.post(`${this.baseUrl}/${entity}`, data, {
                headers: { 'Content-Type': 'application/json' }
            });
            // DAB returns {"value":[{...}]}, extract the first item
            const created = response.data.value?.[0] || response.data;
            return { success: true, value: created };
        } catch (error) {
            console.error(`REST POST ${entity} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async update(entity, id, data) {
        try {
            const response = await axios.patch(`${this.baseUrl}/${entity}/Id/${id}`, data, {
                headers: { 'Content-Type': 'application/json' }
            });
            return { success: true, value: response.data };
        } catch (error) {
            console.error(`REST PATCH ${entity}/${id} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async delete(entity, id) {
        try {
            await axios.delete(`${this.baseUrl}/${entity}/Id/${id}`);
            return { success: true };
        } catch (error) {
            console.error(`REST DELETE ${entity}/${id} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }
}

// Create REST client instance for onboarding tools
const dab = new DabRestClient(DAB_REST_URL);

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
// System Prompt and Tools
// ============================================================================

const systemPrompt = `You are an expert accounting assistant for Modern Accounting (also known as ACTO). When users say "Modern", "Modern Accounting", or "MA", they are referring to this system and its database. When users say "QB", "QBO", or "QuickBooks", they mean QuickBooks Online. You help users with:

1. ONBOARDING NEW USERS: Handle these common onboarding responses:
   - "Yes, from QuickBooks" or mentions QBO: Check qbo_get_status. If not connected, say "Great! Click the 'Connect to QuickBooks' button above to securely link your account. Once connected, I'll analyze your data and help you migrate." If connected, use qbo_analyze_migration to show what can be migrated.
   - "Yes, from another platform" or Xero/FreshBooks/Wave: Say "I can help! While I don't have direct integration yet, you can export your data as CSV files and I'll help you import them. What would you like to start with - customers, chart of accounts, or invoices?"
   - "Starting fresh" or new business: Use create_company to create their company record, then use list_industry_templates to show available industry templates. After they choose, use generate_coa_from_template to create their chart of accounts.

COMPANY SETUP FLOW:
When helping users set up a new company, follow this conversational flow:
1. Ask for company name and basic info (business type, industry description)
2. Use create_company to create the company record
3. Use list_industry_templates to show template options and ask which matches their business:
   - "IT Consulting" or "Professional Services" -> it_consulting template
   - "Online store" or "E-commerce" or "Retail" -> ecommerce_retail template
   - "Restaurant" or "Food service" or "Cafe" -> restaurant_food template
   - "Construction" or "Contractor" or "Trades" -> construction template
   - "Not sure" or "General" -> general_business template
4. Use generate_coa_from_template to create accounts
5. Celebrate: "Your chart of accounts is ready with X accounts tailored for your business!"
6. Offer next steps: "Would you like to set up bank accounts, or import data from another system?"

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
- MIGRATION CONTEXT: Once a user imports data from a source (e.g., QuickBooks), assume subsequent import requests are from the same source. Confirm briefly: "I'll import your vendors from QuickBooks - sound good?" or "Importing invoices from QuickBooks..." Don't ask them to re-specify the source each time.

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
1. CRITICAL: Always use qbo_analyze_migration FIRST - it now shows both QBO data AND what's already imported to ACTO
2. NEVER suggest importing entities that are already imported - check the "imported" counts in the analysis
3. Ask for confirmation before running migration tools
4. Migrate in order: Accounts -> Customers & Vendors -> Products -> Invoices/Bills
5. Report results clearly: "Created X, Skipped Y (already exist), Z errors"
6. If errors occur, explain what went wrong and offer to retry
7. Celebrate successful migrations with positive feedback!

MIGRATION STATUS AWARENESS:
- qbo_analyze_migration returns: qbo (counts in QuickBooks), imported (already in ACTO), remaining (still need to import)
- Use get_migration_status to check ACTO import status independently
- ALWAYS check what's been imported before suggesting what to migrate next
- Show "X of Y already imported" format to give users clear status
- If something is fully imported (remaining = 0), do NOT suggest re-importing it

Migration conversation example:
User: "I want to migrate from QuickBooks"
Assistant: [Check qbo_get_status] "I see you're connected to 'ABC Company' on QuickBooks! Let me analyze your data and check what's already been imported..."
Assistant: [Call qbo_analyze_migration] "Here's your migration status:

**QuickBooks Data:**
- 50 accounts, 150 customers, 25 vendors, 533 invoices

**Already Imported to ACTO:**
- 48 accounts (of 50) - almost complete!
- 0 customers, 0 vendors, 0 invoices

**Remaining to Import:**
- 2 accounts, 150 customers, 25 vendors, 533 invoices

Your chart of accounts is almost done! Would you like me to finish importing the remaining 2 accounts, then move on to customers and vendors?"

User: "Yes, let's do it"
Assistant: [Call migrate_accounts] "Chart of accounts complete: 2 more accounts imported (48 were already there).
Now migrating customers..."
[Call migrate_customers] "Customers migrated: 150 created.
Now migrating vendors..."
[Call migrate_vendors] "Vendors migrated: 25 created.

Your master data is now fully imported! Ready to migrate invoices when you are."

GENERIC DATABASE ACCESS:
You have direct database access via these MCP tools - use them for any data queries:
- dab_describe_entities: Discover available tables and their fields
- dab_query: Query ANY table with filters (invoices, invoicelines, customers, accounts, journalentries, etc.)
- dab_create: Create records in any table

IMPORTANT: For specific data lookups (like "show invoice 9126 line items"), use dab_query directly:
  dab_query({ entity: "invoicelines", filter: "InvoiceId eq 'xxx'" })
This is MORE EFFICIENT than using legacy tools like query_invoices which don't return line items.

Common DAB entities: invoices, invoicelines, customers, vendors, accounts, journalentries, journalentrylines, bills, billlines, banktransactions, payments, paymentapplications

QUICKBOOKS ONLINE ACCESS:
You also have direct QBO access via these tools:
- qbo_query: Run any SQL-like query against QBO (e.g., "SELECT * FROM Invoice WHERE DocNumber = '9126'")
- qbo_get_invoice: Get a specific invoice with all line items by ID or DocNumber

QBO entities: Customer, Vendor, Invoice, Bill, Payment, BillPayment, JournalEntry, Account, Item
Note: QBO line items are embedded in parent objects (Invoice.Line), not separate tables.

WHEN TO USE WHICH:
- For ACTO/Modern Accounting data → use dab_query
- For QuickBooks Online data → use qbo_query or qbo_get_invoice
- For migration comparisons → query both systems`;





const tools = [
    // =========================================================================
    // Generic MCP Tools - Direct database access via DAB MCP
    // =========================================================================
    {
        type: 'function',
        function: {
            name: 'dab_describe_entities',
            description: 'List all available database entities/tables and their fields. Call this first to discover what data is available. Returns entity names, field names, types, and permissions.',
            parameters: {
                type: 'object',
                properties: {
                    entities: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Optional: specific entity names to describe. Omit to get all entities.'
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'dab_query',
            description: 'Query any database table/entity. Use dab_describe_entities first to discover available entities and fields. Supports OData-style filtering.',
            parameters: {
                type: 'object',
                properties: {
                    entity: { type: 'string', description: 'Entity name to query (e.g., invoices, invoicelines, customers, accounts, journalentries)' },
                    filter: { type: 'string', description: 'OData filter expression (e.g., "InvoiceId eq \'abc-123\'", "Status eq \'Pending\'", "Amount gt 100")' },
                    select: { type: 'string', description: 'Comma-separated field names to return (e.g., "Id,Name,Amount")' },
                    orderby: { type: 'string', description: 'Field to sort by (e.g., "CreatedAt desc")' },
                    first: { type: 'number', description: 'Max records to return (default 100)' }
                },
                required: ['entity']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'dab_create',
            description: 'Create a new record in any database table/entity. Use dab_describe_entities first to see required fields.',
            parameters: {
                type: 'object',
                properties: {
                    entity: { type: 'string', description: 'Entity name (e.g., invoicelines, customers)' },
                    data: { type: 'object', description: 'Field values for the new record' }
                },
                required: ['entity', 'data']
            }
        }
    },
    // =========================================================================
    // Generic QBO MCP Tools - Direct QuickBooks Online access
    // =========================================================================
    {
        type: 'function',
        function: {
            name: 'qbo_query',
            description: 'Run a SQL-like query against QuickBooks Online. QBO entities: Customer, Vendor, Invoice, Bill, Payment, BillPayment, JournalEntry, Account, Item. Note: Line items are embedded in parent objects (Invoice.Line, Bill.Line), not separate entities.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'SQL-like query (e.g., "SELECT * FROM Invoice WHERE DocNumber = \'9126\'", "SELECT * FROM Customer WHERE DisplayName LIKE \'%Smith%\'")'
                    },
                    fetchAll: {
                        type: 'boolean',
                        description: 'If true, returns full raw data including line items. If false, returns summarized data.'
                    }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_get_invoice',
            description: 'Get a specific QBO invoice by ID or DocNumber, including all line items.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Invoice ID' },
                    docNumber: { type: 'string', description: 'Invoice number (e.g., "9126")' }
                }
            }
        }
    },
    // =========================================================================
    // Legacy Custom Tools (kept for backwards compatibility)
    // =========================================================================
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
            description: 'Analyze QuickBooks Online data for migration. Returns QBO entity counts, what has ALREADY been imported to ACTO, and what REMAINS to import. ALWAYS use this before suggesting migration steps to avoid re-importing existing data.',
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
    // ========== Migration Status Tools ==========
    {
        type: 'function',
        function: {
            name: 'get_migration_status',
            description: 'Check what data has been imported from an external system (like QuickBooks) to ACTO. Use this BEFORE suggesting migrations to see what has already been imported vs what remains.',
            parameters: {
                type: 'object',
                properties: {
                    source_system: {
                        type: 'string',
                        enum: ['QBO'],
                        description: 'Source system to check (default: QBO)'
                    }
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
            name: 'migrate_products',
            description: 'Migrate products and services from QuickBooks Online to ACTO.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of items to migrate (for testing). Omit to migrate all.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_products',
            description: 'Delete products/services from ACTO. DANGEROUS: Use preview mode first, then confirm with exact count. Always show user what will be deleted before confirming.',
            parameters: {
                type: 'object',
                properties: {
                    preview: {
                        type: 'boolean',
                        description: 'If true (default), only shows count and sample of products to delete. Set to false to actually delete.',
                        default: true
                    },
                    confirm_count: {
                        type: 'number',
                        description: 'Required for actual deletion. Must match exact count of products. User must explicitly confirm this number.'
                    }
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
    },
    {
        type: 'function',
        function: {
            name: 'migrate_bills',
            description: 'Migrate bills from QuickBooks Online to ACTO. Requires vendors and accounts to be migrated first.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of bills to migrate (for testing). Omit to migrate all.' },
                    unpaid_only: { type: 'boolean', description: 'Only migrate unpaid/open bills' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_payments',
            description: 'Migrate customer payments from QuickBooks Online to ACTO. Requires customers and invoices to be migrated first.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of payments to migrate (for testing). Omit to migrate all.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_bill_payments',
            description: 'Migrate vendor bill payments from QuickBooks Online to ACTO. Requires vendors, accounts, and bills to be migrated first.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of bill payments to migrate (for testing). Omit to migrate all.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_journal_entries',
            description: 'Migrate journal entries from QuickBooks Online to ACTO. Requires accounts to be migrated first.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Limit number of journal entries to migrate (for testing). Omit to migrate all.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_invoice_lines',
            description: 'PREFERRED TOOL for importing/migrating invoice line items from QuickBooks Online to Modern Accounting. Use this when a user asks to import, migrate, or sync line items for a specific invoice. This tool uses the stored QBO connection - no separate QBO session needed.',
            parameters: {
                type: 'object',
                properties: {
                    invoice_number: { type: 'string', description: 'The invoice number (e.g., "5117")' }
                },
                required: ['invoice_number']
            }
        }
    },
    // ========== Company Onboarding Tools ==========
    {
        type: 'function',
        function: {
            name: 'list_industry_templates',
            description: 'Get available industry templates for company setup. Shows template names, descriptions, and categories to help user choose.',
            parameters: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        description: 'Filter by category (Services, Retail, Food, Construction, General)'
                    }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_company',
            description: 'Create a new company during onboarding. Use this when user provides their company name to start setup.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Company name' },
                    legal_name: { type: 'string', description: 'Legal/registered name (if different)' },
                    industry: { type: 'string', description: 'Industry type' },
                    business_type: {
                        type: 'string',
                        enum: ['Sole Proprietor', 'LLC', 'S-Corp', 'C-Corp', 'Partnership', 'Non-Profit'],
                        description: 'Business entity type'
                    },
                    address: { type: 'string', description: 'Street address' },
                    city: { type: 'string', description: 'City' },
                    state: { type: 'string', description: 'State' },
                    zip_code: { type: 'string', description: 'ZIP code' },
                    phone: { type: 'string', description: 'Phone number' },
                    email: { type: 'string', description: 'Email address' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_industry_template',
            description: 'Get details of a specific industry template including all accounts in the COA.',
            parameters: {
                type: 'object',
                properties: {
                    template_code: {
                        type: 'string',
                        description: 'Industry template code (it_consulting, ecommerce_retail, restaurant_food, construction, general_business)'
                    }
                },
                required: ['template_code']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_coa_from_template',
            description: 'Generate chart of accounts from the selected industry template. Creates all accounts in the database.',
            parameters: {
                type: 'object',
                properties: {
                    company_id: { type: 'string', description: 'Company ID' },
                    template_code: { type: 'string', description: 'Industry template code' },
                    preview_only: { type: 'boolean', description: 'If true, only show what would be created without creating' }
                },
                required: ['company_id', 'template_code']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_onboarding_status',
            description: 'Get the current onboarding status and progress for a company.',
            parameters: {
                type: 'object',
                properties: {
                    company_id: { type: 'string', description: 'Company ID (optional - uses most recent company if not specified)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_onboarding_step',
            description: 'Mark an onboarding step as completed or skipped.',
            parameters: {
                type: 'object',
                properties: {
                    company_id: { type: 'string', description: 'Company ID' },
                    step_code: { type: 'string', description: 'Step code (company_info, industry_selection, coa_setup, bank_accounts, migration)' },
                    status: {
                        type: 'string',
                        enum: ['InProgress', 'Completed', 'Skipped'],
                        description: 'New status'
                    },
                    skip_reason: { type: 'string', description: 'Reason for skipping (if status is Skipped)' }
                },
                required: ['company_id', 'step_code', 'status']
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
// Generic MCP Tool Execution Functions
// ============================================================================

async function executeDabDescribeEntities(params) {
    try {
        const result = await mcp.describeEntities(params.entities ? { entities: params.entities } : {});
        if (result.error) {
            return { success: false, error: result.error };
        }
        // Simplify the response for the AI - just entity names and key fields
        const entities = result.result?.entities || result.entities || [];
        const simplified = entities.map(e => ({
            name: e.name,
            fields: (e.fields || []).map(f => ({ name: f.name, type: f.type })).slice(0, 20),
            permissions: e.permissions
        }));
        return { success: true, entities: simplified };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeDabQuery(params) {
    try {
        const options = {};
        if (params.filter) options.filter = params.filter;
        if (params.select) options.select = params.select;
        if (params.orderby) options.orderby = [params.orderby];
        options.first = params.first || 100;

        const result = await mcp.readRecords(params.entity, options);
        if (result.error) {
            return { success: false, error: result.error, entity: params.entity };
        }
        const records = result.result?.value || [];
        return {
            success: true,
            entity: params.entity,
            count: records.length,
            records: records.slice(0, 50) // Limit to prevent token overflow
        };
    } catch (error) {
        return { success: false, error: error.message, entity: params.entity };
    }
}

async function executeDabCreate(params) {
    try {
        const result = await mcp.createRecord(params.entity, params.data);
        if (result.error) {
            return { success: false, error: result.error, entity: params.entity };
        }
        return {
            success: true,
            entity: params.entity,
            created: result.result || result
        };
    } catch (error) {
        return { success: false, error: error.message, entity: params.entity };
    }
}

// ============================================================================
// Generic QBO Tool Execution Functions
// ============================================================================

async function executeQboQuery(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks. Please connect first.', needsAuth: true };
        }

        const result = await qboAuth.query(params.query);

        // QBO returns results keyed by entity type (e.g., { Invoice: [...], Customer: [...] })
        const entityTypes = Object.keys(result || {}).filter(k => k !== 'startPosition' && k !== 'maxResults' && k !== 'totalCount');

        if (entityTypes.length === 0) {
            return { success: true, count: 0, data: [] };
        }

        const entityType = entityTypes[0];
        const records = result[entityType] || [];

        // If fetchAll, return full data (including line items), otherwise summarize
        if (params.fetchAll) {
            return {
                success: true,
                entityType,
                count: records.length,
                data: records.slice(0, 20) // Limit to prevent token overflow
            };
        }

        // Return summarized data
        const summarized = records.slice(0, 50).map(r => ({
            Id: r.Id,
            Name: r.DisplayName || r.Name || r.DocNumber,
            Type: r.AccountType || r.Type,
            Date: r.TxnDate || r.MetaData?.CreateTime,
            Amount: r.TotalAmt || r.Balance || r.CurrentBalance,
            Status: r.Balance > 0 ? 'Open' : 'Paid',
            LineCount: r.Line?.length || 0
        }));

        return {
            success: true,
            entityType,
            count: records.length,
            data: summarized
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboGetInvoice(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks. Please connect first.', needsAuth: true };
        }

        let query;
        if (params.id) {
            query = `SELECT * FROM Invoice WHERE Id = '${params.id}'`;
        } else if (params.docNumber) {
            query = `SELECT * FROM Invoice WHERE DocNumber = '${params.docNumber}'`;
        } else {
            return { success: false, error: 'Please provide either id or docNumber' };
        }

        const result = await qboAuth.query(query);
        const invoices = result?.Invoice || [];

        if (invoices.length === 0) {
            return { success: false, error: 'Invoice not found' };
        }

        const inv = invoices[0];
        return {
            success: true,
            invoice: {
                id: inv.Id,
                docNumber: inv.DocNumber,
                customerName: inv.CustomerRef?.name,
                customerId: inv.CustomerRef?.value,
                date: inv.TxnDate,
                dueDate: inv.DueDate,
                total: inv.TotalAmt,
                balance: inv.Balance,
                status: inv.Balance > 0 ? 'Open' : 'Paid',
                lineCount: inv.Line?.length || 0,
                lines: (inv.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail').map(l => ({
                    description: l.Description,
                    quantity: l.SalesItemLineDetail?.Qty,
                    unitPrice: l.SalesItemLineDetail?.UnitPrice,
                    amount: l.Amount,
                    itemName: l.SalesItemLineDetail?.ItemRef?.name
                }))
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Legacy Tool Execution Functions (using MCP)
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

// QBO Tool Execution - Now uses qboAuth (DB-backed) instead of qboMcp

async function executeQboGetStatus() {
    try {
        const status = await qboAuth.getStatus();
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
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return {
                success: false,
                error: 'Not connected to QuickBooks Online. Please connect first.',
                needsAuth: true
            };
        }

        // Get QBO data counts
        const qboAnalysis = await qboAuth.analyzeForMigration();

        // Get ACTO import status
        const actoStatus = await executeGetMigrationStatus({ source_system: 'QBO' });

        // Calculate what's remaining to import
        const remaining = {
            customers: Math.max(0, (qboAnalysis.customers || 0) - (actoStatus.imported?.customers || 0)),
            vendors: Math.max(0, (qboAnalysis.vendors || 0) - (actoStatus.imported?.vendors || 0)),
            accounts: Math.max(0, (qboAnalysis.accounts || 0) - (actoStatus.imported?.accounts || 0)),
            products: Math.max(0, (qboAnalysis.items || 0) - (actoStatus.imported?.products || 0)),
            invoices: Math.max(0, (qboAnalysis.invoices || 0) - (actoStatus.imported?.invoices || 0)),
            bills: Math.max(0, (qboAnalysis.bills || 0) - (actoStatus.imported?.bills || 0)),
            payments: Math.max(0, (qboAnalysis.payments || 0) - (actoStatus.imported?.payments || 0)),
            billPayments: Math.max(0, (qboAnalysis.billPayments || 0) - (actoStatus.imported?.billPayments || 0)),
            journalEntries: Math.max(0, (qboAnalysis.journalEntries || 0) - (actoStatus.imported?.journalEntries || 0))
        };

        const totalRemaining = Object.values(remaining).reduce((sum, n) => sum + n, 0);

        return {
            success: true,
            qbo: qboAnalysis,
            imported: actoStatus.imported || {},
            remaining,
            totalRemaining,
            migrationComplete: totalRemaining === 0 && actoStatus.hasImportedData,
            summary: actoStatus.hasImportedData
                ? `Already imported: ${actoStatus.totalRecordsImported} records. Remaining: ${totalRemaining} records.`
                : 'No data has been imported yet. Ready to begin migration.'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeGetMigrationStatus(params) {
    try {
        const sourceSystem = params?.source_system || 'QBO';

        // Query each entity table for counts where SourceSystem matches
        const filter = `SourceSystem eq '${sourceSystem}'`;

        const [customers, vendors, accounts, invoices, bills, products, payments, billPayments, journalEntries] = await Promise.all([
            mcp.readRecords('customers', { filter, first: 10000 }),
            mcp.readRecords('vendors', { filter, first: 10000 }),
            mcp.readRecords('accounts', { filter, first: 10000 }),
            mcp.readRecords('invoices', { filter, first: 10000 }),
            mcp.readRecords('bills', { filter, first: 10000 }),
            mcp.readRecords('productsservices', { filter, first: 10000 }),
            mcp.readRecords('payments', { filter, first: 10000 }),
            mcp.readRecords('billpayments', { filter, first: 10000 }),
            mcp.readRecords('journalentries', { filter, first: 10000 })
        ]);

        const imported = {
            customers: customers.result?.value?.length || 0,
            vendors: vendors.result?.value?.length || 0,
            accounts: accounts.result?.value?.length || 0,
            invoices: invoices.result?.value?.length || 0,
            bills: bills.result?.value?.length || 0,
            products: products.result?.value?.length || 0,
            payments: payments.result?.value?.length || 0,
            billPayments: billPayments.result?.value?.length || 0,
            journalEntries: journalEntries.result?.value?.length || 0
        };

        const totalImported = Object.values(imported).reduce((sum, n) => sum + n, 0);
        const hasImported = totalImported > 0;

        return {
            success: true,
            sourceSystem,
            hasImportedData: hasImported,
            totalRecordsImported: totalImported,
            imported,
            summary: hasImported
                ? `Found ${totalImported} records imported from ${sourceSystem}`
                : `No records have been imported from ${sourceSystem} yet`
        };
    } catch (error) {
        console.error('Error getting migration status:', error);
        return { success: false, error: error.message };
    }
}

async function executeQboSearchCustomers(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const criteria = {
            name: params.display_name,
            active: params.active,
            fetchAll: params.fetch_all
        };

        const result = await qboAuth.searchCustomers(criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchInvoices(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const criteria = {
            fetchAll: params.fetch_all,
            startDate: params.start_date,
            endDate: params.end_date
        };

        const result = await qboAuth.searchInvoices(criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchVendors(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const criteria = {
            name: params.display_name,
            active: params.active,
            fetchAll: params.fetch_all
        };

        const result = await qboAuth.searchVendors(criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchAccounts(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const criteria = {
            type: params.account_type,
            active: params.active,
            fetchAll: params.fetch_all
        };

        const result = await qboAuth.searchAccounts(criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeQboSearchBills(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const criteria = {
            fetchAll: params.fetch_all,
            startDate: params.start_date,
            endDate: params.end_date
        };

        const result = await qboAuth.searchBills(criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Migration Tool Execution Functions
// ============================================================================

// Migration now uses database-driven mappings and qboAuth for API calls

async function executeMigrateCustomers(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch customers from QBO
        const qboResult = await qboAuth.searchCustomers({ fetchAll: true });
        let qboCustomers = qboResult.data || [];

        // Apply limit if specified
        if (params.limit && params.limit > 0) {
            qboCustomers = qboCustomers.slice(0, params.limit);
        }

        if (qboCustomers.length === 0) {
            return { success: true, message: 'No customers found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration (DB-driven)
        const result = await migrateCustomers(qboCustomers, mcp, 'QBO');

        return {
            success: true,
            message: `Migration complete: ${result.migrated} customers migrated, ${result.skipped} skipped. [View Customers](/customers)`,
            migrated: result.migrated,
            skipped: result.skipped,
            viewUrl: '/customers',
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateVendors(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch vendors from QBO
        const qboResult = await qboAuth.searchVendors({ fetchAll: true });
        let qboVendors = qboResult.data || [];

        if (params.limit && params.limit > 0) {
            qboVendors = qboVendors.slice(0, params.limit);
        }

        if (qboVendors.length === 0) {
            return { success: true, message: 'No vendors found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration (DB-driven - no in-memory ID maps needed)
        const result = await migrateVendors(qboVendors, mcp, 'QBO');

        return {
            success: true,
            message: `Migration complete: ${result.migrated} vendors migrated, ${result.skipped} skipped. [View Vendors](/vendors)`,
            migrated: result.migrated,
            skipped: result.skipped,
            viewUrl: '/vendors',
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateProducts(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch items/products from QBO
        const qboResult = await qboAuth.searchItems({ fetchAll: true });
        let qboItems = qboResult.data || [];

        if (params.limit && params.limit > 0) {
            qboItems = qboItems.slice(0, params.limit);
        }

        if (qboItems.length === 0) {
            return { success: true, message: 'No products/services found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration (DB-driven)
        const result = await migrateProducts(qboItems, mcp, 'QBO');

        return {
            success: true,
            message: `Migration complete: ${result.migrated} products/services migrated, ${result.skipped} skipped. [View Products](/products-services)`,
            migrated: result.migrated,
            skipped: result.skipped,
            viewUrl: '/products-services',
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateInvoiceLines(params) {
    try {
        const { invoice_number } = params;
        if (!invoice_number) {
            return { success: false, error: 'Invoice number is required' };
        }

        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // 1. Find the invoice in ACTO by invoice number
        const maInvoicesResult = await mcp.readRecords('invoices', {
            filter: `InvoiceNumber eq '${invoice_number}'`,
            first: 1
        });

        const maInvoice = maInvoicesResult.result?.value?.[0];
        if (!maInvoice) {
            return { success: false, error: `Invoice ${invoice_number} not found in Modern Accounting` };
        }

        if (maInvoice.SourceSystem !== 'QBO') {
            return { success: false, error: `Invoice ${invoice_number} is not from QBO` };
        }

        // 2. Check if invoice already has line items
        const existingLinesResult = await mcp.readRecords('invoicelines', {
            filter: `InvoiceId eq '${maInvoice.Id}'`,
            first: 100
        });

        const existingLines = existingLinesResult.result?.value || [];
        if (existingLines.length > 0) {
            return { success: false, error: `Invoice ${invoice_number} already has ${existingLines.length} line items` };
        }

        // 3. Fetch the invoice from QBO using SourceId
        const qboInvoice = await qboAuth.makeApiCall(
            await qboAuth.getActiveRealmId(),
            'GET',
            `/invoice/${maInvoice.SourceId}`
        );

        if (!qboInvoice?.Invoice) {
            return { success: false, error: `Invoice not found in QBO with ID ${maInvoice.SourceId}` };
        }

        const invoice = qboInvoice.Invoice;

        // 4. Create line items in ACTO
        const salesLines = (invoice.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail');
        let linesCreated = 0;
        const createdLines = [];

        for (const line of salesLines) {
            try {
                const detail = line.SalesItemLineDetail || {};
                const qty = parseFloat(detail.Qty) || 1;
                const unitPrice = parseFloat(detail.UnitPrice) || parseFloat(line.Amount) || 0;

                await mcp.createRecord('invoicelines', {
                    InvoiceId: maInvoice.Id,
                    Description: line.Description || detail.ItemRef?.name || 'Line Item',
                    Quantity: qty,
                    UnitPrice: unitPrice
                    // Amount is a computed column (Quantity * UnitPrice)
                });

                linesCreated++;
                createdLines.push({
                    description: line.Description || detail.ItemRef?.name || 'Line Item',
                    amount: (qty * unitPrice).toFixed(2)
                });
            } catch (lineError) {
                console.error('Failed to create invoice line:', lineError.message);
            }
        }

        return {
            success: true,
            message: `Successfully created ${linesCreated} line items for invoice ${invoice_number}`,
            invoiceNumber: invoice_number,
            invoiceId: maInvoice.Id,
            qboInvoiceId: maInvoice.SourceId,
            linesCreated,
            lines: createdLines
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateAccounts(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch accounts from QBO
        const qboResult = await qboAuth.searchAccounts({ fetchAll: true });
        let qboAccounts = qboResult.data || [];

        if (params.limit && params.limit > 0) {
            qboAccounts = qboAccounts.slice(0, params.limit);
        }

        if (qboAccounts.length === 0) {
            return { success: true, message: 'No accounts found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration (DB-driven)
        const result = await migrateAccounts(qboAccounts, mcp, 'QBO');

        return {
            success: true,
            message: `Migration complete: ${result.migrated} accounts migrated, ${result.skipped} skipped. [View Chart of Accounts](/accounts)`,
            migrated: result.migrated,
            skipped: result.skipped,
            viewUrl: '/accounts',
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateInvoices(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch invoices from QBO (with limit if specified to avoid fetching all 500+)
        const searchOpts = { fetchAll: true };
        if (params.limit && params.limit > 0) {
            searchOpts.limit = params.limit * 2; // Fetch extra in case some are skipped
        }
        const qboResult = await qboAuth.searchInvoices(searchOpts);
        let qboInvoices = qboResult.data || [];

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

        // Run migration (DB-driven - customer lookups done via database)
        const result = await migrateInvoices(qboInvoices, mcp, 'QBO');

        // Calculate total value migrated
        const totalValue = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} invoices migrated, ${result.skipped} skipped. [View Invoices](/invoices)`,
            migrated: result.migrated,
            skipped: result.skipped,
            viewUrl: '/invoices',
            totalValue: formatCurrency(totalValue),
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigrateBills(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch bills from QBO (with limit if specified to avoid fetching all)
        const searchOpts = { fetchAll: true };
        if (params.limit && params.limit > 0) {
            searchOpts.limit = params.limit * 2; // Fetch extra in case some are skipped
        }
        const qboResult = await qboAuth.searchBills(searchOpts);
        let qboBills = qboResult.data || [];

        // Filter to unpaid only if requested
        if (params.unpaid_only) {
            qboBills = qboBills.filter(bill => {
                const balance = parseFloat(bill.Balance) || 0;
                return balance > 0;
            });
        }

        if (params.limit && params.limit > 0) {
            qboBills = qboBills.slice(0, params.limit);
        }

        if (qboBills.length === 0) {
            return { success: true, message: 'No bills found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration
        const result = await migrateBills(qboBills, mcp, 'QBO');

        // Calculate total value migrated
        const totalValue = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} bills migrated, ${result.skipped} skipped. [View Bills](/bills)`,
            migrated: result.migrated,
            skipped: result.skipped,
            viewUrl: '/bills',
            totalValue: formatCurrency(totalValue),
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeMigratePayments(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch payments from QBO
        const qboResult = await qboAuth.searchPayments({ fetchAll: true });
        let qboPayments = qboResult.data || [];

        if (params.limit && params.limit > 0) {
            qboPayments = qboPayments.slice(0, params.limit);
        }

        if (qboPayments.length === 0) {
            return { success: true, message: 'No payments found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration
        const result = await migratePayments(qboPayments, mcp, 'QBO');

        // Calculate total value migrated
        const totalValue = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} payments migrated, ${result.skipped} skipped.`,
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

async function executeMigrateBillPayments(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch bill payments from QBO
        const qboResult = await qboAuth.searchBillPayments({ fetchAll: true });
        let qboBillPayments = qboResult.data || [];

        if (params.limit && params.limit > 0) {
            qboBillPayments = qboBillPayments.slice(0, params.limit);
        }

        if (qboBillPayments.length === 0) {
            return { success: true, message: 'No bill payments found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration
        const result = await migrateBillPayments(qboBillPayments, mcp, 'QBO');

        // Calculate total value migrated
        const totalValue = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} bill payments migrated, ${result.skipped} skipped.`,
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

async function executeMigrateJournalEntries(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Fetch journal entries from QBO
        const qboResult = await qboAuth.searchJournalEntries({ fetchAll: true });
        let qboJournalEntries = qboResult.data || [];

        if (params.limit && params.limit > 0) {
            qboJournalEntries = qboJournalEntries.slice(0, params.limit);
        }

        if (qboJournalEntries.length === 0) {
            return { success: true, message: 'No journal entries found to migrate', migrated: 0, skipped: 0 };
        }

        // Run migration
        const result = await migrateJournalEntries(qboJournalEntries, mcp, 'QBO');

        // Calculate total debit/credit migrated
        const totalDebit = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.totalDebit || 0), 0);

        return {
            success: true,
            message: `Migration complete: ${result.migrated} journal entries migrated, ${result.skipped} skipped.`,
            migrated: result.migrated,
            skipped: result.skipped,
            totalDebit: formatCurrency(totalDebit),
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeDeleteProducts(params) {
    try {
        const preview = params.preview !== false; // default true
        const confirmCount = params.confirm_count;

        // Get all products
        const productsResult = await mcp.readRecords('productsservices', {
            select: 'Id,Name',
            first: 1000
        });
        const items = productsResult.result?.value || [];

        if (items.length === 0) {
            return {
                success: true,
                preview: true,
                count: 0,
                message: 'No products/services found to delete.'
            };
        }

        if (preview) {
            // Preview mode - show what would be deleted
            return {
                success: true,
                preview: true,
                count: items.length,
                sample: items.slice(0, 10).map(p => p.Name),
                message: `Found ${items.length} product(s)/service(s). To delete ALL of them, you must confirm with the exact count: ${items.length}`,
                confirmInstruction: `Say "Yes, delete all ${items.length} products" to confirm deletion.`
            };
        }

        // Confirm mode - verify count matches exactly
        if (confirmCount === undefined || confirmCount === null) {
            return {
                success: false,
                error: 'Confirmation required. You must provide confirm_count matching the exact number of products.',
                count: items.length,
                hint: `There are ${items.length} products. Call with confirm_count: ${items.length} to proceed.`
            };
        }

        if (confirmCount !== items.length) {
            return {
                success: false,
                error: `Count mismatch! You confirmed ${confirmCount} but there are ${items.length} products. Please preview again to get the current count.`,
                actualCount: items.length,
                providedCount: confirmCount
            };
        }

        // Actually delete all products
        const deleted = [];
        const errors = [];

        for (const item of items) {
            try {
                const deleteResult = await mcp.deleteRecord('productsservices', { Id: item.Id });
                if (deleteResult.error) {
                    errors.push({ name: item.Name, error: deleteResult.error });
                } else {
                    deleted.push(item.Name);
                }
            } catch (err) {
                errors.push({ name: item.Name, error: err.message });
            }
        }

        return {
            success: true,
            preview: false,
            deleted: deleted.length,
            failed: errors.length,
            deletedNames: deleted.slice(0, 10),
            errors: errors.slice(0, 5),
            message: `Deleted ${deleted.length} product(s)/service(s).${errors.length > 0 ? ` ${errors.length} failed.` : ''}`
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Company Onboarding Functions
// ============================================================================

async function executeListIndustryTemplates(params) {
    try {
        const options = {
            orderby: 'SortOrder asc',
            first: 20
        };
        if (params.category) {
            options.filter = `Category eq '${params.category}'`;
        }

        const result = await dab.get('industrytemplates', options);
        if (!result.success) {
            return { success: false, error: result.error };
        }

        const templates = result.value || [];
        return {
            success: true,
            count: templates.length,
            templates: templates.map(t => ({
                code: t.Code,
                name: t.Name,
                description: t.Description,
                category: t.Category,
                accountCount: JSON.parse(t.COATemplate || '[]').length
            })),
            message: `Found ${templates.length} industry templates. Ask the user which one best matches their business.`
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeCreateCompany(params) {
    try {
        const companyData = {
            Name: params.name,
            LegalName: params.legal_name || null,
            Industry: params.industry || null,
            BusinessType: params.business_type || null,
            Address: params.address || null,
            City: params.city || null,
            State: params.state || null,
            ZipCode: params.zip_code || null,
            Phone: params.phone || null,
            Email: params.email || null,
            OnboardingStatus: 'InProgress'
        };

        const createResult = await dab.create('companies', companyData);
        if (!createResult.success) {
            return { success: false, error: createResult.error };
        }

        const companyId = createResult.value?.Id;

        // Initialize onboarding steps
        const steps = [
            { code: 'company_info', name: 'Company Information', order: 1, status: 'Completed' },
            { code: 'industry_selection', name: 'Industry Selection', order: 2, status: 'Pending' },
            { code: 'coa_setup', name: 'Chart of Accounts Setup', order: 3, status: 'Pending' },
            { code: 'bank_accounts', name: 'Bank Account Setup', order: 4, status: 'Pending' },
            { code: 'migration', name: 'Data Migration (Optional)', order: 5, status: 'Pending' }
        ];

        for (const step of steps) {
            await dab.create('onboardingprogress', {
                CompanyId: companyId,
                StepCode: step.code,
                StepName: step.name,
                StepOrder: step.order,
                Status: step.status,
                StartedAt: step.status === 'Completed' ? new Date().toISOString() : null,
                CompletedAt: step.status === 'Completed' ? new Date().toISOString() : null
            });
        }

        return {
            success: true,
            message: `Created company '${params.name}'. Now ask which industry template to use for their chart of accounts.`,
            company: {
                id: companyId,
                name: params.name,
                onboardingStatus: 'InProgress'
            },
            nextStep: 'industry_selection'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeGetIndustryTemplate(params) {
    try {
        const result = await dab.get('industrytemplates', {
            filter: `Code eq '${params.template_code}'`,
            first: 1
        });

        if (!result.success) {
            return { success: false, error: result.error };
        }

        const template = result.value?.[0];
        if (!template) {
            return { success: false, error: `Template '${params.template_code}' not found` };
        }

        const accounts = JSON.parse(template.COATemplate || '[]');
        const accountsByType = {};
        accounts.forEach(a => {
            if (!accountsByType[a.type]) accountsByType[a.type] = [];
            accountsByType[a.type].push({ code: a.code, name: a.name });
        });

        return {
            success: true,
            template: {
                code: template.Code,
                name: template.Name,
                description: template.Description,
                category: template.Category,
                totalAccounts: accounts.length
            },
            accountsByType,
            message: `Template '${template.Name}' has ${accounts.length} accounts. Ask user if they want to use this template.`
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeGenerateCOAFromTemplate(params) {
    try {
        // Get the template
        const templateResult = await dab.get('industrytemplates', {
            filter: `Code eq '${params.template_code}'`,
            first: 1
        });

        if (!templateResult.success) {
            return { success: false, error: templateResult.error };
        }

        const template = templateResult.value?.[0];
        if (!template) {
            return { success: false, error: `Template '${params.template_code}' not found` };
        }

        const accounts = JSON.parse(template.COATemplate || '[]');

        if (params.preview_only) {
            return {
                success: true,
                preview: true,
                templateName: template.Name,
                accountCount: accounts.length,
                accounts: accounts.map(a => ({
                    code: a.code,
                    name: a.name,
                    type: a.type
                })),
                message: `This will create ${accounts.length} accounts. Ask user to confirm.`
            };
        }

        // Check for existing accounts with same codes
        const existingResult = await dab.get('accounts', {
            select: 'Code',
            first: 1000
        });
        const existingCodes = new Set((existingResult.value || []).map(a => a.Code));

        // Create all accounts
        let created = 0;
        let skipped = 0;
        const errors = [];

        for (const acct of accounts) {
            // Skip if account code already exists
            if (existingCodes.has(acct.code)) {
                skipped++;
                continue;
            }

            const result = await dab.create('accounts', {
                Code: acct.code,
                Name: acct.name,
                Type: acct.type,
                Subtype: acct.subtype || null,
                Description: acct.description || null,
                IsActive: true
            });

            if (!result.success) {
                errors.push({ code: acct.code, error: result.error });
            } else {
                created++;
            }
        }

        // Update onboarding steps
        if (params.company_id) {
            // Mark industry_selection as completed
            const industryProgress = await dab.get('onboardingprogress', {
                filter: `CompanyId eq ${params.company_id} and StepCode eq 'industry_selection'`,
                first: 1
            });
            if (industryProgress.value?.[0]) {
                await dab.update('onboardingprogress', industryProgress.value[0].Id, {
                    Status: 'Completed',
                    CompletedAt: new Date().toISOString(),
                    StepData: JSON.stringify({ templateCode: params.template_code })
                });
            }

            // Mark coa_setup as completed
            const coaProgress = await dab.get('onboardingprogress', {
                filter: `CompanyId eq ${params.company_id} and StepCode eq 'coa_setup'`,
                first: 1
            });
            if (coaProgress.value?.[0]) {
                await dab.update('onboardingprogress', coaProgress.value[0].Id, {
                    Status: 'Completed',
                    CompletedAt: new Date().toISOString(),
                    StepData: JSON.stringify({ accountsCreated: created, accountsSkipped: skipped })
                });
            }

            // Update company industry
            await dab.update('companies', params.company_id, {
                Industry: template.Name,
                UpdatedAt: new Date().toISOString()
            });
        }

        return {
            success: true,
            message: `Created ${created} accounts from '${template.Name}' template.${skipped > 0 ? ` Skipped ${skipped} (already existed).` : ''}`,
            created,
            skipped,
            errors: errors.length > 0 ? errors : undefined,
            link: '/accounts',
            nextStep: 'Ask if user wants to set up bank accounts or migrate data from QuickBooks.'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeGetOnboardingStatus(params) {
    try {
        let companyId = params.company_id;

        // If no company ID provided, get the most recent company
        if (!companyId) {
            const companiesResult = await dab.get('companies', {
                orderby: 'CreatedAt desc',
                first: 1
            });
            if (!companiesResult.success) {
                return { success: false, error: companiesResult.error };
            }
            const company = companiesResult.value?.[0];
            if (!company) {
                return { success: false, error: 'No companies found. Create a company first.' };
            }
            companyId = company.Id;
        }

        // Get company details
        const companyResult = await dab.get('companies', {
            filter: `Id eq ${companyId}`,
            first: 1
        });
        if (!companyResult.success) {
            return { success: false, error: companyResult.error };
        }
        const company = companyResult.value?.[0];
        if (!company) {
            return { success: false, error: 'Company not found' };
        }

        // Get onboarding progress
        const progressResult = await dab.get('onboardingprogress', {
            filter: `CompanyId eq ${companyId}`,
            orderby: 'StepOrder asc'
        });
        const steps = progressResult.value || [];

        const completedSteps = steps.filter(s => s.Status === 'Completed').length;
        const totalSteps = steps.length;

        return {
            success: true,
            company: {
                id: company.Id,
                name: company.Name,
                industry: company.Industry,
                onboardingStatus: company.OnboardingStatus
            },
            progress: {
                completed: completedSteps,
                total: totalSteps,
                percentage: totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0
            },
            steps: steps.map(s => ({
                code: s.StepCode,
                name: s.StepName,
                status: s.Status,
                completedAt: s.CompletedAt
            })),
            nextStep: steps.find(s => s.Status === 'Pending')?.StepCode || 'complete'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeUpdateOnboardingStep(params) {
    try {
        const progressResult = await dab.get('onboardingprogress', {
            filter: `CompanyId eq ${params.company_id} and StepCode eq '${params.step_code}'`,
            first: 1
        });

        if (!progressResult.success) {
            return { success: false, error: progressResult.error };
        }

        const progress = progressResult.value?.[0];
        if (!progress) {
            return { success: false, error: `Step '${params.step_code}' not found for this company` };
        }

        const updateData = {
            Status: params.status,
            UpdatedAt: new Date().toISOString()
        };

        if (params.status === 'InProgress') {
            updateData.StartedAt = new Date().toISOString();
        } else if (params.status === 'Completed') {
            updateData.CompletedAt = new Date().toISOString();
        } else if (params.status === 'Skipped') {
            updateData.SkippedAt = new Date().toISOString();
            if (params.skip_reason) {
                updateData.SkipReason = params.skip_reason;
            }
        }

        await dab.update('onboardingprogress', progress.Id, updateData);

        // Check if all steps are done
        const allProgressResult = await dab.get('onboardingprogress', {
            filter: `CompanyId eq ${params.company_id}`,
            orderby: 'StepOrder asc'
        });
        const allSteps = allProgressResult.value || [];
        const allDone = allSteps.every(s => s.Status === 'Completed' || s.Status === 'Skipped');

        if (allDone) {
            await dab.update('companies', params.company_id, {
                OnboardingStatus: 'Completed',
                OnboardingCompletedAt: new Date().toISOString()
            });
        }

        return {
            success: true,
            message: `Step '${params.step_code}' marked as ${params.status}`,
            allComplete: allDone
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Function Dispatcher
// ============================================================================

/**
 * Get all available tools - dynamic MCP tools + static fallback tools
 */
function getAllTools() {
    // If we have dynamic tools from MCP, prioritize them
    if (dynamicTools.length > 0) {
        // Filter out QBO MCP tools that overlap with native functionality
        // The QBO MCP uses a separate session that may not be connected
        const filteredDynamicTools = dynamicTools.filter(t => {
            const name = t.function.name;
            // Exclude QBO connection status (chat-api has its own connection)
            if (name.includes('qbo_get_connection_status')) return false;
            // Exclude QBO analyze for migration (use native migrate_ tools instead)
            if (name.includes('qbo_analyze_for_migration')) return false;
            return true;
        });

        // Combine dynamic tools with essential static tools (migration, etc.)
        const essentialStaticTools = tools.filter(t =>
            t.function.name.startsWith('migrate_') ||
            t.function.name.startsWith('create_') ||
            t.function.name.startsWith('get_onboarding') ||
            t.function.name.startsWith('update_onboarding') ||
            t.function.name.startsWith('list_') ||
            t.function.name.startsWith('generate_')
        );
        // Put essential static tools FIRST so AI prefers them for migration tasks
        return [...essentialStaticTools, ...filteredDynamicTools];
    }
    // Fallback to static tools if MCP discovery failed
    return tools;
}

async function executeFunction(name, args) {
    // Check if this is a dynamically discovered MCP tool
    const isDynamicTool = dynamicTools.some(t => t.function.name === name);
    if (isDynamicTool) {
        console.log(`Executing MCP tool: ${name}`);
        const result = await mcpManager.callTool(name, args);
        return result;
    }

    // Fall through to static tool handlers
    switch (name) {
        // Legacy static tools - these don't go through MCP
        case 'dab_describe_entities':
            return executeDabDescribeEntities(args);
        case 'dab_query':
            return executeDabQuery(args);
        case 'dab_create':
            return executeDabCreate(args);
        case 'qbo_query':
            return executeQboQuery(args);
        case 'qbo_get_invoice':
            return executeQboGetInvoice(args);
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
        case 'get_migration_status':
            return executeGetMigrationStatus(args);
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
        case 'migrate_bills':
            return executeMigrateBills(args);
        case 'migrate_payments':
            return executeMigratePayments(args);
        case 'migrate_bill_payments':
            return executeMigrateBillPayments(args);
        case 'migrate_journal_entries':
            return executeMigrateJournalEntries(args);
        case 'migrate_products':
            return executeMigrateProducts(args);
        case 'migrate_invoice_lines':
            return executeMigrateInvoiceLines(args);
        case 'delete_products':
            return executeDeleteProducts(args);
        // Company Onboarding Tools
        case 'list_industry_templates':
            return executeListIndustryTemplates(args);
        case 'create_company':
            return executeCreateCompany(args);
        case 'get_industry_template':
            return executeGetIndustryTemplate(args);
        case 'generate_coa_from_template':
            return executeGenerateCOAFromTemplate(args);
        case 'get_onboarding_status':
            return executeGetOnboardingStatus(args);
        case 'update_onboarding_step':
            return executeUpdateOnboardingStep(args);
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

// Initiate QBO OAuth flow (now uses direct OAuth, saves to DB)
app.post('/api/qbo/connect', async (req, res) => {
    try {
        const state = randomUUID(); // Use as session correlation
        const authUrl = qboAuth.getAuthorizationUrl(state);

        // Store state for callback verification
        qboSessions.set(state, { createdAt: new Date() });

        res.json({
            success: true,
            authUrl: authUrl,
            sessionId: state
        });
    } catch (error) {
        console.error('QBO connect error:', error);
        res.status(500).json({ error: 'Failed to initiate QBO connection' });
    }
});

// QBO OAuth callback - handles token exchange and saves to DB
app.get('/api/qbo/oauth-callback', async (req, res) => {
    try {
        // Construct the full callback URL
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const fullUrl = `${protocol}://${host}${req.originalUrl}`;

        console.log('OAuth callback received:', fullUrl);

        const result = await qboAuth.handleCallback(fullUrl);

        if (result.success) {
            // Redirect to success page or close popup
            const successHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>QuickBooks Connected</title>
                    <style>
                        body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                        .card { background: white; padding: 48px; border-radius: 16px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
                        .icon { width: 80px; height: 80px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
                        .icon svg { width: 40px; height: 40px; color: white; }
                        h1 { color: #1f2937; margin-bottom: 12px; }
                        p { color: #6b7280; margin-bottom: 24px; }
                        .btn { background: #667eea; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; display: inline-block; }
                    </style>
                    <script>
                        // Notify parent window and close popup
                        if (window.opener) {
                            window.opener.postMessage({ type: 'qbo-connected', realmId: '${result.realmId}', companyName: '${result.companyName}' }, '*');
                            setTimeout(() => window.close(), 2000);
                        }
                    </script>
                </head>
                <body>
                    <div class="card">
                        <div class="icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg></div>
                        <h1>QuickBooks Connected!</h1>
                        <p>Connected to: ${result.companyName}</p>
                        <a href="${APP_URL}" class="btn">Return to Dashboard</a>
                    </div>
                </body>
                </html>
            `;
            res.send(successHtml);
        } else {
            throw new Error('OAuth callback failed');
        }
    } catch (error) {
        console.error('OAuth callback error:', error);
        const errorHtml = `
            <!DOCTYPE html>
            <html>
            <head><title>Connection Error</title>
            <style>body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; } .error { color: #dc2626; }</style>
            </head>
            <body><div class="error"><h1>Connection Failed</h1><p>${error.message}</p><a href="${APP_URL}">Return to Dashboard</a></div></body>
            </html>
        `;
        res.status(500).send(errorHtml);
    }
});

// Legacy callback route - redirect to new one
app.get('/api/qbo/callback', async (req, res) => {
    res.redirect('/api/qbo/oauth-callback?' + new URLSearchParams(req.query).toString());
});

// Get QBO connection status (now uses DB-backed auth)
app.get('/api/qbo/status', async (req, res) => {
    try {
        const status = await qboAuth.getStatus();

        res.json({
            sessionId: status.realmId || null,
            ...status
        });
    } catch (error) {
        console.error('QBO status error:', error);
        res.status(500).json({ error: 'Failed to get QBO status' });
    }
});

// Disconnect QBO (marks connection as inactive in DB)
app.post('/api/qbo/disconnect', async (req, res) => {
    try {
        const status = await qboAuth.getStatus();
        if (status.realmId) {
            await qboAuth.disconnect(status.realmId);
        }
        res.json({ success: true });
    } catch (error) {
        console.error('QBO disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect QBO' });
    }
});

// Analyze QBO data for migration
app.get('/api/qbo/analyze', async (req, res) => {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return res.status(400).json({
                error: 'Not connected to QuickBooks',
                needsAuth: true
            });
        }

        const analysis = await qboAuth.analyzeForMigration();
        res.json(analysis);
    } catch (error) {
        console.error('QBO analyze error:', error);
        res.status(500).json({ error: 'Failed to analyze QBO data' });
    }
});

// ============================================================================
// Plaid Bank Feed Endpoints
// ============================================================================

// Create Plaid Link token for initializing Plaid Link
app.post('/api/plaid/link-token', async (req, res) => {
    try {
        const userId = req.body.userId || 'default-user';
        const result = await plaidService.createLinkToken(userId);
        res.json(result);
    } catch (error) {
        console.error('Plaid link token error:', error);
        res.status(500).json({ error: error.message || 'Failed to create link token' });
    }
});

// Exchange public token for access token (called after Plaid Link success)
app.post('/api/plaid/exchange-token', async (req, res) => {
    try {
        const { publicToken, metadata } = req.body;
        if (!publicToken) {
            return res.status(400).json({ error: 'Missing publicToken' });
        }

        const result = await plaidService.exchangePublicToken(publicToken, metadata);
        res.json(result);
    } catch (error) {
        console.error('Plaid token exchange error:', error);
        res.status(500).json({ error: error.message || 'Failed to exchange token' });
    }
});

// Get all Plaid connections
app.get('/api/plaid/connections', async (req, res) => {
    try {
        const connections = await plaidService.getActiveConnections();

        // For each connection, get account count
        const connectionsWithAccounts = await Promise.all(
            connections.map(async (conn) => {
                const accounts = await plaidService.getAccountsByConnectionId(conn.Id);
                return {
                    id: conn.Id,
                    itemId: conn.ItemId,
                    institutionId: conn.InstitutionId,
                    institutionName: conn.InstitutionName,
                    lastSyncAt: conn.LastSyncAt,
                    syncStatus: conn.SyncStatus,
                    syncErrorMessage: conn.SyncErrorMessage,
                    accountCount: accounts.length,
                    createdAt: conn.CreatedAt,
                };
            })
        );

        res.json({ connections: connectionsWithAccounts });
    } catch (error) {
        console.error('Plaid connections error:', error);
        res.status(500).json({ error: 'Failed to get connections' });
    }
});

// Disconnect a Plaid connection
app.post('/api/plaid/connections/:itemId/disconnect', async (req, res) => {
    try {
        const { itemId } = req.params;
        const result = await plaidService.disconnect(itemId);
        res.json(result);
    } catch (error) {
        console.error('Plaid disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

// Get all Plaid accounts
app.get('/api/plaid/accounts', async (req, res) => {
    try {
        const accounts = await plaidService.getAllAccounts();

        // Get connection info for each account
        const connections = await plaidService.getActiveConnections();
        const connectionMap = new Map(connections.map(c => [c.Id, c]));

        const accountsWithInfo = accounts.map(account => {
            const connection = connectionMap.get(account.PlaidConnectionId);
            return {
                id: account.Id,
                plaidAccountId: account.PlaidAccountId,
                accountName: account.AccountName,
                officialName: account.OfficialName,
                accountType: account.AccountType,
                accountSubtype: account.AccountSubtype,
                mask: account.Mask,
                linkedAccountId: account.LinkedAccountId,
                currentBalance: account.CurrentBalance,
                availableBalance: account.AvailableBalance,
                institutionName: connection?.InstitutionName || 'Unknown',
            };
        });

        res.json({ accounts: accountsWithInfo });
    } catch (error) {
        console.error('Plaid accounts error:', error);
        res.status(500).json({ error: 'Failed to get accounts' });
    }
});

// Link a Plaid account to a chart of accounts entry
app.post('/api/plaid/accounts/:id/link', async (req, res) => {
    try {
        const { id } = req.params;
        const { ledgerAccountId } = req.body;

        if (!ledgerAccountId) {
            return res.status(400).json({ error: 'Missing ledgerAccountId' });
        }

        const result = await plaidService.linkAccountToLedger(id, ledgerAccountId);
        res.json(result);
    } catch (error) {
        console.error('Plaid link account error:', error);
        res.status(500).json({ error: error.message || 'Failed to link account' });
    }
});

// Validate a Plaid connection
app.get('/api/plaid/connections/:itemId/validate', async (req, res) => {
    try {
        const { itemId } = req.params;
        const result = await plaidService.validateConnection(itemId);
        res.json(result);
    } catch (error) {
        console.error('Plaid validate error:', error);
        res.status(500).json({ error: 'Failed to validate connection' });
    }
});

// Sync transactions for a specific Plaid connection
app.post('/api/plaid/connections/:itemId/sync', async (req, res) => {
    try {
        const { itemId } = req.params;
        const result = await plaidSync.syncConnection(itemId);
        res.json(result);
    } catch (error) {
        console.error('Plaid sync error:', error);
        res.status(500).json({ error: error.message || 'Failed to sync transactions' });
    }
});

// Sync all active Plaid connections
app.post('/api/plaid/sync-all', async (req, res) => {
    try {
        const results = await plaidSync.syncAllConnections();
        res.json({ results });
    } catch (error) {
        console.error('Plaid sync-all error:', error);
        res.status(500).json({ error: 'Failed to sync connections' });
    }
});

// Update account balances for a Plaid connection
app.post('/api/plaid/connections/:itemId/balances', async (req, res) => {
    try {
        const { itemId } = req.params;
        const result = await plaidSync.updateBalances(itemId);
        res.json(result);
    } catch (error) {
        console.error('Plaid balances error:', error);
        res.status(500).json({ error: error.message || 'Failed to update balances' });
    }
});

// Sandbox: Fire webhook to simulate new transactions
app.post('/api/plaid/sandbox/fire-webhook/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { webhookCode } = req.body;
        const result = await plaidService.fireSandboxWebhook(itemId, webhookCode || 'SYNC_UPDATES_AVAILABLE');
        res.json({ success: true, result });
    } catch (error) {
        console.error('Sandbox webhook error:', error);
        res.status(500).json({ error: error.message || 'Failed to fire webhook' });
    }
});

// Sandbox: Reset sync cursor and re-fetch all transactions
app.post('/api/plaid/sandbox/reset-sync/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;

        // Clear the sync cursor to re-fetch all transactions
        const connection = await plaidService.getConnectionByItemId(itemId);
        if (connection) {
            await axios.patch(`${DAB_REST_URL}/plaidconnections/Id/${connection.Id}`, {
                LastSyncCursor: null,
                LastSyncAt: null
            });
        }

        // Now sync to re-fetch all transactions
        const syncResult = await plaidSync.syncConnection(itemId);

        res.json({
            success: true,
            message: 'Sync cursor reset and transactions re-fetched',
            ...syncResult
        });
    } catch (error) {
        console.error('Sandbox reset error:', error);
        res.status(500).json({ error: error.message || 'Failed to reset sync' });
    }
});

// Get scheduler status
app.get('/api/plaid/scheduler/status', async (req, res) => {
    try {
        const status = plaidScheduler.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Scheduler status error:', error);
        res.status(500).json({ error: 'Failed to get scheduler status' });
    }
});

// Start the scheduler
app.post('/api/plaid/scheduler/start', async (req, res) => {
    try {
        plaidScheduler.start();
        res.json({ success: true, message: 'Scheduler started' });
    } catch (error) {
        console.error('Scheduler start error:', error);
        res.status(500).json({ error: 'Failed to start scheduler' });
    }
});

// Stop the scheduler
app.post('/api/plaid/scheduler/stop', async (req, res) => {
    try {
        plaidScheduler.stop();
        res.json({ success: true, message: 'Scheduler stopped' });
    } catch (error) {
        console.error('Scheduler stop error:', error);
        res.status(500).json({ error: 'Failed to stop scheduler' });
    }
});

// Run a specific scheduled job immediately
app.post('/api/plaid/scheduler/run/:jobName', async (req, res) => {
    try {
        const { jobName } = req.params;
        const result = await plaidScheduler.runNow(jobName);
        res.json({ success: true, result });
    } catch (error) {
        console.error('Scheduler run error:', error);
        res.status(500).json({ error: error.message || 'Failed to run job' });
    }
});

// ============================================================================
// Transaction Learning Endpoints
// ============================================================================

// Approve transaction and learn from correction
app.post('/api/transactions/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { accountId, category, memo } = req.body;

        if (!accountId) {
            return res.status(400).json({ error: 'accountId is required' });
        }

        // Get the original transaction
        const txnResponse = await axios.get(`${DAB_REST_URL}/banktransactions/Id/${id}`);
        const transaction = txnResponse.data?.value?.[0];

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Check if the approved category differs from AI suggestion (learning opportunity)
        const suggestedAccountId = transaction.SuggestedAccountId;
        const shouldLearn = suggestedAccountId && suggestedAccountId.toLowerCase() !== accountId.toLowerCase();

        // Update the transaction
        await axios.patch(`${DAB_REST_URL}/banktransactions/Id/${id}`, {
            ApprovedAccountId: accountId,
            ApprovedCategory: category || transaction.SuggestedCategory,
            ApprovedMemo: memo || transaction.SuggestedMemo,
            Status: 'Approved',
            ReviewedDate: new Date().toISOString()
        });

        // Learn from the correction - create a rule if different from AI suggestion
        let ruleCreated = false;
        if (shouldLearn && transaction.Description) {
            // Extract a pattern from the description (use merchant if available, otherwise first significant word)
            const pattern = transaction.Merchant ||
                transaction.Description.split(' ').filter(w => w.length > 3)[0] ||
                transaction.Description.substring(0, 50);

            if (pattern) {
                try {
                    // Check if rule already exists
                    const existingRules = await axios.get(
                        `${DAB_REST_URL}/categorizationrules?$filter=MatchValue eq '${pattern.replace(/'/g, "''")}'`
                    );

                    if (!existingRules.data?.value?.length) {
                        // Create new rule
                        await axios.post(`${DAB_REST_URL}/categorizationrules`, {
                            MatchType: 'contains',
                            MatchField: 'Description',
                            MatchValue: pattern,
                            AccountId: accountId,
                            Category: category || transaction.SuggestedCategory,
                            Priority: 50,  // User-learned rules have higher priority
                            CreatedBy: 'user-feedback'
                        });
                        ruleCreated = true;
                        console.log(`Learning: Created rule for "${pattern}" -> ${category}`);
                    }
                } catch (ruleError) {
                    console.warn('Failed to create learning rule:', ruleError.message);
                }
            }
        }

        res.json({
            success: true,
            transactionId: id,
            learned: ruleCreated,
            message: ruleCreated ? 'Transaction approved and rule learned' : 'Transaction approved'
        });
    } catch (error) {
        console.error('Transaction approval error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to approve transaction' });
    }
});

// Batch approve transactions
app.post('/api/transactions/batch-approve', async (req, res) => {
    try {
        const { transactions } = req.body;  // Array of { id, accountId, category }

        if (!Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ error: 'transactions array is required' });
        }

        const results = [];
        for (const txn of transactions) {
            try {
                await axios.patch(`${DAB_REST_URL}/banktransactions/Id/${txn.id}`, {
                    ApprovedAccountId: txn.accountId,
                    ApprovedCategory: txn.category,
                    Status: 'Approved',
                    ReviewedDate: new Date().toISOString()
                });
                results.push({ id: txn.id, success: true });
            } catch (err) {
                results.push({ id: txn.id, success: false, error: err.message });
            }
        }

        res.json({
            success: true,
            approved: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        });
    } catch (error) {
        console.error('Batch approval error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to batch approve' });
    }
});

// Get categorization rules
app.get('/api/categorization-rules', async (req, res) => {
    try {
        const response = await axios.get(`${DAB_REST_URL}/categorizationrules?$orderby=Priority,HitCount desc`);
        res.json({ rules: response.data?.value || [] });
    } catch (error) {
        console.error('Get rules error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to get rules' });
    }
});

// Post approved transactions to General Ledger (create journal entries)
app.post('/api/post-transactions', async (req, res) => {
    try {
        const { transactionIds } = req.body;

        if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
            return res.status(400).json({ error: 'transactionIds array is required' });
        }

        const results = { posted: 0, failed: 0, errors: [] };

        for (const txnId of transactionIds) {
            try {
                // Get the transaction
                const txnResponse = await axios.get(`${DAB_REST_URL}/banktransactions/Id/${txnId}`);
                const txn = txnResponse.data?.value?.[0];

                if (!txn) {
                    results.failed++;
                    results.errors.push({ id: txnId, error: 'Transaction not found' });
                    continue;
                }

                if (txn.Status !== 'Approved') {
                    results.failed++;
                    results.errors.push({ id: txnId, error: `Transaction status is ${txn.Status}, not Approved` });
                    continue;
                }

                if (!txn.ApprovedAccountId || !txn.SourceAccountId) {
                    results.failed++;
                    results.errors.push({ id: txnId, error: 'Missing ApprovedAccountId or SourceAccountId' });
                    continue;
                }

                // Create journal entry
                const journalEntryId = crypto.randomUUID();
                const amount = Math.abs(parseFloat(txn.Amount));
                const isOutflow = parseFloat(txn.Amount) < 0;

                // Create the journal entry header
                await axios.post(`${DAB_REST_URL}/journalentries`, {
                    Id: journalEntryId,
                    TransactionDate: txn.TransactionDate,
                    Description: txn.ApprovedMemo || txn.Description,
                    Reference: `BANK-${txnId.substring(0, 8)}`,
                    Status: 'Posted',
                    CreatedAt: new Date().toISOString(),
                    CreatedBy: 'system',
                    PostedAt: new Date().toISOString(),
                    PostedBy: 'system',
                    SourceSystem: 'BankTransaction',
                    SourceId: txnId
                });

                // Create journal entry lines (double-entry)
                // For outflow (negative amount): Debit expense/asset, Credit bank
                // For inflow (positive amount): Debit bank, Credit income/liability
                const line1Id = crypto.randomUUID();
                const line2Id = crypto.randomUUID();

                if (isOutflow) {
                    // Debit the expense/asset account
                    await axios.post(`${DAB_REST_URL}/journalentrylines`, {
                        Id: line1Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.ApprovedAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: amount,
                        Credit: 0,
                        CreatedAt: new Date().toISOString()
                    });
                    // Credit the bank account
                    await axios.post(`${DAB_REST_URL}/journalentrylines`, {
                        Id: line2Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.SourceAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: 0,
                        Credit: amount,
                        CreatedAt: new Date().toISOString()
                    });
                } else {
                    // Debit the bank account
                    await axios.post(`${DAB_REST_URL}/journalentrylines`, {
                        Id: line1Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.SourceAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: amount,
                        Credit: 0,
                        CreatedAt: new Date().toISOString()
                    });
                    // Credit the income/liability account
                    await axios.post(`${DAB_REST_URL}/journalentrylines`, {
                        Id: line2Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.ApprovedAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: 0,
                        Credit: amount,
                        CreatedAt: new Date().toISOString()
                    });
                }

                // Update the bank transaction status and link to journal entry
                await axios.patch(`${DAB_REST_URL}/banktransactions/Id/${txnId}`, {
                    Status: 'Posted',
                    JournalEntryId: journalEntryId
                });

                results.posted++;
            } catch (txnError) {
                results.failed++;
                results.errors.push({ id: txnId, error: txnError.message });
                console.error(`Error posting transaction ${txnId}:`, txnError.message);
            }
        }

        res.json({
            success: true,
            count: results.posted,
            failed: results.failed,
            errors: results.errors.length > 0 ? results.errors : undefined
        });
    } catch (error) {
        console.error('Post transactions error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to post transactions' });
    }
});

// ============================================================================
// Automatic Journal Entry Endpoints (Issue #131)
// ============================================================================

// Get all account defaults
app.get('/api/account-defaults', async (req, res) => {
    try {
        const defaults = await journalEntryService.getAccountDefaults();
        res.json({
            success: true,
            defaults,
            accountTypes: ACCOUNT_TYPES
        });
    } catch (error) {
        console.error('Get account defaults error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to get account defaults' });
    }
});

// Set an account default
app.put('/api/account-defaults/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { accountId, description } = req.body;

        if (!accountId) {
            return res.status(400).json({ error: 'accountId is required' });
        }

        // Validate account type
        const validTypes = Object.values(ACCOUNT_TYPES);
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                error: `Invalid account type. Valid types: ${validTypes.join(', ')}`
            });
        }

        const result = await journalEntryService.setAccountDefault(type, accountId, description);
        res.json({
            success: true,
            ...result,
            accountType: type
        });
    } catch (error) {
        console.error('Set account default error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to set account default' });
    }
});

// Post an invoice (create journal entry)
app.post('/api/invoices/:id/post', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.body.userId || 'system';

        const result = await journalEntryService.postInvoice(id, userId);
        res.json({
            success: true,
            message: 'Invoice posted successfully',
            ...result
        });
    } catch (error) {
        console.error('Post invoice error:', error.message);
        res.status(error.message.includes('not found') ? 404 : 400).json({
            error: error.message || 'Failed to post invoice'
        });
    }
});

// Void an invoice (create reversing journal entry)
app.post('/api/invoices/:id/void', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.body.userId || 'system';

        const result = await journalEntryService.voidInvoice(id, userId);
        res.json({
            success: true,
            message: 'Invoice voided successfully',
            ...result
        });
    } catch (error) {
        console.error('Void invoice error:', error.message);
        res.status(error.message.includes('not found') ? 404 : 400).json({
            error: error.message || 'Failed to void invoice'
        });
    }
});

// Post a bill (create journal entry)
app.post('/api/bills/:id/post', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.body.userId || 'system';

        const result = await journalEntryService.postBill(id, userId);
        res.json({
            success: true,
            message: 'Bill posted successfully',
            ...result
        });
    } catch (error) {
        console.error('Post bill error:', error.message);
        res.status(error.message.includes('not found') ? 404 : 400).json({
            error: error.message || 'Failed to post bill'
        });
    }
});

// Void a bill (create reversing journal entry)
app.post('/api/bills/:id/void', async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.body.userId || 'system';

        const result = await journalEntryService.voidBill(id, userId);
        res.json({
            success: true,
            message: 'Bill voided successfully',
            ...result
        });
    } catch (error) {
        console.error('Void bill error:', error.message);
        res.status(error.message.includes('not found') ? 404 : 400).json({
            error: error.message || 'Failed to void bill'
        });
    }
});

// Create a customer payment with journal entry
app.post('/api/payments', async (req, res) => {
    try {
        const userId = req.body.userId || 'system';
        const paymentData = {
            customerId: req.body.customerId,
            paymentDate: req.body.paymentDate,
            totalAmount: req.body.totalAmount,
            paymentMethod: req.body.paymentMethod,
            depositAccountId: req.body.depositAccountId,
            memo: req.body.memo,
            applications: req.body.applications || []
        };

        const result = await journalEntryService.recordInvoicePayment(paymentData, userId);
        res.json({
            success: true,
            message: 'Payment recorded successfully',
            ...result
        });
    } catch (error) {
        console.error('Record payment error:', error.message);
        res.status(400).json({ error: error.message || 'Failed to record payment' });
    }
});

// Create a bill payment with journal entry
app.post('/api/billpayments', async (req, res) => {
    try {
        const userId = req.body.userId || 'system';
        const paymentData = {
            vendorId: req.body.vendorId,
            paymentDate: req.body.paymentDate,
            totalAmount: req.body.totalAmount,
            paymentMethod: req.body.paymentMethod,
            paymentAccountId: req.body.paymentAccountId,
            memo: req.body.memo,
            applications: req.body.applications || []
        };

        const result = await journalEntryService.recordBillPayment(paymentData, userId);
        res.json({
            success: true,
            message: 'Bill payment recorded successfully',
            ...result
        });
    } catch (error) {
        console.error('Record bill payment error:', error.message);
        res.status(400).json({ error: error.message || 'Failed to record bill payment' });
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

        let response = await client.getChatCompletions(deploymentName, messages, { tools: getAllTools(), toolChoice: 'auto' });
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

            response = await client.getChatCompletions(deploymentName, messages, { tools: getAllTools(), toolChoice: 'auto' });
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
// Enhancement Request API Endpoints (Issue #88)
// ============================================================================

// POST /api/enhancements - Queue new enhancement request
app.post('/api/enhancements', async (req, res) => {
    try {
        const { description, requestorName } = req.body;

        if (!description || description.trim().length === 0) {
            return res.status(400).json({ error: 'Description is required' });
        }

        // Use AI to extract and clarify the intent from the description
        // Includes retry logic with exponential backoff (3 retries)
        let clarifiedDescription = description;
        let extractedIntent = null;

        try {
            // Wrap AI call in retry logic for resilience
            const intentResponse = await withRetry(async () => {
                return await client.getChatCompletions(deploymentName, [
                    {
                        role: 'system',
                        content: `You are an assistant that helps clarify feature requests for a Modern Accounting software system.
Given a user's feature request, extract and clarify:
1. What feature they want (be specific)
2. Why they need it (the business value)
3. Any constraints or requirements mentioned

Respond in JSON format:
{
  "clarifiedDescription": "A clear, actionable description of the feature",
  "featureType": "Feature|Bug|Enhancement|Refactor",
  "affectedAreas": ["list", "of", "affected", "modules"],
  "priority": "Low|Medium|High|Critical"
}`
                    },
                    {
                        role: 'user',
                        content: description
                    }
                ], {
                    temperature: 0.3,
                    maxTokens: 500
                });
            }, {
                maxRetries: 3,
                baseDelayMs: 1000,
                maxDelayMs: 10000
            });

            const intentContent = intentResponse.choices[0]?.message?.content;
            if (intentContent) {
                try {
                    const parsedIntent = JSON.parse(intentContent);
                    // Validate and normalize the extracted intent
                    extractedIntent = validateExtractedIntent(parsedIntent);
                    clarifiedDescription = extractedIntent?.clarifiedDescription || description;
                } catch (parseError) {
                    console.warn('Could not parse AI intent response, using original description');
                }
            }
        } catch (aiError) {
            console.warn('AI intent extraction failed after all retries, using original description:', aiError.message);
        }

        // Create the enhancement record using DAB REST API
        const enhancementData = {
            RequestorName: requestorName || 'Anonymous',
            Description: clarifiedDescription,
            Status: 'pending',
            Notes: extractedIntent ? JSON.stringify({
                originalDescription: description,
                extractedIntent: extractedIntent
            }) : null
        };

        const result = await dab.create('enhancements', enhancementData);

        if (!result.success) {
            throw new Error(result.error || 'Failed to create enhancement');
        }

        res.status(201).json({
            success: true,
            enhancement: result.value,
            extractedIntent: extractedIntent
        });
    } catch (error) {
        console.error('Create enhancement error:', error);
        res.status(500).json({ error: 'Failed to create enhancement request', details: error.message });
    }
});

// GET /api/enhancements - List enhancements with optional status filter
app.get('/api/enhancements', async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;

        const options = {
            orderby: 'CreatedAt desc',
            first: parseInt(limit, 10)
        };

        if (status) {
            options.filter = `Status eq '${status}'`;
        }

        const result = await dab.get('enhancements', options);

        if (!result.success) {
            throw new Error(result.error || 'Failed to fetch enhancements');
        }

        res.json({
            success: true,
            enhancements: result.value
        });
    } catch (error) {
        console.error('List enhancements error:', error);
        res.status(500).json({ error: 'Failed to fetch enhancements', details: error.message });
    }
});

// GET /api/enhancements/:id - Get single enhancement by ID
app.get('/api/enhancements/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await dab.getById('enhancements', id);

        if (!result.success) {
            return res.status(404).json({ error: 'Enhancement not found' });
        }

        res.json({
            success: true,
            enhancement: result.value
        });
    } catch (error) {
        console.error('Get enhancement error:', error);
        res.status(500).json({ error: 'Failed to fetch enhancement', details: error.message });
    }
});

// PATCH /api/enhancements/:id - Update enhancement status
app.patch('/api/enhancements/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, branchName, prNumber, notes } = req.body;

        // Validate status if provided
        const validStatuses = ['pending', 'in-progress', 'deployed', 'reverted', 'failed'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                error: 'Invalid status',
                validStatuses: validStatuses
            });
        }

        // Build update data
        const updateData = {
            UpdatedAt: new Date().toISOString()
        };

        if (status) updateData.Status = status;
        if (branchName !== undefined) updateData.BranchName = branchName;
        if (prNumber !== undefined) updateData.PrNumber = prNumber;
        if (notes !== undefined) updateData.Notes = notes;

        const result = await dab.update('enhancements', id, updateData);

        if (!result.success) {
            return res.status(404).json({ error: 'Enhancement not found or update failed' });
        }

        res.json({
            success: true,
            enhancement: result.value
        });
    } catch (error) {
        console.error('Update enhancement error:', error);
        res.status(500).json({ error: 'Failed to update enhancement', details: error.message });
    }
});

// ============================================================================
// Deployment Routes (Issue #87 Phase 2)
// ============================================================================

app.use('/api/deployments', deploymentsRouter);

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 7071;

// Initialize and start server
async function startServer() {
    await initializeUploadDir();

    // Load QBO connections from database (for persistent sessions)
    try {
        const loadedCount = await qboAuth.loadConnectionsFromDB();
        if (loadedCount > 0) {
            console.log(`Loaded ${loadedCount} QBO connection(s) from database`);
        }
    } catch (error) {
        console.warn('Could not load QBO connections:', error.message);
    }

    // Load Plaid connections from database
    try {
        const loadedCount = await plaidService.loadConnectionsFromDB();
        if (loadedCount > 0) {
            console.log(`Loaded ${loadedCount} Plaid connection(s) from database`);
        }
    } catch (error) {
        console.warn('Could not load Plaid connections:', error.message);
    }

    // Start Plaid scheduler for background sync (optional - can be controlled via API)
    if (process.env.PLAID_AUTO_SYNC !== 'false') {
        try {
            plaidScheduler.start();
        } catch (error) {
            console.warn('Could not start Plaid scheduler:', error.message);
        }
    }

    app.listen(PORT, async () => {
        console.log(`Chat API running on http://localhost:${PORT}`);
        console.log(`Deployment: ${deploymentName}`);
        console.log(`DAB MCP URL: ${DAB_MCP_URL}`);
        console.log(`QBO MCP URL: ${QBO_MCP_URL}`);

        // Discover tools from MCP servers
        console.log('\nDiscovering MCP tools...');
        try {
            dynamicTools = await mcpManager.discoverAllTools();
            console.log(`Discovered ${dynamicTools.length} tools from MCP servers`);
        } catch (error) {
            console.warn('MCP tool discovery failed:', error.message);
            console.warn('Using fallback static tools');
        }
    });
}

startServer();
