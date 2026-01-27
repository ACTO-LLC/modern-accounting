import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Lock, Unlock, Plus, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';

interface AccountingPeriod {
  Id: string;
  FiscalYearStart: string;
  FiscalYearEnd: string;
  ClosingDate: string | null;
  IsLocked: boolean;
  ClosedBy: string | null;
  ClosedAt: string | null;
  CreatedAt: string;
}

interface YearEndCloseEntry {
  Id: string;
  FiscalYear: number;
  CloseDate: string;
  NetIncome: number;
  TotalRevenue: number;
  TotalExpenses: number;
  JournalEntryReference: string;
  RetainedEarningsAccountName: string;
  CreatedBy: string;
  CreatedAt: string;
}

export default function AccountingPeriods() {
  const queryClient = useQueryClient();
  const [showNewPeriodForm, setShowNewPeriodForm] = useState(false);
  const [newPeriodData, setNewPeriodData] = useState({
    fiscalYearStart: '',
    fiscalYearEnd: '',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: periods, isLoading: periodsLoading } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: async () => {
      const response = await api.get<{ value: AccountingPeriod[] }>('/accountingperiods?$orderby=FiscalYearStart desc');
      return response.data.value;
    },
  });

  const { data: closeEntries } = useQuery({
    queryKey: ['year-end-close-entries'],
    queryFn: async () => {
      const response = await api.get<{ value: YearEndCloseEntry[] }>('/yearendcloseentries?$orderby=FiscalYear desc');
      return response.data.value;
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: async (data: { FiscalYearStart: string; FiscalYearEnd: string }) => {
      return api.post('/accountingperiods', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      setShowNewPeriodForm(false);
      setNewPeriodData({ fiscalYearStart: '', fiscalYearEnd: '' });
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed to create accounting period');
    },
  });

  const lockPeriodMutation = useMutation({
    mutationFn: async ({ id, isLocked }: { id: string; isLocked: boolean }) => {
      return api.patch(`/accountingperiods/Id/${id}`, {
        IsLocked: isLocked,
        ClosedBy: isLocked ? 'current-user' : null,
        ClosedAt: isLocked ? new Date().toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
  });

  const handleCreatePeriod = () => {
    if (!newPeriodData.fiscalYearStart || !newPeriodData.fiscalYearEnd) {
      setError('Please enter both start and end dates');
      return;
    }
    createPeriodMutation.mutate({
      FiscalYearStart: newPeriodData.fiscalYearStart,
      FiscalYearEnd: newPeriodData.fiscalYearEnd,
    });
  };

  const getCloseEntryForPeriod = (period: AccountingPeriod) => {
    const year = new Date(period.FiscalYearEnd).getFullYear();
    return closeEntries?.find(entry => entry.FiscalYear === year);
  };

  if (periodsLoading) {
    return <div className="p-4">Loading accounting periods...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Accounting Periods</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage fiscal years and year-end closing processes.
          </p>
        </div>
        <button
          onClick={() => setShowNewPeriodForm(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Fiscal Year
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* New Period Form */}
      {showNewPeriodForm && (
        <div className="mb-6 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create New Fiscal Year</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fiscal Year Start
              </label>
              <input
                type="date"
                value={newPeriodData.fiscalYearStart}
                onChange={(e) => setNewPeriodData(prev => ({ ...prev, fiscalYearStart: e.target.value }))}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Fiscal Year End
              </label>
              <input
                type="date"
                value={newPeriodData.fiscalYearEnd}
                onChange={(e) => setNewPeriodData(prev => ({ ...prev, fiscalYearEnd: e.target.value }))}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleCreatePeriod}
              disabled={createPeriodMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {createPeriodMutation.isPending ? 'Creating...' : 'Create Period'}
            </button>
            <button
              onClick={() => {
                setShowNewPeriodForm(false);
                setError(null);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Periods List */}
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Fiscal Year
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Period
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Year-End Close
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {periods?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No accounting periods defined.</p>
                  <p className="text-sm mt-1">Create a fiscal year to get started.</p>
                </td>
              </tr>
            ) : (
              periods?.map((period) => {
                const closeEntry = getCloseEntryForPeriod(period);
                const fiscalYear = new Date(period.FiscalYearEnd).getFullYear();
                return (
                  <tr key={period.Id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Calendar className="h-5 w-5 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          FY {fiscalYear}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(period.FiscalYearStart)} - {formatDate(period.FiscalYearEnd)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {period.IsLocked ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          <Lock className="h-3 w-3 mr-1" />
                          Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <Unlock className="h-3 w-3 mr-1" />
                          Open
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {closeEntry ? (
                        <div className="flex items-center">
                          <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                          <div>
                            <span className="text-sm text-gray-900 dark:text-white">Closed</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                              Net Income: ${closeEntry.NetIncome.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-gray-400">Not closed</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {!closeEntry && (
                          <a
                            href={`/year-end-close/${period.Id}`}
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            Close Year
                          </a>
                        )}
                        <button
                          onClick={() => lockPeriodMutation.mutate({ id: period.Id, isLocked: !period.IsLocked })}
                          disabled={lockPeriodMutation.isPending}
                          className={`${
                            period.IsLocked
                              ? 'text-green-600 hover:text-green-900 dark:text-green-400'
                              : 'text-red-600 hover:text-red-900 dark:text-red-400'
                          }`}
                        >
                          {period.IsLocked ? 'Unlock' : 'Lock'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Year-End Close History */}
      {closeEntries && closeEntries.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Year-End Close History</h2>
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Fiscal Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Close Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total Revenue
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Total Expenses
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Net Income
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Journal Entry
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {closeEntries.map((entry) => (
                  <tr key={entry.Id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      FY {entry.FiscalYear}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(entry.CloseDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400">
                      ${entry.TotalRevenue.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600 dark:text-red-400">
                      ${entry.TotalExpenses.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                      ${entry.NetIncome.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 dark:text-indigo-400">
                      {entry.JournalEntryReference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
