import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  AccountInfo,
  InteractionStatus,
  InteractionRequiredAuthError,
  SilentRequest
} from '@azure/msal-browser';
import { useMsal, useIsAuthenticated, useAccount } from '@azure/msal-react';
import { loginRequest, apiRequest, UserRole } from '../lib/authConfig';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AccountInfo | null;
  userRole: UserRole;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const msalIsAuthenticated = useIsAuthenticated();
  const account = useAccount(accounts[0] || null);
  const [userRole, setUserRole] = useState<UserRole>('Viewer');

  // Allow bypassing auth for testing/development
  const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === 'true';
  const isAuthenticated = bypassAuth || msalIsAuthenticated;
  const isLoading = bypassAuth ? false : inProgress !== InteractionStatus.None;

  // Extract user role from token claims
  useEffect(() => {
    if (account) {
      const claims = account.idTokenClaims as Record<string, unknown> | undefined;
      const roles = claims?.roles as string[] | undefined;

      if (roles?.includes('Admin')) {
        setUserRole('Admin');
      } else if (roles?.includes('Accountant')) {
        setUserRole('Accountant');
      } else {
        setUserRole('Viewer');
      }
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

  const value: AuthContextType = {
    isAuthenticated,
    isLoading,
    user: account,
    userRole,
    login,
    logout,
    getAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
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
  };

  return rolePermissions[userRole]?.includes(requiredPermission) ?? false;
}
