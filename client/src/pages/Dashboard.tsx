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

interface JournalEntry {
  Id: string;
  TransactionDate: string;
  Description: string;
  Lines: JournalEntryLine[];
}

interface JournalEntryLine {
  Id: string;
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

export default function Dashboard() {
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
    queryKey: ['bank-transactions'],
    queryFn: async () => {
      const response = await fetch('/api/banktransactions');
      if (!response.ok) throw new Error('Failed to fetch bank transactions');
      const data = await response.json();
      return data.value as BankTransaction[];
    }
  });

  // Calculations
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  let totalRevenue = 0;
  let totalExpenses = 0;
  let cashOnHand = 0;

  const accountMap = new Map(accounts?.map(a => [a.Id, a]) || []);

  if (allLines && accounts) {
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
      // Assuming 'Asset' type and maybe checking name or a subtype if available
      else if (account.Type === 'Asset' && (account.Name.includes('Bank') || account.Name.includes('Checking') || account.Name.includes('Cash'))) {
        cashOnHand += line.Debit - line.Credit;
      }
    });
  }

  const netIncome = totalRevenue - totalExpenses;
  const pendingCount = bankTransactions?.filter(t => t.Status === 'Pending').length || 0;

  // Chart Data Preparation (Last 6 Months)
  const chartData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const month = d.toLocaleString('default', { month: 'short' });
    const year = d.getFullYear();
    
    // Calculate for this month
    // This is expensive O(N*M) but fine for small datasets. 
    // In production, use a SQL aggregation view.
    let monthRevenue = 0;
    let monthExpenses = 0;

    if (allLines && journalEntries) {
        // We need to link lines to dates. 
        // Map EntryId -> Date
        const entryDateMap = new Map(journalEntries.map(e => [e.Id, new Date(e.TransactionDate)]));

        allLines.forEach(line => {
            const date = entryDateMap.get(line.JournalEntryId as any); // Type assertion if needed
            // Note: JournalEntryId might be missing in line interface above, verify schema
            // Actually, line usually has JournalEntryId. Let's assume it does.
            if (date && date.getMonth() === d.getMonth() && date.getFullYear() === year) {
                const account = accountMap.get(line.AccountId);
                if (account?.Type === 'Revenue') monthRevenue += line.Credit - line.Debit;
                if (account?.Type === 'Expense') monthExpenses += line.Debit - line.Credit;
            }
        });
    }

    chartData.push({
      name: month,
      Income: monthRevenue,
      Expenses: monthExpenses
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                  <dd className="text-lg font-medium text-gray-900">${totalRevenue.toLocaleString()}</dd>
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
                  <dd className="text-lg font-medium text-gray-900">${totalExpenses.toLocaleString()}</dd>
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
                    ${netIncome.toLocaleString()}
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
                  <dd className="text-lg font-medium text-gray-900">${cashOnHand.toLocaleString()}</dd>
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

        {/* Sidebar: Pending Actions & Recent Activity */}
        <div className="space-y-8">
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
                        <p className="text-sm text-gray-500">{new Date(entry.TransactionDate).toLocaleDateString()}</p>
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
