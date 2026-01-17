import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, LucideIcon } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';
import { NavItem as NavItemType } from './navConfig';

interface NavGroupProps {
  id: string;
  name: string;
  icon: LucideIcon;
  items: NavItemType[];
}

export default function NavGroup({ id, name, icon: Icon, items }: NavGroupProps) {
  const location = useLocation();
  const { isCollapsed, isGroupExpanded, toggleGroup } = useSidebar();
  const [showFlyout, setShowFlyout] = useState(false);

  const isExpanded = isGroupExpanded(id);

  // Check if any child is active
  const hasActiveChild = items.some(item =>
    location.pathname === item.href ||
    (item.href !== '/' && location.pathname.startsWith(item.href))
  );

  // Expanded sidebar mode - show inline expandable list
  if (!isCollapsed) {
    return (
      <div className="space-y-0.5">
        <button
          onClick={() => toggleGroup(id)}
          className={clsx(
            "w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors",
            hasActiveChild
              ? "text-indigo-700 dark:text-indigo-300"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
          )}
        >
          <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
          <span className="flex-1 text-left truncate">{name}</span>
          <ChevronRight
            className={clsx(
              "h-4 w-4 transition-transform duration-200",
              isExpanded && "rotate-90"
            )}
          />
        </button>

        {/* Expanded children */}
        <div
          className={clsx(
            "overflow-hidden transition-all duration-200",
            isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          )}
        >
          {items.map(item => {
            const ItemIcon = item.icon;
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));

            return (
              <Link
                key={item.id}
                to={item.href}
                className={clsx(
                  "flex items-center pl-10 pr-4 py-1.5 text-sm rounded-md transition-colors",
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
                )}
              >
                <ItemIcon className="mr-3 h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // Collapsed sidebar mode - show flyout on hover
  return (
    <div
      className="relative"
      onMouseEnter={() => setShowFlyout(true)}
      onMouseLeave={() => setShowFlyout(false)}
    >
      <button
        className={clsx(
          "w-full flex items-center justify-center px-2 py-2 rounded-md transition-colors",
          hasActiveChild
            ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
        )}
      >
        <Icon className="h-5 w-5" />
      </button>

      {/* Flyout menu */}
      {showFlyout && (
        <div className="absolute left-full top-0 ml-2 z-50 min-w-48 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {name}
          </div>
          {items.map(item => {
            const ItemIcon = item.icon;
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));

            return (
              <Link
                key={item.id}
                to={item.href}
                className={clsx(
                  "flex items-center px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                )}
              >
                <ItemIcon className="mr-3 h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
          {/* Arrow pointer */}
          <div className="absolute left-0 top-3 -translate-x-full border-8 border-transparent border-r-white dark:border-r-gray-800" />
        </div>
      )}
    </div>
  );
}
