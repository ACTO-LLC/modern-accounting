import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { LogIn, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Shield className="h-12 w-12 text-blue-600" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Modern Accounting
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in to access your accounting dashboard
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="text-center text-sm text-gray-700">
              <p>Use your organization credentials to sign in.</p>
            </div>

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign in with Microsoft
                </>
              )}
            </button>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Secured by Azure AD
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-gray-500">
          <p>By signing in, you agree to the Terms of Service and Privacy Policy.</p>
        </div>
      </div>
    </div>
  );
}
