/**
 * Multi-tenant QuickBooks client for HTTP MCP server.
 * Manages OAuth and API calls per session.
 */

import QuickBooks from 'node-quickbooks';
import OAuthClient from 'intuit-oauth';
import { sessionStore, QBOSession } from './session-store.js';

// Lazy-load environment configuration (called after dotenv.config())
function getConfig() {
    const clientId = process.env.QBO_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.QBO_CLIENT_SECRET?.trim() || '';
    const environment = (process.env.QBO_ENVIRONMENT || 'sandbox').trim();
    const redirectUri = (process.env.QBO_REDIRECT_URI || 'http://localhost:8001/oauth/callback').trim();

    return { clientId, clientSecret, environment, redirectUri };
}

// Create OAuth client lazily
function createOAuthClient() {
    const config = getConfig();
    if (!config.clientId || !config.clientSecret) {
        console.warn('QBO_CLIENT_ID and QBO_CLIENT_SECRET must be set for QuickBooks integration');
    }
    return new OAuthClient({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        environment: config.environment,
        redirectUri: config.redirectUri
    });
}

/**
 * Get the authorization URL for OAuth flow
 */
export function getAuthorizationUrl(state: string): string {
    const oauthClient = createOAuthClient();
    return oauthClient.authorizeUri({
        scope: [OAuthClient.scopes.Accounting as string],
        state
    }).toString();
}

/**
 * Handle OAuth callback and store tokens for session
 */
export async function handleOAuthCallback(
    sessionId: string,
    callbackUrl: string
): Promise<QBOSession> {
    console.log('Handling OAuth callback for session:', sessionId);

    const oauthClient = createOAuthClient();

    try {
        const response = await oauthClient.createToken(callbackUrl);
        const tokens = response.token;

        console.log('Token exchange successful, realmId:', tokens.realmId);

        // Store tokens in session
        const session = sessionStore.setTokens(sessionId, {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            realmId: tokens.realmId,
            expiresIn: tokens.expires_in || 3600
        });

        // Fetch company info
        try {
            const qb = await getAuthenticatedClient(sessionId);
            const companyInfo = await new Promise<any>((resolve, reject) => {
                qb.getCompanyInfo(tokens.realmId, (err: any, info: any) => {
                    if (err) {
                        console.error('getCompanyInfo error:', err);
                        reject(err);
                    } else {
                        console.log('Company info response:', JSON.stringify(info, null, 2));
                        resolve(info);
                    }
                });
            });
            // Handle different response structures from node-quickbooks
            const companyName = companyInfo?.CompanyInfo?.CompanyName
                || companyInfo?.QueryResponse?.CompanyInfo?.[0]?.CompanyName
                || companyInfo?.companyName
                || companyInfo?.CompanyName;
            session.companyName = companyName || 'Connected Company';
            sessionStore.update(sessionId, { companyName: session.companyName });
            console.log('Company name set to:', session.companyName);
        } catch (e: any) {
            console.error('Could not fetch company name:', e?.message || e);
            // Still mark as connected, just without company name
            session.companyName = 'QuickBooks Company';
            sessionStore.update(sessionId, { companyName: session.companyName });
        }

        return session;
    } catch (error: any) {
        console.error('OAuth callback error:', error);
        throw error;
    }
}

/**
 * Refresh access token for a session
 */
export async function refreshAccessToken(sessionId: string): Promise<void> {
    const session = sessionStore.get(sessionId);
    if (!session?.refreshToken) {
        throw new Error('No refresh token available for session');
    }

    const oauthClient = createOAuthClient();

    try {
        const authResponse = await oauthClient.refreshUsingToken(session.refreshToken);

        sessionStore.update(sessionId, {
            accessToken: authResponse.token.access_token,
            refreshToken: authResponse.token.refresh_token, // May be rotated
            tokenExpiry: new Date(Date.now() + (authResponse.token.expires_in || 3600) * 1000)
        });

        console.log('Token refreshed for session:', sessionId);
    } catch (error: any) {
        console.error('Token refresh failed:', error);
        throw new Error(`Failed to refresh token: ${error.message}`);
    }
}

/**
 * Get authenticated QuickBooks client for a session
 */
