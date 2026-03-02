import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Activity,
  ArrowRight
} from 'lucide-react';
import { formatDate, formatMonthShort } from '../lib/dateUtils';
import { useOnboarding } from '../contexts/OnboardingContext';
import { useCurrency } from '../contexts/CurrencyContext';
import LearningChecklist from '../components/onboarding/LearningChecklist';
import ErrorBoundary from '../components/ErrorBoundary';

interface JournalEntry {
  Id: string;
  TransactionDate: string;
  Description: string;
  Lines: JournalEntryLine[];
}

interface JournalEntryLine {
  Id: string;
  JournalEntryId: string;
  AccountId: string;
  Debit: number;
  Credit: number;
  Account: {
    Id: string;
    Name: string;
    Type: string;
  };
}

interface BankTransaction {
  Id: string;
  Status: string;
  Amount: number;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface Invoice {
  Id: string;
  TotalAmount: number;
  AmountPaid: number;
  Status: string;
  IssueDate: string;
}

interface Bill {
  Id: string;
  TotalAmount: number;
  AmountPaid: number;
  Status: string;
  BillDate: string;
}

interface Expense {
  Id: string;
  TotalAmount: number;
  Status: string;
  ExpenseDate: string;
}

interface Payment {
  Id: string;
  TotalAmount: number;
  PaymentDate: string;
  Status: string;
  Type: string;
}

export default function Dashboard() {
  const { formatCurrency } = useCurrency();
  const { status: onboardingStatus } = useOnboarding();

  // Show learning checklist for users in training mode
  const showLearningChecklist = onboardingStatus &&
    !onboardingStatus.onboardingCompleted &&
    !onboardingStatus.showAllFeatures &&
    onboardingStatus.experienceLevel;

  // Fetch Journal Entries for Financials
  const { data: journalEntries } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const response = await fetch('/api/journalentries?$orderby=TransactionDate desc');
      if (!response.ok) throw new Error('Failed to fetch journal entries');
      const data = await response.json();
      // We need to fetch lines for calculation. 
      // Ideally DAB would support $expand, but we know it might not.
      // For dashboard summary, we might need a dedicated endpoint or fetch all lines.
      // For now, let's assume we can fetch lines or use a separate query if needed.
      // Actually, let's fetch lines separately to be safe, like we did for Invoices.
      return data.value as JournalEntry[];
    }
  });

  // Fetch Lines separately since we can't rely on $expand
  const { data: allLines } = useQuery({
    queryKey: ['journal-entry-lines'],
    queryFn: async () => {
      const response = await fetch('/api/journalentrylines');
      if (!response.ok) throw new Error('Failed to fetch lines');
      const data = await response.json();
      return data.value as JournalEntryLine[];
    }
  });

  // Fetch Accounts to know Types
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await fetch('/api/accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      const data = await response.json();
      return data.value as Account[];
    }
  });

  // Fetch Bank Transactions for Pending Actions
  const { data: bankTransactions } = useQuery({
    queryKey: ['banktransactions'],
    queryFn: async () => {
      const response = await fetch('/api/banktransactions');
      if (!response.ok) throw new Error('Failed to fetch bank transactions');
      const data = await response.json();
      return data.value as BankTransaction[];
    }
  });

  // Fetch Invoices for Revenue calculation
  const { data: invoices } = useQuery({
    queryKey: ['invoices-dashboard'],
    queryFn: async () => {
      const response = await fetch('/api/invoices');
      if (!response.ok) throw new Error('Failed to fetch invoices');
      const data = await response.json();
      return data.value as Invoice[];
    }
  });

  // Fetch Bills for Expenses calculation
  const { data: bills } = useQuery({
    queryKey: ['bills-dashboard'],
    queryFn: async () => {
      const response = await fetch('/api/bills');
      if (!response.ok) throw new Error('Failed to fetch bills');
      const data = await response.json();
      return data.value as Bill[];
    }
  });

  // Fetch Expenses
  const { data: expenses } = useQuery({
    queryKey: ['expenses-dashboard'],
    queryFn: async () => {
      const response = await fetch('/api/expenses');
      if (!response.ok) throw new Error('Failed to fetch expenses');
      const data = await response.json();
      return data.value as Expense[];
    }
  });

  // Fetch Payments for Cash calculation
  const { data: payments } = useQuery({
    queryKey: ['payments-dashboard'],
    queryFn: async () => {
      const response = await fetch('/api/payments');
      if (!response.ok) throw new Error('Failed to fetch payments');
      const data = await response.json();
      return data.value as Payment[];
    }
  });

  // Calculations - Use journal entries if available, otherwise fall back to transaction data
  let totalRevenue = 0;
  let totalExpenses = 0;
  let cashOnHand = 0;

  const accountMap = new Map(accounts?.map(a => [a.Id, a]) || []);

  // Try to calculate from journal entries first (proper GL)
  if (allLines && accounts && allLines.length > 0) {
    allLines.forEach(line => {
      const account = accountMap.get(line.AccountId);
      if (!account) return;

      // Simple logic: Revenue = Credits to Revenue accounts
      if (account.Type === 'Revenue') {
        totalRevenue += line.Credit - line.Debit;
      }
      // Expenses = Debits to Expense accounts
      else if (account.Type === 'Expense') {
        totalExpenses += line.Debit - line.Credit;
      }
      // Cash = Debits - Credits to Asset accounts (specifically Bank)
      else if (account.Type === 'Asset' && (account.Name.includes('Bank') || account.Name.includes('Checking') || account.Name.includes('Cash'))) {
        cashOnHand += line.Debit - line.Credit;
      }
    });
  } else {
    // Fall back to transaction-based calculations if no journal entries
    // Revenue from paid invoices
    if (invoices) {
      totalRevenue = invoices
        .filter(inv => inv.Status !== 'Cancelled' && inv.Status !== 'Voided')
        .reduce((sum, inv) => sum + (inv.AmountPaid || 0), 0);
    }

    // Expenses from bills and expenses
    if (bills) {
      totalExpenses += bills
        .filter(bill => bill.Status !== 'Cancelled' && bill.Status !== 'Voided')
        .reduce((sum, bill) => sum + (bill.AmountPaid || 0), 0);
    }
    if (expenses) {
      totalExpenses += expenses
        .filter(exp => exp.Status === 'Paid' || exp.Status === 'Approved')
        .reduce((sum, exp) => sum + (exp.TotalAmount || 0), 0);
    }

    // Cash from payments
    if (payments) {
      const completedPayments = payments.filter(p => p.Status === 'Completed');
      // Payments received (from customers)
      const paymentsReceived = completedPayments
        .filter(p => p.Type === 'Received' || p.Type === 'CustomerPayment')
        .reduce((sum, p) => sum + (p.TotalAmount || 0), 0);
      // Payments made (to vendors)
      const paymentsMade = completedPayments
        .filter(p => p.Type === 'Made' || p.Type === 'VendorPayment' || p.Type === 'BillPayment')
        .reduce((sum, p) => sum + (p.TotalAmount || 0), 0);
      cashOnHand = paymentsReceived - paymentsMade;
    }
  }

  const netIncome = totalRevenue - totalExpenses;
  const pendingCount = bankTransactions?.filter(t => t.Status === 'Pending').length || 0;

  // Chart Data Preparation (Last 6 Months)
  const chartData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const month = formatMonthShort(d);
    const year = d.getFullYear();
    const monthStart = new Date(year, d.getMonth(), 1);
    const monthEnd = new Date(year, d.getMonth() + 1, 0);

    let monthRevenue = 0;
    let monthExpenses = 0;

    // Try journal entries first
    if (allLines && journalEntries && allLines.length > 0) {
      const entryDateMap = new Map(journalEntries.map(e => [e.Id, new Date(e.TransactionDate)]));

      allLines.forEach(line => {
        const date = entryDateMap.get(line.JournalEntryId as string);
        if (date && date.getMonth() === d.getMonth() && date.getFullYear() === year) {
          const account = accountMap.get(line.AccountId);
          if (account?.Type === 'Revenue') monthRevenue += line.Credit - line.Debit;
          if (account?.Type === 'Expense') monthExpenses += line.Debit - line.Credit;
        }
      });
    } else {
      // Fall back to transaction data
      if (invoices) {
        monthRevenue = invoices
          .filter(inv => {
            const issueDate = new Date(inv.IssueDate);
            return inv.Status !== 'Cancelled' && inv.Status !== 'Voided' &&
              issueDate >= monthStart && issueDate <= monthEnd;
          })
          .reduce((sum, inv) => sum + (inv.AmountPaid || 0), 0);
      }

      if (bills) {
        monthExpenses += bills
          .filter(bill => {
            const billDate = new Date(bill.BillDate);
            return bill.Status !== 'Cancelled' && bill.Status !== 'Voided' &&
              billDate >= monthStart && billDate <= monthEnd;
          })
          .reduce((sum, bill) => sum + (bill.AmountPaid || 0), 0);
      }

      if (expenses) {
        monthExpenses += expenses
          .filter(exp => {
            const expDate = new Date(exp.ExpenseDate);
            return (exp.Status === 'Paid' || exp.Status === 'Approved') &&
              expDate >= monthStart && expDate <= monthEnd;
          })
          .reduce((sum, exp) => sum + (exp.TotalAmount || 0), 0);
      }
    }

    chartData.push({
      name: month,
      Income: monthRevenue,
      Expenses: monthExpenses
    });
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">Financial overview and pending actions</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Revenue</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(totalRevenue)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingDown className="h-6 w-6 text-red-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Expenses</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(totalExpenses)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Net Income</dt>
                  <dd className={`text-lg font-medium ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(netIncome)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Activity className="h-6 w-6 text-blue-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Cash on Hand</dt>
                  <dd className="text-lg font-medium text-gray-900">{formatCurrency(cashOnHand)}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Area */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Cash Flow (Last 6 Months)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Income" fill="#10B981" />
                <Bar dataKey="Expenses" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sidebar: Learning Progress, Pending Actions & Recent Activity */}
        <div className="space-y-8">
          {/* Learning Checklist - shown for users in training mode */}
          {showLearningChecklist && (
            <ErrorBoundary
              fallback={
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Unable to load learning progress. Visit Settings to view your full learning path.
                  </p>
                </div>
              }
            >
              <LearningChecklist compact maxItems={4} />
            </ErrorBoundary>
          )}

          {/* Pending Actions */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Pending Actions</h3>
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    You have <span className="font-bold">{pendingCount}</span> Unreviewed Transactions.
                  </p>
                  <div className="mt-4">
                    <Link
                      to="/review"
                      className="text-sm font-medium text-yellow-700 hover:text-yellow-600 flex items-center"
                    >
                      Review Now <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Activity</h3>
            <ul className="divide-y divide-gray-200">
              {journalEntries?.slice(0, 5).map((entry) => (
                <li key={entry.Id} className="py-4">
                  <div className="flex space-x-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">{entry.Description}</h3>
                        <p className="text-sm text-gray-500">{formatDate(entry.TransactionDate)}</p>
                      </div>
                      <p className="text-sm text-gray-500">Journal Entry</p>
                    </div>
                  </div>
                </li>
              ))}
              {!journalEntries?.length && (
                <li className="py-4 text-sm text-gray-500">No recent activity</li>
              )}
            </ul>
            <div className="mt-6">
              <Link to="/journal-entries" className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                View All Activity
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
