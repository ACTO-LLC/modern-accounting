import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DateRangePicker, ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import { formatDateLong } from '../../lib/dateUtils';

interface Account { Id: string; Name: string; Type: string; Subtype: string | null; }
interface JournalEntry { Id: string; TransactionDate: string; }
interface JournalEntryLine { Id: string; JournalEntryId: string; AccountId: string; Debit: number; Credit: number; }

export default function ProfitAndLoss() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);

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

  const reportData = useMemo(() => {
    if (!accounts || !journalEntries || !lines) {
      return {
        revenueAccounts: [],
        expenseAccounts: [],
        totalRevenue: 0,
        totalExpenses: 0,
      };
    }

    const accountMap = new Map(accounts.map((a) => [a.Id, a]));
    const entryDateMap = new Map(
      journalEntries.map((e) => [e.Id, new Date(e.TransactionDate)])
    );

    // Parse dates explicitly to avoid timezone issues
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    const filteredLines = lines.filter((line) => {
      const date = entryDateMap.get(line.JournalEntryId);
      return date && date >= start && date <= end;
    });

    const accountTotals = new Map<string, number>();
    filteredLines.forEach((line) => {
      const account = accountMap.get(line.AccountId);
      if (!account) return;

      const current = accountTotals.get(line.AccountId) || 0;
      if (account.Type === 'Revenue') {
        accountTotals.set(line.AccountId, current + (line.Credit - line.Debit));
      } else if (account.Type === 'Expense') {
        accountTotals.set(line.AccountId, current + (line.Debit - line.Credit));
      }
    });

    const revenueAccounts: { account: Account; balance: number }[] = [];
    const expenseAccounts: { account: Account; balance: number }[] = [];

    accountTotals.forEach((balance, accountId) => {
      const account = accountMap.get(accountId);
      if (!account || balance === 0) return;

      if (account.Type === 'Revenue') {
        revenueAccounts.push({ account, balance });
      } else if (account.Type === 'Expense') {
        expenseAccounts.push({ account, balance });
      }
    });

    revenueAccounts.sort((a, b) => a.account.Name.localeCompare(b.account.Name));
    expenseAccounts.sort((a, b) => a.account.Name.localeCompare(b.account.Name));

    return {
      revenueAccounts,
      expenseAccounts,
      totalRevenue: revenueAccounts.reduce((sum, a) => sum + a.balance, 0),
      totalExpenses: expenseAccounts.reduce((sum, a) => sum + a.balance, 0),
    };
  }, [accounts, journalEntries, lines, startDate, endDate]);

  const columns: ReportColumn[] = [
    { key: 'name', header: 'Account', align: 'left' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      format: (value) => (value !== undefined ? formatCurrency(value) : ''),
    },
  ];

  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [
      { name: 'Revenue', amount: undefined, isHeader: true },
    ];

    reportData.revenueAccounts.forEach(({ account, balance }) =>
      rows.push({ name: account.Name, amount: balance, indent: 1 })
    );

    rows.push(
      { name: 'Total Revenue', amount: reportData.totalRevenue, isSubtotal: true },
      { name: '', amount: undefined },
      { name: 'Expenses', amount: undefined, isHeader: true }
    );

    reportData.expenseAccounts.forEach(({ account, balance }) =>
      rows.push({ name: account.Name, amount: balance, indent: 1 })
    );

    rows.push(
      { name: 'Total Expenses', amount: reportData.totalExpenses, isSubtotal: true },
      { name: '', amount: undefined },
      {
        name: 'Net Income',
        amount: reportData.totalRevenue - reportData.totalExpenses,
        isTotal: true,
      }
    );

    return rows;
  }, [reportData]);

  const handleExportCSV = () =>
    exportToCSV(`profit-loss-${startDate}-to-${endDate}`, columns, tableData);

  const formatDateRange = () =>
    `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;

  if (isLoading) {
    return <div className="max-w-4xl mx-auto p-4">Loading profit and loss report...</div>;
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading the report.';
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load profit and loss data.</p>
        <p className="text-gray-600 mt-2">{message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
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
        title="Profit & Loss Statement"
        subtitle="Income Statement"
        dateRange={formatDateRange()}
        onExportCSV={handleExportCSV}
      />
      <div className="mb-6">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <ReportTable columns={columns} data={tableData} />
      </div>
      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs">
        <p>
          Generated on{' '}
          {formatDateLong(new Date())}
        </p>
      </div>
    </div>
  );
}
