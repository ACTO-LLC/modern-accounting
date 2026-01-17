import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { LucideIcon } from 'lucide-react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useState } from 'react';

interface NavItemProps {
  name: string;
  href: string;
  icon: LucideIcon;
  isNested?: boolean;
}

export default function NavItem({ name, href, icon: Icon, isNested = false }: NavItemProps) {
  const location = useLocation();
  const { isCollapsed } = useSidebar();
  const [showTooltip, setShowTooltip] = useState(false);

  const isActive = location.pathname === href ||
    (href !== '/' && location.pathname.startsWith(href));

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Link
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
          <span className="text-sm font-medium truncate">{name}</span>
        )}
      </Link>

      {/* Tooltip when collapsed */}
      {isCollapsed && showTooltip && (
        <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2 py-1 text-sm text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg whitespace-nowrap">
          {name}
          <div 
            className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-700"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}
