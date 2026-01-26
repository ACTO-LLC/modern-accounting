import { Link } from 'react-router-dom';
import { TrendingUp, Scale, List, Clock, ClipboardList, DollarSign, Receipt, CreditCard, FileText, Users, FileSearch, Car, BookOpen } from 'lucide-react';

const reports = [
  {
    name: 'Profit & Loss',
    description: 'Income statement showing revenues, expenses, and net income over a period',
    href: '/reports/profit-loss',
    icon: TrendingUp,
    color: 'bg-green-100 text-green-600',
  },
  {
    name: 'Balance Sheet',
    description: 'Statement of financial position showing assets, liabilities, and equity',
    href: '/reports/balance-sheet',
    icon: Scale,
    color: 'bg-blue-100 text-blue-600',
  },
  {
    name: 'Trial Balance',
    description: 'List of all accounts with their debit and credit balances',
    href: '/reports/trial-balance',
    icon: List,
    color: 'bg-purple-100 text-purple-600',
  },
  {
    name: 'General Ledger',
    description: 'All transactions by account with running balances and beginning/ending balances',
    href: '/reports/general-ledger',
    icon: BookOpen,
    color: 'bg-slate-100 text-slate-600',
  },
  {
    name: 'Transaction Detail by Account',
    description: 'All transactions affecting specific accounts with full details',
    href: '/reports/transaction-detail',
    icon: FileSearch,
    color: 'bg-cyan-100 text-cyan-600',
  },
  {
    name: 'AR Aging Summary',
    description: 'Outstanding customer invoices organized by age',
    href: '/reports/ar-aging',
    icon: Clock,
    color: 'bg-orange-100 text-orange-600',
  },
  {
    name: 'AP Aging Summary',
    description: 'Outstanding vendor bills organized by age',
    href: '/reports/ap-aging',
    icon: ClipboardList,
    color: 'bg-red-100 text-red-600',
  },
  {
    name: 'Customer Statement',
    description: 'Account activity and outstanding balances for a customer',
    href: '/reports/customer-statement',
    icon: Users,
    color: 'bg-cyan-100 text-cyan-600',
  },
  {
    name: 'Payroll Summary',
    description: 'Summary of payroll runs, gross pay, deductions, and net pay',
    href: '/reports/payroll-summary',
    icon: DollarSign,
    color: 'bg-teal-100 text-teal-600',
  },
  {
    name: 'Sales Tax Liability',
    description: 'Tax collected on invoices by tax rate and period',
    href: '/reports/sales-tax',
    icon: Receipt,
    color: 'bg-rose-100 text-rose-600',
  },
  {
    name: 'Expense Report',
    description: 'Expenses grouped by category, vendor, or project',
    href: '/reports/expenses',
    icon: CreditCard,
    color: 'bg-amber-100 text-amber-600',
  },
  {
    name: 'Mileage Report',
    description: 'Business mileage summary with tax deduction calculations',
    href: '/reports/mileage',
    icon: Car,
    color: 'bg-lime-100 text-lime-600',
  },
  {
    name: 'Tax Forms (W-2/1099)',
    description: 'Generate W-2 forms for employees and 1099-NEC for contractors',
    href: '/tax-forms',
    icon: FileText,
    color: 'bg-indigo-100 text-indigo-600',
  },
];

export default function Reports() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate and view financial reports for your business
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((report) => (
          <Link
            key={report.name}
            to={report.href}
            className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${report.color}`}>
                <report.icon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{report.name}</h2>
                <p className="mt-1 text-sm text-gray-500">{report.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
