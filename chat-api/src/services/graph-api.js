/**
 * Microsoft Graph API Service
 * Integrates with Azure AD / Entra ID for user and group management
 *
 * @module services/graph-api
 */

import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

/**
 * Graph API configuration
 */
const config = {
    clientId: process.env.GRAPH_API_CLIENT_ID || process.env.AZURE_AD_CLIENT_ID,
    clientSecret: process.env.GRAPH_API_CLIENT_SECRET || process.env.AZURE_AD_CLIENT_SECRET,
    tenantId: process.env.GRAPH_API_TENANT_ID || process.env.AZURE_AD_TENANT_ID,
    authority: `https://login.microsoftonline.com/${process.env.GRAPH_API_TENANT_ID || process.env.AZURE_AD_TENANT_ID}`,
    scopes: ['https://graph.microsoft.com/.default'],
};

/**
 * MSAL Confidential Client for app-only authentication
 */
let msalClient = null;

/**
 * Get or create the MSAL client
 * @returns {ConfidentialClientApplication}
 */
function getMsalClient() {
    if (!msalClient && config.clientId && config.clientSecret && config.tenantId) {
        msalClient = new ConfidentialClientApplication({
            auth: {
                clientId: config.clientId,
                clientSecret: config.clientSecret,
                authority: config.authority,
            },
        });
    }
    return msalClient;
}

/**
 * Get an access token for Microsoft Graph API
 * @returns {Promise<string>}
 */
async function getAccessToken() {
    const client = getMsalClient();
    if (!client) {
        throw new Error('Graph API not configured. Set GRAPH_API_CLIENT_ID, GRAPH_API_CLIENT_SECRET, and GRAPH_API_TENANT_ID.');
    }

    const result = await client.acquireTokenByClientCredential({
        scopes: config.scopes,
    });

    if (!result?.accessToken) {
        throw new Error('Failed to acquire Graph API access token');
    }

    return result.accessToken;
}

/**
 * Make a request to Microsoft Graph API
 * @param {string} endpoint - Graph API endpoint (e.g., '/users')
 * @param {Object} options - Request options
 * @returns {Promise<any>}
 */
async function graphRequest(endpoint, options = {}) {
    const token = await getAccessToken();

    const response = await axios({
        method: options.method || 'GET',
        url: `https://graph.microsoft.com/v1.0${endpoint}`,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
        data: options.body,
        params: options.params,
    });

    return response.data;
}

/**
 * Get user details from Entra ID
 * @param {string} userIdOrUpn - User ID (object ID) or UPN (email)
 * @returns {Promise<Object>}
 */
export async function getUser(userIdOrUpn) {
    return graphRequest(`/users/${userIdOrUpn}`, {
        params: {
            $select: 'id,displayName,mail,userPrincipalName,givenName,surname,jobTitle,department,officeLocation',
        },
    });
}

/**
 * Get user's group memberships
 * @param {string} userId - User ID (object ID)
 * @returns {Promise<Array>}
 */
export async function getUserGroups(userId) {
    const result = await graphRequest(`/users/${userId}/memberOf`, {
        params: {
            $select: 'id,displayName,description',
            $top: 100,
        },
    });

    // Filter to only include groups (not directory roles)
    return result.value.filter(m => m['@odata.type'] === '#microsoft.graph.group');
}

/**
 * Get all users in the directory
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
export async function listUsers(options = {}) {
    const { filter, top = 100, skipToken } = options;

    const params = {
        $select: 'id,displayName,mail,userPrincipalName,givenName,surname,accountEnabled,createdDateTime',
        $top: top,
    };

    if (filter) {
        params.$filter = filter;
    }

    if (skipToken) {
        params.$skiptoken = skipToken;
    }

    return graphRequest('/users', { params });
}

/**
 * Get all groups in the directory
 * @param {Object} options - Query options
 * @returns {Promise<Array>}
 */
export async function listGroups(options = {}) {
    const { filter, top = 100 } = options;

    const params = {
        $select: 'id,displayName,description,mail,securityEnabled',
        $top: top,
    };

    if (filter) {
        params.$filter = filter;
    }

    return graphRequest('/groups', { params });
}

/**
 * Get group members
 * @param {string} groupId - Group ID
 * @returns {Promise<Array>}
 */
export async function getGroupMembers(groupId) {
    const result = await graphRequest(`/groups/${groupId}/members`, {
        params: {
            $select: 'id,displayName,mail,userPrincipalName',
            $top: 100,
        },
    });

    return result.value;
}

/**
 * Check if a user is a member of a specific group
 * @param {string} userId - User ID
 * @param {string} groupId - Group ID
 * @returns {Promise<boolean>}
 */
export async function isGroupMember(userId, groupId) {
    try {
        const result = await graphRequest('/me/memberOf', {
            method: 'POST',
            body: {
                groupIds: [groupId],
            },
        });
        return result.value.includes(groupId);
    } catch (error) {
        // Use checkMemberObjects for app-only context
        const result = await graphRequest(`/users/${userId}/checkMemberObjects`, {
            method: 'POST',
            body: {
                ids: [groupId],
            },
        });
        return result.value.includes(groupId);
    }
}

/**
 * Invite an external user to the directory
 * @param {Object} invitation - Invitation details
 * @returns {Promise<Object>}
 */
export async function inviteUser(invitation) {
    const { email, displayName, redirectUrl, sendInvitationMessage = true } = invitation;

    return graphRequest('/invitations', {
        method: 'POST',
        body: {
            invitedUserEmailAddress: email,
            invitedUserDisplayName: displayName,
            inviteRedirectUrl: redirectUrl || process.env.VITE_REDIRECT_URI || 'https://localhost:5173',
            sendInvitationMessage,
        },
    });
}

/**
 * Update user properties in Entra ID
 * @param {string} userId - User ID
 * @param {Object} updates - Properties to update
 * @returns {Promise<void>}
 */
export async function updateUser(userId, updates) {
    const allowedFields = ['displayName', 'givenName', 'surname', 'jobTitle', 'department', 'officeLocation'];

    const filteredUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
            filteredUpdates[key] = value;
        }
    }

    if (Object.keys(filteredUpdates).length === 0) {
        throw new Error('No valid fields to update');
    }

    await graphRequest(`/users/${userId}`, {
        method: 'PATCH',
        body: filteredUpdates,
    });
}

/**
 * Check if Graph API is configured and available
 * @returns {boolean}
 */
export function isConfigured() {
    return Boolean(config.clientId && config.clientSecret && config.tenantId);
}

/**
 * Test Graph API connectivity
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
    if (!isConfigured()) {
        return false;
    }

    try {
        await graphRequest('/organization', {
            params: { $select: 'id' },
        });
        return true;
    } catch (error) {
        console.error('Graph API connection test failed:', error.message);
        return false;
    }
}

export default {
    getUser,
    getUserGroups,
    listUsers,
    listGroups,
    getGroupMembers,
    isGroupMember,
    inviteUser,
    updateUser,
    isConfigured,
    testConnection,
};
