import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, usePermission } from '../contexts/AuthContext';
import type { UserRole } from '../lib/authConfig';

interface ProtectedRouteProps {
  requiredPermission?: string;
  requiredRole?: UserRole;
}

export default function ProtectedRoute({ requiredPermission, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, userRole } = useAuth();
  const hasPermission = requiredPermission ? usePermission(requiredPermission) : true;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role requirement
  if (requiredRole) {
    const roleHierarchy: UserRole[] = ['Viewer', 'Accountant', 'Admin'];
    const userRoleIndex = roleHierarchy.indexOf(userRole);
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

    if (userRoleIndex < requiredRoleIndex) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
            <p className="mt-2 text-gray-600">
              You don't have permission to access this page.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Required role: {requiredRole}. Your role: {userRole}
            </p>
          </div>
        </div>
      );
    }
  }

  // Check permission requirement
  if (!hasPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="mt-2 text-gray-600">
            You don't have the required permission: {requiredPermission}
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
