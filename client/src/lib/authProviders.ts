/**
 * Authentication Provider Detection
 * Hybrid support for Azure AD B2C (external/SMB users) and Entra ID (enterprise/internal)
 *
 * @module lib/authProviders
 */

import { Configuration, LogLevel } from '@azure/msal-browser';

/**
 * Auth provider types
 */
export type AuthProviderType = 'EntraID' | 'B2C';

/**
 * Detected auth configuration
 */
export interface DetectedAuthConfig {
  provider: AuthProviderType;
  clientId: string;
  authority: string;
  redirectUri: string;
  scopes: string[];
  knownAuthorities?: string[];
}

/**
 * Enterprise domains that use Entra ID SSO
 * Add your enterprise domains here
 */
const ENTERPRISE_DOMAINS = (import.meta.env.VITE_ENTERPRISE_DOMAINS || '').split(',').filter(Boolean);

/**
 * B2C Configuration
 */
const B2C_CONFIG = {
  clientId: import.meta.env.VITE_B2C_CLIENT_ID || '',
  tenantName: import.meta.env.VITE_B2C_TENANT_NAME || '',
  signInPolicy: import.meta.env.VITE_B2C_SIGNIN_POLICY || 'B2C_1_SignUpSignIn',
  resetPasswordPolicy: import.meta.env.VITE_B2C_RESET_PASSWORD_POLICY || 'B2C_1_PasswordReset',
  editProfilePolicy: import.meta.env.VITE_B2C_EDIT_PROFILE_POLICY || 'B2C_1_EditProfile',
  scopes: (import.meta.env.VITE_B2C_SCOPES || 'openid,profile,email').split(','),
};

/**
 * Entra ID Configuration
 */
const ENTRA_CONFIG = {
  clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
  tenantId: import.meta.env.VITE_AZURE_TENANT_ID || '',
  authority: import.meta.env.VITE_AZURE_AUTHORITY || '',
  // Scopes should be space-separated per OAuth 2.0 spec, fallback to array
  scopes: import.meta.env.VITE_API_SCOPES?.split(' ').filter(Boolean) || ['openid', 'profile', 'email'],
};

/**
 * Check if an email domain is an enterprise domain
 * @param email - User email address
 * @returns True if enterprise domain
 */
export function isEnterpriseDomain(email: string): boolean {
  if (!email || ENTERPRISE_DOMAINS.length === 0) {
    return true; // Default to Entra ID if no domains configured
  }

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return false;
  }

  return ENTERPRISE_DOMAINS.some((d: string) => d.toLowerCase() === domain);
}

/**
 * Detect the appropriate auth provider based on context
 * @param emailHint - Optional email hint for provider selection
 * @returns Detected auth configuration
 */
export function detectAuthProvider(emailHint?: string): DetectedAuthConfig {
  const redirectUri = import.meta.env.VITE_REDIRECT_URI || window.location.origin;

  // If B2C is not configured, always use Entra ID
  if (!B2C_CONFIG.clientId || !B2C_CONFIG.tenantName) {
    return {
      provider: 'EntraID',
      clientId: ENTRA_CONFIG.clientId,
      authority: ENTRA_CONFIG.authority || `https://login.microsoftonline.com/${ENTRA_CONFIG.tenantId}`,
      redirectUri,
      scopes: ENTRA_CONFIG.scopes.length > 0 ? ENTRA_CONFIG.scopes : ['openid', 'profile', 'email'],
    };
  }

  // If email is provided and is enterprise domain, use Entra ID
  if (emailHint && isEnterpriseDomain(emailHint)) {
    return {
      provider: 'EntraID',
      clientId: ENTRA_CONFIG.clientId,
      authority: ENTRA_CONFIG.authority || `https://login.microsoftonline.com/${ENTRA_CONFIG.tenantId}`,
      redirectUri,
      scopes: ENTRA_CONFIG.scopes.length > 0 ? ENTRA_CONFIG.scopes : ['openid', 'profile', 'email'],
    };
  }

  // Otherwise use B2C for external/SMB users
  const b2cAuthority = `https://${B2C_CONFIG.tenantName}.b2clogin.com/${B2C_CONFIG.tenantName}.onmicrosoft.com/${B2C_CONFIG.signInPolicy}`;

  return {
    provider: 'B2C',
    clientId: B2C_CONFIG.clientId,
    authority: b2cAuthority,
    redirectUri,
    scopes: B2C_CONFIG.scopes,
    knownAuthorities: [`${B2C_CONFIG.tenantName}.b2clogin.com`],
  };
}

