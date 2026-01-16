import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, usePermission } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { type UserRole, hasRoleAccess } from '../lib/authConfig';

interface ProtectedRouteProps {
  requiredPermission?: string;
  requiredRole?: UserRole;
  requiredRoles?: UserRole[];  // Any of these roles
  requireMfa?: boolean;
  requiredFeature?: string;
}

export default function ProtectedRoute({
  requiredPermission,
  requiredRole,
  requiredRoles,
  requireMfa,
  requiredFeature,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, userRole, hasAnyRole, mfaCompleted } = useAuth();
  const { isFeatureEnabled, isLoading: tenantLoading } = useTenant();
  const hasPermission = requiredPermission ? usePermission(requiredPermission) : true;

  if (isLoading || tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check MFA requirement
  if (requireMfa && !mfaCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MFA Required</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Multi-factor authentication is required to access this page.
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Please complete MFA verification to continue.
          </p>
        </div>
      </div>
    );
  }

  // Check feature availability (subscription tier)
  if (requiredFeature && !isFeatureEnabled(requiredFeature)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Feature Not Available</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            This feature requires an upgraded subscription.
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Contact your administrator to upgrade your plan.
          </p>
        </div>
      </div>
    );
  }

  // Check role requirement (single role with hierarchy)
  if (requiredRole) {
    if (!hasRoleAccess(userRole, requiredRole)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Access Denied</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              You don't have permission to access this page.
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
              Required role: {requiredRole}. Your role: {userRole}
            </p>
          </div>
        </div>
      );
    }
  }

  // Check multiple roles (any of these roles)
  if (requiredRoles && requiredRoles.length > 0) {
    if (!hasAnyRole(...requiredRoles)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Access Denied</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              You don't have permission to access this page.
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
              Required role: {requiredRoles.join(' or ')}. Your role: {userRole}
            </p>
          </div>
        </div>
      );
    }
  }

  // Check permission requirement
  if (!hasPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">Access Denied</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            You don't have the required permission: {requiredPermission}
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
