import { Configuration } from '@azure/msal-browser';
import { detectAuthProvider, buildMsalConfig } from './authProviders';

// Detect and build MSAL configuration
const detectedConfig = detectAuthProvider();

// MSAL configuration for Azure AD / Entra ID / B2C
// Supports hybrid authentication with automatic provider detection
export const msalConfig: Configuration = buildMsalConfig(detectedConfig);

// Scopes for accessing the API
export const loginRequest = {
  scopes: detectedConfig.scopes,
};

// Scopes for accessing the DAB API (Data API Builder)
export const apiRequest = {
  scopes: import.meta.env.VITE_API_SCOPES?.split(' ').filter(Boolean) || detectedConfig.scopes,
};

// User roles for RBAC (expanded to include Employee role)
export type UserRole = 'Admin' | 'Accountant' | 'Viewer' | 'Employee';

// Role permissions mapping
export const rolePermissions: Record<UserRole, string[]> = {
  Admin: ['*'], // Full access
  Accountant: ['read', 'write', 'reports', 'banking', 'reconciliation', 'invoicing', 'bills', 'journal_entries'],
  Viewer: ['read', 'reports'],
  Employee: ['time_entry', 'expense_submit', 'read_own'],
};

// Role hierarchy for comparison (higher index = more permissions)
export const roleHierarchy: UserRole[] = ['Employee', 'Viewer', 'Accountant', 'Admin'];

/**
 * Check if a role has access to another role's level
 * @param userRole - The user's role
 * @param requiredRole - The required role
 * @returns True if user's role is equal or higher
 */
export function hasRoleAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  const userIndex = roleHierarchy.indexOf(userRole);
  const requiredIndex = roleHierarchy.indexOf(requiredRole);
  return userIndex >= requiredIndex;
}

/**
 * Check if a role has a specific permission
 * @param role - The role to check
 * @param permission - The permission to check for
 * @returns True if role has the permission
 */
export function roleHasPermission(role: UserRole, permission: string): boolean {
  const permissions = rolePermissions[role];
  return permissions.includes('*') || permissions.includes(permission);
}

// MFA configuration
export const mfaConfig = {
  // Enable MFA requirement for sensitive operations
  requireForSensitiveOps: import.meta.env.VITE_REQUIRE_MFA === 'true',
  // MFA challenge endpoint
  challengeEndpoint: '/api/users/mfa/challenge',
  // MFA verify endpoint
  verifyEndpoint: '/api/users/mfa/verify',
};

// Export detected auth provider info
export const authProvider = detectedConfig.provider;
