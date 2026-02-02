/**
 * QBO Authentication Module
 * Handles OAuth flow and token persistence to database
 *
 * Authentication Strategy:
 * - QBO connections are stored in DAB (Data API Builder)
 * - DAB requires Azure AD authentication for all operations
 * - Since OAuth callback has no user context, we use:
 *   - Production: App Service Managed Identity
 *   - Local dev: DefaultAzureCredential (Azure CLI, env vars, etc.)
 *
 * This is documented in CLAUDE.md under "QBO Auth DAB Integration"
 */

import dotenv from 'dotenv';
dotenv.config();

import OAuthClient from 'intuit-oauth';
import axios from 'axios';
import { DefaultAzureCredential } from '@azure/identity';

const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';
const DAB_AUDIENCE = process.env.AZURE_AD_AUDIENCE || process.env.AZURE_AD_CLIENT_ID;

// Azure credential for DAB authentication (uses Managed Identity in production, Azure CLI locally)
let azureCredential = null;
let cachedToken = null;
let tokenExpiry = null;

/**
 * Get an Azure AD token for DAB API calls
 * Uses Managed Identity in production, DefaultAzureCredential locally
 */
async function getDabAuthToken() {
    // Skip auth if DAB_API_URL is localhost (local dev without auth)
    if (DAB_API_URL.includes('localhost')) {
        return null;
    }

    // Check if we have a valid cached token (with 5 min buffer)
    if (cachedToken && tokenExpiry && new Date() < new Date(tokenExpiry.getTime() - 5 * 60 * 1000)) {
        return cachedToken;
    }

    try {
        if (!azureCredential) {
            azureCredential = new DefaultAzureCredential();
        }

        // Get token for DAB API
        const scope = DAB_AUDIENCE ? `api://${DAB_AUDIENCE}/.default` : null;
        if (!scope) {
            console.warn('DAB_AUDIENCE not configured, skipping auth token acquisition');
            return null;
        }

        const tokenResponse = await azureCredential.getToken(scope);
        cachedToken = tokenResponse.token;
        tokenExpiry = tokenResponse.expiresOnTimestamp ? new Date(tokenResponse.expiresOnTimestamp) : new Date(Date.now() + 3600 * 1000);

        console.log('Acquired DAB auth token via Managed Identity, expires:', tokenExpiry);
        return cachedToken;
    } catch (error) {
        console.error('Failed to acquire DAB auth token:', error.message);
        // Return null to allow fallback to unauthenticated (for backwards compatibility)
        return null;
    }
}

/**
 * Create axios config with auth headers for DAB calls
 * Uses managed identity token with Service role for backend operations
 */
async function getDabAxiosConfig() {
    const token = await getDabAuthToken();
    const config = {
        headers: {
            'Content-Type': 'application/json'
        }
    };
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
        // DAB requires X-MS-API-ROLE header to use non-default roles
        // Service role is assigned to the App Service managed identity
        config.headers['X-MS-API-ROLE'] = 'Service';
        console.log('[QBO Auth] Using managed identity token with Service role');
    } else {
        console.log('[QBO Auth] No managed identity token available');
    }
    return config;
}

// In-memory cache of active connections (keyed by realmId)
const activeConnections = new Map();

class QBOAuth {
    constructor() {
        this.clientId = process.env.QBO_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID;
        this.clientSecret = process.env.QBO_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET;
        this.redirectUri = process.env.QBO_REDIRECT_URI || 'http://localhost:7071/api/qbo/oauth-callback';
        this.environment = process.env.QBO_ENVIRONMENT || 'sandbox';

        if (!this.clientId || !this.clientSecret) {
            console.warn('QBO credentials not configured. Set QBO_CLIENT_ID and QBO_CLIENT_SECRET.');
        }
    }

    /**
     * Create a new OAuth client instance
     */
    createOAuthClient() {
        return new OAuthClient({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            environment: this.environment,
            redirectUri: this.redirectUri,
        });
    }

