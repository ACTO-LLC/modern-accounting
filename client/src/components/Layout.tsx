import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, BookOpen, Settings, Menu, Building2, Upload, CheckCircle, Database, Users, Package, Scale, Truck, BarChart3, FolderOpen, Clock, Tag, MapPin, Warehouse, Receipt } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

export default function Layout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Invoices', href: '/invoices', icon: FileText },
    { name: 'Customers', href: '/customers', icon: Users },
    { name: 'Products & Services', href: '/products-services', icon: Package },
    { name: 'Inventory', href: '/inventory', icon: Warehouse },
    { name: 'Vendors', href: '/vendors', icon: Truck },
    { name: 'Bills', href: '/bills', icon: Receipt },
    { name: 'Projects', href: '/projects', icon: FolderOpen },
    { name: 'Time Tracking', href: '/time-entries', icon: Clock },
    { name: 'Classes', href: '/classes', icon: Tag },
    { name: 'Locations', href: '/locations', icon: MapPin },
    { name: 'Banking', href: '/banking', icon: Building2 },
    { name: 'Journal Entries', href: '/journal-entries', icon: BookOpen },
    { name: 'Import', href: '/import', icon: Upload },
    { name: 'Review', href: '/review', icon: CheckCircle },
    { name: 'Transactions', href: '/transactions', icon: Database },
    { name: 'Reconciliation', href: '/reconciliations', icon: Scale },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className={clsx(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex items-center justify-center h-16 border-b border-gray-200">
          <span className="text-xl font-bold text-indigo-600">Modern Books</span>
        </div>
        <nav className="p-4 space-y-1">
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
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
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
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2">
          <span className="text-lg font-bold text-indigo-600">Modern Books</span>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
