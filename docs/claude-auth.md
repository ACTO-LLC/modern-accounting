# Claude Guidelines: Authentication & Authorization

## MSAL v3 Azure AD Authentication Issues (Jan 2026)

**Problem:** Login fails with `endpoints_resolution_error: Endpoints cannot be resolved` or `AADSTS650053: scope 'openid,profile,email' doesn't exist`.

**Root Causes:**
1. MSAL v3.x requires calling `initialize()` before use
2. MSAL tries to fetch cloud discovery metadata from Azure AD at runtime, which can fail due to firewalls/proxies
3. Default scopes were comma-separated string instead of array

**Solution:**

1. **Initialize MSAL before use:**
```tsx
// App.tsx
const msalInstance = new PublicClientApplication(msalConfig);
const msalInitPromise = msalInstance.initialize(); // Required for MSAL v3.x

// Wait for initialization in App component
useEffect(() => {
  msalInitPromise.then(() => setMsalReady(true));
}, []);
```

2. **Provide static metadata to avoid network fetch:**
```tsx
// authProviders.ts - buildMsalConfig()
const authorityMetadata = JSON.stringify({
  authorization_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  token_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  jwks_uri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  end_session_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`,
});

const cloudDiscoveryMetadata = JSON.stringify({
  tenant_discovery_endpoint: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
  'api-version': '1.1',
  metadata: [{
    preferred_network: 'login.microsoftonline.com',
    preferred_cache: 'login.windows.net',
    aliases: ['login.microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.windows.net']
  }]
});

return {
  auth: {
    clientId,
    authority,
    authorityMetadata,
    cloudDiscoveryMetadata,
    // ...
  }
};
```

3. **Fix scopes to be array, not comma-separated string:**
```tsx
// WRONG
scopes: 'openid,profile,email'.split(' ') // Results in ['openid,profile,email']

// CORRECT
scopes: ['openid', 'profile', 'email']
```

---

## QBO Auth DAB Integration (Feb 2026)

**Problem:** QBO OAuth callback needs to store tokens in DAB, but the callback has no user context (it's a redirect from Intuit, not an authenticated API call).

**Solution:** Use Azure Managed Identity for backend-to-backend authentication:

1. **Production (Azure App Service):** Uses Managed Identity to authenticate to DAB
2. **Local Development:** Uses `DefaultAzureCredential` which falls back to Azure CLI credentials

**Implementation (`chat-api/qbo-auth.js`):**
```javascript
import { DefaultAzureCredential } from '@azure/identity';

const DAB_AUDIENCE = process.env.AZURE_AD_AUDIENCE;
let azureCredential = null;

async function getDabAuthToken() {
    // Skip auth for localhost
    if (DAB_API_URL.includes('localhost')) return null;

    if (!azureCredential) {
        azureCredential = new DefaultAzureCredential();
    }

    const scope = `api://${DAB_AUDIENCE}/.default`;
    const tokenResponse = await azureCredential.getToken(scope);
    return tokenResponse.token;
}
```

**Why Managed Identity for QBO, but User Tokens for Migrations:**
- **QBO token storage:** System operation with no user context - uses Managed Identity
- **Data migrations:** User-initiated operations - uses forwarded user tokens for SQL audit trails

**Required Environment Variables:**
- `AZURE_AD_AUDIENCE`: The App Registration's Client ID (e.g., `2685fbc4-b4fd-4ea7-8773-77ec0826e7af`)
- `DAB_API_URL`: The DAB API endpoint

**Local Development:**
1. Login to Azure CLI: `az login`
2. Set `DAB_API_URL=http://localhost:5000/api` to skip auth (local DAB doesn't require it)
3. Or set up a local service principal for full auth testing

---

## Plaid Bank Integration Auth Flow (Feb 2026)

**Problem:** Plaid Link completes successfully (user authenticates with bank), but `/api/plaid/exchange-token` fails with 500 when saving the connection to DAB.

**Root Cause:** The Plaid service was using `X-MS-API-ROLE: Admin` but the App Service's managed identity is assigned the `Service` role, not `Admin`. DAB rejects the request because the identity doesn't have that role.

**Solution:** Use `Service` role for backend-to-backend DAB calls via Managed Identity.

**Implementation (`chat-api/plaid-service.js`):**
```javascript
import { DefaultAzureCredential } from '@azure/identity';

const DAB_AUDIENCE = process.env.AZURE_AD_AUDIENCE;
let azureCredential = null;
let cachedToken = null;
let tokenExpiry = null;

async function getDabAuthToken() {
    if (DAB_API_URL.includes('localhost')) return null;

    // Token caching with 5-minute buffer
    if (cachedToken && tokenExpiry && new Date() < new Date(tokenExpiry.getTime() - 5 * 60 * 1000)) {
        return cachedToken;
    }

    try {
        if (!azureCredential) {
            azureCredential = new DefaultAzureCredential();
        }
        const scope = `api://${DAB_AUDIENCE}/.default`;
        const tokenResponse = await azureCredential.getToken(scope);
        cachedToken = tokenResponse.token;
        tokenExpiry = new Date(tokenResponse.expiresOnTimestamp || Date.now() + 3600000);
        return cachedToken;
    } catch (error) {
        console.error('[Plaid] Failed to get DAB auth token:', error.message);
        return null; // Graceful degradation - will fail at DAB with 403
    }
}

async function getDabHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = await getDabAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-MS-API-ROLE'] = 'Service';  // MUST match managed identity's role
    }
    return headers;
}
```

**DAB Config Requirements:**
Entities accessed by Plaid service must include the `Service` role:
```json
"plaidconnections": {
    "permissions": [
        { "role": "authenticated", "actions": ["*"] },
        { "role": "Service", "actions": ["*"] }
    ]
},
"plaidaccounts": {
    "permissions": [
        { "role": "authenticated", "actions": ["*"] },
        { "role": "Service", "actions": ["*"] }
    ]
}
```

**Required Environment Variables (Production):**
- `PLAID_CLIENT_ID`: Plaid API client ID
- `PLAID_SECRET`: Plaid API secret (production or sandbox)
- `PLAID_ENV`: `sandbox`, `development`, or `production`
- `AZURE_AD_AUDIENCE`: App Registration Client ID (for DAB auth)
- `DAB_API_URL`: DAB API endpoint

**Common Mistakes:**
1. **Wrong role:** Using `Admin` instead of `Service` - the managed identity must have the role you specify
2. **Wrong credentials:** Using production secret with `PLAID_ENV=sandbox` or vice versa
3. **Missing DAB permissions:** Forgetting to add `Service` role to entities in dab-config.json
4. **Throwing errors:** Auth failures should return null, not throw - let DAB return the actual error

**Plaid Link Flow:**
1. Frontend calls `/api/plaid/link-token` to get a link token
2. User completes Plaid Link (authenticates with bank)
3. Plaid returns a `public_token` to the frontend
4. Frontend calls `/api/plaid/exchange-token` with the public token
5. Backend exchanges public token for access token via Plaid API
6. Backend saves connection to DAB using Managed Identity auth
