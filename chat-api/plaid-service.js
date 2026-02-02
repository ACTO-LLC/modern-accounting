/**
 * Plaid Service Module
 * Handles Plaid Link integration and connection management
 * Following pattern from qbo-auth.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { DefaultAzureCredential } from '@azure/identity';
import axios from 'axios';
import crypto from 'crypto';

const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';
const DAB_AUDIENCE = process.env.AZURE_AD_AUDIENCE;

// Azure credential for DAB authentication (Managed Identity in production)
let azureCredential = null;

/**
 * Get auth token for DAB API calls using Managed Identity
 */
async function getDabAuthToken() {
    // Skip auth for localhost DAB
    if (DAB_API_URL.includes('localhost')) return null;

    if (!azureCredential) {
        azureCredential = new DefaultAzureCredential();
    }

    try {
        const scope = `api://${DAB_AUDIENCE}/.default`;
        const tokenResponse = await azureCredential.getToken(scope);
        return tokenResponse.token;
    } catch (error) {
        console.error('Failed to get DAB auth token:', error.message);
        throw error;
    }
}

/**
 * Build headers for DAB API calls
 */
async function getDabHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = await getDabAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-MS-API-ROLE'] = 'Admin';
    }
    return headers;
}

// Encryption key for access tokens (should be 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.PLAID_ENCRYPTION_KEY || crypto.scryptSync(
    process.env.PLAID_SECRET || 'default-key',
    'plaid-salt',
    32
);
const IV_LENGTH = 16;

// In-memory cache of active connections
const activeConnections = new Map();

class PlaidService {
    constructor() {
        this.clientId = process.env.PLAID_CLIENT_ID;
        this.secret = process.env.PLAID_SECRET;
        this.env = process.env.PLAID_ENV || 'sandbox';

        if (!this.clientId || !this.secret) {
            console.warn('Plaid credentials not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.');
            this.client = null;
        } else {
            const configuration = new Configuration({
                basePath: PlaidEnvironments[this.env],
                baseOptions: {
                    headers: {
                        'PLAID-CLIENT-ID': this.clientId,
                        'PLAID-SECRET': this.secret,
                    },
                },
            });
            this.client = new PlaidApi(configuration);
            console.log(`Plaid client initialized in ${this.env} environment`);
        }
    }

