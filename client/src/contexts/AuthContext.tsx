import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  AccountInfo,
  InteractionStatus,
  InteractionRequiredAuthError,
  SilentRequest
} from '@azure/msal-browser';
import { useMsal, useIsAuthenticated, useAccount } from '@azure/msal-react';
import { loginRequest, apiRequest, UserRole, roleHierarchy } from '../lib/authConfig';
import { setCurrentTenantId } from '../lib/api';

/**
 * Extended user claims from Entra ID / B2C tokens
 */
interface UserClaims {
  roles?: string[];
  groups?: string[];
  tid?: string;           // Tenant ID from token
  oid?: string;           // Object ID
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  amr?: string[];         // Authentication methods reference (includes 'mfa' if MFA was used)
  tfp?: string;           // Trust framework policy (B2C)
  acr?: string;           // Authentication context class reference (B2C)
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AccountInfo | null;
  userRole: UserRole;
  userRoles: UserRole[];
  tenantId: string | null;
  mfaCompleted: boolean;
  authProvider: 'EntraID' | 'B2C';
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Check bypass at module level
const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === 'true';

// Provider for when auth is bypassed (no MSAL)
function BypassAuthProvider({ children }: { children: ReactNode }) {
  // Mock user for bypass auth mode with stable oid for onboarding
  const mockUser = {
    username: 'dev@localhost',
    name: 'Development User',
    localAccountId: 'dev-local-account',
    homeAccountId: 'dev-home-account',
    environment: 'localhost',
    tenantId: 'dev-tenant',
    idTokenClaims: {
      oid: '00000000-0000-0000-0000-000000000001', // Valid UUID format for onboarding
      name: 'Development User',
      preferred_username: 'dev@localhost',
      roles: ['Admin'],
    },
  };

  const value: AuthContextType = {
    isAuthenticated: true,
    isLoading: false,
    user: mockUser as AccountInfo,
    userRole: 'Admin',
    userRoles: ['Admin'],
    tenantId: 'dev-tenant',
    mfaCompleted: true,
    authProvider: 'EntraID',
    login: async () => { console.log('Auth bypassed - login skipped'); },
    logout: async () => { console.log('Auth bypassed - logout skipped'); },
    getAccessToken: async () => null,
    hasRole: () => true,
    hasAnyRole: () => true,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Provider for real MSAL auth
function MsalAuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const msalIsAuthenticated = useIsAuthenticated();
  const account = useAccount(accounts[0] || null);
  const [userRole, setUserRole] = useState<UserRole>('Viewer');
  const [userRoles, setUserRoles] = useState<UserRole[]>(['Viewer']);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [mfaCompleted, setMfaCompleted] = useState(false);
  const [authProvider, setAuthProvider] = useState<'EntraID' | 'B2C'>('EntraID');

  const isAuthenticated = msalIsAuthenticated;
  const isLoading = inProgress !== InteractionStatus.None;

  // Extract user claims from token
  useEffect(() => {
    if (account) {
      const claims = account.idTokenClaims as UserClaims | undefined;

      // Extract roles
      const tokenRoles = claims?.roles || [];
      const mappedRoles: UserRole[] = [];

      if (tokenRoles.includes('Admin')) mappedRoles.push('Admin');
      if (tokenRoles.includes('Accountant')) mappedRoles.push('Accountant');
      if (tokenRoles.includes('Employee')) mappedRoles.push('Employee');
      if (tokenRoles.includes('Viewer') || mappedRoles.length === 0) mappedRoles.push('Viewer');

      // Sort by hierarchy (highest first)
      mappedRoles.sort((a, b) => roleHierarchy.indexOf(b) - roleHierarchy.indexOf(a));

      setUserRoles(mappedRoles);
      setUserRole(mappedRoles[0] || 'Viewer');

      // Extract tenant ID
      const tid = claims?.tid || null;
      setTenantId(tid);
      // Update API tenant header
      setCurrentTenantId(tid);

      // Check MFA status
      const amr = claims?.amr || [];
      setMfaCompleted(amr.includes('mfa'));

      // Detect auth provider (B2C has tfp or acr claims)
      if (claims?.tfp || claims?.acr) {
        setAuthProvider('B2C');
      } else {
        setAuthProvider('EntraID');
      }
    } else {
      setUserRoles(['Viewer']);
      setUserRole('Viewer');
      setTenantId(null);
      setCurrentTenantId(null);
      setMfaCompleted(false);
      setAuthProvider('EntraID');
    }
  }, [account]);

  const login = useCallback(async () => {
    try {
      await instance.loginPopup(loginRequest);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, [instance]);

  const logout = useCallback(async () => {
    try {
      await instance.logoutPopup({
        postLogoutRedirectUri: window.location.origin,
      });
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  }, [instance]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!account) {
      return null;
    }

    const silentRequest: SilentRequest = {
      ...apiRequest,
      account: account,
    };

    try {
      const response = await instance.acquireTokenSilent(silentRequest);
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Token expired or requires interaction, trigger popup
        try {
          const response = await instance.acquireTokenPopup(apiRequest);
          return response.accessToken;
        } catch (popupError) {
          console.error('Token acquisition failed:', popupError);
          return null;
        }
      }
      console.error('Token acquisition failed:', error);
      return null;
    }
  }, [instance, account]);

  // Check if user has a specific role
  const hasRole = useCallback((role: UserRole): boolean => {
    // Admin has access to everything
    if (userRoles.includes('Admin')) return true;
    return userRoles.includes(role);
  }, [userRoles]);

  // Check if user has any of the specified roles
  const hasAnyRole = useCallback((...roles: UserRole[]): boolean => {
    // Admin has access to everything
    if (userRoles.includes('Admin')) return true;
    return roles.some(role => userRoles.includes(role));
  }, [userRoles]);

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    user: account,
    userRole,
    userRoles,
    tenantId,
    mfaCompleted,
    authProvider,
    login,
    logout,
    getAccessToken,
    hasRole,
    hasAnyRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Export the appropriate provider based on bypass setting
export function AuthProvider({ children }: { children: ReactNode }) {
  if (bypassAuth) {
    return <BypassAuthProvider>{children}</BypassAuthProvider>;
  }
  return <MsalAuthProvider>{children}</MsalAuthProvider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Hook for checking permissions
export function usePermission(requiredPermission: string): boolean {
  const { userRole, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return false;
  }

  const rolePermissions: Record<UserRole, string[]> = {
    Admin: ['read', 'write', 'delete', 'manage_users'],
    Accountant: ['read', 'write'],
    Viewer: ['read'],
    Employee: ['time_entry', 'expense_submit', 'read_own'],
  };

  return rolePermissions[userRole]?.includes(requiredPermission) ?? false;
}
