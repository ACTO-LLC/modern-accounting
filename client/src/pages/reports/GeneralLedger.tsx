import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DateRangePicker, ReportHeader, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import { formatDateShort, formatDateLong, formatDateTime } from '../../lib/dateUtils';

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

interface TransactionWithBalance {
  id: string;
  journalEntryId: string;
  date: string;
  num: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface AccountGroup {
  account: Account;
  beginningBalance: number;
  transactions: TransactionWithBalance[];
  endingBalance: number;
  totalDebits: number;
  totalCredits: number;
}

export default function GeneralLedger() {
  const navigate = useNavigate();
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [selectedAccountType, setSelectedAccountType] = useState<string>('all');

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

  // Get unique account types for filter dropdown
  const accountTypes = useMemo(() => {
    if (!accounts) return [];
    const types = new Set(accounts.map((a) => a.Type));
    return Array.from(types).sort();
  }, [accounts]);

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

  // Filter accounts based on type selection
  const filteredAccountsForDropdown = useMemo(() => {
    if (selectedAccountType === 'all') return sortedAccounts;
    return sortedAccounts.filter((a) => a.Type === selectedAccountType);
  }, [sortedAccounts, selectedAccountType]);

  const reportData = useMemo(() => {
    if (!accounts || !journalEntries || !lines) {
      return { accountGroups: [] as AccountGroup[] };
    }

    const accountMap = new Map(accounts.map((a) => [a.Id, a]));
    const entryMap = new Map(journalEntries.map((e) => [e.Id, e]));

    // Parse dates explicitly to avoid timezone issues
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    // Determine which accounts to include
    let accountsToInclude: Account[] = [];
    if (selectedAccountId !== 'all') {
      const account = accountMap.get(selectedAccountId);
      if (account) accountsToInclude = [account];
    } else if (selectedAccountType !== 'all') {
      accountsToInclude = accounts.filter((a) => a.Type === selectedAccountType);
    } else {
      accountsToInclude = accounts;
    }

    // Calculate beginning balances (all transactions before start date)
    const beginningBalances = new Map<string, number>();
    lines.forEach((line) => {
      const entry = entryMap.get(line.JournalEntryId);
      if (!entry) return;

      const entryDate = new Date(entry.TransactionDate);
      if (entryDate < start) {
        const account = accountMap.get(line.AccountId);
        if (!account) return;

        const isNormallyDebit = ['Asset', 'Expense'].includes(account.Type);
        const current = beginningBalances.get(line.AccountId) || 0;
        const lineEffect = isNormallyDebit
          ? line.Debit - line.Credit
          : line.Credit - line.Debit;
        beginningBalances.set(line.AccountId, current + lineEffect);
      }
    });

    // Build account groups with running balances
    const accountGroups: AccountGroup[] = [];
    const typeOrder = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

    // Sort accounts to include
    accountsToInclude.sort((a, b) => {
      const typeCompare = typeOrder.indexOf(a.Type) - typeOrder.indexOf(b.Type);
      if (typeCompare !== 0) return typeCompare;
      return a.Name.localeCompare(b.Name);
    });

    accountsToInclude.forEach((account) => {
      const isNormallyDebit = ['Asset', 'Expense'].includes(account.Type);
      const beginningBalance = beginningBalances.get(account.Id) || 0;

      // Get all lines for this account within the date range
      const accountLines = lines
        .filter((line) => {
          if (line.AccountId !== account.Id) return false;
          const entry = entryMap.get(line.JournalEntryId);
          if (!entry) return false;

          const entryDate = new Date(entry.TransactionDate);
          return entryDate >= start && entryDate <= end;
        })
        .map((line) => {
          const entry = entryMap.get(line.JournalEntryId)!;
          return { line, entry };
        })
        .sort((a, b) => {
          const dateCompare =
            new Date(a.entry.TransactionDate).getTime() -
            new Date(b.entry.TransactionDate).getTime();
          if (dateCompare !== 0) return dateCompare;
          // If same date, sort by reference/id for consistency
          return (a.entry.Reference || a.entry.Id).localeCompare(
            b.entry.Reference || b.entry.Id
          );
        });

      // Only include accounts with activity or beginning balance
      if (accountLines.length === 0 && beginningBalance === 0) {
        return;
      }

      let runningBalance = beginningBalance;
      let totalDebits = 0;
      let totalCredits = 0;

      const transactions: TransactionWithBalance[] = accountLines.map(
        ({ line, entry }) => {
          const lineEffect = isNormallyDebit
            ? line.Debit - line.Credit
            : line.Credit - line.Debit;
          runningBalance += lineEffect;
          totalDebits += line.Debit;
          totalCredits += line.Credit;

          return {
            id: line.Id,
            journalEntryId: entry.Id,
            date: formatDateShort(entry.TransactionDate),
            num: entry.Reference || entry.Id.slice(0, 8),
            description: entry.Description + (line.Description ? ` - ${line.Description}` : ''),
            debit: line.Debit,
            credit: line.Credit,
            balance: runningBalance,
          };
        }
      );

      accountGroups.push({
        account,
        beginningBalance,
        transactions,
        endingBalance: runningBalance,
        totalDebits,
        totalCredits,
      });
    });

    return { accountGroups };
  }, [accounts, journalEntries, lines, startDate, endDate, selectedAccountId, selectedAccountType]);

  const columns: ReportColumn[] = [
    { key: 'date', header: 'Date', align: 'left' },
    { key: 'num', header: 'Num', align: 'left' },
    { key: 'description', header: 'Description', align: 'left' },
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
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      format: (value, row) => {
        if (row.isHeader || value === undefined || value === null) return '';
        return formatCurrency(value);
      },
    },
  ];

  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [];

