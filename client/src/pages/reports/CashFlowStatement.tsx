import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DateRangePicker, ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import { formatDateLong } from '../../lib/dateUtils';

interface Account {
  Id: string;
  Name: string;
  Type: string;
  Subtype: string | null;
  CashFlowCategory: string | null;
}

interface JournalEntry {
  Id: string;
  TransactionDate: string;
}

interface JournalEntryLine {
  Id: string;
  JournalEntryId: string;
  AccountId: string;
  Debit: number;
  Credit: number;
}

/**
 * Statement of Cash Flows Report
 *
 * Uses the indirect method:
 * 1. Start with Net Income
 * 2. Add back non-cash expenses (depreciation)
 * 3. Adjust for changes in operating assets/liabilities
 * 4. Show investing activities (fixed asset changes)
 * 5. Show financing activities (equity, loans)
 * 6. Reconcile to change in cash
 */
export default function CashFlowStatement() {
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
        netIncome: 0,
        depreciationAdjustment: 0,
        operatingItems: [] as { name: string; amount: number }[],
        netOperatingCashFlow: 0,
        investingItems: [] as { name: string; amount: number }[],
        netInvestingCashFlow: 0,
        financingItems: [] as { name: string; amount: number }[],
        netFinancingCashFlow: 0,
        netCashChange: 0,
        beginningCash: 0,
        endingCash: 0,
        actualCashChange: 0,
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

    // Get period start for beginning balance calculation
    const periodStart = new Date(start);
    periodStart.setMilliseconds(periodStart.getMilliseconds() - 1);

    // Filter lines for the period
    const periodLines = lines.filter((line) => {
      const date = entryDateMap.get(line.JournalEntryId);
      return date && date >= start && date <= end;
    });

    // Filter lines for before period (for beginning balances)
    const beforePeriodLines = lines.filter((line) => {
      const date = entryDateMap.get(line.JournalEntryId);
      return date && date < start;
    });

    // Calculate Net Income for the period
    let netIncome = 0;
    periodLines.forEach((line) => {
      const account = accountMap.get(line.AccountId);
      if (!account) return;

      if (account.Type === 'Revenue') {
        netIncome += line.Credit - line.Debit;
      } else if (account.Type === 'Expense') {
        netIncome -= line.Debit - line.Credit;
      }
    });

    // Calculate depreciation adjustment (non-cash expense added back)
    let depreciationAdjustment = 0;
    periodLines.forEach((line) => {
      const account = accountMap.get(line.AccountId);
      if (!account) return;

      if (account.Type === 'Expense' &&
          (account.Name.toLowerCase().includes('depreciation') ||
           account.Name.toLowerCase().includes('amortization'))) {
        depreciationAdjustment += line.Debit - line.Credit;
      }
    });

    // Helper to calculate account balance change
    const calculateBalanceChange = (accountId: string): number => {
      const account = accountMap.get(accountId);
      if (!account) return 0;

      let beginningBalance = 0;
      let endingBalance = 0;

      // Calculate beginning balance
      beforePeriodLines.forEach((line) => {
        if (line.AccountId !== accountId) return;
        if (account.Type === 'Asset') {
          beginningBalance += line.Debit - line.Credit;
        } else {
          beginningBalance += line.Credit - line.Debit;
        }
      });

      // Calculate ending balance
      endingBalance = beginningBalance;
      periodLines.forEach((line) => {
        if (line.AccountId !== accountId) return;
        if (account.Type === 'Asset') {
          endingBalance += line.Debit - line.Credit;
        } else {
          endingBalance += line.Credit - line.Debit;
        }
      });

      return endingBalance - beginningBalance;
    };

    // Identify cash accounts
    const cashAccounts = accounts.filter((a) =>
      a.Subtype === 'Bank' ||
      a.Subtype === 'Cash' ||
      a.Name.toLowerCase().includes('cash') ||
      a.Name.toLowerCase().includes('checking') ||
      a.Name.toLowerCase().includes('savings')
    );

    const cashAccountIds = new Set(cashAccounts.map((a) => a.Id));

    // Calculate beginning and ending cash
    let beginningCash = 0;
    let endingCash = 0;

    cashAccounts.forEach((account) => {
      let balance = 0;
      beforePeriodLines.forEach((line) => {
        if (line.AccountId !== account.Id) return;
        balance += line.Debit - line.Credit; // Assets increase with debit
      });
      beginningCash += balance;

      periodLines.forEach((line) => {
        if (line.AccountId !== account.Id) return;
        balance += line.Debit - line.Credit;
      });
      endingCash += balance;
    });

    const actualCashChange = endingCash - beginningCash;

    // Operating Activities - Changes in current assets and liabilities
    const operatingItems: { name: string; amount: number }[] = [];

    accounts.forEach((account) => {
      // Skip cash accounts, revenue, expense, and accounts with no operating activity
      if (cashAccountIds.has(account.Id)) return;
      if (account.Type === 'Revenue' || account.Type === 'Expense') return;

      // Operating accounts: current assets (except cash) and current liabilities
      const isOperating =
        account.CashFlowCategory === 'Operating' ||
        (account.Type === 'Asset' && ['Receivable', 'Inventory', 'OtherCurrentAsset', 'PrepaidExpense'].includes(account.Subtype || '')) ||
        (account.Type === 'Liability' && ['Payable', 'CreditCard', 'OtherCurrentLiability', 'AccruedLiability'].includes(account.Subtype || ''));

      if (!isOperating) return;

      // Skip depreciation contra accounts (already handled)
      if (account.Name.toLowerCase().includes('accumulated depreciation')) return;

      const change = calculateBalanceChange(account.Id);
      if (Math.abs(change) < 0.01) return;

      // For assets: increase = cash used (negative), decrease = cash provided (positive)
      // For liabilities: increase = cash provided (positive), decrease = cash used (negative)
      let cashImpact: number;
      if (account.Type === 'Asset') {
        cashImpact = -change; // Asset increase uses cash
      } else {
        cashImpact = change; // Liability increase provides cash
      }

      operatingItems.push({
        name: `Change in ${account.Name}`,
        amount: cashImpact,
      });
    });

    // Sort operating items by absolute value
    operatingItems.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    const netOperatingCashFlow = netIncome + depreciationAdjustment +
      operatingItems.reduce((sum, item) => sum + item.amount, 0);

    // Investing Activities - Fixed assets and investments
    const investingItems: { name: string; amount: number }[] = [];

    accounts.forEach((account) => {
      if (cashAccountIds.has(account.Id)) return;

      const isInvesting =
        account.CashFlowCategory === 'Investing' ||
        (account.Type === 'Asset' && ['FixedAsset', 'Investment', 'OtherAsset'].includes(account.Subtype || '')) ||
        account.Name.toLowerCase().includes('equipment') ||
        account.Name.toLowerCase().includes('vehicle') ||
        account.Name.toLowerCase().includes('building') ||
        account.Name.toLowerCase().includes('property') ||
        account.Name.toLowerCase().includes('investment');

      if (!isInvesting) return;

      // Skip accumulated depreciation (it's a contra-asset, handled in operating)
      if (account.Name.toLowerCase().includes('accumulated')) return;

      const change = calculateBalanceChange(account.Id);
      if (Math.abs(change) < 0.01) return;

      // Asset increase = purchase (negative cash flow)
      // Asset decrease = sale (positive cash flow)
      const cashImpact = -change;

      const label = change > 0
        ? `Purchase of ${account.Name}`
        : `Sale of ${account.Name}`;

      investingItems.push({
        name: label,
        amount: cashImpact,
      });
    });

    investingItems.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    const netInvestingCashFlow = investingItems.reduce((sum, item) => sum + item.amount, 0);

    // Financing Activities - Equity and long-term liabilities
    const financingItems: { name: string; amount: number }[] = [];

    accounts.forEach((account) => {
      if (cashAccountIds.has(account.Id)) return;

      const isFinancing =
        account.CashFlowCategory === 'Financing' ||
        account.Type === 'Equity' ||
        (account.Type === 'Liability' && ['LongTermLiability', 'NotesPayable', 'Loan'].includes(account.Subtype || '')) ||
        account.Name.toLowerCase().includes('loan') ||
        account.Name.toLowerCase().includes('note') ||
        account.Name.toLowerCase().includes('mortgage');

      if (!isFinancing) return;

      const change = calculateBalanceChange(account.Id);
      if (Math.abs(change) < 0.01) return;

      let cashImpact: number;
      let label: string;

      if (account.Type === 'Equity') {
        // Owner's equity/investment increase = cash in (positive)
        // Owner's draw increase = cash out (but draw is usually recorded as decrease in equity)
        if (account.Name.toLowerCase().includes('draw') ||
            account.Name.toLowerCase().includes('distribution')) {
          // Draws: increase in draw account (which is usually contra-equity) = cash out
          cashImpact = -Math.abs(change);
          label = `Owner Withdrawals/Distributions`;
        } else if (account.Name.toLowerCase().includes('retained')) {
          // Skip retained earnings - already reflected in net income
          return;
        } else {
          // Capital contributions
          cashImpact = change;
          label = change > 0 ? `Capital Contribution` : `Capital Distribution`;
        }
      } else {
        // Liabilities: increase = borrowing (positive), decrease = repayment (negative)
        cashImpact = change;
        label = change > 0
          ? `Proceeds from ${account.Name}`
          : `Repayment of ${account.Name}`;
      }

      financingItems.push({
        name: label,
        amount: cashImpact,
      });
    });

    financingItems.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    const netFinancingCashFlow = financingItems.reduce((sum, item) => sum + item.amount, 0);

    const netCashChange = netOperatingCashFlow + netInvestingCashFlow + netFinancingCashFlow;

    return {
      netIncome,
      depreciationAdjustment,
      operatingItems,
      netOperatingCashFlow,
      investingItems,
      netInvestingCashFlow,
      financingItems,
      netFinancingCashFlow,
      netCashChange,
      beginningCash,
      endingCash,
      actualCashChange,
    };
  }, [accounts, journalEntries, lines, startDate, endDate]);

  const columns: ReportColumn[] = [
    { key: 'name', header: 'Description', align: 'left' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      format: (value) => (value !== undefined ? formatCurrency(value) : ''),
    },
  ];

  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [
      { name: 'CASH FLOWS FROM OPERATING ACTIVITIES', amount: undefined, isHeader: true },
      { name: 'Net Income', amount: reportData.netIncome, indent: 1 },
      { name: 'Adjustments to reconcile net income to net cash:', amount: undefined, indent: 1 },
    ];

    // Add depreciation if any
    if (Math.abs(reportData.depreciationAdjustment) >= 0.01) {
      rows.push({
        name: 'Depreciation & Amortization',
        amount: reportData.depreciationAdjustment,
        indent: 2,
      });
    }

    // Add changes in operating assets/liabilities
    if (reportData.operatingItems.length > 0) {
      rows.push({ name: 'Changes in operating assets and liabilities:', amount: undefined, indent: 1 });
      reportData.operatingItems.forEach((item) => {
        rows.push({ name: item.name, amount: item.amount, indent: 2 });
      });
    }

    rows.push(
      { name: 'Net cash provided by operating activities', amount: reportData.netOperatingCashFlow, isSubtotal: true },
      { name: '', amount: undefined },
      { name: 'CASH FLOWS FROM INVESTING ACTIVITIES', amount: undefined, isHeader: true }
    );

    if (reportData.investingItems.length > 0) {
      reportData.investingItems.forEach((item) => {
        rows.push({ name: item.name, amount: item.amount, indent: 1 });
      });
    } else {
      rows.push({ name: 'No investing activities', amount: undefined, indent: 1 });
    }

    rows.push(
      { name: 'Net cash used in investing activities', amount: reportData.netInvestingCashFlow, isSubtotal: true },
      { name: '', amount: undefined },
      { name: 'CASH FLOWS FROM FINANCING ACTIVITIES', amount: undefined, isHeader: true }
    );

    if (reportData.financingItems.length > 0) {
      reportData.financingItems.forEach((item) => {
        rows.push({ name: item.name, amount: item.amount, indent: 1 });
      });
    } else {
      rows.push({ name: 'No financing activities', amount: undefined, indent: 1 });
    }

    rows.push(
      { name: 'Net cash provided by financing activities', amount: reportData.netFinancingCashFlow, isSubtotal: true },
      { name: '', amount: undefined },
      { name: 'NET INCREASE (DECREASE) IN CASH', amount: reportData.netCashChange, isTotal: true },
      { name: '', amount: undefined },
      { name: 'Cash at beginning of period', amount: reportData.beginningCash, indent: 1 },
      { name: 'CASH AT END OF PERIOD', amount: reportData.endingCash, isTotal: true }
    );

    return rows;
  }, [reportData]);

  const handleExportCSV = () =>
    exportToCSV(`cash-flow-statement-${startDate}-to-${endDate}`, columns, tableData);

  const formatDateRange = () =>
    `For the period ${formatDateLong(startDate)} through ${formatDateLong(endDate)}`;

  // Check if the calculated cash change matches actual cash change
  const isReconciled =
    Math.abs(reportData.netCashChange - reportData.actualCashChange) < 0.01;

  if (isLoading) {
    return <div className="max-w-4xl mx-auto p-4">Loading statement of cash flows...</div>;
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading the report.';
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load cash flow statement data.</p>
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
        title="Statement of Cash Flows"
        subtitle="Indirect Method"
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
      {!isReconciled && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <p className="text-sm text-yellow-800">
            <strong>Warning:</strong> The calculated net change in cash (
            {formatCurrency(reportData.netCashChange)}) does not match the actual change in
            cash accounts ({formatCurrency(reportData.actualCashChange)}). This may indicate
            transactions that need to be categorized or accounts that need CashFlowCategory
            assignment.
          </p>
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
