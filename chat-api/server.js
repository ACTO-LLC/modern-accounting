import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
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
import taxRouter from './src/routes/tax.js';
import { validateJWT, optionalJWT, requireRole, requirePermission, requireMFA } from './src/middleware/auth.js';
import { resolveTenant, optionalTenant } from './src/middleware/tenant.js';
import {
    extractFromBusinessCard,
    extractFromEmailSignature,
    checkForDuplicates,
    formatContactForCreation
} from './src/services/contact-extractor.js';
import {
    isRenderingAvailable,
    getRendererType,
    renderPage
} from './src/services/web-renderer.js';
import { logAuditEvent, mapEntityType } from './src/services/audit-log.js';

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
// DAB (Data API Builder) Proxy
// ============================================================================
// Proxy /api/* requests to DAB for database operations
// Excludes routes handled directly by this server
const DAB_PROXY_URL = process.env.DAB_URL || process.env.DAB_REST_URL?.replace('/api', '') || 'http://localhost:5000';
const DAB_EXCLUDED_PATHS = [
    '/api/health',
    '/api/users',
    '/api/github',
    '/api/tax',
    '/api/chat',
    '/api/qbo',
    '/api/plaid',
    '/api/enhancements',
    '/api/deployments',
    '/api/extract-contact',
    '/api/upload-document',
    '/api/upload-receipt',
    '/api/transactions',
    '/api/banktransactions',
    '/api/post-transactions',
    '/api/categorization-rules',
    '/api/insights'
];

// Create proxy middleware instance once (not per-request)
const dabProxyMiddleware = createProxyMiddleware({
    target: DAB_PROXY_URL,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: (path, req) => {
        // Reconstruct full path: /api + stripped path
        const fullPath = '/api' + path;
        console.log(`[DAB Proxy] Rewriting path: ${path} -> ${fullPath}`);
        return fullPath;
    },
    onProxyReq: (proxyReq, req, res) => {
        const authHeader = req.headers.authorization;
        const hasAuth = authHeader ? `Bearer token present (${authHeader.length} chars)` : 'No auth header';
        console.log(`[DAB Proxy] Forwarding: ${req.method} ${proxyReq.path} -> ${DAB_PROXY_URL}${proxyReq.path}`);
        console.log(`[DAB Proxy] Authorization: ${hasAuth}`);

        // Note: mutations (POST/PATCH/PUT/DELETE) are handled via axios above,
        // so this proxy only handles GET requests. No body re-serialization needed.
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`[DAB Proxy] Response: ${proxyRes.statusCode} for ${req.method} ${req.path}`);
    },
    onError: (err, req, res) => {
        console.error('[DAB Proxy] Error:', err.message);
        res.status(502).json({
            error: 'Database API unavailable',
            message: err.message
        });
    }
});

