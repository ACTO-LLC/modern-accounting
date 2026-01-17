/**
 * Tenant Context
 * Manages multi-tenant state and provides tenant information throughout the app
 *
 * @module contexts/TenantContext
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import api from '../lib/api';

/**
 * Subscription tier types
 */
export type SubscriptionTier = 'Free' | 'Starter' | 'Professional' | 'Enterprise';

/**
 * Tenant information
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  subscriptionTier: SubscriptionTier;
  maxUsers: number;
  maxCompanies: number;
  brandingConfig?: {
    logo?: string;
    primaryColor?: string;
    companyName?: string;
  };
  complianceFlags?: {
    gdpr?: boolean;
    soc2?: boolean;
    hipaa?: boolean;
  };
}

/**
 * User profile from the API
 */
export interface UserProfile {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  authProvider: 'EntraID' | 'B2C';
  preferences: Record<string, unknown>;
  lastLoginAt?: string;
  mfaEnabled: boolean;
  mfaMethod?: string;
  isActive: boolean;
  roles: Array<{
    id: string;
    name: string;
    description: string;
    permissions: string[];
    companyId?: string;
  }>;
  permissions: string[];
  tenant: Tenant;
}

/**
 * Tenant context type
 */
interface TenantContextType {
  tenant: Tenant | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (...permissions: string[]) => boolean;
  hasAllPermissions: (...permissions: string[]) => boolean;
  isFeatureEnabled: (feature: string) => boolean;
  refreshProfile: () => Promise<void>;
  updatePreferences: (preferences: Record<string, unknown>) => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

// Check bypass at module level
const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === 'true';

/**
 * Feature availability by subscription tier
 */
const TIER_FEATURES: Record<SubscriptionTier, string[]> = {
  Free: ['basic_accounting', 'invoicing', 'reports_basic'],
  Starter: ['basic_accounting', 'invoicing', 'reports_basic', 'bank_import', 'multi_user'],
  Professional: ['basic_accounting', 'invoicing', 'reports_basic', 'bank_import', 'multi_user', 'reports_advanced', 'api_access', 'time_tracking', 'projects'],
  Enterprise: ['basic_accounting', 'invoicing', 'reports_basic', 'bank_import', 'multi_user', 'reports_advanced', 'api_access', 'time_tracking', 'projects', 'sso', 'audit_log', 'custom_roles', 'api_unlimited', 'dedicated_support'],
};

/**
 * Provider for when auth is bypassed (no real tenant)
 */
function BypassTenantProvider({ children }: { children: ReactNode }) {
  const value: TenantContextType = {
    tenant: {
      id: 'dev-tenant',
      name: 'Development Tenant',
      slug: 'dev',
      subscriptionTier: 'Enterprise',
      maxUsers: 100,
      maxCompanies: 10,
    },
    userProfile: {
      id: 'dev-user',
      tenantId: 'dev-tenant',
      email: 'dev@localhost',
      displayName: 'Development User',
      authProvider: 'EntraID',
      preferences: {},
      mfaEnabled: false,
      isActive: true,
      roles: [{ id: 'admin', name: 'Admin', description: 'Full access', permissions: ['*'], companyId: undefined }],
      permissions: ['*'],
      tenant: {
        id: 'dev-tenant',
        name: 'Development Tenant',
        slug: 'dev',
        subscriptionTier: 'Enterprise',
        maxUsers: 100,
        maxCompanies: 10,
      },
    },
    isLoading: false,
    error: null,
    permissions: ['*'],
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    isFeatureEnabled: () => true,
    refreshProfile: async () => {},
    updatePreferences: async () => {},
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

/**
 * Real tenant provider that fetches from API
 */
function RealTenantProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, getAccessToken } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch user profile and tenant info
   */
  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setTenant(null);
      setUserProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Ensure we have a token before making the request
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Unable to acquire access token');
      }

      const response = await api.get<UserProfile>('/users/me');
      const profile = response.data;

      setUserProfile(profile);
      setTenant(profile.tenant);
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load user profile');
      // Don't clear existing data on error - might be temporary
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getAccessToken]);

  /**
   * Refresh profile data
   */
  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  /**
   * Update user preferences
   */
  const updatePreferences = useCallback(async (preferences: Record<string, unknown>) => {
    try {
      await api.patch('/users/me', { preferences });
      // Refresh profile to get updated data
      await refreshProfile();
    } catch (err) {
      console.error('Failed to update preferences:', err);
      throw err;
    }
  }, [refreshProfile]);

  // Fetch profile when auth state changes
  useEffect(() => {
    if (!authLoading) {
      fetchProfile();
    }
  }, [authLoading, isAuthenticated, fetchProfile]);

  /**
   * Check if user has a specific permission
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!userProfile) return false;
    const perms = userProfile.permissions;
    return perms.includes('*') || perms.includes(permission);
  }, [userProfile]);

  /**
   * Check if user has any of the specified permissions
   */
  const hasAnyPermission = useCallback((...permissions: string[]): boolean => {
    return permissions.some(p => hasPermission(p));
  }, [hasPermission]);

  /**
   * Check if user has all of the specified permissions
   */
  const hasAllPermissions = useCallback((...permissions: string[]): boolean => {
    return permissions.every(p => hasPermission(p));
  }, [hasPermission]);

  /**
   * Check if a feature is enabled for the tenant's subscription tier
   */
  const isFeatureEnabled = useCallback((feature: string): boolean => {
    if (!tenant) return false;
    const tierFeatures = TIER_FEATURES[tenant.subscriptionTier] || [];
    return tierFeatures.includes(feature);
  }, [tenant]);

  const value: TenantContextType = {
    tenant,
    userProfile,
    isLoading: isLoading || authLoading,
    error,
    permissions: userProfile?.permissions || [],
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isFeatureEnabled,
    refreshProfile,
    updatePreferences,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

/**
 * Tenant provider - switches between bypass and real based on config
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  if (bypassAuth) {
    return <BypassTenantProvider>{children}</BypassTenantProvider>;
  }
  return <RealTenantProvider>{children}</RealTenantProvider>;
}

/**
 * Hook to access tenant context
 */
export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}

/**
 * Hook to check a specific permission
 */
export function useHasPermission(permission: string): boolean {
  const { hasPermission, isLoading } = useTenant();
  if (isLoading) return false;
  return hasPermission(permission);
}

/**
 * Hook to check feature availability
 */
export function useFeature(feature: string): boolean {
  const { isFeatureEnabled, isLoading } = useTenant();
  if (isLoading) return false;
  return isFeatureEnabled(feature);
}

export default TenantContext;
