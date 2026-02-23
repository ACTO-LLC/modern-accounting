import { useRef, useState, useEffect } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, User, ChevronDown, LogOut } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useAuth } from '../../contexts/AuthContext';
import { useCompanySettings } from '../../contexts/CompanySettingsContext';
import GlobalSearch from '../GlobalSearch';
import NavItem from './NavItem';
import NavGroup from './NavGroup';
import { navigationConfig, isNavGroup } from './navConfig';

interface SidebarProps {
  isMobileMenuOpen: boolean;
}

export default function Sidebar({ isMobileMenuOpen }: SidebarProps) {
  const { isCollapsed, toggleCollapsed } = useSidebar();
  const { user, userRole, logout } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      data-testid="sidebar"
      data-collapsed={isCollapsed}
      className={clsx(
        "fixed inset-y-0 left-0 z-50 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-all duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0 print:hidden flex flex-col",
        isCollapsed ? "w-16" : "w-64",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Header with logo and user menu */}
      <div className={clsx(
        "flex items-center h-16 border-b border-gray-200 dark:border-gray-700",
        isCollapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        {!isCollapsed ? (
          <>
            {companySettings.logoUrl ? (
              <img
                src={companySettings.logoUrl}
                alt={companySettings.name}
                className="h-10 max-w-[140px] object-contain"
              />
            ) : (
              <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400 truncate">
                {companySettings.name || 'Modern Books'}
              </span>
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
          </>
        ) : (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="p-1 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <User className="h-5 w-5" />
            </button>
            {isUserMenuOpen && (
              <div className="absolute left-full ml-2 top-0 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
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
        )}
      </div>

      {/* Global Search - only when expanded */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <GlobalSearch />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navigationConfig.map(entry => {
          if (isNavGroup(entry)) {
            return (
              <NavGroup
                key={entry.id}
                id={entry.id}
                name={entry.name}
                icon={entry.icon}
                items={entry.items}
                visibilityFlag={entry.visibilityFlag}
              />
            );
          }
          return (
            <NavItem
              key={entry.id}
              name={entry.name}
              href={entry.href}
              icon={entry.icon}
              featureKey={entry.featureKey}
              alwaysVisible={entry.alwaysVisible}
              visibilityFlag={entry.visibilityFlag}
            />
          );
        })}
      </nav>

      {/* Collapse Toggle & Version */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-2">
        <button
          onClick={toggleCollapsed}
          className={clsx(
            "w-full flex items-center rounded-md py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors",
            isCollapsed ? "justify-center px-2" : "px-4"
          )}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="mr-3 h-5 w-5" />
              <span>Collapse</span>
            </>
          )}
        </button>
        {!isCollapsed && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">
            v{__APP_VERSION__}
          </p>
        )}
      </div>
    </div>
  );
}
