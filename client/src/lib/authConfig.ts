import { Configuration, LogLevel } from '@azure/msal-browser';

// MSAL configuration for Azure AD
// These values MUST be configured via environment variables
if (!import.meta.env.VITE_AZURE_CLIENT_ID) {
  throw new Error('VITE_AZURE_CLIENT_ID environment variable is required');
}

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
    authority: import.meta.env.VITE_AZURE_AUTHORITY || 'https://login.microsoftonline.com/common',
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: window.location.origin,
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
            console.error(message);
            return;
          case LogLevel.Info:
            console.info(message);
            return;
          case LogLevel.Verbose:
            console.debug(message);
            return;
          case LogLevel.Warning:
            console.warn(message);
            return;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Scopes for accessing the API
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};

// Scopes for accessing the DAB API (Data API Builder)
// Note: Falls back to default scope if not configured for development
export const apiRequest = {
  scopes: import.meta.env.VITE_API_SCOPES 
    ? import.meta.env.VITE_API_SCOPES.split(' ')
    : ['openid', 'profile'],
};

// User roles for RBAC
export type UserRole = 'Admin' | 'Accountant' | 'Viewer';

export const rolePermissions: Record<UserRole, string[]> = {
  Admin: ['read', 'write', 'delete', 'manage_users'],
  Accountant: ['read', 'write'],
  Viewer: ['read'],
};