export async function getAuthenticatedClient(sessionId: string): Promise<QuickBooks> {
    const session = sessionStore.get(sessionId);

    if (!session?.refreshToken || !session?.realmId) {
        throw new Error('Session not connected to QuickBooks. Please authenticate first.');
    }

    // Check if token needs refresh
    if (sessionStore.isTokenExpired(sessionId)) {
        await refreshAccessToken(sessionId);
    }

    const updatedSession = sessionStore.get(sessionId)!;

    if (!updatedSession.accessToken || !updatedSession.realmId) {
        throw new Error('Session tokens not available after refresh');
    }

    const config = getConfig();

    return new QuickBooks(
        config.clientId,
        config.clientSecret,
        updatedSession.accessToken,
        false, // no token secret for OAuth 2.0
        updatedSession.realmId,
        config.environment === 'sandbox',
        false, // debug
        null, // minor version
        '2.0', // oauth version
        updatedSession.refreshToken
    );
}

/**
 * Check if session is connected to QuickBooks
 */
export function isSessionConnected(sessionId: string): boolean {
    return sessionStore.isConnected(sessionId);
}

/**
 * Get session info
 */
export function getSessionInfo(sessionId: string): QBOSession | undefined {
    return sessionStore.get(sessionId);
}

/**
 * Disconnect session (revoke tokens)
 */
export function disconnectSession(sessionId: string): void {
    sessionStore.delete(sessionId);
    console.log('Session disconnected:', sessionId);
}

/**
 * Create a QuickBooks client from passed-in tokens (stateless mode)
 * This allows callers to pass tokens directly without using session storage.
 */
export function createClientFromTokens(accessToken: string, realmId: string): QuickBooks {
    const config = getConfig();

    return new QuickBooks(
        config.clientId,
        config.clientSecret,
        accessToken,
        false, // no token secret for OAuth 2.0
        realmId,
        config.environment === 'sandbox',
        false, // debug
        undefined, // minor version
        '2.0', // oauth version
        undefined // no refresh token in stateless mode
    );
}

/**
 * Execute a paginated query to fetch ALL records for an entity type.
 * QBO API limits results to 1000 per request, so we use STARTPOSITION to paginate.
 *
 * @param qb - QuickBooks client
 * @param entityType - The QBO entity type (Customer, Vendor, Account, etc.)
 * @param findMethod - The method name on qb (e.g., 'findCustomers')
 * @param whereClause - Optional WHERE conditions array
 * @param pageSize - Records per page (max 1000 for QBO)
 */
export async function queryAllPaginated(
    qb: QuickBooks,
    entityType: string,
    findMethod: string,
    criteria: any[] = [],
    pageSize: number = 1000
): Promise<{ records: any[]; totalCount: number }> {
    const allRecords: any[] = [];
    let startPosition = 1;
    let hasMore = true;

    console.log(`[QBO MCP] Fetching all ${entityType} records with pagination...`);

    while (hasMore) {
        // Build criteria object for node-quickbooks
        // It expects { limit, offset, ... } not array format
        const paginatedCriteria: any = {
            limit: pageSize,
            offset: startPosition - 1  // node-quickbooks uses 0-based offset
        };

        // Add any filter criteria (convert array format to object if needed)
        if (Array.isArray(criteria)) {
            criteria.forEach((c: any) => {
                if (c.field && c.value !== undefined) {
                    paginatedCriteria[c.field] = c.value;
                }
            });
        }

        const result = await new Promise<any>((resolve, reject) => {
            (qb as any)[findMethod](paginatedCriteria, (err: any, data: any) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        const records = result?.QueryResponse?.[entityType] || [];
        allRecords.push(...records);

        console.log(`[QBO MCP] Fetched ${entityType} ${startPosition}-${startPosition + records.length - 1}, total: ${allRecords.length}`);

        if (records.length < pageSize) {
            hasMore = false;
        } else {
            startPosition += pageSize;
        }
    }

    console.log(`[QBO MCP] Completed fetching ${entityType}: ${allRecords.length} total records`);

    return {
        records: allRecords,
        totalCount: allRecords.length
    };
}

/**
 * Get count for an entity type
 */
export async function getEntityCount(
    qb: QuickBooks,
    findMethod: string
): Promise<number> {
    const result = await new Promise<any>((resolve, reject) => {
        (qb as any)[findMethod]({ count: true }, (err: any, data: any) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
    return result?.QueryResponse?.totalCount || 0;
}

export { sessionStore };