    /**
     * Generate authorization URL for OAuth flow
     */
    getAuthorizationUrl(state = 'oauth-state') {
        const oauthClient = this.createOAuthClient();
        return oauthClient.authorizeUri({
            scope: [OAuthClient.scopes.Accounting],
            state: state
        });
    }

    /**
     * Handle OAuth callback and save tokens to database
     */
    async handleCallback(callbackUrl) {
        const oauthClient = this.createOAuthClient();

        try {
            console.log('Exchanging authorization code for tokens...');
            const response = await oauthClient.createToken(callbackUrl);
            const tokens = response.token;

            console.log('Token exchange successful, realmId:', tokens.realmId);

            // Get company info
            const companyName = await this.fetchCompanyName(oauthClient, tokens.realmId);

            // Calculate expiry times
            const now = new Date();
            const tokenExpiry = new Date(now.getTime() + (tokens.expires_in || 3600) * 1000);
            const refreshTokenExpiry = new Date(now.getTime() + (tokens.x_refresh_token_expires_in || 8640000) * 1000); // ~100 days

            // Save to database
            await this.saveConnection({
                realmId: tokens.realmId,
                companyName: companyName,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: tokenExpiry,
                refreshTokenExpiry: refreshTokenExpiry,
                environment: this.environment
            });

            // Cache in memory
            activeConnections.set(tokens.realmId, {
                oauthClient,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry,
                companyName
            });

            return {
                success: true,
                realmId: tokens.realmId,
                companyName: companyName
            };
        } catch (error) {
            console.error('OAuth callback error:', error);
            throw error;
        }
    }

    /**
     * Fetch company name from QBO
     */
    async fetchCompanyName(oauthClient, realmId) {
        try {
            const baseUrl = this.environment === 'production'
                ? 'https://quickbooks.api.intuit.com'
                : 'https://sandbox-quickbooks.api.intuit.com';

            const response = await axios.get(
                `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${oauthClient.getToken().access_token}`,
                        'Accept': 'application/json'
                    }
                }
            );