/**
 * Build MSAL configuration for detected provider
 * @param config - Detected auth configuration
 * @returns MSAL Configuration object
 */
export function buildMsalConfig(config: DetectedAuthConfig): Configuration {
  // Extract tenant ID from authority URL for metadata
  const tenantMatch = config.authority.match(/login\.microsoftonline\.com\/([^/]+)/);
  const tenantId = tenantMatch ? tenantMatch[1] : '';

  // Provide static authority metadata to avoid network fetch issues
  // This is especially useful when firewalls/proxies block discovery
  const authorityMetadata = tenantId && !config.authority.includes('b2clogin.com')
    ? JSON.stringify({
        authorization_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
        token_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        jwks_uri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
        end_session_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`,
      })
    : undefined;

  // Cloud discovery metadata for Azure AD global cloud
  const cloudDiscoveryMetadata = tenantId && !config.authority.includes('b2clogin.com')
    ? JSON.stringify({
        tenant_discovery_endpoint: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
        'api-version': '1.1',
        metadata: [{
          preferred_network: 'login.microsoftonline.com',
          preferred_cache: 'login.windows.net',
          aliases: ['login.microsoftonline.com', 'login.windows.net', 'login.microsoft.com', 'sts.windows.net']
        }]
      })
    : undefined;

  return {
    auth: {
      clientId: config.clientId,
      authority: config.authority,
      redirectUri: config.redirectUri,
      postLogoutRedirectUri: window.location.origin,
      knownAuthorities: config.knownAuthorities,
      navigateToLoginRequestUrl: true,
      authorityMetadata,
      cloudDiscoveryMetadata,
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) {
            return;
          }
          switch (level) {
            case LogLevel.Error:
              console.error('[MSAL]', message);
              return;
            case LogLevel.Warning:
              console.warn('[MSAL]', message);
              return;
            case LogLevel.Info:
              if (import.meta.env.DEV) {
                console.info('[MSAL]', message);
              }
              return;
            case LogLevel.Verbose:
              if (import.meta.env.DEV) {
                console.debug('[MSAL]', message);
              }
              return;
          }
        },
        logLevel: import.meta.env.DEV ? LogLevel.Verbose : LogLevel.Warning,
      },
    },
  };
}

/**
 * Get B2C password reset authority
 * @returns Password reset authority URL or null if B2C not configured
 */
export function getPasswordResetAuthority(): string | null {
  if (!B2C_CONFIG.tenantName) {
    return null;
  }
  return `https://${B2C_CONFIG.tenantName}.b2clogin.com/${B2C_CONFIG.tenantName}.onmicrosoft.com/${B2C_CONFIG.resetPasswordPolicy}`;
}

/**
 * Get B2C edit profile authority
 * @returns Edit profile authority URL or null if B2C not configured
 */
export function getEditProfileAuthority(): string | null {
  if (!B2C_CONFIG.tenantName) {
    return null;
  }
  return `https://${B2C_CONFIG.tenantName}.b2clogin.com/${B2C_CONFIG.tenantName}.onmicrosoft.com/${B2C_CONFIG.editProfilePolicy}`;
}

/**
 * Check if B2C is configured
 */
export function isB2CConfigured(): boolean {
  return Boolean(B2C_CONFIG.clientId && B2C_CONFIG.tenantName);
}

/**
 * Check if the current auth session is B2C
 * @param authority - The authority URL from the account
 */
export function isB2CSession(authority?: string): boolean {
  if (!authority) {
    return false;
  }
  return authority.includes('b2clogin.com');
}

export default {
  detectAuthProvider,
  buildMsalConfig,
  isEnterpriseDomain,
  getPasswordResetAuthority,
  getEditProfileAuthority,
  isB2CConfigured,
  isB2CSession,
};
