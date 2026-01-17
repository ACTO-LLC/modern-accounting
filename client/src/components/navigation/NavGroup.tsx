import { useState, useRef, useCallback, useEffect } from 'react';
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
  const [flyoutPosition, setFlyoutPosition] = useState({ top: 0, left: 0 });
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);

  // Calculate flyout position based on button location
  const updateFlyoutPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setFlyoutPosition({
        top: rect.top,
        left: rect.right + 12, // 12px gap for the bridge
      });
    }
  }, []);

  // Open flyout immediately, but delay close to allow mouse to travel to flyout
  const openFlyout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    updateFlyoutPosition();
    setShowFlyout(true);
  }, [updateFlyoutPosition]);

  const closeFlyout = useCallback(() => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowFlyout(false);
    }, 150); // 150ms delay allows mouse to travel to flyout
  }, []);

  // Handle click outside to close flyout
  useEffect(() => {
    if (!showFlyout) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        flyoutRef.current && !flyoutRef.current.contains(target)
      ) {
        setShowFlyout(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFlyout]);

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

        {/* Expanded children - only render when expanded for cleaner DOM */}
        {isExpanded && (
          <div className="overflow-hidden">
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
        )}
      </div>
    );
  }

  // Collapsed sidebar mode - show flyout on hover or click
  return (
    <>
      <div
        className="relative"
        onMouseEnter={openFlyout}
        onMouseLeave={closeFlyout}
      >
        <button
          ref={buttonRef}
          onClick={() => {
            updateFlyoutPosition();
            setShowFlyout(!showFlyout);
          }}
          className={clsx(
            "w-full flex items-center justify-center px-2 py-2 rounded-md transition-colors",
            hasActiveChild
              ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
          )}
        >
          <Icon className="h-5 w-5" />
        </button>
      </div>

      {/* Flyout menu - using fixed position to escape overflow:hidden */}
      {showFlyout && (
        <div
          ref={flyoutRef}
          className="fixed z-[100]"
          style={{ top: flyoutPosition.top, left: flyoutPosition.left }}
          onMouseEnter={openFlyout}
          onMouseLeave={closeFlyout}
        >
          <div className="min-w-48 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
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
                  onClick={() => setShowFlyout(false)}
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
        </div>
      )}
    </>
  );
}
