import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { LucideIcon } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useFeatureAccess } from '../../contexts/OnboardingContext';
import { useFeatureFlags, FeatureKey } from '../../contexts/FeatureFlagsContext';
import { useState, useRef, useCallback } from 'react';

interface NavItemProps {
  name: string;
  href: string;
  icon: LucideIcon;
  isNested?: boolean;
  featureKey?: string;
  alwaysVisible?: boolean;
  visibilityFlag?: FeatureKey;
}

export default function NavItem({ name, href, icon: Icon, isNested = false, featureKey, alwaysVisible, visibilityFlag }: NavItemProps) {
  const location = useLocation();
  const { isCollapsed } = useSidebar();
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const linkRef = useRef<HTMLAnchorElement>(null);

  // Check feature access (onboarding)
  const { isAccessible, status: featureStatus } = useFeatureAccess(featureKey);

  // Check admin feature flag visibility
  const { isFeatureEnabled } = useFeatureFlags();
  const isVisibleByFlag = !visibilityFlag || isFeatureEnabled(visibilityFlag);

  const isActive = location.pathname === href ||
    (href !== '/' && location.pathname.startsWith(href));

  const handleMouseEnter = useCallback(() => {
    if (isCollapsed && linkRef.current) {
      const rect = linkRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 8,
      });
      setShowTooltip(true);
    }
  }, [isCollapsed]);

  // Hide item if admin has disabled the feature flag
  // This must be AFTER all hooks to satisfy React's rules of hooks
  if (!isVisibleByFlag) {
    return null;
  }

  // During onboarding, hide items unless they're always visible or accessible
  if (!alwaysVisible && !isAccessible) {
    return null;
  }

  // Visual indicator for feature status
  const showNewBadge = featureKey && featureStatus === 'unlocked';
  const showCompletedIndicator = featureKey && featureStatus === 'completed';

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Link
        ref={linkRef}
        to={href}
        className={clsx(
          "flex items-center rounded-md transition-colors",
          isNested ? "py-1.5" : "py-2",
          isCollapsed ? "justify-center px-2" : (isNested ? "pl-10 pr-4" : "px-4"),
          isActive
            ? "bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
        )}
      >
        <Icon className={clsx("h-5 w-5 flex-shrink-0", !isCollapsed && "mr-3")} />
        {!isCollapsed && (
          <>
            <span className="text-sm font-medium truncate flex-1">{name}</span>
            {showNewBadge && (
              <span className="ml-2 px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded">
                New
              </span>
            )}
            {showCompletedIndicator && (
              <span className="ml-2 text-green-500 dark:text-green-400">✓</span>
            )}
          </>
        )}
      </Link>

      {/* Tooltip when collapsed - fixed position to escape overflow:hidden */}
      {isCollapsed && showTooltip && (
        <div
          className="fixed z-[100] px-2 py-1 text-sm text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg whitespace-nowrap -translate-y-1/2 flex items-center gap-2"
          style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
        >
          {name}
          {showNewBadge && (
            <span className="px-1 py-0.5 text-xs font-medium bg-green-500 text-white rounded">
              New
            </span>
          )}
          {showCompletedIndicator && (
            <span className="text-green-400">✓</span>
          )}
          <div
            className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-700"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