// Direct route handlers for entities that need body forwarding (bypass proxy issues)
// These handle POST/PATCH/PUT by manually forwarding to DAB with the parsed body
app.patch('/api/companies/Id/:id', async (req, res) => {
    try {
        const dabUrl = `${DAB_PROXY_URL}/api/companies/Id/${req.params.id}`;
        console.log(`[DAB Direct] PATCH ${dabUrl}`);
        const response = await axios.patch(dabUrl, req.body, {
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
            }
        });
        logAuditEvent({
            action: 'Update',
            entityType: 'Company',
            entityId: req.params.id,
            entityDescription: `Update Company #${req.params.id.substring(0, 8)}`,
            newValues: req.body,
            req,
            source: 'API',
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('[DAB Direct] PATCH companies failed:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

app.post('/api/companies', async (req, res) => {
    try {
        const dabUrl = `${DAB_PROXY_URL}/api/companies`;
        console.log(`[DAB Direct] POST ${dabUrl}`);
        const response = await axios.post(dabUrl, req.body, {
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && { 'Authorization': req.headers.authorization })
            }
        });
        logAuditEvent({
            action: 'Create',
            entityType: 'Company',
            entityId: response.data?.value?.[0]?.Id || req.body?.Id,
            entityDescription: `Create Company${req.body?.Name ? ' (' + req.body.Name + ')' : ''}`,
            newValues: req.body,
            req,
            source: 'API',
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('[DAB Direct] POST companies failed:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
});

// Apply proxy for /api/* routes, but skip locally-handled paths
app.use('/api', async (req, res, next) => {
    // Check if this path should be handled locally
    const fullPath = '/api' + req.path;
    const shouldSkip = DAB_EXCLUDED_PATHS.some(excluded =>
        fullPath === excluded || fullPath.startsWith(excluded + '/')
    );

    if (shouldSkip) {
        return next();
    }

    // Mutations (POST/PATCH/PUT/DELETE) bypass the proxy and use axios directly.
    // Kestrel (DAB) enforces MinRequestBodyDataRate which causes body stream timeouts
    // when http-proxy-middleware pipes the already-consumed express.json() stream.
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        // Parse user from JWT for audit logging (non-blocking)
        await new Promise((resolve) => optionalJWT(req, res, resolve));

        // Fallback: if optionalJWT couldn't validate (issuer/audience mismatch etc.),
        // decode the JWT payload without verification to get user info for audit logging.
        // This is safe because DAB independently validates the token for authorization.
        if (!req.user && req.headers.authorization?.startsWith('Bearer ')) {
            try {
                const token = req.headers.authorization.slice(7);
                const payloadB64 = token.split('.')[1];
                const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
                req.user = {
                    entraObjectId: payload.oid || payload.sub || null,
                    email: payload.email || payload.preferred_username || payload.upn || null,
                    displayName: payload.name || payload.given_name || payload.email || null,
                };
                console.log('[DAB Direct] Decoded JWT for audit:', req.user.displayName, req.user.email);
            } catch (decodeErr) {
                console.warn('[DAB Direct] JWT decode fallback failed:', decodeErr.message);
            }
        }

        try {
            const dabUrl = `${DAB_PROXY_URL}${fullPath}`;
            const headers = {
                'Content-Type': req.headers['content-type'] || 'application/json',
                ...(req.headers['x-ms-api-role'] && { 'X-MS-API-ROLE': req.headers['x-ms-api-role'] }),
                ...(req.headers.authorization && { 'Authorization': req.headers.authorization }),
            };
            console.log(`[DAB Direct] ${req.method} ${dabUrl}`);
            const response = await axios({
                method: req.method.toLowerCase(),
                url: dabUrl,
                data: ['POST', 'PATCH', 'PUT'].includes(req.method) ? req.body : undefined,
                headers,
                validateStatus: () => true,
            });

            // Audit log (fire-and-forget)
            const pathMatch = fullPath.split('?')[0].match(/^\/api\/([^/]+)(?:\/Id\/(.+))?$/i);
            if (pathMatch) {
                const entity = pathMatch[1];
                const id = pathMatch[2] || null;
                const excluded = ['auditlog', 'authauditlog', 'health'];
                if (!excluded.includes(entity.toLowerCase())) {
                    const actionMap = { POST: 'Create', PATCH: 'Update', PUT: 'Update', DELETE: 'Delete' };
                    logAuditEvent({
                        action: actionMap[req.method] || 'System',
                        entityType: mapEntityType(entity),
                        entityId: id || req.body?.Id || req.body?.id || response.data?.value?.[0]?.Id || null,
                        newValues: ['POST', 'PATCH', 'PUT'].includes(req.method) ? req.body : null,
                        userId: req.user?.entraObjectId || null,
                        userName: req.user?.displayName || null,
                        userEmail: req.user?.email || null,
                        req,
                        source: 'DAB',
                    });
                }
            }

            res.status(response.status).json(response.data);
        } catch (error) {
            console.error(`[DAB Direct] ${req.method} ${fullPath} failed:`, error.response?.data || error.message);
            res.status(error.response?.status || 502).json(error.response?.data || { error: error.message });
        }
        return;
    }

    // GETs use the proxy (streaming works fine for reads)
    return dabProxyMiddleware(req, res, next);
});

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

// Tax calculation API routes
app.use('/api/tax', taxRouter);

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
const MA_MCP_URL = process.env.MA_MCP_URL || 'http://localhost:5002/mcp';
const DAB_REST_URL = process.env.DAB_REST_URL || 'http://localhost:5000/api';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// Initialize MCP servers
mcpManager.addServer('dab', DAB_MCP_URL);
mcpManager.addServer('qbo', QBO_MCP_URL);
mcpManager.addServer('ma', MA_MCP_URL);

// Dynamic tools discovered from MCP servers (populated at startup)
let dynamicTools = [];

// File storage map for tracking uploaded files (fileId -> file metadata)
const fileStorage = new Map();

// ============================================================================
// REST Client for DAB (used for onboarding tools - more reliable than MCP)
// ============================================================================

class DabRestClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    _decodeJwtPayload(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = Buffer.from(parts[1], 'base64').toString('utf8');
            return JSON.parse(payload);
        } catch (e) {
            return null;
        }
    }

    _buildHeaders(authToken = null, role = null) {
        const headers = { 'Content-Type': 'application/json' };

        // DAB requires X-MS-API-ROLE header for authorization
        // Always include it - for local DAB Simulator auth and production
        const effectiveRole = role || 'Admin';
        headers['X-MS-API-ROLE'] = effectiveRole;

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;

            // Log token details for debugging
            const payload = this._decodeJwtPayload(authToken);
            if (payload) {
                console.log(`[DAB REST] Token: aud=${payload.aud}, roles=${JSON.stringify(payload.roles)}, sub=${payload.sub?.substring(0, 8)}...`);
            }
            console.log(`[DAB REST] Headers: X-MS-API-ROLE=${effectiveRole}`);
        } else {
            console.log(`[DAB REST] No auth token - using X-MS-API-ROLE=${effectiveRole} for local DAB Simulator`);
        }
        return headers;
    }

    async get(entity, options = {}, authToken = null) {
        try {
            const params = new URLSearchParams();
            if (options.filter) params.append('$filter', options.filter);
            if (options.orderby) params.append('$orderby', Array.isArray(options.orderby) ? options.orderby.join(',') : options.orderby);
            if (options.select) params.append('$select', options.select);
            if (options.first) params.append('$first', options.first.toString());

            const url = `${this.baseUrl}/${entity}${params.toString() ? '?' + params.toString() : ''}`;
            const response = await axios.get(url, { headers: this._buildHeaders(authToken) });
            return { success: true, value: response.data.value || [] };
        } catch (error) {
            console.error(`REST GET ${entity} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async getById(entity, id, authToken = null) {
        try {
            const url = `${this.baseUrl}/${entity}/Id/${id}`;
            const response = await axios.get(url, { headers: this._buildHeaders(authToken) });
            return { success: true, value: response.data };
        } catch (error) {
            console.error(`REST GET ${entity}/${id} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async create(entity, data, authToken = null) {
        try {
            const headers = this._buildHeaders(authToken);
            console.log(`[DAB REST] POST ${this.baseUrl}/${entity}`);
            const response = await axios.post(`${this.baseUrl}/${entity}`, data, { headers });
            // DAB returns {"value":[{...}]}, extract the first item
            const created = response.data.value?.[0] || response.data;
            return { success: true, value: created };
        } catch (error) {
            console.error(`REST POST ${entity} failed:`, error.message);
            if (error.response) {
                console.error(`[DAB REST] Response status: ${error.response.status}`);
                console.error(`[DAB REST] Response data:`, JSON.stringify(error.response.data).substring(0, 500));
            }
            return { success: false, error: error.message };
        }
    }

    async update(entity, id, data, authToken = null) {
        try {
            const response = await axios.patch(`${this.baseUrl}/${entity}/Id/${id}`, data, {
                headers: this._buildHeaders(authToken)
            });
            return { success: true, value: response.data };
        } catch (error) {
            console.error(`REST PATCH ${entity}/${id} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    async delete(entity, id, authToken = null) {
        try {
            await axios.delete(`${this.baseUrl}/${entity}/Id/${id}`, { headers: this._buildHeaders(authToken) });
            return { success: true };
        } catch (error) {
            console.error(`REST DELETE ${entity}/${id} failed:`, error.message);
            return { success: false, error: error.message };
        }
    }

    // MCP-compatible adapter methods for migration executor
    async readRecords(entity, options = {}, authToken = null) {
        const result = await this.get(entity, options, authToken);
        if (result.success) {
            return { result: { value: result.value } };
        }
        return { error: result.error };
    }

    async createRecord(entity, data, authToken = null) {
        const result = await this.create(entity, data, authToken);
        if (result.success) {
            return { result: result.value };
        }
        return { error: result.error };
    }

    async deleteRecord(entity, params, authToken = null) {
        const id = params.Id || params.id;
        const result = await this.delete(entity, id, authToken);
        if (result.success) {
            return { result: { deleted: true } };
        }
        return { error: result.error };
    }

    // describeEntities is not available via REST API - return empty schema
    async describeEntities(params = {}, authToken = null) {
        // DAB REST API doesn't have a schema endpoint
        // Return a minimal response to avoid breaking callers
        return {
            result: {
                entities: []
            },
            error: 'Schema discovery not available via REST API'
        };
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

        // Performance optimizations
        this.lastActivityTime = 0;
        this.keepAliveInterval = null;
        this.keepAliveIntervalMs = 30000; // 30 seconds - keep session alive
        this.sessionTimeoutMs = 120000;   // 2 minutes - MCP session timeout

        // Response cache for frequently accessed data
        this.responseCache = new Map();
        this.responseCacheTtlMs = 5000;   // 5 second cache TTL for read queries
    }

    /**
     * Start session keep-alive pings
     */
    startKeepAlive() {
        if (this.keepAliveInterval) return;

        this.keepAliveInterval = setInterval(async () => {
            if (!this.initialized || !this.sessionId) return;

            const timeSinceActivity = Date.now() - this.lastActivityTime;
            // Only ping if we've been idle but session is still valid
            if (timeSinceActivity > this.keepAliveIntervalMs &&
                timeSinceActivity < this.sessionTimeoutMs) {
                try {
                    // Light ping - list tools (small response)
                    await this.ping();
                } catch (e) {
                    console.log('Keep-alive ping failed:', e.message);
                }
            }
        }, this.keepAliveIntervalMs);
    }

    /**
     * Stop session keep-alive pings
     */
    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    /**
     * Ping the session to keep it alive
     */
    async ping() {
        if (!this.initialized || !this.sessionId) return false;

        this.requestId++;
        const payload = {
            jsonrpc: '2.0',
            id: this.requestId,
            method: 'ping'
        };

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.sessionId) {
                headers['Mcp-Session-Id'] = this.sessionId;
            }

            await axios.post(this.mcpUrl, payload, {
                headers,
                timeout: 5000,
                transformResponse: [(data) => data]
            });

            this.lastActivityTime = Date.now();
            return true;
        } catch (error) {
            // Session likely expired
            return false;
        }
    }

    /**
     * Get cache key for a read operation
     */
    getCacheKey(entity, options) {
        return `${entity}:${JSON.stringify(options)}`;
    }

    /**
     * Clear the response cache
     */
    clearCache() {
        this.responseCache.clear();
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
                this.lastActivityTime = Date.now();
                this.startKeepAlive();
                console.log('MCP initialized, session:', this.sessionId);
                return true;
            }
            return false;
        } catch (error) {
            console.error('MCP initialization failed:', error.message);
            return false;
        }
    }

    async callTool(toolName, args = {}, authToken = null, retryOnSessionError = true) {
        await this.initialize();

        // Update activity time to prevent unnecessary keep-alive pings
        this.lastActivityTime = Date.now();

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
            // Forward auth token to DAB for authenticated requests
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
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
                    this.stopKeepAlive();
                    this.initialized = false;
                    this.sessionId = null;
                    return this.callTool(toolName, args, authToken, false);
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
                this.stopKeepAlive();
                this.initialized = false;
                this.sessionId = null;
                return this.callTool(toolName, args, authToken, false);
            }
            console.error(`MCP call failed for ${toolName}:`, error.message);
            return { error: error.message };
        }
    }

    // Entity operations
    async describeEntities(options = {}, authToken = null) {
        return this.callTool('describe_entities', options, authToken);
    }

    async readRecords(entity, options = {}, authToken = null) {
        return this.callTool('read_records', { entity, ...options }, authToken);
    }

    /**
     * Read records with short-lived caching for migration batch operations.
     * Cache is cleared after TTL expires.
     */
    async readRecordsCached(entity, options = {}) {
        const cacheKey = this.getCacheKey(entity, options);
        const cached = this.responseCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this.responseCacheTtlMs) {
            return cached.data;
        }

        const result = await this.readRecords(entity, options);

        // Only cache successful reads
        if (!result.error) {
            this.responseCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
        }

        return result;
    }

    /**
     * Batch check for existing records by field values.
     * Returns a Map of fieldValue -> existing record ID (or null if not found).
     * Much more efficient than checking one by one.
     */
    async batchCheckExisting(entity, fieldName, fieldValues) {
        if (!fieldValues || fieldValues.length === 0) {
            return new Map();
        }

        // Build OR filter for all values at once
        const escapedValues = fieldValues.map(v =>
            String(v).replace(/'/g, "''")
        );
        const filter = escapedValues
            .map(v => `${fieldName} eq '${v}'`)
            .join(' or ');

        const result = await this.readRecords(entity, {
            filter: `(${filter})`,
            select: `Id,${fieldName}`,
            first: fieldValues.length
        });

        const existingMap = new Map();
        const records = result.result?.value || [];

        for (const record of records) {
            existingMap.set(String(record[fieldName]), record.Id);
        }

        // Mark non-found values as null
        for (const value of fieldValues) {
            if (!existingMap.has(String(value))) {
                existingMap.set(String(value), null);
            }
        }

        return existingMap;
    }

    /**
     * Create multiple records in parallel with controlled concurrency.
     * Returns array of results in same order as input data.
     */
    async createRecordsBatch(entity, dataArray, concurrency = 5) {
        const results = [];

        for (let i = 0; i < dataArray.length; i += concurrency) {
            const batch = dataArray.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map(data => this.createRecord(entity, data))
            );
            results.push(...batchResults);
        }

        return results;
    }

    async createRecord(entity, data, authToken = null) {
        return this.callTool('create_record', { entity, data }, authToken);
    }

    async updateRecord(entity, keys, fields, authToken = null) {
        return this.callTool('update_record', { entity, keys, fields }, authToken);
    }

    async deleteRecord(entity, keys, authToken = null) {
        return this.callTool('delete_record', { entity, keys }, authToken);
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

5. WEB RESEARCH: You can fetch content from public websites. Two tools are available:

   fetch_company_info: Use this when user provides their company website URL. It checks multiple pages (/contact, /about, /locations, etc.) and extracts:
   - Company name
   - Email addresses
   - Phone numbers
   - Physical addresses
   Example: "Get our info from www.acme.com" -> use fetch_company_info

   fetch_webpage: Use for fetching a specific single page URL.

   IMPORTANT: After fetching company info, if the user is in onboarding or asks to update their company record:
   1. Use the extracted info (company name, phone, email, address) to update their company settings
   2. Use dab_query to find their existing company record
   3. Use dab_create or appropriate update methods to save the information
   4. Confirm what was updated: "I found and saved: Company Name, Phone: xxx, Email: xxx, Address: xxx"

6. FILE PROCESSING & CONTACT EXTRACTION: When users upload images, paste text, or ask about extracting contacts:

   BUSINESS CARDS:
   - When user uploads a business card image, use extract_from_business_card with the file ID
   - AI will extract: Company Name, Contact Name, Title/Role, Email, Phone, Address, Website
   - Show the extracted information and check for duplicates
   - If duplicates found, show them and ask user if it's a new contact or existing one
   - If no duplicates, ask "Is this a customer or vendor?"
   - Use create_customer_from_contact or create_vendor_from_contact to create the record
   - Success example: "✓ Created customer 'Acme Corporation' with contact John Smith (john@acme.com, 555-123-4567)"
   
   EMAIL SIGNATURES:
   - When user pastes an email signature, use extract_from_email_signature
   - AI will parse patterns to extract: Name, Company, Title, Email, Phone, Address, Website
   - Show extracted information (note: email signatures have lower confidence than scanned cards)
   - Check for duplicates and follow same flow as business cards
   - If pattern extraction fails, ask user to provide details manually
   
   RECEIPTS & INVOICES:
   - Extract merchant name, amount, date, and line items
   - Suggest appropriate expense category based on merchant type
   - Offer to create vendor record if not exists
   
   BANK STATEMENTS:
   - Identify bank name and account type
   - Suggest creating bank account in chart of accounts
   - Offer to create bank account automatically
   
   AUTO-CREATION WORKFLOW:
   1. Extract information from file/text
   2. Check for duplicates (email, name, or company match)
   3. If duplicates exist, show them and ask for confirmation
   4. If no duplicates or user confirms new record, create automatically
   5. Show confirmation with [View Customers] or [View Vendors] link

IMPORTANT RULES:
- Always use tools to fetch data. Never fabricate financial information.
- When uncertain, say "I'm not entirely sure, but..." or "Based on the available data..."
- Format currency as $X,XXX.XX
- Include clickable links formatted as [text](link) when referring to specific records
- For general accounting guidance (not about user's specific data), answer based on GAAP principles
- When you can confidently extract info from a file and take action (create account, customer, vendor), do it automatically and inform the user afterward
- Only ask for confirmation when there's ambiguity (e.g., "Is this a customer or vendor?") or duplicates found
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

SALES TAX CALCULATION:
The system supports three methods for determining sales tax on invoices:

1. MANUAL: User selects a tax rate from configured rates (traditional dropdown)
   - Best for: Simple businesses with one location and one tax rate
   - Configured in: Settings > Tax Settings (choose "Manual Selection")

2. ZIP-BASED API (Free): Automatic lookup based on customer postal code
   - Uses Avalara's free TaxRates API
   - ZIP-level accuracy (good for most small businesses)
   - Rate limited to 100 requests/hour per company
   - Results are cached (configurable duration)
   - Falls back to configured default rate if limit exceeded
   - Best for: Businesses selling to customers in multiple locations

3. PAID API (Avalara AvaTax or TaxJar): Street-level accuracy
   - Requires subscription with provider
   - Handles complex tax scenarios (exemptions, special rules)
   - Real-time jurisdiction-level rates
   - Best for: High-volume businesses, multi-state sellers, complex tax needs

HOW AUTOMATIC TAX WORKS ON INVOICES:
- When a customer is selected, system checks their PostalCode/State/City
- If auto-tax is enabled, system calls /api/tax/rate with customer address
- Tax rate is auto-populated in the invoice form
- User can still override with manual selection
- Shows "Auto: X.XX%" badge when rate is automatically determined

TAX SETTINGS CONFIGURATION:
Located at Settings > Tax Settings. Users can:
- Choose calculation method (manual/zip_api/paid_api)
- Configure paid API credentials (encrypted storage)
- Set fallback tax rate for API failures
- Test API connections before saving
- Set cache duration for API results

DATABASE ENTITIES:
- TaxCalculationSettings: Company tax config (method, API credentials, fallback rate)
- TaxRateCache: Cached API results with expiration
- TaxRates: Manually configured tax rates (for dropdown selection)

COMMON TAX QUESTIONS:
- "Do I need to collect sales tax?" -> Depends on nexus (physical/economic presence) in each state
- "What rate should I use?" -> Check your state's tax website or use automatic lookup
- "What about tax exemptions?" -> Mark customers as tax-exempt or specific items as non-taxable
- "Multi-state selling?" -> Recommend ZIP-based or paid API for automatic rate determination

BUSINESS VS PERSONAL TRANSACTIONS:
Transactions can be tagged as personal (IsPersonal = true) or business (default). This helps users who use their business accounts for occasional personal expenses:
- Expenses and Mileage forms have a "Personal" checkbox
- List views have a filter: Business Only (default), Personal Only, or All
- Reports default to "Business Only" for clean tax reporting
- Personal transactions show an orange "Personal" badge
- Use dab_query with filter "IsPersonal eq true" or "IsPersonal eq false" to query by type
- Remind users: Personal expenses are NOT tax-deductible for the business

CUSTOMER DEPOSITS & PREPAYMENTS:
Customer deposits are advance payments before services are rendered (unearned revenue):
- Located under Sales > Customer Deposits
- Accounting flow:
  1. Receive deposit: Debit Cash, Credit Unearned Revenue (liability)
  2. Apply to invoice: Debit Unearned Revenue, Credit Accounts Receivable
- Deposits can be partially applied across multiple invoices
- Status: Open, PartiallyApplied, Applied, Refunded
- Use dab_query on "customerdeposits" entity to check deposit balances
- Help users understand: deposits are NOT revenue until earned

YEAR-END CLOSE / CLOSING THE BOOKS:
Year-end close zeroes out revenue and expense accounts to Retained Earnings:
- Located under Accounting > Year-End Close
- Creates closing journal entries automatically
- Revenue accounts: Debit Revenue, Credit Retained Earnings
- Expense accounts: Debit Retained Earnings, Credit Expense
- After close, periods can be locked to prevent accidental posting
- FiscalYearCloses table tracks which years are closed
- Use dab_query on "fiscalyearcloses" to check close status
- IMPORTANT: Year-end close should only be done ONCE per fiscal year

CREDIT MEMOS & CUSTOMER REFUNDS:
Credit memos handle returns, adjustments, and overpayments for customers:
- Located under Sales > Credit Memos
- Accounting flow:
  1. Issue credit memo: Debit Sales/Revenue, Credit Accounts Receivable (reduces AR)
  2. Apply to invoice: Reduces invoice balance, updates AmountApplied on credit memo
  3. Issue refund: Debit Accounts Receivable, Credit Cash/Bank
- Status: Open, PartiallyApplied, Applied, Refunded, Voided
- Credit memos have line items (products/services) just like invoices
- Use dab_query on "creditmemos" to check credit balances (includes BalanceRemaining)
- Use dab_query on "creditapplications" to see how credits were applied to invoices
- Use dab_query on "refunds" to check refund status
- Help users understand: credits reduce what the customer owes, refunds return cash

IMPORT & SYNC:
The Import page consolidates bank import, CSV import, and match review into one tabbed interface:
- Located under Import & Sync > Import
- Three tabs: Bank Import, CSV Import, Review Matches
- Bank Connections: manage Plaid bank links (separate page)
- Bank Rules: auto-categorization rules for imported transactions (separate page)
- Old URLs (/bank-import, /bank-import/matches) redirect to the unified Import page

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
- migrate_bills: Migrate bills (requires vendors first)

CUTOFF DATE MIGRATION (RECOMMENDED):
For clean migrations, use the cutoff date approach:
- create_opening_balance_je: Create opening balance JE from QBO trial balance as of cutoff date
- migrate_open_invoices: Migrate only open (unpaid) invoices as of cutoff date
- migrate_open_bills: Migrate only open (unpaid) bills as of cutoff date
- verify_migration_complete: Verify migration is complete, shows next steps

Cutoff date migration workflow:
1. Migrate master data: Accounts, Customers, Vendors
2. create_opening_balance_je with cutoff date (e.g., 2026-01-31) - captures all balances
3. migrate_open_invoices with same cutoff date - only brings open AR
4. migrate_open_bills with same cutoff date - only brings open AP
5. verify_migration_complete - confirms all steps done
6. User connects bank via Plaid for transactions going forward

Benefits of cutoff date approach:
- Clean start without importing years of historical transactions
- Opening JE captures all account balances in one entry
- Only open invoices/bills need to be tracked individually
- Bank transactions flow fresh through Plaid from go-live date

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

USER TRAINING & LEARNING PATH:
The system has a progressive learning feature that guides new users through features based on experience level and goals.

When users ask about training or learning:
- "What should I learn next?" -> Check their learning path progress and suggest the next unlocked feature
- "How do I use [feature]?" -> Provide contextual help based on their experience level
- "Show my progress" -> Summarize completed vs. remaining learning modules

Learning modules (in typical order):
1. Foundation: Customers, Vendors, Products & Services, Tax Settings
2. Transactions: Invoices, Estimates, Bills, Expenses
3. Accounting: Chart of Accounts, Journal Entries
4. Advanced: Reports

Feature status types:
- Locked: Prerequisites not complete (explain what they need to do first)
- Unlocked: Available to learn
- In Progress: Currently learning
- Completed: Mastered

Example responses:
- "Great progress! You've completed 4 of 11 modules. Your next step is learning about Invoices."
- "To unlock Journal Entries, you'll first need to complete the Chart of Accounts module."
- "Since you selected 'invoicing' as your primary goal, I recommend focusing on Customers → Products → Invoices."

Encouragement guidelines:
- Celebrate completions: "Excellent! You've mastered Customers. Ready for the next step?"
- Acknowledge progress: "You're making great progress - already 40% through your learning journey!"
- Offer help: "Would you like me to explain any concepts as you explore this feature?"

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
- For migration comparisons → query both systems

BALANCE SHEET DIAGNOSTICS:
When users ask about balance sheet issues, out-of-balance problems, or accounting discrepancies, ALWAYS use the diagnostic tools to query actual data instead of giving generic advice:
- diagnose_balance_sheet: Checks the balance sheet equation (Assets = Liabilities + Equity), finds accounts with wrong-sign balances, and summarizes totals by account type. Use this FIRST for any balance sheet question.
- find_unbalanced_entries: Finds journal entries where debits do not equal credits. Use this to identify specific problematic entries.

Example questions that should trigger diagnostics:
- "Why is our balance sheet out of balance?"
- "Is the balance sheet correct?"
- "Are there any accounting errors?"
- "Check our books for issues"
- "Why don't my assets match liabilities plus equity?"
- "Find problems with our journal entries"

ALWAYS run the diagnostic tools and report specific findings with actual numbers. Never give generic educational answers when the user is asking about THEIR data.`;





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
            description: 'Create a new customer record with contact information. Records created via AI are tagged with SourceSystem="AI" for tracking. Always confirm with the user before creating a customer.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Customer/Company name (required)' },
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
            description: 'Create a new vendor record with contact information. Records created via AI are tagged with SourceSystem="AI" for tracking. Always confirm with the user before creating a vendor.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Vendor/Company name (required)' },
                    email: { type: 'string', description: 'Email address' },
                    phone: { type: 'string', description: 'Phone number' },
                    address: { type: 'string', description: 'Full address' },
                    is_1099_vendor: { type: 'boolean', description: 'Whether this is a 1099 vendor (default: false)' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_account',
            description: 'Create a new account in the chart of accounts. Records created via AI are tagged with SourceSystem="AI" for tracking. Always confirm with the user before creating an account.',
            parameters: {
                type: 'object',
                properties: {
                    code: { type: 'string', description: 'Account code (e.g., 1000, 5100) - must be unique' },
                    name: { type: 'string', description: 'Account name (required)' },
                    type: {
                        type: 'string',
                        enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'],
                        description: 'Account type (required)'
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
            name: 'qbo_search_entity',
            description: 'Search any QuickBooks Online entity type. Supports all QBO entities: Customer, Vendor, Account, Item, Invoice, Bill, Payment, BillPayment, JournalEntry, Purchase, Deposit, Transfer, Estimate, CreditMemo, SalesReceipt, RefundReceipt, VendorCredit, Employee, and more.',
            parameters: {
                type: 'object',
                properties: {
                    entity_type: { type: 'string', description: 'QBO entity type in PascalCase (e.g., Customer, Purchase, Deposit, Invoice)' },
                    display_name: { type: 'string', description: 'Filter by display name or name' },
                    active: { type: 'boolean', description: 'Filter by active status' },
                    start_date: { type: 'string', description: 'Start date filter (YYYY-MM-DD) for transaction entities' },
                    end_date: { type: 'string', description: 'End date filter (YYYY-MM-DD) for transaction entities' },
                    customer_name: { type: 'string', description: 'Filter by customer name (for invoices, payments)' },
                    vendor_name: { type: 'string', description: 'Filter by vendor name (for bills, bill payments)' },
                    fetch_all: { type: 'boolean', description: 'Fetch all records with automatic pagination' }
                },
                required: ['entity_type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_list_export_entities',
            description: 'List available entities that can be exported from QuickBooks Online. Dynamically discovers all supported QBO entity types.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'qbo_export_data',
            description: 'Export data from QuickBooks Online to a downloadable file. Supports JSON and CSV formats. Accepts any QBO entity type (e.g., Customer, Purchase, Deposit, Invoice, Vendor, etc.). Use qbo_list_export_entities to discover available types. Returns a download URL for the exported file.',
            parameters: {
                type: 'object',
                properties: {
                    entity: {
                        type: 'string',
                        description: 'The QBO entity type to export (e.g., Customer, Vendor, Invoice, Purchase, Deposit, JournalEntry)'
                    },
                    format: {
                        type: 'string',
                        enum: ['json', 'csv'],
                        description: 'Output format: json (default) or csv'
                    },
                    columns: {
                        type: 'string',
                        description: 'Comma-separated list of columns to include. If not specified, all columns are included.'
                    },
                    start_date: {
                        type: 'string',
                        description: 'Start date filter (YYYY-MM-DD) for transaction entities like invoices, bills, payments'
                    },
                    end_date: {
                        type: 'string',
                        description: 'End date filter (YYYY-MM-DD) for transaction entities'
                    },
                    name: {
                        type: 'string',
                        description: 'Filter by name/display name (for customers, vendors, accounts, items)'
                    },
                    active: {
                        type: 'boolean',
                        description: 'Filter by active status (true/false)'
                    },
                    customer_name: {
                        type: 'string',
                        description: 'Filter by customer name (for invoices, payments)'
                    },
                    vendor_name: {
                        type: 'string',
                        description: 'Filter by vendor name (for bills, billPayments)'
                    }
                },
                required: ['entity']
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
    // ========== QBO Cutoff Date Migration Tools ==========
    {
        type: 'function',
        function: {
            name: 'create_opening_balance_je',
            description: 'Create an opening balance journal entry from QuickBooks trial balance. Creates a single balanced JE capturing all account balances as of the cutoff date. This is step 1 of cutoff date migration.',
            parameters: {
                type: 'object',
                properties: {
                    cutoff_date: { type: 'string', description: 'Cutoff date in YYYY-MM-DD format (e.g., "2026-01-31"). Balances are as of this date.' },
                    preview_only: { type: 'boolean', description: 'If true, show what would be created without creating. Default false.' }
                },
                required: ['cutoff_date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_open_invoices',
            description: 'Migrate only OPEN (unpaid/partially paid) invoices from QuickBooks as of cutoff date. Excludes fully paid invoices. This is step 2 of cutoff date migration.',
            parameters: {
                type: 'object',
                properties: {
                    cutoff_date: { type: 'string', description: 'Only include invoices issued on or before this date (YYYY-MM-DD)' },
                    include_partially_paid: { type: 'boolean', description: 'Include partially paid invoices. Default true.' }
                },
                required: ['cutoff_date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'migrate_open_bills',
            description: 'Migrate only OPEN (unpaid/partially paid) bills from QuickBooks as of cutoff date. Excludes fully paid bills. This is step 3 of cutoff date migration.',
            parameters: {
                type: 'object',
                properties: {
                    cutoff_date: { type: 'string', description: 'Only include bills issued on or before this date (YYYY-MM-DD)' },
                    include_partially_paid: { type: 'boolean', description: 'Include partially paid bills. Default true.' }
                },
                required: ['cutoff_date']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'verify_migration_complete',
            description: 'Verify QBO cutoff date migration is complete. Checks opening balance JE exists, counts migrated entities, and compares AR/AP totals.',
            parameters: {
                type: 'object',
                properties: {
                    cutoff_date: { type: 'string', description: 'The cutoff date used for migration (YYYY-MM-DD)' }
                },
                required: ['cutoff_date']
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
    },
    // ========== Contact Extraction Tools (Business Cards & Email Signatures) ==========
    {
        type: 'function',
        function: {
            name: 'extract_from_business_card',
            description: 'Extract contact information from a business card image using AI vision. Extracts name, company, title, email, phone, address, and website.',
            parameters: {
                type: 'object',
                properties: {
                    file_id: { type: 'string', description: 'The uploaded file ID of the business card image' }
                },
                required: ['file_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'extract_from_email_signature',
            description: 'Extract contact information from an email signature text. Extracts name, company, title, email, phone, address, and website using pattern matching.',
            parameters: {
                type: 'object',
                properties: {
                    signature_text: { type: 'string', description: 'The email signature text to extract contact info from' }
                },
                required: ['signature_text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_customer_from_contact',
            description: 'Create a new customer record from extracted contact information (from business card or email). Checks for duplicates first.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Company name or contact name' },
                    email: { type: 'string', description: 'Email address' },
                    phone: { type: 'string', description: 'Phone number' },
                    address: { type: 'string', description: 'Physical address' },
                    contact_title: { type: 'string', description: 'Contact job title' },
                    website: { type: 'string', description: 'Website URL' },
                    skip_duplicate_check: { type: 'boolean', description: 'Skip duplicate check if user confirmed they want to create anyway' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_vendor_from_contact',
            description: 'Create a new vendor record from extracted contact information (from business card or email). Checks for duplicates first.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Company name or vendor name' },
                    email: { type: 'string', description: 'Email address' },
                    phone: { type: 'string', description: 'Phone number' },
                    address: { type: 'string', description: 'Physical address' },
                    contact_title: { type: 'string', description: 'Contact job title' },
                    website: { type: 'string', description: 'Website URL' },
                    is_1099_vendor: { type: 'boolean', description: 'Whether this is a 1099 contractor' },
                    skip_duplicate_check: { type: 'boolean', description: 'Skip duplicate check if user confirmed they want to create anyway' }
                },
                required: ['name']
            }
        }
    },
    // ========== Balance Sheet Diagnostic Tools ==========
    {
        type: 'function',
        function: {
            name: 'diagnose_balance_sheet',
            description: 'Diagnose balance sheet issues by querying actual account data. Checks the balance sheet equation (Assets = Liabilities + Equity), finds accounts with unexpected sign balances, and summarizes totals by account type. Use this when users ask "why is my balance sheet out of balance?" or similar questions about balance sheet problems.',
            parameters: {
                type: 'object',
                properties: {}
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_unbalanced_entries',
            description: 'Find journal entries where total debits do not equal total credits. These unbalanced entries are a common cause of balance sheet problems. Returns specific entry details so the user can fix them.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Max number of unbalanced entries to return (default 20)' }
                }
            }
        }
    },
    // ========== Web Tools ==========
    {
        type: 'function',
        function: {
            name: 'fetch_webpage',
            description: 'Fetch content from a public webpage URL. Use this to get company information, contact details, or other publicly available data from websites. Returns the text content of the page.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to fetch (must be a valid http:// or https:// URL)'
                    }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'fetch_company_info',
            description: 'Fetch company information from a website by checking multiple common pages (homepage, contact, about, etc.). Use this when a user provides their company website and you need to extract business details like company name, address, phone, email, etc. This is more thorough than fetch_webpage as it tries multiple page variations.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The base URL of the company website (e.g., https://www.example.com)'
                    }
                },
                required: ['url']
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

async function executeDabDescribeEntities(params, authToken = null) {
    try {
        const result = await dab.describeEntities(params.entities ? { entities: params.entities } : {}, authToken);
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

async function executeDabQuery(params, authToken = null) {
    try {
        const options = {};
        if (params.filter) options.filter = params.filter;
        if (params.select) options.select = params.select;
        if (params.orderby) options.orderby = [params.orderby];
        options.first = params.first || 100;

        // Use REST client for production compatibility
        const result = await dab.readRecords(params.entity, options, authToken);
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

async function executeDabCreate(params, authToken = null) {
    try {
        // Use REST client for production compatibility
        const result = await dab.createRecord(params.entity, params.data, authToken);
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
    console.log('[QBO Tool] executeQboQuery called with:', JSON.stringify(params));
    try {
        const status = await qboAuth.getStatus();
        console.log('[QBO Tool] QBO status:', JSON.stringify(status));
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks. Please connect first.', needsAuth: true };
        }

        const result = await qboAuth.query(params.query);
        console.log('[QBO Tool] Query result keys:', Object.keys(result || {}), 'totalCount:', result?.totalCount);

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

        const result = await dab.readRecords('invoices', mcpOptions);
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

        const custResult = await dab.readRecords('customers', mcpOptions);
        if (custResult.error) {
            return { success: false, error: custResult.error };
        }

        let customers = custResult.result?.value || [];

        // Get all invoices to calculate revenue
        const invResult = await dab.readRecords('invoices', { first: 1000 });
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

        const result = await dab.readRecords('bills', mcpOptions);
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
        const invResult = await dab.readRecords('invoices', {
            filter: `IssueDate ge ${start} and IssueDate le ${end}`,
            first: 1000
        });
        const invoices = invResult.result?.value || [];

        // Get bills for the period
        const billResult = await dab.readRecords('bills', {
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
        const overdueInvResult = await dab.readRecords('invoices', {
            filter: `Status ne 'Paid' and DueDate lt ${today}`,
            orderby: ['DueDate asc'],
            first: 100
        });
        const overdueInvoices = overdueInvResult.result?.value || [];

        // Get overdue bills
        const overdueBillsResult = await dab.readRecords('bills', {
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

            const upcomingInvResult = await dab.readRecords('invoices', {
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

            const upcomingBillsResult = await dab.readRecords('bills', {
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

        const result = await dab.readRecords('accounts', mcpOptions);
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
        const custResult = await dab.readRecords('customers', {
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
        const invResult = await dab.readRecords('invoices', {
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
        const jeResult = await dab.readRecords('journalentries', {
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
        const findResult = await dab.readRecords('invoices', {
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

        const createResult = await dab.createRecord('invoices', newInvoiceData);
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
        // Validate required fields
        if (!params.name || params.name.trim() === '') {
            return { success: false, error: 'Customer name is required' };
        }

        // Validate email format if provided
        if (params.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
            return { success: false, error: 'Invalid email format' };
        }

        const customerData = {
            Name: params.name.trim(),
            Email: params.email || null,
            Phone: params.phone || null,
            BillingAddress: params.address || null,
            // Tag as AI-created for tracking and auditing
            SourceSystem: 'AI',
            SourceId: `AI-${Date.now()}`
        };

        const createResult = await dab.createRecord('customers', customerData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `Successfully created customer '${params.name}'`,
            customer: {
                id: newId,
                name: params.name,
                email: params.email,
                phone: params.phone,
                address: params.address,
                createdBy: 'AI Assistant',
                link: `${APP_URL}/customers`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeCreateVendor(params) {
    try {
        // Validate required fields
        if (!params.name || params.name.trim() === '') {
            return { success: false, error: 'Vendor name is required' };
        }

        // Validate email format if provided
        if (params.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email)) {
            return { success: false, error: 'Invalid email format' };
        }

        const vendorData = {
            Name: params.name.trim(),
            Email: params.email || null,
            Phone: params.phone || null,
            Address: params.address || null,
            Is1099Vendor: params.is_1099_vendor || false,
            // Tag as AI-created for tracking and auditing
            SourceSystem: 'AI',
            SourceId: `AI-${Date.now()}`
        };

        const createResult = await dab.createRecord('vendors', vendorData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `Successfully created vendor '${params.name}'`,
            vendor: {
                id: newId,
                name: params.name,
                email: params.email,
                phone: params.phone,
                address: params.address,
                is1099: params.is_1099_vendor,
                createdBy: 'AI Assistant',
                link: `${APP_URL}/vendors`
            }
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function executeCreateAccount(params) {
    try {
        // Validate required fields
        if (!params.code || params.code.trim() === '') {
            return { success: false, error: 'Account code is required' };
        }
        if (!params.name || params.name.trim() === '') {
            return { success: false, error: 'Account name is required' };
        }
        if (!params.type) {
            return { success: false, error: 'Account type is required' };
        }

        // Validate account type
        const validTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
        if (!validTypes.includes(params.type)) {
            return { success: false, error: `Invalid account type. Must be one of: ${validTypes.join(', ')}` };
        }

        const accountData = {
            Code: params.code.trim(),
            Name: params.name.trim(),
            Type: params.type,
            Subtype: params.subtype || null,
            Description: params.description || null,
            IsActive: true,
            // Tag as AI-created for tracking and auditing
            SourceSystem: 'AI',
            SourceId: `AI-${Date.now()}`
        };

        const createResult = await dab.createRecord('accounts', accountData);
        if (createResult.error) {
            // Check for duplicate code error
            if (createResult.error.includes('UQ_Accounts_Code') || createResult.error.includes('duplicate')) {
                return { success: false, error: `Account code '${params.code}' already exists. Please use a unique code.` };
            }
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `Successfully created account ${params.code} - ${params.name}`,
            account: {
                id: newId,
                code: params.code,
                name: params.name,
                type: params.type,
                subtype: params.subtype,
                createdBy: 'AI Assistant',
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

async function executeQboAnalyzeMigration(authToken = null) {
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
        const actoStatus = await executeGetMigrationStatus({ source_system: 'QBO' }, authToken);

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

async function executeGetMigrationStatus(params, authToken = null) {
    try {
        const sourceSystem = params?.source_system || 'QBO';

        // Query each entity table for counts where SourceSystem matches
        const filter = `SourceSystem eq '${sourceSystem}'`;

        const [customers, vendors, accounts, invoices, bills, products, payments, billPayments, journalEntries] = await Promise.all([
            dab.readRecords('customers', { filter, first: 10000 }, authToken),
            dab.readRecords('vendors', { filter, first: 10000 }, authToken),
            dab.readRecords('accounts', { filter, first: 10000 }, authToken),
            dab.readRecords('invoices', { filter, first: 10000 }, authToken),
            dab.readRecords('bills', { filter, first: 10000 }, authToken),
            dab.readRecords('productsservices', { filter, first: 10000 }, authToken),
            dab.readRecords('payments', { filter, first: 10000 }, authToken),
            dab.readRecords('billpayments', { filter, first: 10000 }, authToken),
            dab.readRecords('journalentries', { filter, first: 10000 }, authToken)
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

async function executeQboSearchEntity(params) {
    console.log('[QBO Tool] executeQboSearchEntity called with:', JSON.stringify(params));
    try {
        const status = await qboAuth.getStatus();
        console.log('[QBO Tool] QBO status:', JSON.stringify(status));
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        if (!params.entity_type) {
            return { success: false, error: 'entity_type parameter is required (e.g., Customer, Purchase, Deposit)' };
        }

        const criteria = {
            name: params.display_name,
            active: params.active,
            type: params.account_type,
            fetchAll: params.fetch_all,
            startDate: params.start_date,
            endDate: params.end_date,
            customerName: params.customer_name,
            vendorName: params.vendor_name
        };

        const result = await qboAuth.searchEntity(params.entity_type, criteria);
        return { success: true, ...result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * List available QBO entities for export - dynamically discovered, no hardcoded list.
 * Common QBO entity types include: Customer, Vendor, Account, Item, Invoice, Bill,
 * Payment, BillPayment, JournalEntry, Purchase, Deposit, Transfer, Estimate,
 * CreditMemo, SalesReceipt, RefundReceipt, VendorCredit, Employee, etc.
 */
async function executeQboListExportEntities(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        // Common QBO entity types - listed for discovery, but any valid QBO entity can be queried
        const commonEntities = [
            { key: 'Customer', description: 'Customer records' },
            { key: 'Vendor', description: 'Vendor records' },
            { key: 'Account', description: 'Chart of Accounts' },
            { key: 'Item', description: 'Products & Services' },
            { key: 'Invoice', description: 'Invoice transactions' },
            { key: 'Bill', description: 'Bill transactions' },
            { key: 'Payment', description: 'Customer payments' },
            { key: 'BillPayment', description: 'Bill payments (vendor payments)' },
            { key: 'JournalEntry', description: 'Journal entries' },
            { key: 'Purchase', description: 'Purchases (expenses, checks, credit card charges)' },
            { key: 'Deposit', description: 'Bank deposits' },
            { key: 'Transfer', description: 'Bank transfers' },
            { key: 'Estimate', description: 'Estimates / quotes' },
            { key: 'CreditMemo', description: 'Credit memos' },
            { key: 'SalesReceipt', description: 'Sales receipts' },
            { key: 'RefundReceipt', description: 'Refund receipts' },
            { key: 'VendorCredit', description: 'Vendor credits' },
            { key: 'Employee', description: 'Employee records' },
        ];

        return {
            success: true,
            companyName: status.companyName,
            realmId: status.realmId,
            entities: commonEntities,
            hint: 'Use qbo_export_data with any entity key. Column names are derived from the data - no predefined columns. Filter transactions with start_date/end_date.'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Export QBO data to a downloadable file
 * Returns download URL without pre-fetching data (avoids double QBO API calls).
 * Accepts any valid QBO entity type - no hardcoded validation list.
 */
async function executeQboExportData(params) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        if (!params.entity) {
            return { success: false, error: 'Entity parameter is required. Use qbo_list_export_entities to see available options.' };
        }

        const format = params.format || 'json';

        // Build the download URL (data will be fetched when user clicks the link)
        const baseUrl = process.env.API_URL || 'http://localhost:3001';
        const queryParams = new URLSearchParams();
        queryParams.set('entity', params.entity);
        queryParams.set('format', format);
        if (params.columns) queryParams.set('columns', params.columns);
        if (params.start_date) queryParams.set('startDate', params.start_date);
        if (params.end_date) queryParams.set('endDate', params.end_date);
        if (params.name) queryParams.set('name', params.name);
        if (params.active !== undefined) queryParams.set('active', params.active.toString());
        if (params.customer_name) queryParams.set('customerName', params.customer_name);
        if (params.vendor_name) queryParams.set('vendorName', params.vendor_name);

        const downloadUrl = `${baseUrl}/api/qbo/export?${queryParams.toString()}`;

        return {
            success: true,
            entity: params.entity,
            format,
            filters: {
                startDate: params.start_date,
                endDate: params.end_date,
                name: params.name,
                active: params.active,
                customerName: params.customer_name,
                vendorName: params.vendor_name
            },
            downloadUrl,
            hint: `Export URL ready for ${params.entity}. The user can download the ${format.toUpperCase()} file from the download URL.`
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Migration Tool Execution Functions
// ============================================================================

// Migration now uses database-driven mappings and qboAuth for API calls

async function executeMigrateCustomers(params, authToken = null) {
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

        // Run migration (DB-driven) - use REST client with auth token for production
        const result = await migrateCustomers(qboCustomers, dab, 'QBO', authToken);

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

async function executeMigrateVendors(params, authToken = null) {
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

        // Run migration (DB-driven) - use REST client with auth token for production
        const result = await migrateVendors(qboVendors, dab, 'QBO', authToken);

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

async function executeMigrateProducts(params, authToken = null) {
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

        // Run migration (DB-driven) - use REST client with auth token for production
        const result = await migrateProducts(qboItems, dab, 'QBO', authToken);

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

async function executeMigrateInvoiceLines(params, authToken = null) {
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
        const maInvoicesResult = await dab.readRecords('invoices', {
            filter: `InvoiceNumber eq '${invoice_number}'`,
            first: 1
        }, authToken);

        const maInvoice = maInvoicesResult.result?.value?.[0];
        if (!maInvoice) {
            return { success: false, error: `Invoice ${invoice_number} not found in Modern Accounting` };
        }

        if (maInvoice.SourceSystem !== 'QBO') {
            return { success: false, error: `Invoice ${invoice_number} is not from QBO` };
        }

        // 2. Check if invoice already has line items
        const existingLinesResult = await dab.readRecords('invoicelines', {
            filter: `InvoiceId eq '${maInvoice.Id}'`,
            first: 100
        }, authToken);

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

                await dab.createRecord('invoicelines', {
                    InvoiceId: maInvoice.Id,
                    Description: line.Description || detail.ItemRef?.name || 'Line Item',
                    Quantity: qty,
                    UnitPrice: unitPrice
                    // Amount is a computed column (Quantity * UnitPrice)
                }, authToken);

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

async function executeMigrateAccounts(params, authToken = null) {
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

        // Run migration (DB-driven) - use REST client with auth token for production
        const result = await migrateAccounts(qboAccounts, dab, 'QBO', authToken);

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

async function executeMigrateInvoices(params, authToken = null) {
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

        // Run migration (DB-driven) - use REST client with auth token for production
        const result = await migrateInvoices(qboInvoices, dab, 'QBO', authToken);

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

async function executeMigrateBills(params, authToken = null) {
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

        // Run migration - use REST client with auth token for production
        const result = await migrateBills(qboBills, dab, 'QBO', authToken);

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

async function executeMigratePayments(params, authToken = null) {
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

        // Run migration - use REST client with auth token for production
        const result = await migratePayments(qboPayments, dab, 'QBO', authToken);

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

async function executeMigrateBillPayments(params, authToken = null) {
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

        // Run migration - use REST client with auth token for production
        const result = await migrateBillPayments(qboBillPayments, dab, 'QBO', authToken);

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

async function executeMigrateJournalEntries(params, authToken = null) {
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

        // Run migration - use REST client with auth token for production
        const result = await migrateJournalEntries(qboJournalEntries, dab, 'QBO', authToken);

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

// ============================================================================
// QBO Cutoff Date Migration Tools
// ============================================================================

/**
 * Create opening balance journal entry from QBO trial balance
 */
async function executeCreateOpeningBalanceJE(params, authToken = null) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const cutoffDate = params.cutoff_date;
        const previewOnly = params.preview_only || false;

        if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
            return { success: false, error: 'Invalid cutoff_date. Use YYYY-MM-DD format.' };
        }

        // Get trial balance from QBO (uses qbo_get_trial_balance tool via direct API call)
        const qboAccounts = await qboAuth.searchAccounts({ fetchAll: true });
        const accounts = qboAccounts.data || [];

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

        // Load QBO-to-ACTO account mappings
        const migrationMapsResult = await dab.get('migrationentitymaps', {
            filter: `SourceSystem eq 'QBO' and EntityType eq 'Account'`
        }, authToken);
        const accountMaps = migrationMapsResult.value || [];
        const qboToActoMap = new Map();
        for (const map of accountMaps) {
            qboToActoMap.set(String(map.SourceId), map.TargetId);
        }

        // Build journal entry lines
        let totalDebits = 0;
        let totalCredits = 0;
        const journalLines = [];
        const unmappedAccounts = [];

        for (const account of accounts) {
            const balance = parseFloat(account.CurrentBalance) || 0;
            if (Math.abs(balance) < 0.01) continue; // Skip zero-balance accounts

            const qboId = String(account.Id);
            const actoAccountId = qboToActoMap.get(qboId);

            if (!actoAccountId) {
                unmappedAccounts.push({
                    qboId,
                    name: account.Name,
                    balance
                });
                continue;
            }

            const accountType = account.AccountType || '';
            const isDebitNormal = debitNormalTypes.some(t => accountType.includes(t));

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
            } else {
                // Credit-normal accounts
                if (balance > 0) {
                    credit = balance;
                    totalCredits += balance;
                } else {
                    debit = Math.abs(balance);
                    totalDebits += Math.abs(balance);
                }
            }

            journalLines.push({
                accountId: actoAccountId,
                qboAccountName: account.Name,
                accountType: accountType,
                description: `Opening balance from QBO - ${account.Name}`,
                debit: Math.round(debit * 100) / 100,
                credit: Math.round(credit * 100) / 100
            });
        }

        // Round totals
        totalDebits = Math.round(totalDebits * 100) / 100;
        totalCredits = Math.round(totalCredits * 100) / 100;
        const outOfBalance = Math.round((totalDebits - totalCredits) * 100) / 100;

        // If out of balance, add balancing entry to Opening Balance Equity
        if (Math.abs(outOfBalance) >= 0.01) {
            // Find or create Opening Balance Equity account
            const equityResult = await dab.get('accounts', {
                filter: `Name eq 'Opening Balance Equity' or Name eq 'Opening Bal Equity'`,
                first: 1
            }, authToken);

            let equityAccountId = equityResult.value?.[0]?.Id;

            if (!equityAccountId) {
                // Create Opening Balance Equity account if it doesn't exist
                if (!previewOnly) {
                    const newEquityAccount = await dab.create('accounts', {
                        Name: 'Opening Balance Equity',
                        Type: 'Equity',
                        Code: 'OBE-001',
                        Description: 'Balancing account for opening balance journal entries'
                    }, authToken);
                    equityAccountId = newEquityAccount.value?.Id;
                }
            }

            if (equityAccountId || previewOnly) {
                // Add balancing line
                if (outOfBalance > 0) {
                    // Debits exceed credits - need a credit to balance
                    journalLines.push({
                        accountId: equityAccountId || 'OPENING_BALANCE_EQUITY',
                        qboAccountName: 'Opening Balance Equity (Balancing)',
                        accountType: 'Equity',
                        description: 'Balancing entry for opening balance JE',
                        debit: 0,
                        credit: Math.abs(outOfBalance)
                    });
                    totalCredits += Math.abs(outOfBalance);
                } else {
                    // Credits exceed debits - need a debit to balance
                    journalLines.push({
                        accountId: equityAccountId || 'OPENING_BALANCE_EQUITY',
                        qboAccountName: 'Opening Balance Equity (Balancing)',
                        accountType: 'Equity',
                        description: 'Balancing entry for opening balance JE',
                        debit: Math.abs(outOfBalance),
                        credit: 0
                    });
                    totalDebits += Math.abs(outOfBalance);
                }
            }
        }

        const reference = `QBO-OPENING-${cutoffDate}`;

        // Preview mode - show what would be created
        if (previewOnly) {
            return {
                success: true,
                preview: true,
                reference,
                cutoffDate,
                accountsWithBalance: journalLines.length,
                totalDebits: formatCurrency(totalDebits),
                totalCredits: formatCurrency(totalCredits),
                isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
                balancingEntry: Math.abs(outOfBalance) >= 0.01 ? formatCurrency(outOfBalance) : null,
                unmappedAccounts: unmappedAccounts.length,
                unmappedDetails: unmappedAccounts.slice(0, 5),
                sampleLines: journalLines.slice(0, 10).map(l => ({
                    account: l.qboAccountName,
                    debit: l.debit > 0 ? formatCurrency(l.debit) : '',
                    credit: l.credit > 0 ? formatCurrency(l.credit) : ''
                })),
                message: `Preview: Would create opening balance JE "${reference}" with ${journalLines.length} lines. ` +
                    `Total Debits: ${formatCurrency(totalDebits)}, Total Credits: ${formatCurrency(totalCredits)}. ` +
                    (unmappedAccounts.length > 0 ? `Warning: ${unmappedAccounts.length} QBO accounts not yet migrated.` : 'All accounts mapped.')
            };
        }

        // Check if opening balance JE already exists
        const existingJE = await dab.get('journalentries', {
            filter: `Reference eq '${reference}'`,
            first: 1
        }, authToken);

        if (existingJE.value?.length > 0) {
            return {
                success: false,
                error: `Opening balance JE "${reference}" already exists (ID: ${existingJE.value[0].Id}). Delete it first if you want to recreate.`,
                existingId: existingJE.value[0].Id
            };
        }

        // Create the journal entry
        const newJEId = randomUUID().toUpperCase();
        const jeResult = await dab.create('journalentries', {
            Id: newJEId,
            TransactionDate: cutoffDate,
            Description: `Opening balances from QuickBooks Online as of ${cutoffDate}`,
            Reference: reference,
            Status: 'Posted',
            CreatedBy: 'QBO Migration',
            SourceSystem: 'QBO',
            SourceId: `OPENING-${cutoffDate}`
        }, authToken);

        if (!jeResult.success) {
            return { success: false, error: `Failed to create journal entry: ${jeResult.error}` };
        }

        // Create journal entry lines
        let linesCreated = 0;
        const lineErrors = [];

        for (const line of journalLines) {
            try {
                await dab.create('journalentrylines', {
                    JournalEntryId: newJEId,
                    AccountId: line.accountId,
                    Description: line.description,
                    Debit: line.debit,
                    Credit: line.credit
                }, authToken);
                linesCreated++;
            } catch (err) {
                lineErrors.push({
                    account: line.qboAccountName,
                    error: err.message
                });
            }
        }

        return {
            success: true,
            message: `Created opening balance JE "${reference}" with ${linesCreated} lines. [View Journal Entries](/journal-entries)`,
            journalEntryId: newJEId,
            reference,
            cutoffDate,
            linesCreated,
            totalDebits: formatCurrency(totalDebits),
            totalCredits: formatCurrency(totalCredits),
            lineErrors: lineErrors.length,
            errorDetails: lineErrors.slice(0, 5),
            unmappedAccounts: unmappedAccounts.length,
            viewUrl: '/journal-entries'
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Migrate only open (unpaid/partially paid) invoices as of cutoff date
 */
async function executeMigrateOpenInvoices(params, authToken = null) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const cutoffDate = params.cutoff_date;
        const includePartiallyPaid = params.include_partially_paid !== false; // default true

        if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
            return { success: false, error: 'Invalid cutoff_date. Use YYYY-MM-DD format.' };
        }

        // Fetch all invoices from QBO with Balance > 0 (unpaid/partially paid)
        const qboResult = await qboAuth.searchInvoices({ fetchAll: true });
        let qboInvoices = qboResult.data || [];

        // Filter to only open invoices (Balance > 0)
        qboInvoices = qboInvoices.filter(inv => {
            const balance = parseFloat(inv.Balance) || 0;
            return balance > 0;
        });

        // Filter by cutoff date (issued on or before)
        qboInvoices = qboInvoices.filter(inv => {
            const txnDate = inv.TxnDate;
            return txnDate && txnDate <= cutoffDate;
        });

        // Optionally exclude partially paid (only keep fully unpaid)
        if (!includePartiallyPaid) {
            qboInvoices = qboInvoices.filter(inv => {
                const total = parseFloat(inv.TotalAmt) || 0;
                const balance = parseFloat(inv.Balance) || 0;
                return Math.abs(total - balance) < 0.01; // Fully unpaid
            });
        }

        if (qboInvoices.length === 0) {
            return {
                success: true,
                message: `No open invoices found on or before ${cutoffDate}`,
                migrated: 0,
                skipped: 0
            };
        }

        // Calculate stats before migration
        const totalOpenAR = qboInvoices.reduce((sum, inv) => sum + (parseFloat(inv.Balance) || 0), 0);
        const partiallyPaidCount = qboInvoices.filter(inv => {
            const total = parseFloat(inv.TotalAmt) || 0;
            const balance = parseFloat(inv.Balance) || 0;
            return total > balance && balance > 0;
        }).length;

        // Run migration (DB-driven) - use REST client with auth token
        const result = await migrateInvoices(qboInvoices, dab, 'QBO', authToken);

        // Calculate total value migrated
        const totalValue = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            message: `Migrated ${result.migrated} open invoices from QBO (${partiallyPaidCount} partially paid). [View Invoices](/invoices)`,
            migrated: result.migrated,
            skipped: result.skipped,
            cutoffDate,
            totalOpenAR: formatCurrency(totalOpenAR),
            partiallyPaidCount,
            totalValue: formatCurrency(totalValue),
            viewUrl: '/invoices',
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Migrate only open (unpaid/partially paid) bills as of cutoff date
 */
async function executeMigrateOpenBills(params, authToken = null) {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return { success: false, error: 'Not connected to QuickBooks', needsAuth: true };
        }

        const cutoffDate = params.cutoff_date;
        const includePartiallyPaid = params.include_partially_paid !== false; // default true

        if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
            return { success: false, error: 'Invalid cutoff_date. Use YYYY-MM-DD format.' };
        }

        // Fetch all bills from QBO with Balance > 0 (unpaid/partially paid)
        const qboResult = await qboAuth.searchBills({ fetchAll: true });
        let qboBills = qboResult.data || [];

        // Filter to only open bills (Balance > 0)
        qboBills = qboBills.filter(bill => {
            const balance = parseFloat(bill.Balance) || 0;
            return balance > 0;
        });

        // Filter by cutoff date (issued on or before)
        qboBills = qboBills.filter(bill => {
            const txnDate = bill.TxnDate;
            return txnDate && txnDate <= cutoffDate;
        });

        // Optionally exclude partially paid (only keep fully unpaid)
        if (!includePartiallyPaid) {
            qboBills = qboBills.filter(bill => {
                const total = parseFloat(bill.TotalAmt) || 0;
                const balance = parseFloat(bill.Balance) || 0;
                return Math.abs(total - balance) < 0.01; // Fully unpaid
            });
        }

        if (qboBills.length === 0) {
            return {
                success: true,
                message: `No open bills found on or before ${cutoffDate}`,
                migrated: 0,
                skipped: 0
            };
        }

        // Calculate stats before migration
        const totalOpenAP = qboBills.reduce((sum, bill) => sum + (parseFloat(bill.Balance) || 0), 0);
        const partiallyPaidCount = qboBills.filter(bill => {
            const total = parseFloat(bill.TotalAmt) || 0;
            const balance = parseFloat(bill.Balance) || 0;
            return total > balance && balance > 0;
        }).length;

        // Run migration (DB-driven) - use REST client with auth token
        const result = await migrateBills(qboBills, dab, 'QBO', authToken);

        // Calculate total value migrated
        const totalValue = result.details
            .filter(d => d.status === 'created')
            .reduce((sum, d) => sum + (d.amount || 0), 0);

        return {
            success: true,
            message: `Migrated ${result.migrated} open bills from QBO (${partiallyPaidCount} partially paid). [View Bills](/bills)`,
            migrated: result.migrated,
            skipped: result.skipped,
            cutoffDate,
            totalOpenAP: formatCurrency(totalOpenAP),
            partiallyPaidCount,
            totalValue: formatCurrency(totalValue),
            viewUrl: '/bills',
            errors: result.errors.length,
            errorDetails: result.errors.slice(0, 5),
            details: result.details.slice(0, 10)
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Verify QBO cutoff date migration is complete
 */
async function executeVerifyMigrationComplete(params, authToken = null) {
    try {
        const cutoffDate = params.cutoff_date;

        if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
            return { success: false, error: 'Invalid cutoff_date. Use YYYY-MM-DD format.' };
        }

        const reference = `QBO-OPENING-${cutoffDate}`;
        const checks = {
            openingBalanceJE: { passed: false, details: null },
            customersCount: { passed: false, count: 0 },
            vendorsCount: { passed: false, count: 0 },
            accountsCount: { passed: false, count: 0 },
            openInvoices: { passed: false, count: 0, total: 0 },
            openBills: { passed: false, count: 0, total: 0 }
        };

        // Check opening balance JE
        const jeResult = await dab.get('journalentries', {
            filter: `Reference eq '${reference}'`,
            first: 1
        }, authToken);

        if (jeResult.value?.length > 0) {
            const je = jeResult.value[0];
            // Get line counts
            const linesResult = await dab.get('journalentrylines', {
                filter: `JournalEntryId eq '${je.Id}'`
            }, authToken);
            const lines = linesResult.value || [];
            const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.Debit) || 0), 0);
            const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.Credit) || 0), 0);

            checks.openingBalanceJE = {
                passed: true,
                details: {
                    id: je.Id,
                    reference: je.Reference,
                    date: je.TransactionDate,
                    status: je.Status,
                    lineCount: lines.length,
                    totalDebit: formatCurrency(totalDebit),
                    totalCredit: formatCurrency(totalCredit),
                    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01
                }
            };
        }

        // Count migrated entities from MigrationEntityMaps
        const customerMaps = await dab.get('migrationentitymaps', {
            filter: `SourceSystem eq 'QBO' and EntityType eq 'Customer'`
        }, authToken);
        checks.customersCount = {
            passed: (customerMaps.value?.length || 0) > 0,
            count: customerMaps.value?.length || 0
        };

        const vendorMaps = await dab.get('migrationentitymaps', {
            filter: `SourceSystem eq 'QBO' and EntityType eq 'Vendor'`
        }, authToken);
        checks.vendorsCount = {
            passed: (vendorMaps.value?.length || 0) > 0,
            count: vendorMaps.value?.length || 0
        };

        const accountMaps = await dab.get('migrationentitymaps', {
            filter: `SourceSystem eq 'QBO' and EntityType eq 'Account'`
        }, authToken);
        checks.accountsCount = {
            passed: (accountMaps.value?.length || 0) > 0,
            count: accountMaps.value?.length || 0
        };

        // Count open invoices in ACTO
        const invoicesResult = await dab.get('invoices', {
            filter: `SourceSystem eq 'QBO' and Status ne 'Paid'`
        }, authToken);
        const openInvoices = invoicesResult.value || [];
        const arTotal = openInvoices.reduce((sum, inv) => {
            const total = parseFloat(inv.TotalAmount) || 0;
            const paid = parseFloat(inv.AmountPaid) || 0;
            return sum + (total - paid);
        }, 0);
        checks.openInvoices = {
            passed: true,
            count: openInvoices.length,
            total: formatCurrency(arTotal)
        };

        // Count open bills in ACTO
        const billsResult = await dab.get('bills', {
            filter: `SourceSystem eq 'QBO' and Status ne 'Paid'`
        }, authToken);
        const openBills = billsResult.value || [];
        const apTotal = openBills.reduce((sum, bill) => {
            const total = parseFloat(bill.TotalAmount) || 0;
            const paid = parseFloat(bill.AmountPaid) || 0;
            return sum + (total - paid);
        }, 0);
        checks.openBills = {
            passed: true,
            count: openBills.length,
            total: formatCurrency(apTotal)
        };

        // Determine overall status
        const allPassed = checks.openingBalanceJE.passed &&
            checks.customersCount.passed &&
            checks.vendorsCount.passed &&
            checks.accountsCount.passed;

        // Build next steps based on what's missing
        const nextSteps = [];
        if (!checks.openingBalanceJE.passed) {
            nextSteps.push('Create opening balance journal entry using create_opening_balance_je tool');
        }
        if (!checks.customersCount.passed) {
            nextSteps.push('Migrate customers from QBO using migrate_customers tool');
        }
        if (!checks.vendorsCount.passed) {
            nextSteps.push('Migrate vendors from QBO using migrate_vendors tool');
        }
        if (!checks.accountsCount.passed) {
            nextSteps.push('Migrate chart of accounts from QBO using migrate_accounts tool');
        }
        if (checks.openInvoices.count === 0 && checks.openingBalanceJE.passed) {
            nextSteps.push('Migrate open invoices using migrate_open_invoices tool');
        }
        if (checks.openBills.count === 0 && checks.openingBalanceJE.passed) {
            nextSteps.push('Migrate open bills using migrate_open_bills tool');
        }
        if (nextSteps.length === 0) {
            nextSteps.push('Migration complete! Connect bank accounts via Plaid for ongoing transactions.');
        }

        return {
            success: true,
            migrationComplete: allPassed && checks.openInvoices.count > 0,
            cutoffDate,
            checks,
            summary: {
                openingBalanceJE: checks.openingBalanceJE.passed ? 'Created' : 'Missing',
                customers: checks.customersCount.count,
                vendors: checks.vendorsCount.count,
                accounts: checks.accountsCount.count,
                openInvoices: `${checks.openInvoices.count} (${checks.openInvoices.total})`,
                openBills: `${checks.openBills.count} (${checks.openBills.total})`
            },
            nextSteps,
            message: allPassed
                ? `Migration verification passed! ${checks.customersCount.count} customers, ${checks.vendorsCount.count} vendors, ${checks.accountsCount.count} accounts migrated.`
                : `Migration incomplete. See nextSteps for required actions.`
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
        const productsResult = await dab.readRecords('productsservices', {
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
                const deleteResult = await dab.deleteRecord('productsservices', { Id: item.Id });
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

async function executeListIndustryTemplates(params, authToken = null) {
    try {
        const options = {
            orderby: 'SortOrder asc',
            first: 20
        };
        if (params.category) {
            options.filter = `Category eq '${params.category}'`;
        }

        const result = await dab.get('industrytemplates', options, authToken);
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

async function executeCreateCompany(params, authToken = null) {
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

        const createResult = await dab.create('companies', companyData, authToken);
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
            }, authToken);
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

async function executeGetIndustryTemplate(params, authToken = null) {
    try {
        const result = await dab.get('industrytemplates', {
            filter: `Code eq '${params.template_code}'`,
            first: 1
        }, authToken);

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

async function executeGenerateCOAFromTemplate(params, authToken = null) {
    try {
        // Get the template
        const templateResult = await dab.get('industrytemplates', {
            filter: `Code eq '${params.template_code}'`,
            first: 1
        }, authToken);

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
        }, authToken);
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
            }, authToken);

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
            }, authToken);
            if (industryProgress.value?.[0]) {
                await dab.update('onboardingprogress', industryProgress.value[0].Id, {
                    Status: 'Completed',
                    CompletedAt: new Date().toISOString(),
                    StepData: JSON.stringify({ templateCode: params.template_code })
                }, authToken);
            }

            // Mark coa_setup as completed
            const coaProgress = await dab.get('onboardingprogress', {
                filter: `CompanyId eq ${params.company_id} and StepCode eq 'coa_setup'`,
                first: 1
            }, authToken);
            if (coaProgress.value?.[0]) {
                await dab.update('onboardingprogress', coaProgress.value[0].Id, {
                    Status: 'Completed',
                    CompletedAt: new Date().toISOString(),
                    StepData: JSON.stringify({ accountsCreated: created, accountsSkipped: skipped })
                }, authToken);
            }

            // Update company industry
            await dab.update('companies', params.company_id, {
                Industry: template.Name,
                UpdatedAt: new Date().toISOString()
            }, authToken);
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

async function executeGetOnboardingStatus(params, authToken = null) {
    try {
        let companyId = params.company_id;

        // If no company ID provided, get the most recent company
        if (!companyId) {
            const companiesResult = await dab.get('companies', {
                orderby: 'CreatedAt desc',
                first: 1
            }, authToken);
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
        }, authToken);
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
        }, authToken);
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

async function executeUpdateOnboardingStep(params, authToken = null) {
    try {
        const progressResult = await dab.get('onboardingprogress', {
            filter: `CompanyId eq ${params.company_id} and StepCode eq '${params.step_code}'`,
            first: 1
        }, authToken);

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

        await dab.update('onboardingprogress', progress.Id, updateData, authToken);

        // Check if all steps are done
        const allProgressResult = await dab.get('onboardingprogress', {
            filter: `CompanyId eq ${params.company_id}`,
            orderby: 'StepOrder asc'
        }, authToken);
        const allSteps = allProgressResult.value || [];
        const allDone = allSteps.every(s => s.Status === 'Completed' || s.Status === 'Skipped');

        if (allDone) {
            await dab.update('companies', params.company_id, {
                OnboardingStatus: 'Completed',
                OnboardingCompletedAt: new Date().toISOString()
            }, authToken);
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
// Contact Extraction Tool Execution Functions
// ============================================================================

async function executeExtractFromBusinessCard(params) {
    try {
        const { file_id } = params;
        if (!file_id || !fileStorage.has(file_id)) {
            return { success: false, error: 'File not found. Please upload a business card image first.' };
        }

        const fileInfo = fileStorage.get(file_id);
        if (!fileInfo.filePath) {
            return { success: false, error: 'File path not available for extraction' };
        }

        // Extract using GPT-4o Vision
        const extractionResult = await extractFromBusinessCard(fileInfo.filePath, fileInfo.fileType);
        
        if (!extractionResult.success) {
            return {
                success: false,
                error: extractionResult.error,
                message: 'Unable to extract business card information. Please verify the image is clear and contains contact details.',
                requiresManualEntry: true
            };
        }

        // Check for duplicates
        const duplicates = await checkForDuplicates(extractionResult.data, mcp);
        
        if (duplicates.length > 0) {
            return {
                success: true,
                extracted: extractionResult.data,
                confidence: extractionResult.confidence,
                duplicates: duplicates,
                message: `Found ${duplicates.length} potential duplicate(s). Please confirm if this is a new contact or an existing one.`,
                nextAction: 'ask_duplicate_confirmation'
            };
        }

        return {
            success: true,
            extracted: extractionResult.data,
            confidence: extractionResult.confidence,
            message: 'Business card information extracted successfully. Is this a customer or vendor?',
            nextAction: 'ask_customer_or_vendor'
        };
    } catch (error) {
        console.error('Business card extraction error:', error);
        return { success: false, error: error.message };
    }
}

async function executeExtractFromEmailSignature(params) {
    try {
        const { signature_text } = params;
        if (!signature_text) {
            return { success: false, error: 'No email signature text provided' };
        }

        // Extract using pattern matching
        const extractionResult = await extractFromEmailSignature(signature_text);

        if (!extractionResult.success) {
            return {
                success: false,
                error: extractionResult.error,
                requiresManualEntry: true
            };
        }

        // Check for duplicates
        const duplicates = await checkForDuplicates(extractionResult.data, mcp);

        if (duplicates.length > 0) {
            return {
                success: true,
                extracted: extractionResult.data,
                confidence: extractionResult.confidence,
                duplicates: duplicates,
                message: `Found ${duplicates.length} potential duplicate(s). Please confirm if this is a new contact or an existing one.`,
                nextAction: 'ask_duplicate_confirmation'
            };
        }

        return {
            success: true,
            extracted: extractionResult.data,
            confidence: extractionResult.confidence,
            message: 'Email signature information extracted successfully. Is this a customer or vendor?',
            nextAction: 'ask_customer_or_vendor'
        };
    } catch (error) {
        console.error('Email signature extraction error:', error);
        return { success: false, error: error.message };
    }
}

async function executeCreateCustomerFromContact(params) {
    try {
        const {
            name,
            email,
            phone,
            address,
            contact_title,
            website,
            skip_duplicate_check
        } = params;

        if (!name) {
            return { success: false, error: 'Customer name is required' };
        }

        // Check for duplicates unless skipped
        if (!skip_duplicate_check) {
            const duplicates = await checkForDuplicates({
                contactName: name,
                email,
                companyName: name
            }, mcp);

            if (duplicates.length > 0) {
                return {
                    success: false,
                    duplicatesFound: true,
                    duplicates: duplicates,
                    message: `Found ${duplicates.length} existing customer(s) that might match. Please verify before creating a new one.`,
                    instruction: 'To create anyway, confirm with skip_duplicate_check: true'
                };
            }
        }

        // Create customer
        const customerData = {
            Name: name,
            Email: email || null,
            Phone: phone || null,
            BillingAddress: address || null,
            ContactTitle: contact_title || null,
            Website: website || null,
            CreatedFrom: 'contact_extraction'
        };

        const createResult = await dab.createRecord('customers', customerData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `✓ Created customer '${name}'`,
            customer: {
                id: newId,
                name: name,
                email: email,
                phone: phone,
                address: address,
                title: contact_title,
                website: website,
                link: `${APP_URL}/customers`
            }
        };
    } catch (error) {
        console.error('Create customer error:', error);
        return { success: false, error: error.message };
    }
}

async function executeCreateVendorFromContact(params) {
    try {
        const {
            name,
            email,
            phone,
            address,
            contact_title,
            website,
            is_1099_vendor,
            skip_duplicate_check
        } = params;

        if (!name) {
            return { success: false, error: 'Vendor name is required' };
        }

        // Check for duplicates unless skipped
        if (!skip_duplicate_check) {
            const duplicates = await checkForDuplicates({
                contactName: name,
                email,
                companyName: name
            }, mcp);

            if (duplicates.length > 0) {
                return {
                    success: false,
                    duplicatesFound: true,
                    duplicates: duplicates,
                    message: `Found ${duplicates.length} existing vendor(s) that might match. Please verify before creating a new one.`,
                    instruction: 'To create anyway, confirm with skip_duplicate_check: true'
                };
            }
        }

        // Create vendor
        const vendorData = {
            Name: name,
            Email: email || null,
            Phone: phone || null,
            Address: address || null,
            ContactTitle: contact_title || null,
            Website: website || null,
            Is1099Vendor: is_1099_vendor || false,
            CreatedFrom: 'contact_extraction'
        };

        const createResult = await dab.createRecord('vendors', vendorData);
        if (createResult.error) {
            return { success: false, error: createResult.error };
        }

        const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

        return {
            success: true,
            message: `✓ Created vendor '${name}'${is_1099_vendor ? ' (1099 vendor)' : ''}`,
            vendor: {
                id: newId,
                name: name,
                email: email,
                phone: phone,
                address: address,
                title: contact_title,
                website: website,
                is1099: is_1099_vendor,
                link: `${APP_URL}/vendors`
            }
        };
    } catch (error) {
        console.error('Create vendor error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Web Tool Execution Functions
// ============================================================================

// SSRF protection - block internal/private IPs and cloud metadata endpoints
function isBlockedUrl(url) {
    let hostname = new URL(url).hostname.toLowerCase();

    // Handle IPv6 addresses (hostname includes brackets like "[::1]")
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        hostname = hostname.slice(1, -1); // Remove brackets
    }

    // Block cloud metadata endpoints (AWS, Azure, GCP)
    if (hostname === '169.254.169.254') return true;
    if (hostname === 'metadata.google.internal') return true;

    // Block localhost variants (IPv4 and IPv6)
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1') return true;
    if (hostname.endsWith('.localhost')) return true;

    // Block IPv6 loopback and link-local
    if (hostname.startsWith('::ffff:127.')) return true;  // IPv4-mapped IPv6 loopback
    if (hostname.startsWith('::ffff:169.254.')) return true;  // IPv4-mapped IPv6 link-local
    if (hostname.startsWith('fe80:')) return true;  // IPv6 link-local
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;  // IPv6 unique local (private)

    // Block private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number);
        if (a === 10) return true;                         // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
        if (a === 192 && b === 168) return true;           // 192.168.0.0/16
        if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local)
        if (a === 0) return true;                          // 0.0.0.0/8
        if (a === 127) return true;                        // 127.0.0.0/8 (loopback)
    }

    // Block IPv4-mapped IPv6 addresses with private IPv4
    const mappedMatch = hostname.match(/^::ffff:(\d+)\.(\d+)\.(\d+)\.(\d+)$/i);
    if (mappedMatch) {
        const [, a, b] = mappedMatch.map(Number);
        if (a === 10) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a === 0) return true;
        if (a === 127) return true;
    }

    return false;
}

async function executeFetchWebpage(args) {
    try {
        const { url } = args;

        // Validate URL
        if (!url) {
            return { success: false, error: 'URL is required' };
        }

        // Ensure it's a valid URL
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                return { success: false, error: 'URL must use http:// or https://' };
            }
        } catch (e) {
            return { success: false, error: `Invalid URL: ${e.message}` };
        }

        // SSRF protection - block internal/private addresses
        if (isBlockedUrl(url)) {
            console.warn(`Blocked SSRF attempt: ${url}`);
            return { success: false, error: 'Cannot fetch internal or private addresses' };
        }

        console.log(`Fetching webpage: ${url}`);

        // Fetch the page with a reasonable timeout and user-agent
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Milton/1.0; +https://a-cto.com)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 5
        });

        // Extract text content from HTML
        let content = response.data;

        // If it's HTML, strip tags and clean up
        if (typeof content === 'string' && content.includes('<')) {
            // Remove script and style tags completely
            content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            content = content.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

            // Extract title
            const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : '';

            // Extract meta description
            const descMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
            const description = descMatch ? descMatch[1].trim() : '';

            // Remove all HTML tags
            content = content.replace(/<[^>]+>/g, ' ');

            // Clean up whitespace
            content = content.replace(/\s+/g, ' ').trim();

            // Decode HTML entities
            content = content
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&copy;/g, '©')
                .replace(/&reg;/g, '®')
                .replace(/&trade;/g, '™');

            // Truncate if too long (keep it reasonable for the AI)
            if (content.length > 15000) {
                content = content.substring(0, 15000) + '... [truncated]';
            }

            return {
                success: true,
                url: url,
                title: title,
                description: description,
                content: content
            };
        }

        // If it's not HTML, return as-is (might be JSON, text, etc.)
        return {
            success: true,
            url: url,
            content: typeof content === 'string' ? content : JSON.stringify(content)
        };

    } catch (error) {
        console.error('Error fetching webpage:', error.message);

        if (error.code === 'ENOTFOUND') {
            return { success: false, error: `Could not find website: ${args.url}` };
        }
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            return { success: false, error: `Website took too long to respond` };
        }
        if (error.response?.status === 403) {
            return { success: false, error: `Website blocked access (403 Forbidden)` };
        }
        if (error.response?.status === 404) {
            return { success: false, error: `Page not found (404)` };
        }

        return { success: false, error: `Failed to fetch webpage: ${error.message}` };
    }
}

// Common paths to check for contact/company information
const CONTACT_PAGE_PATHS = [
    '',              // homepage
    '/contact',
    '/contact-us',
    '/contactus',
    '/about',
    '/about-us',
    '/aboutus',
    '/locations',
    '/location',
    '/our-team',
    '/team',
    '/company',
    '/info',
    '/support'
];

async function executeFetchCompanyInfo(args) {
    try {
        const { url } = args;

        if (!url) {
            return { success: false, error: 'URL is required' };
        }

        // Parse and validate base URL
        let baseUrl;
        try {
            baseUrl = new URL(url);
            if (!['http:', 'https:'].includes(baseUrl.protocol)) {
                return { success: false, error: 'URL must use http:// or https://' };
            }
        } catch (e) {
            return { success: false, error: `Invalid URL: ${e.message}` };
        }

        // SSRF protection
        if (isBlockedUrl(url)) {
            console.warn(`Blocked SSRF attempt: ${url}`);
            return { success: false, error: 'Cannot fetch internal or private addresses' };
        }

        const useRenderer = isRenderingAvailable();
        console.log(`Fetching company info from: ${baseUrl.origin} (renderer: ${useRenderer ? getRendererType() : 'static'})`);

        const results = {
            baseUrl: baseUrl.origin,
            title: null,
            description: null,
            pagesChecked: [],
            contactInfo: {
                emails: new Set(),
                phones: new Set(),
                addresses: [],
                companyName: null
            },
            rawContent: '',
            rendererUsed: useRenderer ? getRendererType() : 'static'
        };

        // Helper function to fetch a single page
        async function fetchPage(fullUrl) {
            if (useRenderer) {
                // Use Puppeteer to render JavaScript
                const renderResult = await renderPage(fullUrl, { timeout: 15000, waitAfterLoad: 2000 });
                if (renderResult.success) {
                    return { success: true, html: renderResult.html };
                }
                // Fall back to static fetch on render failure
                console.log(`Renderer failed for ${fullUrl}, falling back to static fetch`);
            }

            // Static fetch with axios
            const response = await axios.get(fullUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Milton/1.0; +https://a-cto.com)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                maxRedirects: 3,
                validateStatus: (status) => status < 400
            });
            return { success: true, html: response.data };
        }

        // Try each path (sequential for renderer to avoid too many browser tabs)
        const pageResults = [];
        for (const path of CONTACT_PAGE_PATHS) {
            const fullUrl = `${baseUrl.origin}${path}`;
            try {
                const result = await fetchPage(fullUrl);
                pageResults.push({ path, fullUrl, ...result });
            } catch (e) {
                pageResults.push({ path, fullUrl, success: false, error: e.message });
            }
        }

        // Process successful pages
        for (const result of pageResults) {
            if (!result.success) continue;

            results.pagesChecked.push(result.path || '/');
            const html = result.html;

            if (typeof html !== 'string') continue;

            // Extract title from homepage
            if (result.path === '' && !results.title) {
                const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                if (titleMatch) results.title = titleMatch[1].trim();
            }

            // Extract meta description
            if (!results.description) {
                const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
                if (descMatch) results.description = descMatch[1].trim();
            }

            // Extract emails (common patterns)
            const emailMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (emailMatches) {
                emailMatches.forEach(email => {
                    // Filter out common non-contact emails
                    if (!email.includes('example.com') &&
                        !email.includes('sentry.io') &&
                        !email.includes('webpack') &&
                        !email.endsWith('.png') &&
                        !email.endsWith('.jpg')) {
                        results.contactInfo.emails.add(email.toLowerCase());
                    }
                });
            }

            // Extract phone numbers (US format)
            const phonePatterns = [
                /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,  // (123) 456-7890 or 123-456-7890
                /\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,  // +1 123 456 7890
                /1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g   // 1-123-456-7890
            ];
            for (const pattern of phonePatterns) {
                const phoneMatches = html.match(pattern);
                if (phoneMatches) {
                    phoneMatches.forEach(phone => {
                        // Normalize phone number
                        const normalized = phone.replace(/[^\d]/g, '');
                        if (normalized.length >= 10 && normalized.length <= 11) {
                            results.contactInfo.phones.add(phone.trim());
                        }
                    });
                }
            }

            // Extract addresses (look for common patterns)
            // This is a simplified extraction - addresses are hard to parse reliably
            const addressPatterns = [
                // Street address with city, state, zip
                /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct)[.,]?\s+(?:Suite|Ste|#|Unit|Apt)?\s*\d*[.,]?\s*[\w\s]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?/gi
            ];
            for (const pattern of addressPatterns) {
                const addressMatches = html.match(pattern);
                if (addressMatches) {
                    addressMatches.forEach(addr => {
                        if (!results.contactInfo.addresses.includes(addr.trim())) {
                            results.contactInfo.addresses.push(addr.trim());
                        }
                    });
                }
            }

            // Try to extract company name from common locations
            if (!results.contactInfo.companyName) {
                // From structured data
                const schemaMatch = html.match(/"name"\s*:\s*"([^"]+)"/);
                if (schemaMatch) {
                    results.contactInfo.companyName = schemaMatch[1];
                }
                // From og:site_name
                const ogMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
                if (ogMatch) {
                    results.contactInfo.companyName = ogMatch[1];
                }
            }

            // Clean HTML and add to raw content (limit per page)
            let cleanedHtml = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (cleanedHtml.length > 3000) {
                cleanedHtml = cleanedHtml.substring(0, 3000);
            }
            results.rawContent += `\n--- ${result.path || '/'} ---\n${cleanedHtml}`;
        }

        // Convert Sets to arrays for JSON
        const response = {
            success: true,
            baseUrl: results.baseUrl,
            title: results.title,
            description: results.description,
            pagesChecked: results.pagesChecked,
            companyName: results.contactInfo.companyName || results.title?.split(/[-|]/)[0]?.trim(),
            emails: Array.from(results.contactInfo.emails),
            phones: Array.from(results.contactInfo.phones),
            addresses: results.contactInfo.addresses,
            rendererUsed: results.rendererUsed,
            content: results.rawContent.length > 15000
                ? results.rawContent.substring(0, 15000) + '... [truncated]'
                : results.rawContent
        };

        console.log(`Company info extracted: ${response.emails.length} emails, ${response.phones.length} phones from ${response.pagesChecked.length} pages (renderer: ${results.rendererUsed})`);

        return response;

    } catch (error) {
        console.error('Error fetching company info:', error.message);
        return { success: false, error: `Failed to fetch company info: ${error.message}` };
    }
}

// ============================================================================
// Balance Sheet Diagnostic Tool Execution Functions
// ============================================================================

async function executeDiagnoseBalanceSheet() {
    try {
        // Fetch all accounts with their types and balances
        const accountsResult = await dab.get('accounts', {
            select: 'Id,Code,Name,AccountType,Balance',
            first: 1000
        });

        if (!accountsResult.success) {
            return { success: false, error: `Failed to fetch accounts: ${accountsResult.error}` };
        }

        const accounts = accountsResult.value || [];

        if (accounts.length === 0) {
            return { success: false, error: 'No accounts found in the chart of accounts. Please set up your chart of accounts first.' };
        }

        // Sum balances by account type
        const typeTotals = {};
        const wrongSignAccounts = [];

        for (const acct of accounts) {
            const type = acct.AccountType || 'Unknown';
            const balance = Number(acct.Balance) || 0;

            if (!typeTotals[type]) {
                typeTotals[type] = { total: 0, count: 0, accounts: [] };
            }
            typeTotals[type].total += balance;
            typeTotals[type].count += 1;

            // Check for wrong-sign balances
            // Assets and Expenses normally have debit (positive) balances
            // Liabilities, Equity, and Revenue normally have credit (positive in our system means credit for these)
            // Skip known contra accounts that legitimately carry opposite-sign balances
            const contraAccountPatterns = /accumulated depreciation|allowance for|sales returns|sales discounts|owner.s draw|purchase returns/i;
            const isContraAccount = contraAccountPatterns.test(acct.Name || '');
            if (balance !== 0 && !isContraAccount) {
                const isDebitType = (type === 'Asset' || type === 'Expense');
                const isCreditType = (type === 'Liability' || type === 'Equity' || type === 'Revenue');

                if ((isDebitType && balance < 0) || (isCreditType && balance < 0)) {
                    wrongSignAccounts.push({
                        code: acct.Code,
                        name: acct.Name,
                        type: type,
                        balance: balance,
                        issue: isDebitType
                            ? 'Negative balance on debit-normal account (Assets/Expenses should normally be positive)'
                            : 'Negative balance on credit-normal account (may indicate reversed entries)'
                    });
                }
            }
        }

        // Calculate balance sheet equation: Assets = Liabilities + Equity
        const totalAssets = typeTotals['Asset']?.total || 0;
        const totalLiabilities = typeTotals['Liability']?.total || 0;
        const totalEquity = typeTotals['Equity']?.total || 0;
        const totalRevenue = typeTotals['Revenue']?.total || 0;
        const totalExpenses = typeTotals['Expense']?.total || 0;

        const liabilitiesPlusEquity = totalLiabilities + totalEquity;
        const difference = Math.round((totalAssets - liabilitiesPlusEquity) * 100) / 100;
        const isBalanced = Math.abs(difference) < 0.01;

        // Net income = Revenue - Expenses (this affects equity via retained earnings)
        const netIncome = totalRevenue - totalExpenses;

        return {
            success: true,
            balanceSheetEquation: {
                totalAssets: Math.round(totalAssets * 100) / 100,
                totalLiabilities: Math.round(totalLiabilities * 100) / 100,
                totalEquity: Math.round(totalEquity * 100) / 100,
                liabilitiesPlusEquity: Math.round(liabilitiesPlusEquity * 100) / 100,
                difference: difference,
                isBalanced: isBalanced
            },
            incomeStatement: {
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalExpenses: Math.round(totalExpenses * 100) / 100,
                netIncome: Math.round(netIncome * 100) / 100,
                note: 'Net income flows into Equity via Retained Earnings. If year-end close has not been run, this may explain an equity imbalance.'
            },
            accountTypeSummary: Object.entries(typeTotals).map(([type, data]) => ({
                type,
                totalBalance: Math.round(data.total * 100) / 100,
                accountCount: data.count
            })),
            wrongSignAccounts: wrongSignAccounts,
            totalAccounts: accounts.length,
            diagnosis: isBalanced
                ? 'Balance sheet is balanced. Assets equal Liabilities plus Equity.'
                : `Balance sheet is OUT OF BALANCE by ${formatCurrency(Math.abs(difference))}. Assets (${formatCurrency(totalAssets)}) do not equal Liabilities (${formatCurrency(totalLiabilities)}) + Equity (${formatCurrency(totalEquity)}) = ${formatCurrency(liabilitiesPlusEquity)}.`
        };
    } catch (error) {
        console.error('Diagnose balance sheet error:', error);
        return { success: false, error: error.message };
    }
}

async function executeFindUnbalancedEntries(params) {
    try {
        const limit = Math.min(Math.max(parseInt(params?.limit) || 20, 1), 100);

        // Fetch all journal entry lines with their entry IDs and amounts
        // Use fetchAll to handle datasets larger than a single page
        const allLines = [];
        let pageSize = 5000;
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
            const linesPage = await dab.get('journalentrylines', {
                select: 'Id,JournalEntryId,AccountId,DebitAmount,CreditAmount,Description',
                first: pageSize,
                offset: offset
            });
            if (!linesPage.success) {
                return { success: false, error: `Failed to fetch journal entry lines: ${linesPage.error}` };
            }
            const pageData = linesPage.value || [];
            allLines.push(...pageData);
            if (pageData.length < pageSize) {
                hasMore = false;
            } else {
                offset += pageSize;
            }
        }
        const linesResult = { success: true, value: allLines };

        if (!linesResult.success) {
            return { success: false, error: `Failed to fetch journal entry lines: ${linesResult.error}` };
        }

        const lines = linesResult.value || [];

        if (lines.length === 0) {
            return { success: true, message: 'No journal entry lines found.', unbalancedEntries: [], totalEntriesChecked: 0 };
        }

        // Group lines by JournalEntryId and sum debits/credits
        const entrySums = {};
        for (const line of lines) {
            const entryId = line.JournalEntryId;
            if (!entryId) continue;

            if (!entrySums[entryId]) {
                entrySums[entryId] = { totalDebits: 0, totalCredits: 0, lineCount: 0, lines: [] };
            }
            entrySums[entryId].totalDebits += Number(line.DebitAmount) || 0;
            entrySums[entryId].totalCredits += Number(line.CreditAmount) || 0;
            entrySums[entryId].lineCount += 1;
            entrySums[entryId].lines.push({
                lineId: line.Id,
                accountId: line.AccountId,
                debit: Number(line.DebitAmount) || 0,
                credit: Number(line.CreditAmount) || 0,
                description: line.Description
            });
        }

        // Find entries where debits != credits
        const unbalanced = [];
        for (const [entryId, sums] of Object.entries(entrySums)) {
            const diff = Math.round((sums.totalDebits - sums.totalCredits) * 100) / 100;
            if (Math.abs(diff) >= 0.01) {
                unbalanced.push({
                    journalEntryId: entryId,
                    totalDebits: Math.round(sums.totalDebits * 100) / 100,
                    totalCredits: Math.round(sums.totalCredits * 100) / 100,
                    difference: diff,
                    lineCount: sums.lineCount,
                    lines: sums.lines
                });
            }
        }

        // Sort by absolute difference descending
        unbalanced.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

        // Also fetch journal entry headers and account names for the unbalanced ones
        const limitedUnbalanced = unbalanced.slice(0, limit);
        if (limitedUnbalanced.length > 0) {
            // Fetch entry headers and accounts in parallel
            const [entriesResult, accountsResult] = await Promise.all([
                dab.get('journalentries', {
                    select: 'Id,EntryNumber,EntryDate,Description,Status',
                    first: 1000
                }),
                dab.get('accounts', {
                    select: 'Id,Code,Name',
                    first: 1000
                })
            ]);

            // Build account lookup map
            const accountsMap = {};
            if (accountsResult.success) {
                for (const acct of (accountsResult.value || [])) {
                    accountsMap[acct.Id] = { code: acct.Code, name: acct.Name };
                }
            }

            if (entriesResult.success) {
                const entriesMap = {};
                for (const entry of (entriesResult.value || [])) {
                    entriesMap[entry.Id] = entry;
                }

                // Enrich unbalanced entries with header info and account names
                for (const ub of limitedUnbalanced) {
                    const header = entriesMap[ub.journalEntryId];
                    if (header) {
                        ub.entryNumber = header.EntryNumber;
                        ub.entryDate = header.EntryDate;
                        ub.description = header.Description;
                        ub.status = header.Status;
                    }
                    // Add account names to lines
                    for (const line of ub.lines) {
                        const acct = accountsMap[line.accountId];
                        if (acct) {
                            line.accountCode = acct.code;
                            line.accountName = acct.name;
                        }
                    }
                }
            }
        }

        const totalEntries = Object.keys(entrySums).length;

        return {
            success: true,
            totalEntriesChecked: totalEntries,
            totalUnbalanced: unbalanced.length,
            unbalancedEntries: limitedUnbalanced,
            message: unbalanced.length === 0
                ? `All ${totalEntries} journal entries are balanced (debits equal credits).`
                : `Found ${unbalanced.length} unbalanced journal ${unbalanced.length === 1 ? 'entry' : 'entries'} out of ${totalEntries} total. These entries have debits that do not equal credits.`
        };
    } catch (error) {
        console.error('Find unbalanced entries error:', error);
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
            t.function.name.startsWith('generate_') ||
            t.function.name.startsWith('diagnose_') ||
            t.function.name.startsWith('find_unbalanced') ||
            t.function.name.startsWith('fetch_')
        );
        // Put essential static tools FIRST so AI prefers them for migration tasks
        return [...essentialStaticTools, ...filteredDynamicTools];
    }
    // Fallback to static tools if MCP discovery failed
    return tools;
}

async function executeFunction(name, args, authToken = null) {
    // Check if this is a dynamically discovered MCP tool
    const isDynamicTool = dynamicTools.some(t => t.function.name === name);
    if (isDynamicTool) {
        console.log(`Executing MCP tool: ${name}`);
        // For QBO tools, inject access token and realm ID from stored connection
        let extraHeaders = {};
        if (name.startsWith('qbo_')) {
            try {
                const connection = await qboAuth.getActiveConnection();
                if (connection && connection.AccessToken && connection.RealmId) {
                    // Refresh token if needed before passing to MCP
                    const tokenExpiry = new Date(connection.TokenExpiry);
                    if (tokenExpiry < new Date(Date.now() + 5 * 60 * 1000)) {
                        console.log('[QBO MCP] Token near expiry, refreshing...');
                        await qboAuth.refreshTokenIfNeeded(connection.RealmId);
                        // Re-fetch after refresh
                        const refreshed = await qboAuth.getActiveConnection();
                        if (refreshed) {
                            extraHeaders['X-QBO-Access-Token'] = refreshed.AccessToken;
                            extraHeaders['X-QBO-Realm-Id'] = refreshed.RealmId;
                        }
                    } else {
                        extraHeaders['X-QBO-Access-Token'] = connection.AccessToken;
                        extraHeaders['X-QBO-Realm-Id'] = connection.RealmId;
                    }
                    console.log(`[QBO MCP] Injecting access token for realm ${connection.RealmId}`);
                } else {
                    console.warn('[QBO MCP] No active QBO connection for tool call');
                }
            } catch (err) {
                console.warn('[QBO MCP] Could not get QBO connection:', err.message);
            }
        }
        const result = await mcpManager.callTool(name, args, authToken, extraHeaders);
        return result;
    }

    // Fall through to static tool handlers
    console.log(`[Tool Dispatch] Static tool: ${name}, args:`, JSON.stringify(args).substring(0, 200));
    switch (name) {
        // Legacy static tools - these don't go through MCP
        case 'dab_describe_entities':
            return executeDabDescribeEntities(args, authToken);
        case 'dab_query':
            return executeDabQuery(args, authToken);
        case 'dab_create':
            return executeDabCreate(args, authToken);
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
            return executeQboAnalyzeMigration(authToken);
        case 'get_migration_status':
            return executeGetMigrationStatus(args, authToken);
        case 'qbo_search_entity':
            return executeQboSearchEntity(args);
        case 'qbo_list_export_entities':
            return executeQboListExportEntities(args);
        case 'qbo_export_data':
            return executeQboExportData(args);
        // Migration Tools - pass authToken for DAB authentication
        case 'migrate_customers':
            return executeMigrateCustomers(args, authToken);
        case 'migrate_vendors':
            return executeMigrateVendors(args, authToken);
        case 'migrate_accounts':
            return executeMigrateAccounts(args, authToken);
        case 'migrate_invoices':
            return executeMigrateInvoices(args, authToken);
        case 'migrate_bills':
            return executeMigrateBills(args, authToken);
        case 'migrate_payments':
            return executeMigratePayments(args, authToken);
        case 'migrate_bill_payments':
            return executeMigrateBillPayments(args, authToken);
        case 'migrate_journal_entries':
            return executeMigrateJournalEntries(args, authToken);
        case 'migrate_products':
            return executeMigrateProducts(args, authToken);
        case 'migrate_invoice_lines':
            return executeMigrateInvoiceLines(args, authToken);
        case 'delete_products':
            return executeDeleteProducts(args);
        // QBO Cutoff Date Migration Tools
        case 'create_opening_balance_je':
            return executeCreateOpeningBalanceJE(args, authToken);
        case 'migrate_open_invoices':
            return executeMigrateOpenInvoices(args, authToken);
        case 'migrate_open_bills':
            return executeMigrateOpenBills(args, authToken);
        case 'verify_migration_complete':
            return executeVerifyMigrationComplete(args, authToken);
        // Company Onboarding Tools
        case 'list_industry_templates':
            return executeListIndustryTemplates(args, authToken);
        case 'create_company':
            return executeCreateCompany(args, authToken);
        case 'get_industry_template':
            return executeGetIndustryTemplate(args, authToken);
        case 'generate_coa_from_template':
            return executeGenerateCOAFromTemplate(args, authToken);
        case 'get_onboarding_status':
            return executeGetOnboardingStatus(args, authToken);
        case 'update_onboarding_step':
            return executeUpdateOnboardingStep(args, authToken);
        // Contact Extraction Tools
        case 'extract_from_business_card':
            return executeExtractFromBusinessCard(args);
        case 'extract_from_email_signature':
            return executeExtractFromEmailSignature(args);
        case 'create_customer_from_contact':
            return executeCreateCustomerFromContact(args);
        case 'create_vendor_from_contact':
            return executeCreateVendorFromContact(args);
        // Balance Sheet Diagnostic Tools
        case 'diagnose_balance_sheet':
            return executeDiagnoseBalanceSheet();
        case 'find_unbalanced_entries':
            return executeFindUnbalancedEntries(args);
        // Web Tools
        case 'fetch_webpage':
            return executeFetchWebpage(args);
        case 'fetch_company_info':
            return executeFetchCompanyInfo(args);
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
    const fileId = randomUUID();
    const result = {
        fileId: fileId,
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

    // Store file info for later retrieval by tools
    fileStorage.set(fileId, {
        filePath: file.path,
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        extractedText: result.extractedText,
        base64Data: result.base64Data,
        createdAt: new Date()
    });

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
// Requires authentication to prevent unauthorized connection attempts
app.post('/api/qbo/connect', validateJWT, async (req, res) => {
    try {
        const state = randomUUID(); // Use as session correlation
        const authUrl = qboAuth.getAuthorizationUrl(state);

        // Store state for callback verification
        qboSessions.set(state, { createdAt: new Date() });

        logAuditEvent({
            action: 'Create',
            entityType: 'QBOConnection',
            entityDescription: 'Initiate QBO OAuth connection',
            newValues: { sessionId: state },
            req,
            source: 'API',
        });

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
// Requires authentication to prevent exposing company info
app.get('/api/qbo/status', validateJWT, async (req, res) => {
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
// Requires authentication to prevent unauthorized disconnection
app.post('/api/qbo/disconnect', validateJWT, async (req, res) => {
    try {
        const status = await qboAuth.getStatus();
        if (status.realmId) {
            await qboAuth.disconnect(status.realmId);
            logAuditEvent({
                action: 'Delete',
                entityType: 'QBOConnection',
                entityId: status.realmId,
                entityDescription: `Disconnect QBO (realmId: ${status.realmId})`,
                req,
                source: 'API',
            });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('QBO disconnect error:', error);
        res.status(500).json({ error: 'Failed to disconnect QBO' });
    }
});

// Analyze QBO data for migration
// Requires authentication to prevent exposing QBO entity counts
app.get('/api/qbo/analyze', validateJWT, async (req, res) => {
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

// Update source tracking for accounts/customers imported from QBO
// This links existing records to their QBO source for migration tracking
// Requires authentication to prevent unauthorized database modifications
app.post('/api/qbo/update-source-tracking', validateJWT, async (req, res) => {
    const dryRun = req.query.dryRun === 'true';
    const results = { accounts: { matched: 0, updated: 0, unmatched: [] }, customers: { matched: 0, updated: 0, unmatched: [] } };

    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return res.status(400).json({ error: 'Not connected to QuickBooks', needsAuth: true });
        }

        // Get QBO accounts (query() returns QueryResponse directly)
        const qboAccountsResult = await qboAuth.query('SELECT Id, Name, FullyQualifiedName, AccountType FROM Account MAXRESULTS 500');
        const qboAccounts = qboAccountsResult?.Account || [];
        console.log(`[Source Tracking] Found ${qboAccounts.length} accounts in QBO`);

        // Get QBO customers
        const qboCustomersResult = await qboAuth.query('SELECT Id, DisplayName, CompanyName, PrimaryEmailAddr FROM Customer MAXRESULTS 500');
        const qboCustomers = qboCustomersResult?.Customer || [];
        console.log(`[Source Tracking] Found ${qboCustomers.length} customers in QBO`);

        // Get ACTO accounts without source tracking
        const dabClient = new DabRestClient();
        const actoAccountsResp = await dabClient.get('/accounts?$filter=SourceSystem eq null');
        const actoAccounts = actoAccountsResp?.value || [];
        console.log(`[Source Tracking] Found ${actoAccounts.length} ACTO accounts without source tracking`);

        // Get ACTO customers without source tracking
        const actoCustomersResp = await dabClient.get('/customers?$filter=SourceSystem eq null');
        const actoCustomers = actoCustomersResp?.value || [];
        console.log(`[Source Tracking] Found ${actoCustomers.length} ACTO customers without source tracking`);

        // Match and update accounts
        for (const acct of actoAccounts) {
            const qboMatch = qboAccounts.find(q =>
                q.Name?.toLowerCase().trim() === acct.Name?.toLowerCase().trim() ||
                q.FullyQualifiedName?.toLowerCase().trim() === acct.Name?.toLowerCase().trim()
            );
            if (qboMatch) {
                results.accounts.matched++;
                if (!dryRun) {
                    await dabClient.patch(`/accounts/Id/${acct.Id}`, { SourceSystem: 'QBO', SourceId: String(qboMatch.Id) });
                    results.accounts.updated++;
                }
            } else {
                results.accounts.unmatched.push(acct.Name);
            }
        }

        // Match and update customers
        for (const cust of actoCustomers) {
            const qboMatch = qboCustomers.find(q =>
                q.DisplayName?.toLowerCase().trim() === cust.Name?.toLowerCase().trim() ||
                q.CompanyName?.toLowerCase().trim() === cust.Name?.toLowerCase().trim() ||
                (q.PrimaryEmailAddr?.Address && cust.Email && q.PrimaryEmailAddr.Address.toLowerCase() === cust.Email.toLowerCase())
            );
            if (qboMatch) {
                results.customers.matched++;
                if (!dryRun) {
                    await dabClient.patch(`/customers/Id/${cust.Id}`, { SourceSystem: 'QBO', SourceId: String(qboMatch.Id) });
                    results.customers.updated++;
                }
            } else {
                results.customers.unmatched.push(cust.Name);
            }
        }

        if (!dryRun) {
            logAuditEvent({
                action: 'Update',
                entityType: 'SourceTracking',
                entityDescription: `QBO source tracking update: ${results.accounts.updated} accounts, ${results.customers.updated} customers linked`,
                newValues: { accountsUpdated: results.accounts.updated, customersUpdated: results.customers.updated },
                req,
                source: 'API',
            });
        }

        res.json({
            success: true,
            dryRun,
            qboCounts: { accounts: qboAccounts.length, customers: qboCustomers.length },
            actoCounts: { accounts: actoAccounts.length, customers: actoCustomers.length },
            results
        });
    } catch (error) {
        console.error('Source tracking update error:', error);
        res.status(500).json({ error: error.message || 'Failed to update source tracking' });
    }
});

// ============================================================================
// QBO Data Export Endpoints (Issue #375)
// ============================================================================

/**
 * Rate limiting config for QBO export requests
 */
const QBO_EXPORT_CONFIG = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000
};

/**
 * Shared entity definitions for QBO export
 * Used by API endpoints, Milton tools, and tool definitions
 */
/**
 * Fetch QBO entity data with rate limiting and exponential backoff.
 * Uses the generic searchEntity() method - no hardcoded entity switch.
 * Accepts any valid QBO entity type (e.g., Customer, Purchase, Deposit, etc.)
 */
async function fetchQboEntityData(entityType, criteria) {
    let retryCount = 0;

    while (retryCount <= QBO_EXPORT_CONFIG.maxRetries) {
        try {
            return await qboAuth.searchEntity(entityType, criteria);
        } catch (error) {
            const isRateLimited =
                error.response?.status === 429 ||
                error.message?.toLowerCase().includes('rate limit') ||
                error.message?.toLowerCase().includes('throttl');

            if (isRateLimited && retryCount < QBO_EXPORT_CONFIG.maxRetries) {
                const delay = Math.min(
                    QBO_EXPORT_CONFIG.initialDelayMs * Math.pow(2, retryCount),
                    QBO_EXPORT_CONFIG.maxDelayMs
                );
                console.log(`[QBO Export] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${QBO_EXPORT_CONFIG.maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retryCount++;
            } else {
                throw error;
            }
        }
    }
}

/**
 * Get a nested property value using dot notation (e.g., "CustomerRef.name" or "Line.0.Amount")
 */
function getNestedProperty(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Get available QBO entities for export
 * Requires authentication to prevent unauthorized data access
 */
app.get('/api/qbo/export/entities', validateJWT, async (req, res) => {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return res.status(400).json({
                error: 'Not connected to QuickBooks',
                needsAuth: true
            });
        }

        // Return common entity types for discovery - but any valid QBO entity can be exported
        const commonEntities = [
            { key: 'Customer', description: 'Customer records' },
            { key: 'Vendor', description: 'Vendor records' },
            { key: 'Account', description: 'Chart of Accounts' },
            { key: 'Item', description: 'Products & Services' },
            { key: 'Invoice', description: 'Invoice transactions' },
            { key: 'Bill', description: 'Bill transactions' },
            { key: 'Payment', description: 'Customer payments' },
            { key: 'BillPayment', description: 'Bill payments (vendor payments)' },
            { key: 'JournalEntry', description: 'Journal entries' },
            { key: 'Purchase', description: 'Purchases (expenses, checks, credit card charges)' },
            { key: 'Deposit', description: 'Bank deposits' },
            { key: 'Transfer', description: 'Bank transfers' },
            { key: 'Estimate', description: 'Estimates / quotes' },
            { key: 'CreditMemo', description: 'Credit memos' },
            { key: 'SalesReceipt', description: 'Sales receipts' },
            { key: 'RefundReceipt', description: 'Refund receipts' },
            { key: 'VendorCredit', description: 'Vendor credits' },
            { key: 'Employee', description: 'Employee records' },
        ];
        res.json({
            entities: commonEntities,
            companyName: status.companyName,
            realmId: status.realmId,
            hint: 'Any valid QBO entity type can be exported, not just those listed here.'
        });
    } catch (error) {
        console.error('QBO entities discovery error:', error);
        res.status(500).json({ error: 'Failed to get available entities' });
    }
});

/**
 * Export QBO data to JSON or CSV
 * Supports filtering, column selection, and rate limiting
 * Requires authentication to prevent unauthorized data access
 */
app.get('/api/qbo/export', validateJWT, async (req, res) => {
    try {
        const status = await qboAuth.getStatus();
        if (!status.connected) {
            return res.status(400).json({
                error: 'Not connected to QuickBooks',
                needsAuth: true
            });
        }

        const {
            entity,           // Required: customers, vendors, accounts, etc.
            format = 'json',  // json or csv
            columns,          // Optional: comma-separated column names
            startDate,        // Optional: YYYY-MM-DD
            endDate,          // Optional: YYYY-MM-DD
            name,             // Optional: filter by name/displayName
            active,           // Optional: true/false
            type,             // Optional: account type, item type
            customerName,     // Optional: for invoices/payments
            vendorName        // Optional: for bills/billPayments
        } = req.query;

        if (!entity) {
            return res.status(400).json({
                error: 'Entity parameter is required',
                hint: 'Use GET /api/qbo/export/entities to see available entities'
            });
        }

        // Build criteria object based on entity type
        const criteria = { fetchAll: true };

        // Apply filters based on entity type
        if (name) criteria.name = name;
        if (active !== undefined) criteria.active = active === 'true';
        if (type) criteria.type = type;
        if (startDate) criteria.startDate = startDate;
        if (endDate) criteria.endDate = endDate;
        if (customerName) criteria.customerName = customerName;
        if (vendorName) criteria.vendorName = vendorName;

        console.log(`[QBO Export] Exporting ${entity} with criteria:`, criteria);

        // No hardcoded entity validation - let QBO's API validate the entity type.
        // This allows any valid QBO entity to be exported without code changes.

        // Fetch data using shared helper with rate limiting
        const data = await fetchQboEntityData(entity, criteria);

        // Extract records array from response
        const records = data?.data || [];
        console.log(`[QBO Export] Retrieved ${records.length} ${entity} records`);

        // Filter columns if specified
        let outputData = records;
        if (columns) {
            const colList = columns.split(',').map(c => c.trim());
            outputData = records.map(record => {
                const filtered = {};
                for (const col of colList) {
                    // Handle nested properties like CustomerRef.name or Line.0.Amount
                    filtered[col] = getNestedProperty(record, col);
                }
                return filtered;
            });
        }

        // Return in requested format
        if (format.toLowerCase() === 'csv') {
            const csvContent = convertToCSV(outputData);
            const filename = `qbo-${entity}-${new Date().toISOString().split('T')[0]}.csv`;

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.send(csvContent);
        }

        // Default JSON format
        const filename = `qbo-${entity}-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json({
            exportDate: new Date().toISOString(),
            entity,
            filters: { startDate, endDate, name, active, type, customerName, vendorName },
            count: outputData.length,
            data: outputData
        });

    } catch (error) {
        console.error('QBO export error:', error);
        res.status(500).json({ error: error.message || 'Failed to export QBO data' });
    }
});

/**
 * Convert array of objects to CSV string
 */
function convertToCSV(data) {
    if (!data || data.length === 0) {
        return '';
    }

    // Get all unique keys from all objects (in case objects have different keys)
    const allKeys = new Set();
    data.forEach(obj => {
        Object.keys(obj).forEach(key => allKeys.add(key));
    });
    const headers = Array.from(allKeys);

    // Create CSV header row
    const csvRows = [headers.map(h => escapeCSVField(h)).join(',')];

    // Create data rows
    for (const row of data) {
        const values = headers.map(header => {
            let value = row[header];
            // Handle nested objects and arrays
            if (value && typeof value === 'object') {
                value = JSON.stringify(value);
            }
            return escapeCSVField(value);
        });
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
}

/**
 * Escape a field for CSV format
 */
function escapeCSVField(field) {
    if (field === null || field === undefined) {
        return '';
    }
    const str = String(field);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// ============================================================================
// Plaid Bank Feed Endpoints
// ============================================================================

// Health check for Plaid service (doesn't require DAB access)
app.get('/api/plaid/health', (req, res) => {
    const client = plaidService.getClient();
    if (client) {
        res.json({ status: 'ok', configured: true });
    } else {
        res.status(503).json({ status: 'unavailable', configured: false, error: 'Plaid client not initialized' });
    }
});

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

// Create Plaid Link token in update mode for re-authenticating existing connections
app.post('/api/plaid/connections/:itemId/update-link-token', async (req, res) => {
    try {
        const { itemId } = req.params;
        const result = await plaidService.createUpdateLinkToken(itemId);
        res.json(result);
    } catch (error) {
        console.error('Plaid update link token error:', error);
        res.status(500).json({ error: error.message || 'Failed to create update link token' });
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
        logAuditEvent({
            action: 'Create',
            entityType: 'PlaidConnection',
            entityDescription: `Exchange Plaid public token (${metadata?.institution?.name || 'unknown institution'})`,
            newValues: { institutionName: metadata?.institution?.name, institutionId: metadata?.institution?.institution_id },
            req,
            source: 'API',
        });
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
        logAuditEvent({
            action: 'Delete',
            entityType: 'PlaidConnection',
            entityId: itemId,
            entityDescription: `Disconnect Plaid connection (itemId: ${itemId})`,
            req,
            source: 'API',
        });
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
        logAuditEvent({
            action: 'Update',
            entityType: 'PlaidAccount',
            entityId: id,
            entityDescription: `Link Plaid account #${id} to ledger account ${ledgerAccountId}`,
            newValues: { linkedAccountId: ledgerAccountId },
            req,
            source: 'API',
        });
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

// Refresh transactions for a Plaid connection (triggers Plaid to fetch new data)
// For sandbox with user_transactions_dynamic, this generates test transactions
app.post('/api/plaid/connections/:itemId/refresh', async (req, res) => {
    try {
        const { itemId } = req.params;

        // Trigger refresh
        await plaidService.refreshTransactions(itemId);

        // Wait a moment for Plaid to process
        await new Promise(r => setTimeout(r, 2000));

        // Then sync to pull the new transactions
        const syncResult = await plaidSync.syncConnection(itemId);

        res.json({
            success: true,
            message: 'Transactions refreshed and synced',
            ...syncResult
        });
    } catch (error) {
        console.error('Plaid refresh error:', error);
        res.status(500).json({ error: error.message || 'Failed to refresh transactions' });
    }
});

// DEBUG: Get raw Plaid transactions response
app.get('/api/plaid/connections/:itemId/debug-transactions', async (req, res) => {
    try {
        const { itemId } = req.params;
        const accessToken = await plaidService.getAccessToken(itemId);
        const client = plaidService.getClient();

        // Call Plaid directly with no cursor to get all transactions
        const response = await client.transactionsSync({
            access_token: accessToken,
            cursor: undefined,
            count: 100,
        });

        res.json({
            added: response.data.added?.length || 0,
            modified: response.data.modified?.length || 0,
            removed: response.data.removed?.length || 0,
            has_more: response.data.has_more,
            transactions: response.data.added?.slice(0, 5) || [], // First 5 for debug
        });
    } catch (error) {
        console.error('Debug transactions error:', error);
        res.status(500).json({ error: error.message });
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
// Employee Bank Verification Endpoints (Plaid Auth)
// ============================================================================

// Create Plaid Link token for employee bank verification (uses Auth product)
app.post('/api/plaid/verify-bank/link-token', async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ error: 'employeeId is required' });
        }

        // Create link token with Auth product for verification
        const result = await plaidService.createVerificationLinkToken(employeeId);
        res.json(result);
    } catch (error) {
        console.error('Plaid verification link token error:', error);
        res.status(500).json({ error: error.message || 'Failed to create verification link token' });
    }
});

// Exchange public token and verify bank account for employee
app.post('/api/plaid/verify-bank/exchange', async (req, res) => {
    try {
        const { publicToken, employeeId, metadata } = req.body;
        if (!publicToken || !employeeId) {
            return res.status(400).json({ error: 'publicToken and employeeId are required' });
        }

        const result = await plaidService.verifyEmployeeBankAccount(publicToken, employeeId, metadata);
        logAuditEvent({
            action: 'Create',
            entityType: 'BankVerification',
            entityId: employeeId,
            entityDescription: `Verify bank account for employee ${employeeId}`,
            newValues: { employeeId, institutionName: metadata?.institution?.name },
            req,
            source: 'API',
        });
        res.json(result);
    } catch (error) {
        console.error('Plaid bank verification error:', error);
        res.status(500).json({ error: error.message || 'Failed to verify bank account' });
    }
});

// Get verification status for an employee
app.get('/api/plaid/verify-bank/status/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const result = await plaidService.getEmployeeVerificationStatus(employeeId);
        res.json(result);
    } catch (error) {
        console.error('Plaid verification status error:', error);
        res.status(500).json({ error: error.message || 'Failed to get verification status' });
    }
});

// Remove bank verification from employee
app.post('/api/plaid/verify-bank/remove/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const result = await plaidService.removeEmployeeBankVerification(employeeId);
        logAuditEvent({
            action: 'Delete',
            entityType: 'BankVerification',
            entityId: employeeId,
            entityDescription: `Remove bank verification for employee ${employeeId}`,
            req,
            source: 'API',
        });
        res.json(result);
    } catch (error) {
        console.error('Plaid verification removal error:', error);
        res.status(500).json({ error: error.message || 'Failed to remove bank verification' });
    }
});

// Get employees with unverified bank accounts (for pay run warning)
app.get('/api/plaid/verify-bank/unverified-employees', async (req, res) => {
    try {
        const result = await plaidService.getUnverifiedEmployees();
        res.json(result);
    } catch (error) {
        console.error('Unverified employees error:', error);
        res.status(500).json({ error: error.message || 'Failed to get unverified employees' });
    }
});

// ============================================================================
// Transaction Learning Endpoints
// ============================================================================

// Helper to extract Bearer token from request
function extractAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    return null;
}

// Approve transaction and learn from correction
app.post('/api/transactions/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { accountId, category, memo } = req.body;
        const authToken = extractAuthToken(req);

        if (!accountId) {
            return res.status(400).json({ error: 'accountId is required' });
        }

        // Get the original transaction using dab client
        const txnResult = await dab.getById('banktransactions', id, authToken);
        if (!txnResult.success) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        const transaction = txnResult.value?.value?.[0] || txnResult.value;

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Check if the approved category differs from AI suggestion (learning opportunity)
        const suggestedAccountId = transaction.SuggestedAccountId;
        const shouldLearn = suggestedAccountId && suggestedAccountId.toLowerCase() !== accountId.toLowerCase();

        // Update the transaction using dab client
        const updateResult = await dab.update('banktransactions', id, {
            ApprovedAccountId: accountId,
            ApprovedCategory: category || transaction.SuggestedCategory,
            ApprovedMemo: memo || transaction.SuggestedMemo,
            Status: 'Approved',
            ReviewedDate: new Date().toISOString()
        }, authToken);

        if (!updateResult.success) {
            console.error('Transaction update failed:', updateResult.error);
            return res.status(500).json({ error: updateResult.error || 'Failed to update transaction' });
        }

        // Learn from the correction - create a rule if different from AI suggestion
        let ruleCreated = false;
        if (shouldLearn && transaction.Description) {
            // Extract a pattern from the description (use merchant if available, otherwise first significant word)
            const pattern = transaction.Merchant ||
                transaction.Description.split(' ').filter(w => w.length > 3)[0] ||
                transaction.Description.substring(0, 50);

            if (pattern) {
                try {
                    // Check if rule already exists using dab client
                    const existingRulesResult = await dab.get('categorizationrules', {
                        filter: `MatchValue eq '${pattern.replace(/'/g, "''")}'`
                    }, authToken);

                    if (existingRulesResult.success && (!existingRulesResult.value || existingRulesResult.value.length === 0)) {
                        // Create new rule using dab client
                        const createResult = await dab.create('categorizationrules', {
                            MatchType: 'contains',
                            MatchField: 'Description',
                            MatchValue: pattern,
                            AccountId: accountId,
                            Category: category || transaction.SuggestedCategory,
                            Priority: 50,  // User-learned rules have higher priority
                            CreatedBy: 'user-feedback'
                        }, authToken);
                        if (createResult.success) {
                            ruleCreated = true;
                            console.log(`Learning: Created rule for "${pattern}" -> ${category}`);
                        }
                    }
                } catch (ruleError) {
                    console.warn('Failed to create learning rule:', ruleError.message);
                }
            }
        }

        logAuditEvent({
            action: 'Update',
            entityType: 'BankTransaction',
            entityId: id,
            entityDescription: `Approve BankTransaction #${id.substring(0, 8)}`,
            newValues: { ApprovedAccountId: accountId, Status: 'Approved', ApprovedCategory: category },
            req,
            source: 'API',
        });
        if (ruleCreated) {
            logAuditEvent({
                action: 'Create',
                entityType: 'CategorizationRule',
                entityDescription: `Auto-created rule from transaction approval`,
                newValues: { MatchValue: transaction.Merchant || transaction.Description?.substring(0, 50), AccountId: accountId },
                req,
                source: 'API',
            });
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
        const authToken = extractAuthToken(req);

        if (!Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ error: 'transactions array is required' });
        }

        console.log(`[Batch Approve] Processing ${transactions.length} transactions`);

        // Pre-fetch accounts for category lookup if needed
        let accountsCache = null;
        const getAccounts = async () => {
            if (!accountsCache) {
                const accountsResult = await dab.get('accounts', {}, authToken);
                accountsCache = accountsResult.success ? accountsResult.value : [];
            }
            return accountsCache;
        };

        const getAccountByCategory = async (category) => {
            if (!category) return null;
            const accounts = await getAccounts();
            // Try exact match first, then partial match
            const exactMatch = accounts.find(a => a.Name?.toLowerCase() === category.toLowerCase());
            if (exactMatch) return exactMatch.Id;
            const partialMatch = accounts.find(a =>
                a.Name?.toLowerCase().includes(category.toLowerCase()) ||
                category.toLowerCase().includes(a.Name?.toLowerCase())
            );
            return partialMatch?.Id || null;
        };

        // Get fallback account based on transaction type (income vs expense)
        const getFallbackAccount = async (isIncome) => {
            const accounts = await getAccounts();
            if (isIncome) {
                // Look for Other Income or Miscellaneous Income
                return accounts.find(a =>
                    a.Name?.toLowerCase().includes('other') && a.Type === 'Revenue'
                )?.Id || accounts.find(a =>
                    a.Name?.toLowerCase().includes('miscellaneous') && a.Type === 'Revenue'
                )?.Id;
            } else {
                // Look for Miscellaneous Expense or Other Expense
                return accounts.find(a =>
                    a.Name?.toLowerCase().includes('miscellaneous') && a.Type === 'Expense'
                )?.Id || accounts.find(a =>
                    a.Name?.toLowerCase().includes('other') && a.Type === 'Expense'
                )?.Id;
            }
        };

        const results = [];
        for (const txn of transactions) {
            try {
                let accountId = txn.accountId;
                let category = txn.category;

                // If no accountId but have category, try to look up by category name
                if (!accountId && category) {
                    accountId = await getAccountByCategory(category);
                    if (accountId) {
                        console.log(`[Batch Approve] Resolved "${category}" -> account ${accountId}`);
                    }
                }

                // If still no accountId, use fallback based on transaction amount
                if (!accountId) {
                    // Fetch transaction to determine if income or expense
                    const txnResult = await dab.getById('banktransactions', txn.id, authToken);
                    const txnData = txnResult.value?.value?.[0] || txnResult.value;
                    if (txnData) {
                        const isIncome = parseFloat(txnData.Amount) > 0;
                        accountId = await getFallbackAccount(isIncome);
                        if (accountId) {
                            category = isIncome ? 'Other Income' : 'Miscellaneous Expense';
                            console.log(`[Batch Approve] Using fallback ${category} for ${txn.id}`);
                        }
                    }
                }

                // Skip transactions without a valid accountId
                if (!accountId) {
                    console.log(`[Batch Approve] Skipping ${txn.id} - no matching account for category "${txn.category}"`);
                    results.push({ id: txn.id, success: false, error: `No matching account for category "${txn.category}"` });
                    continue;
                }

                // Use dab client with proper headers for DAB Simulator auth
                const updateResult = await dab.update('banktransactions', txn.id, {
                    ApprovedAccountId: accountId,
                    ApprovedCategory: category || txn.category,
                    Status: 'Approved',
                    ReviewedDate: new Date().toISOString()
                }, authToken);

                if (updateResult.success) {
                    results.push({ id: txn.id, success: true });
                    logAuditEvent({
                        action: 'Update',
                        entityType: 'BankTransaction',
                        entityId: txn.id,
                        entityDescription: `Batch approve BankTransaction #${txn.id.substring(0, 8)}`,
                        newValues: { ApprovedAccountId: accountId, Status: 'Approved' },
                        req,
                        source: 'API',
                    });
                } else {
                    console.log(`[Batch Approve] Failed ${txn.id}: ${updateResult.error}`);
                    results.push({ id: txn.id, success: false, error: updateResult.error });
                }
            } catch (err) {
                console.log(`[Batch Approve] Error ${txn.id}: ${err.message}`);
                results.push({ id: txn.id, success: false, error: err.message });
            }
        }

        const approved = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        console.log(`[Batch Approve] Completed: ${approved} approved, ${failed} failed`);

        res.json({
            success: true,
            approved,
            failed,
            results
        });
    } catch (error) {
        console.error('Batch approval error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to batch approve' });
    }
});

// Get bank transactions (proxy to DAB with proper headers)
app.get('/api/banktransactions', async (req, res) => {
    try {
        const authToken = extractAuthToken(req);
        // Forward OData query params
        const filter = req.query.$filter;
        const orderby = req.query.$orderby;
        const options = {};
        if (filter) options.filter = filter;
        if (orderby) options.orderby = orderby;

        const result = await dab.get('banktransactions', options, authToken);

        if (!result.success) {
            return res.status(500).json({ error: result.error });
        }

        res.json({ value: result.value });
    } catch (error) {
        console.error('Bank transactions get error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to get transactions' });
    }
});

// Get single bank transaction by ID
app.get('/api/banktransactions/Id/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const authToken = extractAuthToken(req);

        const result = await dab.getById('banktransactions', id, authToken);

        if (!result.success) {
            return res.status(404).json({ error: result.error || 'Transaction not found' });
        }

        res.json(result.value);
    } catch (error) {
        console.error('Bank transaction get error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to get transaction' });
    }
});

// Update individual bank transaction (proxy to DAB with proper headers)
app.patch('/api/banktransactions/Id/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const authToken = extractAuthToken(req);
        console.log(`[Bank Transaction] Updating ${id}`);

        const result = await dab.update('banktransactions', id, req.body, authToken);

        if (!result.success) {
            console.error(`[Bank Transaction] Update failed: ${result.error}`);
            return res.status(500).json({ error: result.error });
        }

        logAuditEvent({
            action: 'Update',
            entityType: 'BankTransaction',
            entityId: id,
            entityDescription: `Update BankTransaction #${id.substring(0, 8)}`,
            newValues: req.body,
            req,
            source: 'API',
        });

        res.json(result.value);
    } catch (error) {
        console.error('Bank transaction update error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to update transaction' });
    }
});

// Get categorization rules
app.get('/api/categorization-rules', async (req, res) => {
    try {
        const authToken = extractAuthToken(req);
        const result = await dab.get('categorizationrules', {
            orderby: ['Priority', 'HitCount desc']
        }, authToken);
        res.json({ rules: result.value || [] });
    } catch (error) {
        console.error('Get rules error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to get rules' });
    }
});

// Post approved transactions to General Ledger (create journal entries)
app.post('/api/post-transactions', async (req, res) => {
    try {
        const { transactionIds } = req.body;
        const authToken = extractAuthToken(req);

        if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
            return res.status(400).json({ error: 'transactionIds array is required' });
        }

        console.log(`[Post Transactions] Processing ${transactionIds.length} transactions`);
        const results = { posted: 0, failed: 0, errors: [] };

        for (const txnId of transactionIds) {
            try {
                // Get the transaction using dab client
                const txnResult = await dab.getById('banktransactions', txnId, authToken);
                const txn = txnResult.value?.value?.[0] || txnResult.value;

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

                // Create the journal entry header using dab client
                const jeResult = await dab.create('journalentries', {
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
                }, authToken);

                if (!jeResult.success) {
                    results.failed++;
                    results.errors.push({ id: txnId, error: `Failed to create journal entry: ${jeResult.error}` });
                    continue;
                }

                // Create journal entry lines (double-entry)
                // For outflow (negative amount): Debit expense/asset, Credit bank
                // For inflow (positive amount): Debit bank, Credit income/liability
                const line1Id = crypto.randomUUID();
                const line2Id = crypto.randomUUID();

                if (isOutflow) {
                    // Debit the expense/asset account
                    await dab.create('journalentrylines', {
                        Id: line1Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.ApprovedAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: amount,
                        Credit: 0,
                        CreatedAt: new Date().toISOString()
                    }, authToken);
                    // Credit the bank account
                    await dab.create('journalentrylines', {
                        Id: line2Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.SourceAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: 0,
                        Credit: amount,
                        CreatedAt: new Date().toISOString()
                    }, authToken);
                } else {
                    // Debit the bank account
                    await dab.create('journalentrylines', {
                        Id: line1Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.SourceAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: amount,
                        Credit: 0,
                        CreatedAt: new Date().toISOString()
                    }, authToken);
                    // Credit the income/liability account
                    await dab.create('journalentrylines', {
                        Id: line2Id,
                        JournalEntryId: journalEntryId,
                        AccountId: txn.ApprovedAccountId,
                        Description: txn.ApprovedMemo || txn.Description,
                        Debit: 0,
                        Credit: amount,
                        CreatedAt: new Date().toISOString()
                    }, authToken);
                }

                // Update the bank transaction status and link to journal entry
                await dab.update('banktransactions', txnId, {
                    Status: 'Posted',
                    JournalEntryId: journalEntryId
                }, authToken);

                logAuditEvent({
                    action: 'Create',
                    entityType: 'JournalEntry',
                    entityId: journalEntryId,
                    entityDescription: `Post BankTransaction #${txnId.substring(0, 8)} -> JournalEntry`,
                    newValues: { TransactionDate: txn.TransactionDate, Reference: `BANK-${txnId.substring(0, 8)}`, Status: 'Posted' },
                    req,
                    source: 'API',
                });
                logAuditEvent({
                    action: 'Update',
                    entityType: 'BankTransaction',
                    entityId: txnId,
                    entityDescription: `Post BankTransaction #${txnId.substring(0, 8)} (status -> Posted)`,
                    newValues: { Status: 'Posted', JournalEntryId: journalEntryId },
                    req,
                    source: 'API',
                });

                results.posted++;
            } catch (txnError) {
                results.failed++;
                results.errors.push({ id: txnId, error: txnError.message });
                console.error(`Error posting transaction ${txnId}:`, txnError.message);
            }
        }

        console.log(`[Post Transactions] Completed: ${results.posted} posted, ${results.failed} failed`);
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
        logAuditEvent({
            action: 'Update',
            entityType: 'AccountDefault',
            entityId: type,
            entityDescription: `Set account default for ${type}`,
            newValues: { type, accountId, description },
            req,
            source: 'API',
        });
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
        logAuditEvent({
            action: 'Update',
            entityType: 'Invoice',
            entityId: id,
            entityDescription: `Post Invoice #${id.substring(0, 8)}`,
            newValues: { Status: 'Posted', PostedBy: userId },
            req,
            source: 'API',
        });
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
        logAuditEvent({
            action: 'Update',
            entityType: 'Invoice',
            entityId: id,
            entityDescription: `Void Invoice #${id.substring(0, 8)}`,
            newValues: { Status: 'Void', VoidedBy: userId },
            req,
            source: 'API',
        });
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
        logAuditEvent({
            action: 'Update',
            entityType: 'Bill',
            entityId: id,
            entityDescription: `Post Bill #${id.substring(0, 8)}`,
            newValues: { Status: 'Posted', PostedBy: userId },
            req,
            source: 'API',
        });
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
        logAuditEvent({
            action: 'Update',
            entityType: 'Bill',
            entityId: id,
            entityDescription: `Void Bill #${id.substring(0, 8)}`,
            newValues: { Status: 'Void', VoidedBy: userId },
            req,
            source: 'API',
        });
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

/**
 * Validate payment application data
 * @param {Array} applications - Array of application objects
 * @param {string} idField - Field name for ID (e.g., 'invoiceId' or 'billId')
 * @returns {Object} Validation result with isValid and error properties
 */
function validatePaymentApplications(applications, idField) {
    if (!Array.isArray(applications)) {
        return { 
            isValid: false, 
            error: 'Invalid applications: must be an array' 
        };
    }

    // Validate each application has required fields
    for (const app of applications) {
        if (app[idField] === null || app[idField] === undefined || app[idField] === '') {
            return { 
                isValid: false, 
                error: `Invalid application: each must have ${idField}` 
            };
        }
        if (app.amountApplied === null || app.amountApplied === undefined) {
            return { 
                isValid: false, 
                error: 'Invalid application: each must have amountApplied' 
            };
        }
        const appAmount = parseFloat(app.amountApplied);
        if (isNaN(appAmount) || appAmount <= 0) {
            return { 
                isValid: false, 
                error: 'Invalid application: amountApplied must be a positive number' 
            };
        }
    }

    return { isValid: true };
}

// Create a customer payment with journal entry
app.post('/api/payments', async (req, res) => {
    try {
        // Validate input
        const totalAmount = parseFloat(req.body.totalAmount);
        if (isNaN(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ 
                error: 'Invalid totalAmount: must be a positive number' 
            });
        }

        const applications = req.body.applications || [];
        const validationResult = validatePaymentApplications(applications, 'invoiceId');
        if (!validationResult.isValid) {
            return res.status(400).json({ error: validationResult.error });
        }

        const userId = req.body.userId || 'system';
        const paymentData = {
            customerId: req.body.customerId,
            paymentDate: req.body.paymentDate,
            totalAmount: totalAmount,
            paymentMethod: req.body.paymentMethod,
            depositAccountId: req.body.depositAccountId,
            memo: req.body.memo,
            applications: applications
        };

        const result = await journalEntryService.recordInvoicePayment(paymentData, userId);
        logAuditEvent({
            action: 'Create',
            entityType: 'Payment',
            entityId: result.paymentId || null,
            entityDescription: `Record customer payment ($${paymentData.totalAmount})`,
            newValues: { customerId: paymentData.customerId, totalAmount: paymentData.totalAmount, paymentMethod: paymentData.paymentMethod },
            req,
            source: 'API',
        });
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
        // Validate input
        const totalAmount = parseFloat(req.body.totalAmount);
        if (isNaN(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ 
                error: 'Invalid totalAmount: must be a positive number' 
            });
        }

        const applications = req.body.applications || [];
        const validationResult = validatePaymentApplications(applications, 'billId');
        if (!validationResult.isValid) {
            return res.status(400).json({ error: validationResult.error });
        }

        const userId = req.body.userId || 'system';
        const paymentData = {
            vendorId: req.body.vendorId,
            paymentDate: req.body.paymentDate,
            totalAmount: totalAmount,
            paymentMethod: req.body.paymentMethod,
            paymentAccountId: req.body.paymentAccountId,
            memo: req.body.memo,
            applications: applications
        };

        const result = await journalEntryService.recordBillPayment(paymentData, userId);
        logAuditEvent({
            action: 'Create',
            entityType: 'BillPayment',
            entityId: result.paymentId || null,
            entityDescription: `Record bill payment ($${paymentData.totalAmount})`,
            newValues: { vendorId: paymentData.vendorId, totalAmount: paymentData.totalAmount, paymentMethod: paymentData.paymentMethod },
            req,
            source: 'API',
        });
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

app.post('/api/chat', optionalJWT, async (req, res) => {
    try {
        const { message, history = [], attachments = [] } = req.body;
        const authToken = req.authToken; // Get auth token for forwarding to DAB

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
        const maxIterations = 10;

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
                const functionResult = await executeFunction(toolCall.function.name, functionArgs, authToken);
                messages.push({ role: 'tool', toolCallId: toolCall.id, content: JSON.stringify(functionResult) });
            }

            response = await client.getChatCompletions(deploymentName, messages, { tools: getAllTools(), toolChoice: 'auto' });
            responseMessage = response.choices[0].message;
        }

        // If we hit the iteration limit and the model still wants to call tools,
        // force a final text response so the user gets an answer instead of an empty string
        if (iterations >= maxIterations && responseMessage.toolCalls && responseMessage.toolCalls.length > 0) {
            console.warn(`Hit maxIterations (${maxIterations}) with pending tool calls, forcing text response`);
            messages.push(responseMessage);
            for (const toolCall of responseMessage.toolCalls) {
                messages.push({ role: 'tool', toolCallId: toolCall.id, content: JSON.stringify({ error: 'Iteration limit reached' }) });
            }
            response = await client.getChatCompletions(deploymentName, messages, { tools: getAllTools(), toolChoice: 'none' });
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

app.get('/api/insights', validateJWT, async (req, res) => {
    try {
        const insights = [];
        const today = getTodayDate();
        const nextThreeDays = getDateInDays(3);

        // Check overdue invoices
        const overdueResult = await dab.readRecords('invoices', {
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
        const upcomingResult = await dab.readRecords('invoices', {
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
        const pendingResult = await dab.readRecords('banktransactions', {
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

        logAuditEvent({
            action: 'Create',
            entityType: 'Enhancement',
            entityId: result.value?.Id,
            entityDescription: `Create enhancement request: ${clarifiedDescription.substring(0, 80)}`,
            newValues: enhancementData,
            req,
            source: 'API',
        });

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

        logAuditEvent({
            action: 'Update',
            entityType: 'Enhancement',
            entityId: id,
            entityDescription: `Update enhancement #${id}${status ? ' (status -> ' + status + ')' : ''}`,
            newValues: updateData,
            req,
            source: 'API',
        });

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

    // ========================================================================
    // Static File Serving (Production)
    // ========================================================================
    // Serve client build from /public folder in production
    const publicPath = path.join(__dirname, 'public');

    // Serve hashed assets with long cache (1 year, immutable)
    // Vite adds content hashes to JS/CSS filenames, so they're safe to cache forever
    app.use('/assets', express.static(path.join(publicPath, 'assets'), {
        maxAge: '1y',
        immutable: true,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }));

    // Serve other static files (favicon, version.json, etc.)
    // HTML and version.json are never cached; other files get a short TTL
    app.use(express.static(publicPath, {
        maxAge: '1h',
        etag: true,
        lastModified: true,
        setHeaders: (res, filePath) => {
            // HTML files must never be served from stale cache — always revalidate
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
            // version.json must always be fresh for the version-check polling
            if (filePath.endsWith('version.json')) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        }
    }));

    // SPA fallback - serve index.html for client-side routing
    // This must be after all API routes
    app.get('*', (req, res, next) => {
        // Don't serve index.html for API routes
        if (req.path.startsWith('/api/')) {
            return res.status(404).json({ error: 'API endpoint not found' });
        }
        // index.html must never be cached — it contains references to hashed assets
        // Using no-store ensures browsers (including Edge) always fetch fresh copy
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(publicPath, 'index.html'), (err) => {
            if (err) {
                // If index.html doesn't exist, continue to 404
                next();
            }
        });
    });

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

    // QBO OAuth redirect listener
    // Intuit developer portal has localhost:7071 registered as redirect URI,
    // but chat-api runs on PORT (8080). This listener redirects OAuth callbacks.
    const QBO_REDIRECT_PORT = 7071;
    if (parseInt(PORT) !== QBO_REDIRECT_PORT) {
        const http = await import('http');
        const redirectServer = http.createServer((req, res) => {
            if (req.url.startsWith('/api/qbo/oauth-callback')) {
                const redirectUrl = `http://localhost:${PORT}${req.url}`;
                console.log(`[QBO Redirect] ${QBO_REDIRECT_PORT} -> ${redirectUrl}`);
                res.writeHead(302, { Location: redirectUrl });
                res.end();
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });
        redirectServer.listen(QBO_REDIRECT_PORT, () => {
            console.log(`QBO OAuth redirect listener on http://localhost:${QBO_REDIRECT_PORT} -> :${PORT}`);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.warn(`[QBO Redirect] Port ${QBO_REDIRECT_PORT} already in use, skipping redirect listener`);
            } else {
                console.warn(`[QBO Redirect] Could not start redirect listener:`, err.message);
            }
        });
    }
}

startServer();
