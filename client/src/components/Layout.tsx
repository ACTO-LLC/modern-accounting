import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, BookOpen, Settings, Menu, Building2, Upload, CheckCircle, Database, Users, Package, Scale, Truck, BarChart3, FolderOpen, Clock, Tag, MapPin, Warehouse, Receipt, ClipboardList, RefreshCw, LogOut, User, ChevronDown, MessageSquare } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import GlobalSearch from './GlobalSearch';

export default function Layout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { user, userRole, logout } = useAuth();
  const { settings: companySettings } = useCompanySettings();

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Invoices', href: '/invoices', icon: FileText },
    { name: 'Estimates', href: '/estimates', icon: ClipboardList },
    { name: 'Customers', href: '/customers', icon: Users },
    { name: 'Products & Services', href: '/products-services', icon: Package },
    { name: 'Inventory', href: '/inventory', icon: Warehouse },
    { name: 'Vendors', href: '/vendors', icon: Truck },
    { name: 'Bills', href: '/bills', icon: Receipt },
    { name: 'Projects', href: '/projects', icon: FolderOpen },
    { name: 'Time Tracking', href: '/time-entries', icon: Clock },
    { name: 'Classes', href: '/classes', icon: Tag },
    { name: 'Locations', href: '/locations', icon: MapPin },
    { name: 'Recurring', href: '/recurring', icon: RefreshCw },
    { name: 'Banking', href: '/banking', icon: Building2 },
    { name: 'Journal Entries', href: '/journal-entries', icon: BookOpen },
    { name: 'Import', href: '/import', icon: Upload },
    { name: 'Review', href: '/review', icon: CheckCircle },
    { name: 'Transactions', href: '/transactions', icon: Database },
    { name: 'Reconciliation', href: '/reconciliations', icon: Scale },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'Feedback', href: '/submissions', icon: MessageSquare },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex print:bg-white">
      {/* Sidebar - Hidden when printing */}
      <div className={clsx(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 print:hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-between h-16 border-b border-gray-200 dark:border-gray-700 px-4">
          {companySettings.logoUrl ? (
            <img
              src={companySettings.logoUrl}
              alt={companySettings.name}
              className="h-10 max-w-[140px] object-contain"
            />
          ) : (
            <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{companySettings.name || 'Modern Books'}</span>
          )}
          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-1 p-1 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <User className="h-5 w-5" />
              <ChevronDown className="h-3 w-3" />
            </button>
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {user?.name || user?.username || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user?.username}
                  </p>
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded">
                    {userRole}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Global Search in Sidebar */}
        <div className="px-4 py-3 border-b border-gray-200">
          <GlobalSearch />
        </div>
        <nav className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  "flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                )}
              >
                <Icon className="mr-3 h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header - Hidden when printing */}
        <div className="lg:hidden flex items-center justify-between bg-white border-b border-gray-200 dark:border-gray-700 px-4 py-2 print:hidden">
          {companySettings.logoUrl ? (
            <img
              src={companySettings.logoUrl}
              alt={companySettings.name}
              className="h-8 max-w-[120px] object-contain"
            />
          ) : (
            <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{companySettings.name || 'Modern Books'}</span>
          )}
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8 print:p-0 print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