    reportData.accountGroups.forEach(
      ({ account, beginningBalance, transactions, endingBalance, totalDebits, totalCredits }) => {
        // Account header
        rows.push({
          date: `${account.Name} (${account.Type})`,
          num: '',
          description: '',
          debit: undefined,
          credit: undefined,
          balance: undefined,
          isHeader: true,
        });

        // Beginning balance row
        rows.push({
          date: '',
          num: '',
          description: 'Beginning Balance',
          debit: undefined,
          credit: undefined,
          balance: beginningBalance,
          indent: 1,
        });

        // Transaction rows
        transactions.forEach((t) => {
          rows.push({
            date: t.date,
            num: t.num,
            description: t.description,
            debit: t.debit || undefined,
            credit: t.credit || undefined,
            balance: t.balance,
            indent: 1,
            journalEntryId: t.journalEntryId,
          });
        });

        // Totals row
        rows.push({
          date: '',
          num: '',
          description: 'Totals and Ending Balance',
          debit: totalDebits || undefined,
          credit: totalCredits || undefined,
          balance: endingBalance,
          isSubtotal: true,
        });

        // Blank row between accounts
        rows.push({
          date: '',
          num: '',
          description: '',
          debit: undefined,
          credit: undefined,
          balance: undefined,
        });
      }
    );

    return rows;
  }, [reportData]);

  const handleExportCSV = () =>
    exportToCSV(`general-ledger-${startDate}-to-${endDate}`, columns, tableData);

  const formatDateRange = () =>
    `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;

  // Handle account type change - reset account selection if it's no longer in filtered list
  const handleAccountTypeChange = (newType: string) => {
    setSelectedAccountType(newType);
    if (selectedAccountId !== 'all') {
      const account = accounts?.find((a) => a.Id === selectedAccountId);
      if (account && newType !== 'all' && account.Type !== newType) {
        setSelectedAccountId('all');
      }
    }
  };

  // Handle row click to drill down to journal entry
  const handleRowClick = (row: ReportRow) => {
    if (row.journalEntryId) {
      navigate(`/journal-entries?entry=${row.journalEntryId}`);
    }
  };

  if (isLoading) {
    return <div className="max-w-6xl mx-auto p-4">Loading general ledger...</div>;
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading the report.';
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load general ledger data.</p>
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
        title="General Ledger"
        subtitle="All transactions by account with running balances"
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
            <label htmlFor="accountTypeFilter" className="text-sm font-medium text-gray-700">
              Account Type:
            </label>
            <select
              id="accountTypeFilter"
              value={selectedAccountType}
              onChange={(e) => handleAccountTypeChange(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="all">All Types</option>
              {accountTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
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
              {filteredAccountsForDropdown.map((account) => (
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
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 print:bg-white">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider print:px-2 print:py-1 ${
                      column.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tableData.map((row, rowIndex) => {
                const rowClasses = row.isHeader
                  ? 'bg-gray-50 font-semibold text-gray-900'
                  : row.isSubtotal
                  ? 'font-semibold text-gray-800 border-t border-gray-200'
                  : row.journalEntryId
                  ? 'hover:bg-blue-50 cursor-pointer'
                  : '';

                return (
                  <tr
                    key={row.journalEntryId || `row-${rowIndex}`}
                    className={rowClasses}
                    onClick={row.journalEntryId ? () => handleRowClick(row) : undefined}
                    title={row.journalEntryId ? 'Click to view journal entry' : undefined}
                  >
                    {columns.map((column) => {
                      const cellClasses = [
                        'px-4 py-2 print:px-2 print:py-1 print:text-xs',
                        column.align === 'right' ? 'text-right' : 'text-left',
                      ];

                      // Apply indentation for first column
                      if (row.indent && column.key === 'date') {
                        cellClasses.push('pl-8');
                      }

                      return (
                        <td key={column.key} className={cellClasses.join(' ')}>
                          {column.format
                            ? column.format(row[column.key], row)
                            : row[column.key] ?? ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs">
        <p>
          Generated on{' '}
          {formatDateTime(new Date())}
        </p>
      </div>
    </div>
  );
}
