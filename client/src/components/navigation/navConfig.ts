import { LucideIcon, LayoutDashboard, FileText, ClipboardList, Users, Package, Warehouse, Truck, UserCheck, DollarSign, Receipt, FolderOpen, Clock, Tag, MapPin, RefreshCw, Layers, Building2, BookOpen, Upload, Database, Scale, BarChart3, MessageSquare, Sparkles, Settings, ShoppingCart } from 'lucide-react';

export interface NavItem {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  name: string;
  icon: LucideIcon;
  items: NavItem[];
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

export const navigationConfig: NavEntry[] = [
  // Dashboard - standalone
  {
    id: 'dashboard',
    name: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
  },

  // Sales group
  {
    id: 'sales',
    name: 'Sales',
    icon: FileText,
    items: [
      { id: 'invoices', name: 'Invoices', href: '/invoices', icon: FileText },
      { id: 'estimates', name: 'Estimates', href: '/estimates', icon: ClipboardList },
    ],
  },

  // Purchasing group
  {
    id: 'purchasing',
    name: 'Purchasing',
    icon: Receipt,
    items: [
      { id: 'purchase-orders', name: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart },
      { id: 'bills', name: 'Bills', href: '/bills', icon: Receipt },
    ],
  },

  // People group
  {
    id: 'people',
    name: 'People',
    icon: Users,
    items: [
      { id: 'customers', name: 'Customers', href: '/customers', icon: Users },
      { id: 'vendors', name: 'Vendors', href: '/vendors', icon: Truck },
      { id: 'employees', name: 'Employees', href: '/employees', icon: UserCheck },
    ],
  },

  // Products & Inventory group
  {
    id: 'products',
    name: 'Products',
    icon: Package,
    items: [
      { id: 'products-services', name: 'Products & Services', href: '/products-services', icon: Package },
      { id: 'inventory', name: 'Inventory', href: '/inventory', icon: Warehouse },
    ],
  },

  // Payroll group
  {
    id: 'payroll',
    name: 'Payroll',
    icon: DollarSign,
    items: [
      { id: 'payruns', name: 'Run Payroll', href: '/payruns', icon: DollarSign },
      { id: 'time-entries', name: 'Time Tracking', href: '/time-entries', icon: Clock },
    ],
  },

  // Projects - standalone
  {
    id: 'projects',
    name: 'Projects',
    href: '/projects',
    icon: FolderOpen,
  },

  // Transactions - standalone
  {
    id: 'transactions',
    name: 'Transactions',
    href: '/transactions',
    icon: Database,
  },

  // Import & Sync group
  {
    id: 'import-sync',
    name: 'Import & Sync',
    icon: Building2,
    items: [
      { id: 'banking', name: 'Bank Connections', href: '/plaid-connections', icon: Building2 },
      { id: 'import', name: 'Import CSV', href: '/import', icon: Upload },
    ],
  },

  // Accounting group
  {
    id: 'accounting',
    name: 'Accounting',
    icon: BookOpen,
    items: [
      { id: 'accounts', name: 'Chart of Accounts', href: '/accounts', icon: Layers },
      { id: 'journal-entries', name: 'Journal Entries', href: '/journal-entries', icon: BookOpen },
      { id: 'classes', name: 'Classes', href: '/classes', icon: Tag },
      { id: 'locations', name: 'Locations', href: '/locations', icon: MapPin },
      { id: 'recurring', name: 'Recurring', href: '/recurring', icon: RefreshCw },
    ],
  },

  // Reconciliation - standalone
  {
    id: 'reconciliations',
    name: 'Reconciliation',
    href: '/reconciliations',
    icon: Scale,
  },

  // Reports - standalone
  {
    id: 'reports',
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
  },

  // Feedback - standalone
  {
    id: 'submissions',
    name: 'Feedback',
    href: '/submissions',
    icon: MessageSquare,
  },

  // AI Enhancements - standalone
  {
    id: 'admin-enhancements',
    name: 'AI Enhancements',
    href: '/admin/enhancements',
    icon: Sparkles,
  },

  // Settings - standalone
  {
    id: 'settings',
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
];
