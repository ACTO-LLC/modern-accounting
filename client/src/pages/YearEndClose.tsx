import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, AlertCircle, BookOpen, Lock, DollarSign } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';

interface AccountingPeriod {
  Id: string;
  FiscalYearStart: string;
  FiscalYearEnd: string;
  ClosingDate: string | null;
  IsLocked: boolean;
}

interface Account {
  Id: string;
  Code: string;
  Name: string;
  Type: string;
}

interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number;
}

interface ClosingPreview {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  revenueAccounts: AccountBalance[];
  expenseAccounts: AccountBalance[];
}

const STEPS = [
  { id: 'review', title: 'Review Period', description: 'Verify the fiscal year details' },
  { id: 'preview', title: 'Preview Closing', description: 'Review accounts to be closed' },
  { id: 'retained-earnings', title: 'Select Account', description: 'Choose Retained Earnings account' },
  { id: 'confirm', title: 'Confirm & Close', description: 'Generate closing entry' },
];

export default function YearEndClose() {
  const { periodId } = useParams<{ periodId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedRetainedEarningsId, setSelectedRetainedEarningsId] = useState<string>('');
  const [closingPreview, setClosingPreview] = useState<ClosingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockPeriod, setLockPeriod] = useState(true);

  // Fetch accounting period
  const { data: period, isLoading: periodLoading } = useQuery({
    queryKey: ['accounting-period', periodId],
    queryFn: async () => {
      const response = await api.get<{ value: AccountingPeriod[] }>(`/accountingperiods?$filter=Id eq ${periodId}`);
      return response.data.value[0];
    },
    enabled: !!periodId,
  });

  // Check if year is already closed
  const { data: existingClose } = useQuery({
    queryKey: ['year-end-close-check', periodId],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(
        `/yearendcloseentries?$filter=AccountingPeriodId eq '${periodId}'`
      );
      return response.data.value.length > 0 ? response.data.value[0] : null;
    },
    enabled: !!periodId,
  });

  // Fetch all accounts
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get<{ value: Account[] }>('/accounts?$filter=IsActive eq true');
      return response.data.value;
    },
  });

  // Fetch journal entry lines for calculating balances
  const { data: journalEntryLines } = useQuery({
    queryKey: ['journal-entry-lines', period?.FiscalYearStart, period?.FiscalYearEnd],
    queryFn: async () => {
      if (!period) return [];
      const startDate = period.FiscalYearStart + 'T00:00:00Z';
      const endDate = period.FiscalYearEnd + 'T23:59:59Z';

      // Get all journal entries in the fiscal year, EXCLUDING prior closing entries
      // Closing entries have Reference starting with "YE-CLOSE"
      const journalResponse = await api.get<{ value: any[] }>(
        `/journalentries?$filter=TransactionDate ge ${startDate} and TransactionDate le ${endDate} and Status eq 'Posted' and not startswith(Reference,'YE-CLOSE')`
      );

      if (!journalResponse.data.value.length) return [];

      // Get the journal entry IDs to filter lines
      const journalEntryIds = journalResponse.data.value.map((je: any) => je.Id);

      // Fetch journal entry lines only for the filtered journal entries
      // Build OData IN filter for the journal entry IDs
      const idFilter = journalEntryIds.map((id: string) => `JournalEntryId eq '${id}'`).join(' or ');
      const linesResponse = await api.get<{ value: any[] }>(
        `/journalentrylines?$filter=${encodeURIComponent(idFilter)}`
      );
      return linesResponse.data.value;
    },
    enabled: !!period,
  });

  // Calculate closing preview when data is available
  useEffect(() => {
    if (!accounts || !journalEntryLines || !period) return;

    const revenueAccounts = accounts.filter(a => a.Type === 'Revenue');
    const expenseAccounts = accounts.filter(a => a.Type === 'Expense');

    // Calculate balance based on account's normal balance
    // Revenue: normal CREDIT balance = Credits - Debits (positive when more credits)
    // Expense: normal DEBIT balance = Debits - Credits (positive when more debits)
    const calculateBalance = (accountId: string, isExpense: boolean): number => {
      const lines = journalEntryLines.filter(l => l.AccountId === accountId);
      if (isExpense) {
        // Expense accounts have normal debit balance
        return lines.reduce((sum, line) => sum + (line.Debit || 0) - (line.Credit || 0), 0);
      } else {
        // Revenue accounts have normal credit balance
        return lines.reduce((sum, line) => sum + (line.Credit || 0) - (line.Debit || 0), 0);
      }
    };

    const revenueBalances: AccountBalance[] = revenueAccounts
      .map(a => ({
        accountId: a.Id,
        accountCode: a.Code,
        accountName: a.Name,
        accountType: a.Type,
        balance: calculateBalance(a.Id, false),
      }))
      .filter(b => Math.abs(b.balance) > 0.01);

    const expenseBalances: AccountBalance[] = expenseAccounts
      .map(a => ({
        accountId: a.Id,
        accountCode: a.Code,
        accountName: a.Name,
        accountType: a.Type,
        balance: calculateBalance(a.Id, true),
      }))
      .filter(b => Math.abs(b.balance) > 0.01);

    const totalRevenue = revenueBalances.reduce((sum, b) => sum + b.balance, 0);
    const totalExpenses = expenseBalances.reduce((sum, b) => sum + b.balance, 0);

    setClosingPreview({
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      revenueAccounts: revenueBalances,
      expenseAccounts: expenseBalances,
    });
  }, [accounts, journalEntryLines, period]);

  // Filter equity accounts for Retained Earnings selection
  const equityAccounts = accounts?.filter(a => a.Type === 'Equity') || [];

  // Close year mutation
  const closeYearMutation = useMutation({
    mutationFn: async () => {
      if (!period || !closingPreview || !selectedRetainedEarningsId) {
        throw new Error('Missing required data');
      }

      const fiscalYear = new Date(period.FiscalYearEnd).getFullYear();

      // 1. Create closing journal entry
      const journalEntryResponse = await api.post('/journalentries', {
        Reference: `YE-CLOSE-${fiscalYear}`,
        TransactionDate: period.FiscalYearEnd,
        Description: `Year-end closing entry for fiscal year ${fiscalYear}`,
        Status: 'Posted',
        CreatedBy: 'system',
      });

      const journalEntryId = journalEntryResponse.data.Id || journalEntryResponse.data.value?.[0]?.Id;

      // 2. Create journal entry lines to zero out revenue accounts (debit revenue)
      for (const account of closingPreview.revenueAccounts) {
        await api.post('/journalentrylines', {
          JournalEntryId: journalEntryId,
          AccountId: account.accountId,
          Description: `Close ${account.accountName}`,
          Debit: account.balance,
          Credit: 0,
        });
      }

      // 3. Create journal entry lines to zero out expense accounts (credit expenses)
      for (const account of closingPreview.expenseAccounts) {
        await api.post('/journalentrylines', {
          JournalEntryId: journalEntryId,
          AccountId: account.accountId,
          Description: `Close ${account.accountName}`,
          Debit: 0,
          Credit: account.balance,
        });
      }

      // 4. Create retained earnings entry (net income to equity)
      if (closingPreview.netIncome >= 0) {
        // Net income - credit retained earnings
        await api.post('/journalentrylines', {
          JournalEntryId: journalEntryId,
          AccountId: selectedRetainedEarningsId,
          Description: `Net income for fiscal year ${fiscalYear}`,
          Debit: 0,
          Credit: closingPreview.netIncome,
        });
      } else {
        // Net loss - debit retained earnings
        await api.post('/journalentrylines', {
          JournalEntryId: journalEntryId,
          AccountId: selectedRetainedEarningsId,
          Description: `Net loss for fiscal year ${fiscalYear}`,
          Debit: Math.abs(closingPreview.netIncome),
          Credit: 0,
        });
      }

      // 5. Create year-end close entry record
      await api.post('/yearendcloseentries_write', {
        AccountingPeriodId: period.Id,
        FiscalYear: fiscalYear,
        CloseDate: period.FiscalYearEnd,
        RetainedEarningsAccountId: selectedRetainedEarningsId,
        JournalEntryId: journalEntryId,
        NetIncome: closingPreview.netIncome,
        TotalRevenue: closingPreview.totalRevenue,
        TotalExpenses: closingPreview.totalExpenses,
        Status: 'Posted',
        CreatedBy: 'current-user',
      });

      // 6. Optionally lock the period
      if (lockPeriod) {
        await api.patch(`/accountingperiods/Id/${period.Id}`, {
          IsLocked: true,
          ClosingDate: period.FiscalYearEnd,
          ClosedBy: 'current-user',
          ClosedAt: new Date().toISOString(),
        });
      }

      return { journalEntryId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['year-end-close-entries'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      navigate('/accounting-periods');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || err.message || 'Failed to close year');
    },
  });

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleClose = () => {
    closeYearMutation.mutate();
  };

  if (periodLoading) {
    return <div className="p-4">Loading period details...</div>;
  }

  if (!period) {
    return (
      <div className="p-4 text-red-600">
        <AlertCircle className="h-6 w-6 inline mr-2" />
        Accounting period not found.
      </div>
    );
  }

  // Already closed warning
  if (existingClose) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center">
          <button onClick={() => navigate('/accounting-periods')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Year-End Close</h1>
        </div>
        <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h2 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
                Fiscal Year Already Closed
              </h2>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                This fiscal year was closed on {formatDate(existingClose.CloseDate)}.
              </p>
            </div>
          </div>
          <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded border border-yellow-200 dark:border-yellow-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Closing Entry Reference:</p>
            <p className="font-mono text-sm text-gray-900 dark:text-white">YE-CLOSE-{new Date(period.FiscalYearEnd).getFullYear()}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Net Income:</p>
            <p className="font-semibold text-gray-900 dark:text-white">${existingClose.NetIncome?.toLocaleString() || '0'}</p>
          </div>
        </div>
      </div>
    );
  }

  const fiscalYear = new Date(period.FiscalYearEnd).getFullYear();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/accounting-periods')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Year-End Close</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Fiscal Year {fiscalYear} ({formatDate(period.FiscalYearStart)} - {formatDate(period.FiscalYearEnd)})
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                index < currentStep
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : index === currentStep
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-gray-300 text-gray-400'
              }`}>
                {index < currentStep ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div className={`w-16 sm:w-24 h-0.5 mx-2 ${
                  index < currentStep ? 'bg-indigo-600' : 'bg-gray-300'
                }`} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 text-center">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">{STEPS[currentStep].title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{STEPS[currentStep].description}</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Step Content */}
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
        {/* Step 1: Review Period */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Fiscal Year</label>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">FY {fiscalYear}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Status</label>
                <p className="text-xl font-semibold text-gray-900 dark:text-white">
                  {period.IsLocked ? 'Locked' : 'Open'}
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">Start Date</label>
                <p className="text-lg text-gray-900 dark:text-white">{formatDate(period.FiscalYearStart)}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">End Date</label>
                <p className="text-lg text-gray-900 dark:text-white">{formatDate(period.FiscalYearEnd)}</p>
              </div>
            </div>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                Before closing, ensure all transactions for this fiscal year have been entered and reviewed.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Preview Closing */}
        {currentStep === 1 && closingPreview && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <label className="block text-sm font-medium text-green-700 dark:text-green-300">Total Revenue</label>
                <p className="text-2xl font-semibold text-green-800 dark:text-green-200">
                  ${closingPreview.totalRevenue.toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <label className="block text-sm font-medium text-red-700 dark:text-red-300">Total Expenses</label>
                <p className="text-2xl font-semibold text-red-800 dark:text-red-200">
                  ${closingPreview.totalExpenses.toLocaleString()}
                </p>
              </div>
              <div className={`p-4 rounded-lg border ${
                closingPreview.netIncome >= 0
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              }`}>
                <label className={`block text-sm font-medium ${
                  closingPreview.netIncome >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-orange-700 dark:text-orange-300'
                }`}>
                  Net {closingPreview.netIncome >= 0 ? 'Income' : 'Loss'}
                </label>
                <p className={`text-2xl font-semibold ${
                  closingPreview.netIncome >= 0 ? 'text-blue-800 dark:text-blue-200' : 'text-orange-800 dark:text-orange-200'
                }`}>
                  ${Math.abs(closingPreview.netIncome).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Revenue Accounts */}
            {closingPreview.revenueAccounts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Revenue Accounts to Close</h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Account</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {closingPreview.revenueAccounts.map(account => (
                        <tr key={account.accountId}>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                            {account.accountCode} - {account.accountName}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-green-600 dark:text-green-400">
                            ${account.balance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Expense Accounts */}
            {closingPreview.expenseAccounts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Expense Accounts to Close</h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Account</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                      {closingPreview.expenseAccounts.map(account => (
                        <tr key={account.accountId}>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                            {account.accountCode} - {account.accountName}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-red-600 dark:text-red-400">
                            ${account.balance.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Select Retained Earnings Account */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Select the Retained Earnings account where the net {closingPreview && closingPreview.netIncome >= 0 ? 'income' : 'loss'} will be posted.
            </p>
            <div className="space-y-2">
              {equityAccounts.map(account => (
                <label
                  key={account.Id}
                  className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedRetainedEarningsId === account.Id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="retainedEarnings"
                    value={account.Id}
                    checked={selectedRetainedEarningsId === account.Id}
                    onChange={(e) => setSelectedRetainedEarningsId(e.target.value)}
                    className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                  />
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {account.Code} - {account.Name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{account.Type}</p>
                  </div>
                </label>
              ))}
            </div>
            {equityAccounts.length === 0 && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  No equity accounts found. Please create a Retained Earnings account first.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Confirm & Close */}
        {currentStep === 3 && closingPreview && (
          <div className="space-y-6">
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <h3 className="text-lg font-medium text-indigo-900 dark:text-indigo-100 mb-2">Closing Entry Summary</h3>
              <div className="space-y-2 text-sm">
                <p className="text-indigo-700 dark:text-indigo-300">
                  <BookOpen className="h-4 w-4 inline mr-2" />
                  A journal entry will be created to close all revenue and expense accounts.
                </p>
                <p className="text-indigo-700 dark:text-indigo-300">
                  <DollarSign className="h-4 w-4 inline mr-2" />
                  Net {closingPreview.netIncome >= 0 ? 'income' : 'loss'} of{' '}
                  <strong>${Math.abs(closingPreview.netIncome).toLocaleString()}</strong>{' '}
                  will be posted to Retained Earnings.
                </p>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="lockPeriod"
                checked={lockPeriod}
                onChange={(e) => setLockPeriod(e.target.checked)}
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <label htmlFor="lockPeriod" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                <Lock className="h-4 w-4 inline mr-1" />
                Lock this accounting period after closing
              </label>
            </div>

            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                <strong>Warning:</strong> This action cannot be easily reversed. Please ensure all transactions for FY {fiscalYear} are complete before proceeding.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={currentStep === 2 && !selectedRetainedEarningsId}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        ) : (
          <button
            onClick={handleClose}
            disabled={closeYearMutation.isPending}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            <Check className="w-4 h-4 mr-2" />
            {closeYearMutation.isPending ? 'Closing...' : 'Close Fiscal Year'}
          </button>
        )}
      </div>
    </div>
  );
}
