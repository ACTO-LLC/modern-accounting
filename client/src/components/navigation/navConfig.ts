import { LucideIcon, LayoutDashboard, FileText, ClipboardList, Users, Package, Warehouse, Truck, UserCheck, DollarSign, Receipt, FolderOpen, Clock, Tag, MapPin, RefreshCw, Layers, Building2, BookOpen, Upload, Database, Scale, BarChart3, MessageSquare, Sparkles, Settings, ShoppingCart, Percent, CreditCard, FileUp, CheckSquare, FileMinus, Car, ListFilter, Banknote, History } from 'lucide-react';

export interface NavItem {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  featureKey?: string; // Maps to MA MCP feature key for onboarding
  alwaysVisible?: boolean; // If true, shown regardless of onboarding state
}

export interface NavGroup {
  id: string;
  name: string;
  icon: LucideIcon;
  items: NavItem[];
  featureKey?: string; // If set, entire group is gated by this feature
}

export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return 'items' in entry;
}

// Feature key mapping to MCP feature keys
// Items without featureKey are always visible (not part of onboarding)
export const navigationConfig: NavEntry[] = [
  // Dashboard - always visible
  {
    id: 'dashboard',
    name: 'Dashboard',
    href: '/',
    icon: LayoutDashboard,
    alwaysVisible: true,
  },

  // Sales group
  {
    id: 'sales',
    name: 'Sales',
    icon: FileText,
    items: [
      { id: 'invoices', name: 'Invoices', href: '/invoices', icon: FileText, featureKey: 'invoices' },
      { id: 'sales-receipts', name: 'Sales Receipts', href: '/sales-receipts', icon: Banknote, featureKey: 'sales_receipts' },
      { id: 'estimates', name: 'Estimates', href: '/estimates', icon: ClipboardList, featureKey: 'estimates' },
    ],
  },

  // Purchasing group
  {
    id: 'purchasing',
    name: 'Purchasing',
    icon: Receipt,
    items: [
      { id: 'purchase-orders', name: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart },
      { id: 'bills', name: 'Bills', href: '/bills', icon: Receipt, featureKey: 'bills' },
      { id: 'vendor-credits', name: 'Vendor Credits', href: '/vendor-credits', icon: FileMinus },
      { id: 'expenses', name: 'Expenses', href: '/expenses', icon: CreditCard, featureKey: 'expenses' },
      { id: 'mileage', name: 'Mileage', href: '/mileage', icon: Car },
    ],
  },

  // People group
  {
    id: 'people',
    name: 'People',
    icon: Users,
    items: [
      { id: 'customers', name: 'Customers', href: '/customers', icon: Users, featureKey: 'customers' },
      { id: 'vendors', name: 'Vendors', href: '/vendors', icon: Truck, featureKey: 'vendors' },
      { id: 'employees', name: 'Employees', href: '/employees', icon: UserCheck },
    ],
  },

  // Products & Inventory group
  {
    id: 'products',
    name: 'Products',
    icon: Package,
    items: [
      { id: 'products-services', name: 'Products & Services', href: '/products-services', icon: Package, featureKey: 'products_services' },
      { id: 'inventory', name: 'Inventory', href: '/inventory', icon: Warehouse },
    ],
  },

  // Payroll group - not part of initial onboarding
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

  // Import & Sync group - not part of initial onboarding
  {
    id: 'import-sync',
    name: 'Import & Sync',
    icon: Building2,
    items: [
      { id: 'banking', name: 'Bank Connections', href: '/plaid-connections', icon: Building2 },
      { id: 'bank-import', name: 'Bank Import', href: '/bank-import', icon: FileUp },
      { id: 'bank-import-matches', name: 'Review Matches', href: '/bank-import/matches', icon: CheckSquare },
      { id: 'bank-rules', name: 'Bank Rules', href: '/bank-rules', icon: ListFilter },
      { id: 'import', name: 'Import CSV', href: '/import', icon: Upload },
    ],
  },

  // Accounting group
  {
    id: 'accounting',
    name: 'Accounting',
    icon: BookOpen,
    items: [
      { id: 'accounts', name: 'Chart of Accounts', href: '/accounts', icon: Layers, featureKey: 'chart_of_accounts' },
      { id: 'journal-entries', name: 'Journal Entries', href: '/journal-entries', icon: BookOpen, featureKey: 'journal_entries' },
      { id: 'tax-rates', name: 'Tax Rates', href: '/tax-rates', icon: Percent },
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
    featureKey: 'reports',
  },

  // Feedback - standalone (always visible)
  {
    id: 'submissions',
    name: 'Feedback',
    href: '/submissions',
    icon: MessageSquare,
    alwaysVisible: true,
  },

  // AI Enhancements - standalone (always visible)
  {
    id: 'admin-enhancements',
    name: 'AI Enhancements',
    href: '/admin/enhancements',
    icon: Sparkles,
    alwaysVisible: true,
  },

  // Audit Log - standalone (always visible)
  {
    id: 'audit-log',
    name: 'Audit Log',
    href: '/admin/audit-log',
    icon: History,
    alwaysVisible: true,
  },

  // Settings - standalone (always visible)
  {
    id: 'settings',
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    alwaysVisible: true,
  },
];
