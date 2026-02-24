import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DateRangePicker, ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import { formatDateShort, formatDateLong } from '../../lib/dateUtils';

interface Account {
  Id: string;
  Name: string;
  Type: string;
  Subtype: string | null;
}

interface JournalEntry {
  Id: string;
  TransactionDate: string;
  Description: string;
  Reference: string | null;
}

interface JournalEntryLine {
  Id: string;
  JournalEntryId: string;
  AccountId: string;
  Description: string | null;
  Debit: number;
  Credit: number;
}

interface TransactionDetail {
  date: string;
  type: string;
  num: string;
  name: string;
  memo: string;
  debit: number;
  credit: number;
}

export default function TransactionDetail() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  const {
    data: accounts,
    isLoading: accountsLoading,
    error: accountsError,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const r = await fetch('/api/accounts');
      if (!r.ok) {
        throw new Error('Failed to load accounts');
      }
      const d = await r.json();
      return d.value as Account[];
    },
  });

  const {
    data: journalEntries,
    isLoading: journalEntriesLoading,
    error: journalEntriesError,
  } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const r = await fetch('/api/journalentries');
      if (!r.ok) {
        throw new Error('Failed to load journal entries');
      }
      const d = await r.json();
      return d.value as JournalEntry[];
    },
  });

  const {
    data: lines,
    isLoading: linesLoading,
    error: linesError,
  } = useQuery({
    queryKey: ['journal-entry-lines'],
    queryFn: async () => {
      const r = await fetch('/api/journalentrylines');
      if (!r.ok) {
        throw new Error('Failed to load journal entry lines');
      }
      const d = await r.json();
      return d.value as JournalEntryLine[];
    },
  });

  const isLoading = accountsLoading || journalEntriesLoading || linesLoading;
  const error = accountsError || journalEntriesError || linesError;

  // Sort accounts by type then name for the dropdown
  const sortedAccounts = useMemo(() => {
    if (!accounts) return [];
    const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    return [...accounts].sort((a, b) => {
      const typeCompare = typeOrder.indexOf(a.Type) - typeOrder.indexOf(b.Type);
      if (typeCompare !== 0) return typeCompare;
      return a.Name.localeCompare(b.Name);
    });
  }, [accounts]);

  const reportData = useMemo(() => {
    if (!accounts || !journalEntries || !lines) {
      return { accountGroups: [], grandTotalDebits: 0, grandTotalCredits: 0 };
    }

    const accountMap = new Map(accounts.map((a) => [a.Id, a]));
    const entryMap = new Map(journalEntries.map((e) => [e.Id, e]));

    // Parse dates explicitly to avoid timezone issues
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    // Filter lines by date range and optionally by account
    const filteredLines = lines.filter((line) => {
      const entry = entryMap.get(line.JournalEntryId);
      if (!entry) return false;

      const date = new Date(entry.TransactionDate);
      if (date < start || date > end) return false;

      if (selectedAccountId !== 'all' && line.AccountId !== selectedAccountId) {
        return false;
      }

      return true;
    });

    // Group by account
    const accountTransactions = new Map<string, TransactionDetail[]>();

    filteredLines.forEach((line) => {
      const entry = entryMap.get(line.JournalEntryId);
      if (!entry) return;

      const transaction: TransactionDetail = {
        date: formatDateShort(entry.TransactionDate),
        type: 'Journal Entry',
        num: entry.Reference || entry.Id.slice(0, 8),
        name: entry.Description,
        memo: line.Description || '',
        debit: line.Debit,
        credit: line.Credit,
      };

      const existing = accountTransactions.get(line.AccountId) || [];
      existing.push(transaction);
      accountTransactions.set(line.AccountId, existing);
    });

    // Build account groups with totals
    const accountGroups: {
      account: Account;
      transactions: TransactionDetail[];
      totalDebits: number;
      totalCredits: number;
    }[] = [];

    // Sort accounts by type then name
    const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
    const sortedAccountIds = Array.from(accountTransactions.keys()).sort((a, b) => {
      const accountA = accountMap.get(a);
      const accountB = accountMap.get(b);
      if (!accountA || !accountB) return 0;
      const typeCompare = typeOrder.indexOf(accountA.Type) - typeOrder.indexOf(accountB.Type);
      if (typeCompare !== 0) return typeCompare;
      return accountA.Name.localeCompare(accountB.Name);
    });

    let grandTotalDebits = 0;
    let grandTotalCredits = 0;

    sortedAccountIds.forEach((accountId) => {
      const account = accountMap.get(accountId);
      if (!account) return;

      const transactions = accountTransactions.get(accountId) || [];
      // Sort transactions by date
      transactions.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });

      const totalDebits = transactions.reduce((sum, t) => sum + t.debit, 0);
      const totalCredits = transactions.reduce((sum, t) => sum + t.credit, 0);

      grandTotalDebits += totalDebits;
      grandTotalCredits += totalCredits;

      accountGroups.push({
        account,
        transactions,
        totalDebits,
        totalCredits,
      });
    });

    return { accountGroups, grandTotalDebits, grandTotalCredits };
  }, [accounts, journalEntries, lines, startDate, endDate, selectedAccountId]);

  const columns: ReportColumn[] = [
    { key: 'date', header: 'Date', align: 'left' },
    { key: 'type', header: 'Type', align: 'left' },
    { key: 'num', header: 'Num', align: 'left' },
    { key: 'name', header: 'Name', align: 'left' },
    { key: 'memo', header: 'Memo', align: 'left' },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      format: (value) => (value ? formatCurrency(value) : ''),
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      format: (value) => (value ? formatCurrency(value) : ''),
    },
  ];

  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [];

    reportData.accountGroups.forEach(({ account, transactions, totalDebits, totalCredits }) => {
      // Account header
      rows.push({
        date: account.Name,
        type: '',
        num: '',
        name: '',
        memo: '',
        debit: undefined,
        credit: undefined,
        isHeader: true,
      });

      // Transaction rows
      transactions.forEach((t) => {
        rows.push({
          date: t.date,
          type: t.type,
          num: t.num,
          name: t.name,
          memo: t.memo,
          debit: t.debit || undefined,
          credit: t.credit || undefined,
          indent: 1,
        });
      });

      // Account subtotal
      rows.push({
        date: `Total ${account.Name}`,
        type: '',
        num: '',
        name: '',
        memo: '',
        debit: totalDebits,
        credit: totalCredits,
        isSubtotal: true,
      });

      // Blank row between accounts
      rows.push({
        date: '',
        type: '',
        num: '',
        name: '',
        memo: '',
        debit: undefined,
        credit: undefined,
      });
    });

    // Grand total
    if (reportData.accountGroups.length > 0) {
      rows.push({
        date: 'GRAND TOTAL',
        type: '',
        num: '',
        name: '',
        memo: '',
        debit: reportData.grandTotalDebits,
        credit: reportData.grandTotalCredits,
        isTotal: true,
      });
    }

    return rows;
  }, [reportData]);

  const handleExportCSV = () =>
    exportToCSV(`transaction-detail-${startDate}-to-${endDate}`, columns, tableData);

  const formatDateRange = () =>
    `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;

  if (isLoading) {
    return <div className="max-w-6xl mx-auto p-4">Loading transaction detail report...</div>;
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading the report.';
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load transaction detail data.</p>
        <p className="text-gray-600 mt-2">{message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 print:hidden">
        <Link
          to="/reports"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Reports
        </Link>
      </div>
      <ReportHeader
        title="Transaction Detail by Account"
        subtitle="All transactions affecting selected accounts"
        dateRange={formatDateRange()}
        onExportCSV={handleExportCSV}
      />
      <div className="mb-6 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <div className="flex items-center gap-2">
            <label htmlFor="accountFilter" className="text-sm font-medium text-gray-700">
              Account:
            </label>
            <select
              id="accountFilter"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="all">All Accounts</option>
              {sortedAccounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name} ({account.Type})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {reportData.accountGroups.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <p className="text-gray-500">No transactions found for the selected criteria.</p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <ReportTable columns={columns} data={tableData} />
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs">
        <p>
          Generated on{' '}
          {formatDateLong(new Date())}
        </p>
      </div>
    </div>
  );
}