            return response.data?.CompanyInfo?.CompanyName || 'Unknown Company';
        } catch (error) {
            console.warn('Could not fetch company name:', error.message);
            return 'QuickBooks Company';
        }
    }

    /**
     * Save connection to database via DAB API
     * Uses Managed Identity for authentication in production
     */
    async saveConnection(connection) {
        try {
            const axiosConfig = await getDabAxiosConfig();

            // Check if connection already exists
            const existing = await this.getConnectionByRealmId(connection.realmId);

            if (existing) {
                // Update existing
                console.log('Updating existing QBO connection for realmId:', connection.realmId);
                await axios.patch(
                    `${DAB_API_URL}/qboconnections/Id/${existing.Id}`,
                    {
                        AccessToken: connection.accessToken,
                        RefreshToken: connection.refreshToken,
                        TokenExpiry: connection.tokenExpiry.toISOString(),
                        RefreshTokenExpiry: connection.refreshTokenExpiry?.toISOString(),
                        CompanyName: connection.companyName,
                        LastUsedAt: new Date().toISOString(),
                        UpdatedAt: new Date().toISOString(),
                        IsActive: true
                    },
                    axiosConfig
                );
            } else {
                // Create new
                console.log('Creating new QBO connection for realmId:', connection.realmId);
                await axios.post(
                    `${DAB_API_URL}/qboconnections`,
                    {
                        RealmId: connection.realmId,
                        CompanyName: connection.companyName,
                        AccessToken: connection.accessToken,
                        RefreshToken: connection.refreshToken,
                        TokenExpiry: connection.tokenExpiry.toISOString(),
                        RefreshTokenExpiry: connection.refreshTokenExpiry?.toISOString(),
                        Environment: connection.environment,
                        IsActive: true,
                        LastUsedAt: new Date().toISOString()
                    },
                    axiosConfig
                );
            }

            console.log('QBO connection saved to database');
        } catch (error) {
            console.error('Failed to save QBO connection:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get connection from database by realmId
     * @param {boolean} activeOnly - If true, only return active connections (default: false for upsert checks)
     */
    async getConnectionByRealmId(realmId, activeOnly = false) {
        try {
            const axiosConfig = await getDabAxiosConfig();
            // Get all connections and filter in code (avoids OData issues)
            const response = await axios.get(`${DAB_API_URL}/qboconnections`, axiosConfig);
            const items = response.data?.value || [];
            // For save/update operations, find ANY record with this realmId (active or not)
            // For status checks, only return active connections
            return items.find(c => c.RealmId === realmId && (activeOnly ? c.IsActive : true)) || null;
        } catch (error) {
            console.error('Failed to get QBO connection:', error.message);
            return null;
        }
    }

    /**
     * Get active connection (any)
     */
    async getActiveConnection() {
        try {
            const axiosConfig = await getDabAxiosConfig();
            // Get all connections and filter in code (avoids OData issues)
            const response = await axios.get(`${DAB_API_URL}/qboconnections`, axiosConfig);
            const items = response.data?.value || [];
            // Filter active and sort by LastUsedAt desc
            const active = items
                .filter(c => c.IsActive)
                .sort((a, b) => new Date(b.LastUsedAt) - new Date(a.LastUsedAt));
            return active.length > 0 ? active[0] : null;
        } catch (error) {
            console.error('Failed to get active QBO connection:', error.message);
            return null;
        }
    }

    /**
     * Refresh access token if needed
     */
    async refreshTokenIfNeeded(realmId) {
        // Check memory cache first
        let connection = activeConnections.get(realmId);

        if (!connection) {
            // Load from database (only active connections)
            const dbConnection = await this.getConnectionByRealmId(realmId, true);
            if (!dbConnection) {
                throw new Error('No QBO connection found for realmId: ' + realmId);
            }

            const oauthClient = this.createOAuthClient();
            oauthClient.setToken({
                access_token: dbConnection.AccessToken,
                refresh_token: dbConnection.RefreshToken,
                token_type: 'bearer',
                expires_in: 3600,
                realmId: realmId
            });

            connection = {
                oauthClient,
                accessToken: dbConnection.AccessToken,
                refreshToken: dbConnection.RefreshToken,
                tokenExpiry: new Date(dbConnection.TokenExpiry),
                companyName: dbConnection.CompanyName
            };

            activeConnections.set(realmId, connection);
        }

        // Check if token is expired or about to expire (within 5 minutes)
        const now = new Date();
        const expiryBuffer = 5 * 60 * 1000; // 5 minutes

        if (connection.tokenExpiry.getTime() - now.getTime() < expiryBuffer) {
            console.log('Access token expired or expiring soon, refreshing...');

            try {
                const oauthClient = connection.oauthClient;
                const response = await oauthClient.refreshUsingToken(connection.refreshToken);
                const newTokens = response.token;

                // Calculate new expiry
                const tokenExpiry = new Date(now.getTime() + (newTokens.expires_in || 3600) * 1000);

                // Update memory cache
                connection.accessToken = newTokens.access_token;
                connection.refreshToken = newTokens.refresh_token || connection.refreshToken;
                connection.tokenExpiry = tokenExpiry;

                // Update database
                const dbConnection = await this.getConnectionByRealmId(realmId);
                if (dbConnection) {
                    const axiosConfig = await getDabAxiosConfig();
                    await axios.patch(
                        `${DAB_API_URL}/qboconnections/Id/${dbConnection.Id}`,
                        {
                            AccessToken: newTokens.access_token,
                            RefreshToken: newTokens.refresh_token || connection.refreshToken,
                            TokenExpiry: tokenExpiry.toISOString(),
                            LastUsedAt: new Date().toISOString(),
                            UpdatedAt: new Date().toISOString()
                        },
                        axiosConfig
                    );
                }

                console.log('Token refreshed successfully');
            } catch (error) {
                console.error('Failed to refresh token:', error.message);
                throw new Error('Token refresh failed. Please reconnect to QuickBooks.');
            }
        }

        return connection;
    }

    /**
     * Get connection status
     */
    async getStatus(realmId = null) {
        try {
            let connection;

            if (realmId) {
                connection = await this.getConnectionByRealmId(realmId, true);  // Only active
            } else {
                connection = await this.getActiveConnection();
            }

            if (!connection) {
                return { connected: false };
            }

            // Check if refresh token is expired
            if (connection.RefreshTokenExpiry) {
                const refreshExpiry = new Date(connection.RefreshTokenExpiry);
                if (refreshExpiry < new Date()) {
                    return {
                        connected: false,
                        error: 'Refresh token expired. Please reconnect.'
                    };
                }
            }

            return {
                connected: true,
                realmId: connection.RealmId,
                companyName: connection.CompanyName,
                environment: connection.Environment,
                lastUsed: connection.LastUsedAt
            };
        } catch (error) {
            console.error('Failed to get QBO status:', error.message);
            return { connected: false, error: error.message };
        }
    }

    /**
     * Disconnect (mark as inactive)
     */
    async disconnect(realmId) {
        try {
            const connection = await this.getConnectionByRealmId(realmId, true);  // Only active
            if (connection) {
                const axiosConfig = await getDabAxiosConfig();
                await axios.patch(
                    `${DAB_API_URL}/qboconnections/Id/${connection.Id}`,
                    {
                        IsActive: false,
                        UpdatedAt: new Date().toISOString()
                    },
                    axiosConfig
                );

                activeConnections.delete(realmId);
                console.log('QBO connection deactivated');
            }
            return { success: true };
        } catch (error) {
            console.error('Failed to disconnect:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load connections from database on startup
     */
    async loadConnectionsFromDB() {
        try {
            const axiosConfig = await getDabAxiosConfig();
            const response = await axios.get(
                `${DAB_API_URL}/qboconnections`,
                axiosConfig
            );
            // Filter active connections in code to avoid OData issues
            const allConnections = response.data?.value || [];
            const connections = allConnections.filter(c => c.IsActive);
            console.log(`Loading ${connections.length} QBO connection(s) from database`);

            for (const conn of connections) {
                const oauthClient = this.createOAuthClient();
                oauthClient.setToken({
                    access_token: conn.AccessToken,
                    refresh_token: conn.RefreshToken,
                    token_type: 'bearer',
                    expires_in: 3600,
                    realmId: conn.RealmId
                });

                activeConnections.set(conn.RealmId, {
                    oauthClient,
                    accessToken: conn.AccessToken,
                    refreshToken: conn.RefreshToken,
                    tokenExpiry: new Date(conn.TokenExpiry),
                    companyName: conn.CompanyName
                });

                console.log(`  Loaded connection for: ${conn.CompanyName} (${conn.RealmId})`);
            }

            return connections.length;
        } catch (error) {
            console.warn('Could not load QBO connections from DB:', error.message);
            return 0;
        }
    }

    /**
     * Make authenticated QBO API call
     */
    async makeApiCall(realmId, method, endpoint, data = null) {
        const connection = await this.refreshTokenIfNeeded(realmId);

        const baseUrl = this.environment === 'production'
            ? 'https://quickbooks.api.intuit.com'
            : 'https://sandbox-quickbooks.api.intuit.com';

        const config = {
            method,
            url: `${baseUrl}/v3/company/${realmId}${endpoint}`,
            headers: {
                'Authorization': `Bearer ${connection.accessToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            config.data = data;
        }

        const response = await axios(config);
        return response.data;
    }

    /**
     * Get the current active realmId
     */
    async getActiveRealmId() {
        const connection = await this.getActiveConnection();
        return connection?.RealmId || null;
    }

    // =========================================================================
    // QBO API Methods - Direct API calls using stored tokens
    // =========================================================================

    /**
     * Execute a QBO query
     */
    async query(queryString) {
        const realmId = await this.getActiveRealmId();
        if (!realmId) {
            throw new Error('Not connected to QuickBooks');
        }

        const encoded = encodeURIComponent(queryString);
        const result = await this.makeApiCall(realmId, 'GET', `/query?query=${encoded}`);
        return result.QueryResponse;
    }

    /**
     * Search customers with pagination support
     */
    async searchCustomers(criteria = {}) {
        let baseQuery = 'SELECT * FROM Customer';
        const conditions = [];

        if (criteria.name) {
            conditions.push(`DisplayName LIKE '%${criteria.name}%'`);
        }
        if (criteria.active !== undefined) {
            conditions.push(`Active = ${criteria.active}`);
        }

        if (conditions.length > 0) {
            baseQuery += ' WHERE ' + conditions.join(' AND ');
        }

        // If fetchAll, paginate through all results
        if (criteria.fetchAll) {
            const allCustomers = [];
            const pageSize = 1000; // QBO max per request
            let startPosition = 1;
            let hasMore = true;

            while (hasMore) {
                const query = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
                const response = await this.query(query);
                const customers = response?.Customer || [];

                allCustomers.push(...customers);

                if (customers.length < pageSize) {
                    hasMore = false;
                } else {
                    startPosition += pageSize;
                }
            }

            return {
                count: allCustomers.length,
                data: allCustomers
            };
        }

        // Non-paginated query
        let query = baseQuery;
        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const customers = response?.Customer || [];

        return {
            count: customers.length,
            customers: customers.map(c => ({
                id: c.Id,
                name: c.DisplayName,
                email: c.PrimaryEmailAddr?.Address,
                balance: c.Balance
            }))
        };
    }

    /**
     * Search vendors with pagination support
     */
    async searchVendors(criteria = {}) {
        let baseQuery = 'SELECT * FROM Vendor';
        const conditions = [];

        if (criteria.name) {
            conditions.push(`DisplayName LIKE '%${criteria.name}%'`);
        }
        if (criteria.active !== undefined) {
            conditions.push(`Active = ${criteria.active}`);
        }

        if (conditions.length > 0) {
            baseQuery += ' WHERE ' + conditions.join(' AND ');
        }

        // If fetchAll, paginate through all results
        if (criteria.fetchAll) {
            const allVendors = [];
            const pageSize = 1000; // QBO max per request
            let startPosition = 1;
            let hasMore = true;

            while (hasMore) {
                const query = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
                const response = await this.query(query);
                const vendors = response?.Vendor || [];

                allVendors.push(...vendors);

                if (vendors.length < pageSize) {
                    hasMore = false;
                } else {
                    startPosition += pageSize;
                }
            }

            return {
                count: allVendors.length,
                data: allVendors
            };
        }

        // Non-paginated query
        let query = baseQuery;
        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const vendors = response?.Vendor || [];

        return {
            count: vendors.length,
            vendors: vendors.map(v => ({
                id: v.Id,
                name: v.DisplayName,
                email: v.PrimaryEmailAddr?.Address,
                balance: v.Balance
            }))
        };
    }

    /**
     * Search accounts (Chart of Accounts)
     */
    async searchAccounts(criteria = {}) {
        let query = 'SELECT * FROM Account';
        const conditions = [];

        if (criteria.name) {
            conditions.push(`Name LIKE '%${criteria.name}%'`);
        }
        if (criteria.type) {
            conditions.push(`AccountType = '${criteria.type}'`);
        }
        if (criteria.active !== undefined) {
            conditions.push(`Active = ${criteria.active}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const accounts = response?.Account || [];

        return {
            count: accounts.length,
            data: criteria.fetchAll ? accounts : undefined,
            accounts: !criteria.fetchAll ? accounts.map(a => ({
                id: a.Id,
                name: a.Name,
                type: a.AccountType,
                subType: a.AccountSubType,
                balance: a.CurrentBalance
            })) : undefined
        };
    }

    /**
     * Search items (Products & Services)
     */
    async searchItems(criteria = {}) {
        let query = 'SELECT * FROM Item';
        const conditions = [];

        if (criteria.name) {
            conditions.push(`Name LIKE '%${criteria.name}%'`);
        }
        if (criteria.type) {
            conditions.push(`Type = '${criteria.type}'`);
        }
        if (criteria.active !== undefined) {
            conditions.push(`Active = ${criteria.active}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const items = response?.Item || [];

        return {
            count: items.length,
            data: criteria.fetchAll ? items : undefined,
            items: !criteria.fetchAll ? items.map(i => ({
                id: i.Id,
                name: i.Name,
                type: i.Type,
                unitPrice: i.UnitPrice,
                active: i.Active
            })) : undefined
        };
    }

    /**
     * Search invoices
     */
    async searchInvoices(criteria = {}) {
        let query = 'SELECT * FROM Invoice';
        const conditions = [];

        if (criteria.customerName) {
            conditions.push(`CustomerRef LIKE '%${criteria.customerName}%'`);
        }
        if (criteria.startDate) {
            conditions.push(`TxnDate >= '${criteria.startDate}'`);
        }
        if (criteria.endDate) {
            conditions.push(`TxnDate <= '${criteria.endDate}'`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDERBY TxnDate DESC';

        // QBO defaults to 100 records, use 1000 (max) unless limited
        query += ` MAXRESULTS ${criteria.limit || 1000}`;

        const response = await this.query(query);
        const invoices = response?.Invoice || [];

        return {
            count: invoices.length,
            data: criteria.fetchAll ? invoices : undefined,
            invoices: !criteria.fetchAll ? invoices.map(i => ({
                id: i.Id,
                docNumber: i.DocNumber,
                customerName: i.CustomerRef?.name,
                date: i.TxnDate,
                total: i.TotalAmt,
                balance: i.Balance
            })) : undefined
        };
    }

    /**
     * Search bills
     */
    async searchBills(criteria = {}) {
        let query = 'SELECT * FROM Bill';
        const conditions = [];

        if (criteria.vendorName) {
            conditions.push(`VendorRef LIKE '%${criteria.vendorName}%'`);
        }
        if (criteria.startDate) {
            conditions.push(`TxnDate >= '${criteria.startDate}'`);
        }
        if (criteria.endDate) {
            conditions.push(`TxnDate <= '${criteria.endDate}'`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDERBY TxnDate DESC';

        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const bills = response?.Bill || [];

        return {
            count: bills.length,
            data: criteria.fetchAll ? bills : undefined,
            bills: !criteria.fetchAll ? bills.map(b => ({
                id: b.Id,
                docNumber: b.DocNumber,
                vendorName: b.VendorRef?.name,
                date: b.TxnDate,
                total: b.TotalAmt,
                balance: b.Balance
            })) : undefined
        };
    }

    /**
     * Search payments (customer payments / receive payments)
     */
    async searchPayments(criteria = {}) {
        let query = 'SELECT * FROM Payment';
        const conditions = [];

        if (criteria.customerName) {
            conditions.push(`CustomerRef LIKE '%${criteria.customerName}%'`);
        }
        if (criteria.startDate) {
            conditions.push(`TxnDate >= '${criteria.startDate}'`);
        }
        if (criteria.endDate) {
            conditions.push(`TxnDate <= '${criteria.endDate}'`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDERBY TxnDate DESC';

        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const payments = response?.Payment || [];

        return {
            count: payments.length,
            data: criteria.fetchAll ? payments : undefined,
            payments: !criteria.fetchAll ? payments.map(p => ({
                id: p.Id,
                refNumber: p.PaymentRefNum,
                customerName: p.CustomerRef?.name,
                date: p.TxnDate,
                total: p.TotalAmt,
                depositAccount: p.DepositToAccountRef?.name
            })) : undefined
        };
    }

    /**
     * Search bill payments (vendor payments)
     */
    async searchBillPayments(criteria = {}) {
        let query = 'SELECT * FROM BillPayment';
        const conditions = [];

        if (criteria.vendorName) {
            conditions.push(`VendorRef LIKE '%${criteria.vendorName}%'`);
        }
        if (criteria.startDate) {
            conditions.push(`TxnDate >= '${criteria.startDate}'`);
        }
        if (criteria.endDate) {
            conditions.push(`TxnDate <= '${criteria.endDate}'`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDERBY TxnDate DESC';

        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const billPayments = response?.BillPayment || [];

        return {
            count: billPayments.length,
            data: criteria.fetchAll ? billPayments : undefined,
            billPayments: !criteria.fetchAll ? billPayments.map(bp => ({
                id: bp.Id,
                docNumber: bp.DocNumber,
                vendorName: bp.VendorRef?.name,
                date: bp.TxnDate,
                total: bp.TotalAmt,
                payType: bp.PayType
            })) : undefined
        };
    }

    /**
     * Search journal entries
     */
    async searchJournalEntries(criteria = {}) {
        let query = 'SELECT * FROM JournalEntry';
        const conditions = [];

        if (criteria.startDate) {
            conditions.push(`TxnDate >= '${criteria.startDate}'`);
        }
        if (criteria.endDate) {
            conditions.push(`TxnDate <= '${criteria.endDate}'`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDERBY TxnDate DESC';

        if (criteria.limit) {
            query += ` MAXRESULTS ${criteria.limit}`;
        }

        const response = await this.query(query);
        const journalEntries = response?.JournalEntry || [];

        return {
            count: journalEntries.length,
            data: criteria.fetchAll ? journalEntries : undefined,
            journalEntries: !criteria.fetchAll ? journalEntries.map(je => ({
                id: je.Id,
                docNumber: je.DocNumber,
                date: je.TxnDate,
                totalDebit: je.Line?.filter(l => l.JournalEntryLineDetail?.PostingType === 'Debit')
                    .reduce((sum, l) => sum + (l.Amount || 0), 0) || 0,
                lineCount: je.Line?.length || 0
            })) : undefined
        };
    }

    /**
     * Analyze QBO data for migration
     */
    async analyzeForMigration() {
        const realmId = await this.getActiveRealmId();
        if (!realmId) {
            throw new Error('Not connected to QuickBooks');
        }

        // Get counts for each entity type
        const [customers, vendors, accounts, items, invoices, bills, payments, billPayments, journalEntries] = await Promise.all([
            this.query('SELECT COUNT(*) FROM Customer'),
            this.query('SELECT COUNT(*) FROM Vendor'),
            this.query('SELECT COUNT(*) FROM Account'),
            this.query('SELECT COUNT(*) FROM Item'),
            this.query('SELECT COUNT(*) FROM Invoice'),
            this.query('SELECT COUNT(*) FROM Bill'),
            this.query('SELECT COUNT(*) FROM Payment'),
            this.query('SELECT COUNT(*) FROM BillPayment'),
            this.query('SELECT COUNT(*) FROM JournalEntry')
        ]);

        return {
            // Priority 1
            customers: customers?.totalCount || 0,
            vendors: vendors?.totalCount || 0,
            accounts: accounts?.totalCount || 0,
            items: items?.totalCount || 0,
            // Priority 2
            invoices: invoices?.totalCount || 0,
            bills: bills?.totalCount || 0,
            payments: payments?.totalCount || 0,
            billPayments: billPayments?.totalCount || 0,
            journalEntries: journalEntries?.totalCount || 0
        };
    }
}

export const qboAuth = new QBOAuth();
export default qboAuth;