    /**
     * Encrypt access token for storage
     */
    encryptToken(token) {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt access token from storage
     */
    decryptToken(encryptedToken) {
        const parts = encryptedToken.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Create a Link token for Plaid Link initialization
     * @param {string} userId - Unique user identifier
     */
    async createLinkToken(userId) {
        if (!this.client) {
            throw new Error('Plaid client not initialized. Check PLAID_CLIENT_ID and PLAID_SECRET.');
        }

        try {
            const response = await this.client.linkTokenCreate({
                user: {
                    client_user_id: userId || 'default-user',
                },
                client_name: 'Modern Accounting',
                products: [Products.Transactions],
                country_codes: [CountryCode.Us],
                language: 'en',
            });

            return {
                success: true,
                linkToken: response.data.link_token,
                expiration: response.data.expiration,
            };
        } catch (error) {
            console.error('Failed to create Plaid link token:', error.response?.data || error.message);
            throw new Error('Failed to create link token: ' + (error.response?.data?.error_message || error.message));
        }
    }

    /**
     * Exchange public token for access token and save connection
     * @param {string} publicToken - Public token from Plaid Link
     * @param {object} metadata - Metadata from Plaid Link (institution, accounts)
     */
    async exchangePublicToken(publicToken, metadata) {
        if (!this.client) {
            throw new Error('Plaid client not initialized');
        }

        try {
            console.log('Exchanging public token for access token...');

            // Exchange public token for access token
            const exchangeResponse = await this.client.itemPublicTokenExchange({
                public_token: publicToken,
            });

            const { access_token, item_id } = exchangeResponse.data;
            console.log('Token exchange successful, itemId:', item_id);

            // Get institution info
            const institutionId = metadata?.institution?.institution_id;
            const institutionName = metadata?.institution?.name || 'Unknown Institution';

            // Save connection to database
            const connection = await this.saveConnection({
                itemId: item_id,
                institutionId: institutionId,
                institutionName: institutionName,
                accessToken: access_token,
            });

            // Get and save account info
            const accountsResponse = await this.client.accountsGet({
                access_token: access_token,
            });

            const accounts = await this.saveAccounts(connection.Id, accountsResponse.data.accounts);

            // Cache in memory
            activeConnections.set(item_id, {
                accessToken: access_token,
                institutionName: institutionName,
            });

            return {
                success: true,
                itemId: item_id,
                institutionName: institutionName,
                accountCount: accounts.length,
            };
        } catch (error) {
            console.error('Public token exchange error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Save connection to database via DAB API
     */
    async saveConnection(connection) {
        try {
            // Check if connection already exists
            const existing = await this.getConnectionByItemId(connection.itemId);

            const encryptedToken = this.encryptToken(connection.accessToken);
            const headers = await getDabHeaders();

            if (existing) {
                // Update existing
                console.log('Updating existing Plaid connection for itemId:', connection.itemId);
                await axios.patch(
                    `${DAB_API_URL}/plaidconnections/Id/${existing.Id}`,
                    {
                        AccessToken: encryptedToken,
                        InstitutionName: connection.institutionName,
                        SyncStatus: 'Pending',
                        UpdatedAt: new Date().toISOString(),
                        IsActive: true
                    },
                    { headers }
                );
                return existing;
            } else {
                // Create new
                console.log('Creating new Plaid connection for itemId:', connection.itemId);
                const newId = crypto.randomUUID();
                await axios.post(
                    `${DAB_API_URL}/plaidconnections`,
                    {
                        Id: newId,
                        ItemId: connection.itemId,
                        InstitutionId: connection.institutionId,
                        InstitutionName: connection.institutionName,
                        AccessToken: encryptedToken,
                        SyncStatus: 'Pending',
                        IsActive: true,
                    },
                    { headers }
                );

                console.log('Plaid connection saved to database');
                return { Id: newId, ...connection };
            }
        } catch (error) {
            console.error('Failed to save Plaid connection:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Save linked accounts to database
     */
    async saveAccounts(connectionId, plaidAccounts) {
        const savedAccounts = [];
        const headers = await getDabHeaders();

        for (const account of plaidAccounts) {
            try {
                // Check if account already exists
                const existingResponse = await axios.get(`${DAB_API_URL}/plaidaccounts`, { headers });
                const existing = (existingResponse.data?.value || [])
                    .find(a => a.PlaidAccountId === account.account_id);

                const accountData = {
                    PlaidConnectionId: connectionId,
                    PlaidAccountId: account.account_id,
                    AccountName: account.name,
                    OfficialName: account.official_name,
                    AccountType: account.type,
                    AccountSubtype: account.subtype,
                    Mask: account.mask,
                    CurrentBalance: account.balances?.current,
                    AvailableBalance: account.balances?.available,
                    CurrencyCode: account.balances?.iso_currency_code || 'USD',
                    IsActive: true,
                    UpdatedAt: new Date().toISOString(),
                };

                if (existing) {
                    await axios.patch(
                        `${DAB_API_URL}/plaidaccounts/Id/${existing.Id}`,
                        accountData,
                        { headers }
                    );
                    savedAccounts.push({ ...existing, ...accountData });
                } else {
                    const newId = crypto.randomUUID();
                    await axios.post(
                        `${DAB_API_URL}/plaidaccounts`,
                        { Id: newId, ...accountData },
                        { headers }
                    );
                    savedAccounts.push({ Id: newId, ...accountData });
                }
            } catch (error) {
                console.error(`Failed to save Plaid account ${account.account_id}:`, error.message);
            }
        }

        console.log(`Saved ${savedAccounts.length} Plaid accounts`);
        return savedAccounts;
    }

    /**
     * Get connection from database by itemId
     */
    async getConnectionByItemId(itemId) {
        try {
            const headers = await getDabHeaders();
            const response = await axios.get(`${DAB_API_URL}/plaidconnections`, { headers });
            const items = response.data?.value || [];
            return items.find(c => c.ItemId === itemId) || null;
        } catch (error) {
            console.error('Failed to get Plaid connection:', error.message);
            return null;
        }
    }

    /**
     * Get all active connections
     */
    async getActiveConnections() {
        try {
            const headers = await getDabHeaders();
            const response = await axios.get(`${DAB_API_URL}/plaidconnections`, { headers });
            const items = response.data?.value || [];
            return items.filter(c => c.IsActive);
        } catch (error) {
            console.error('Failed to get Plaid connections:', error.message);
            return [];
        }
    }

    /**
     * Get all accounts for a connection
     */
    async getAccountsByConnectionId(connectionId) {
        try {
            const headers = await getDabHeaders();
            const response = await axios.get(`${DAB_API_URL}/plaidaccounts`, { headers });
            const items = response.data?.value || [];
            return items.filter(a => a.PlaidConnectionId === connectionId && a.IsActive);
        } catch (error) {
            console.error('Failed to get Plaid accounts:', error.message);
            return [];
        }
    }

    /**
     * Get all Plaid accounts
     */
    async getAllAccounts() {
        try {
            const headers = await getDabHeaders();
            const response = await axios.get(`${DAB_API_URL}/plaidaccounts`, { headers });
            return (response.data?.value || []).filter(a => a.IsActive);
        } catch (error) {
            console.error('Failed to get Plaid accounts:', error.message);
            return [];
        }
    }

    /**
     * Link a Plaid account to a chart of accounts entry
     */
    async linkAccountToLedger(plaidAccountId, ledgerAccountId) {
        try {
            const headers = await getDabHeaders();
            const response = await axios.get(`${DAB_API_URL}/plaidaccounts`, { headers });
            const account = (response.data?.value || []).find(a => a.Id === plaidAccountId);

            if (!account) {
                throw new Error('Plaid account not found');
            }

            await axios.patch(
                `${DAB_API_URL}/plaidaccounts/Id/${plaidAccountId}`,
                {
                    LinkedAccountId: ledgerAccountId,
                    UpdatedAt: new Date().toISOString(),
                },
                { headers }
            );

            console.log(`Linked Plaid account ${plaidAccountId} to ledger account ${ledgerAccountId}`);
            return { success: true };
        } catch (error) {
            console.error('Failed to link account:', error.message);
            throw error;
        }
    }

    /**
     * Disconnect a Plaid item (mark as inactive)
     */
    async disconnect(itemId) {
        try {
            const connection = await this.getConnectionByItemId(itemId);
            if (!connection) {
                return { success: false, error: 'Connection not found' };
            }

            // Optionally remove item from Plaid (revokes access)
            if (this.client) {
                try {
                    const accessToken = this.decryptToken(connection.AccessToken);
                    await this.client.itemRemove({
                        access_token: accessToken,
                    });
                    console.log('Plaid item removed successfully');
                } catch (plaidError) {
                    console.warn('Could not remove item from Plaid:', plaidError.message);
                    // Continue to deactivate locally even if Plaid removal fails
                }
            }

            const headers = await getDabHeaders();

            // Mark connection as inactive
            await axios.patch(
                `${DAB_API_URL}/plaidconnections/Id/${connection.Id}`,
                {
                    IsActive: false,
                    UpdatedAt: new Date().toISOString()
                },
                { headers }
            );

            // Mark all accounts as inactive
            const accounts = await this.getAccountsByConnectionId(connection.Id);
            for (const account of accounts) {
                await axios.patch(
                    `${DAB_API_URL}/plaidaccounts/Id/${account.Id}`,
                    { IsActive: false, UpdatedAt: new Date().toISOString() },
                    { headers }
                );
            }

            activeConnections.delete(itemId);
            console.log('Plaid connection deactivated');

            return { success: true };
        } catch (error) {
            console.error('Failed to disconnect:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate a connection by checking if the access token is still valid
     */
    async validateConnection(itemId) {
        if (!this.client) {
            return { valid: false, error: 'Plaid client not initialized' };
        }

        try {
            const connection = await this.getConnectionByItemId(itemId);
            if (!connection || !connection.IsActive) {
                return { valid: false, error: 'Connection not found or inactive' };
            }

            const accessToken = this.decryptToken(connection.AccessToken);

            // Try to get item info to validate token
            await this.client.itemGet({
                access_token: accessToken,
            });

            return { valid: true, institutionName: connection.InstitutionName };
        } catch (error) {
            console.error('Connection validation failed:', error.response?.data || error.message);

            // Update status to error
            const connection = await this.getConnectionByItemId(itemId);
            if (connection) {
                const headers = await getDabHeaders();
                await axios.patch(
                    `${DAB_API_URL}/plaidconnections/Id/${connection.Id}`,
                    {
                        SyncStatus: 'Error',
                        SyncErrorMessage: error.response?.data?.error_message || error.message,
                        UpdatedAt: new Date().toISOString()
                    },
                    { headers }
                );
            }

            return {
                valid: false,
                error: error.response?.data?.error_message || error.message,
                needsReauth: error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED'
            };
        }
    }

    /**
     * Get decrypted access token for a connection
     */
    async getAccessToken(itemId) {
        // Check memory cache
        if (activeConnections.has(itemId)) {
            return activeConnections.get(itemId).accessToken;
        }

        // Load from database
        const connection = await this.getConnectionByItemId(itemId);
        if (!connection || !connection.IsActive) {
            throw new Error('Connection not found or inactive');
        }

        const accessToken = this.decryptToken(connection.AccessToken);

        // Cache it
        activeConnections.set(itemId, {
            accessToken,
            institutionName: connection.InstitutionName,
        });

        return accessToken;
    }

    /**
     * Get Plaid client instance (for sync operations)
     */
    getClient() {
        return this.client;
    }

    /**
     * Load connections from database on startup
     */
    async loadConnectionsFromDB() {
        try {
            const connections = await this.getActiveConnections();
            console.log(`Loading ${connections.length} Plaid connection(s) from database`);

            for (const conn of connections) {
                try {
                    const accessToken = this.decryptToken(conn.AccessToken);
                    activeConnections.set(conn.ItemId, {
                        accessToken,
                        institutionName: conn.InstitutionName,
                    });
                    console.log(`  Loaded connection for: ${conn.InstitutionName} (${conn.ItemId})`);
                } catch (error) {
                    console.warn(`  Failed to load connection ${conn.ItemId}:`, error.message);
                }
            }

            return connections.length;
        } catch (error) {
            console.warn('Could not load Plaid connections from DB:', error.message);
            return 0;
        }
    }

    /**
     * Create sandbox test transactions (Sandbox only)
     * Requires the Item to be created with user_transactions_dynamic
     */
    async createSandboxTransactions(accessToken, transactions) {
        if (this.env !== 'sandbox') {
            throw new Error('Sandbox transactions can only be created in sandbox environment');
        }

        if (!this.client) {
            throw new Error('Plaid client not initialized');
        }

        const response = await this.client.sandboxItemFireWebhook({
            access_token: accessToken,
            webhook_code: 'SYNC_UPDATES_AVAILABLE',
        });

        return response.data;
    }

    /**
     * Fire a sandbox webhook to simulate new transactions
     */
    async fireSandboxWebhook(itemId, webhookCode = 'SYNC_UPDATES_AVAILABLE') {
        if (this.env !== 'sandbox') {
            throw new Error('Sandbox webhooks can only be fired in sandbox environment');
        }

        if (!this.client) {
            throw new Error('Plaid client not initialized');
        }

        const accessToken = await this.getAccessToken(itemId);

        const response = await this.client.sandboxItemFireWebhook({
            access_token: accessToken,
            webhook_code: webhookCode,
        });

        return response.data;
    }

    /**
     * Reset sandbox item to get fresh transactions
     */
    async resetSandboxItem(itemId) {
        if (this.env !== 'sandbox') {
            throw new Error('Sandbox reset can only be done in sandbox environment');
        }

        if (!this.client) {
            throw new Error('Plaid client not initialized');
        }

        const accessToken = await this.getAccessToken(itemId);

        const response = await this.client.sandboxItemResetLogin({
            access_token: accessToken,
        });

        return response.data;
    }

    // =========================================================================
    // Employee Bank Verification Methods (Direct Deposit)
    // =========================================================================

    /**
     * Create a Link token for employee bank verification (uses Auth product)
     * @param {string} employeeId - Employee ID for verification
     */
    async createVerificationLinkToken(employeeId) {
        if (!this.client) {
            throw new Error('Plaid client not initialized. Check PLAID_CLIENT_ID and PLAID_SECRET.');
        }

        try {
            const response = await this.client.linkTokenCreate({
                user: {
                    client_user_id: `employee-${employeeId}`,
                },
                client_name: 'Modern Accounting',
                products: [Products.Auth],  // Auth product for account/routing verification
                country_codes: [CountryCode.Us],
                language: 'en',
            });

            return {
                success: true,
                linkToken: response.data.link_token,
                expiration: response.data.expiration,
            };
        } catch (error) {
            console.error('Failed to create verification link token:', error.response?.data || error.message);
            throw new Error('Failed to create verification link token: ' + (error.response?.data?.error_message || error.message));
        }
    }

    /**
     * Verify employee bank account using Plaid Auth
     * @param {string} publicToken - Public token from Plaid Link
     * @param {string} employeeId - Employee ID
     * @param {object} metadata - Metadata from Plaid Link (institution, accounts)
     */
    async verifyEmployeeBankAccount(publicToken, employeeId, metadata) {
        if (!this.client) {
            throw new Error('Plaid client not initialized');
        }

        try {
            console.log('Verifying bank account for employee:', employeeId);

            // Exchange public token for access token
            const exchangeResponse = await this.client.itemPublicTokenExchange({
                public_token: publicToken,
            });

            const { access_token, item_id } = exchangeResponse.data;
            console.log('Token exchange successful for verification, itemId:', item_id);

            // Get auth data (routing/account numbers)
            const authResponse = await this.client.authGet({
                access_token: access_token,
            });

            const accounts = authResponse.data.accounts;
            const numbers = authResponse.data.numbers;

            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found in Plaid response');
            }

            // Get the first checking/savings account
            const account = accounts.find(a =>
                a.type === 'depository' &&
                (a.subtype === 'checking' || a.subtype === 'savings')
            ) || accounts[0];

            // Get the ACH numbers for this account
            const achNumbers = numbers.ach?.find(n => n.account_id === account.account_id);

            if (!achNumbers) {
                throw new Error('Could not retrieve ACH routing/account numbers');
            }

            const institutionName = metadata?.institution?.name || 'Unknown Institution';

            // Update employee with verified bank info
            const headers = await getDabHeaders();
            await axios.patch(`${DAB_API_URL}/employees_write/Id/${employeeId}`, {
                BankRoutingNumber: achNumbers.routing,
                BankAccountNumber: achNumbers.account,
                BankAccountType: account.subtype === 'checking' ? 'Checking' : 'Savings',
                PlaidItemId: item_id,
                PlaidAccountId: account.account_id,
                BankVerificationStatus: 'Verified',
                BankVerifiedAt: new Date().toISOString(),
                BankInstitutionName: institutionName,
                UpdatedAt: new Date().toISOString(),
            }, { headers });

            console.log('Employee bank account verified successfully');

            return {
                success: true,
                employeeId,
                status: 'Verified',
                institutionName,
                accountType: account.subtype,
                accountMask: account.mask,
            };
        } catch (error) {
            console.error('Bank verification error:', error.response?.data || error.message);

            // Update employee with failed status
            try {
                const headers = await getDabHeaders();
                await axios.patch(`${DAB_API_URL}/employees_write/Id/${employeeId}`, {
                    BankVerificationStatus: 'Failed',
                    UpdatedAt: new Date().toISOString(),
                }, { headers });
            } catch (updateError) {
                console.error('Failed to update employee verification status:', updateError.message);
            }

            throw new Error('Bank verification failed: ' + (error.response?.data?.error_message || error.message));
        }
    }

    /**
     * Get verification status for an employee
     * @param {string} employeeId - Employee ID
     */
    async getEmployeeVerificationStatus(employeeId) {
        try {
            const headers = await getDabHeaders();
            const response = await axios.get(`${DAB_API_URL}/employees?$filter=Id eq ${employeeId}`, { headers });
            const employee = response.data?.value?.[0];

            if (!employee) {
                return { success: false, error: 'Employee not found' };
            }

            return {
                success: true,
                employeeId,
                status: employee.BankVerificationStatus || 'Unverified',
                verifiedAt: employee.BankVerifiedAt,
                institutionName: employee.BankInstitutionName,
                hasBankInfo: !!(employee.BankRoutingNumber && employee.BankAccountNumberMasked),
            };
        } catch (error) {
            console.error('Failed to get verification status:', error.message);
            throw error;
        }
    }

    /**
     * Remove bank verification from employee (revoke Plaid access)
     * @param {string} employeeId - Employee ID
     */
    async removeEmployeeBankVerification(employeeId) {
        try {
            const headers = await getDabHeaders();
            // Get employee to find Plaid item
            const response = await axios.get(`${DAB_API_URL}/employees?$filter=Id eq ${employeeId}`, { headers });
            const employee = response.data?.value?.[0];

            if (!employee) {
                return { success: false, error: 'Employee not found' };
            }

            // If there's a Plaid item, try to remove it
            if (employee.PlaidItemId && this.client) {
                try {
                    const connection = await this.getConnectionByItemId(employee.PlaidItemId);
                    if (connection) {
                        const accessToken = this.decryptToken(connection.AccessToken);
                        await this.client.itemRemove({
                            access_token: accessToken,
                        });
                        console.log('Plaid item removed for employee:', employeeId);
                    }
                } catch (plaidError) {
                    console.warn('Could not remove Plaid item:', plaidError.message);
                    // Continue to clear employee data even if Plaid removal fails
                }
            }

            // Clear verification data from employee
            await axios.patch(`${DAB_API_URL}/employees_write/Id/${employeeId}`, {
                PlaidItemId: null,
                PlaidAccountId: null,
                BankVerificationStatus: 'Unverified',
                BankVerifiedAt: null,
                BankInstitutionName: null,
                // Note: We keep the bank routing/account numbers as they may have been manually entered
                UpdatedAt: new Date().toISOString(),
            }, { headers });

            return { success: true, message: 'Bank verification removed' };
        } catch (error) {
            console.error('Failed to remove bank verification:', error.message);
            throw error;
        }
    }

    /**
     * Get list of employees with unverified bank accounts (for pay run warnings)
     */
    async getUnverifiedEmployees() {
        try {
            const headers = await getDabHeaders();
            // Get active employees with direct deposit but not verified
            const response = await axios.get(
                `${DAB_API_URL}/employees?$filter=Status eq 'Active'`,
                { headers }
            );
            const employees = response.data?.value || [];

            // Filter to those with bank info but not verified
            const unverified = employees.filter(emp =>
                emp.BankRoutingNumber &&
                emp.BankAccountNumberMasked &&
                emp.BankVerificationStatus !== 'Verified'
            );

            return {
                success: true,
                count: unverified.length,
                employees: unverified.map(emp => ({
                    id: emp.Id,
                    name: emp.FullName || `${emp.FirstName} ${emp.LastName}`,
                    employeeNumber: emp.EmployeeNumber,
                    verificationStatus: emp.BankVerificationStatus || 'Unverified',
                })),
            };
        } catch (error) {
            console.error('Failed to get unverified employees:', error.message);
            throw error;
        }
    }
}

export const plaidService = new PlaidService();
export default plaidService;
