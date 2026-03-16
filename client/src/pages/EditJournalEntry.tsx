import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { ArrowLeft } from 'lucide-react';
import { formatDate } from '../lib/dateUtils';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';
import CircularProgress from '@mui/material/CircularProgress';

interface JournalEntryLine {
  Id: string;
  JournalEntryId: string;
  AccountId: string;
  Description: string;
  Debit: number;
  Credit: number;
  ProjectId?: string;
  ClassId?: string;
}

interface Account {
  Id: string;
  Code: string;
  Name: string;
}

export default function EditJournalEntry() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: entry, isLoading: entryLoading } = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: async () => {
      const resp = await api.get(`/journalentries/Id/${id}`);
      const data = resp.data.value?.[0] || resp.data;
      return data;
    },
    enabled: !!id,
  });

  const { data: lines = [], isLoading: linesLoading } = useQuery({
    queryKey: ['journal-entry-lines', id],
    queryFn: async () => {
      const resp = await api.get(`/journalentrylines?$filter=JournalEntryId eq ${id}`);
      return resp.data.value || [];
    },
    enabled: !!id,
  });

  const { data: accountMap = {} } = useQuery({
    queryKey: ['accounts-map'],
    queryFn: async () => {
      const resp = await api.get<{ value: Account[] }>('/accounts?$orderby=Code');
      const map: Record<string, Account> = {};
      for (const a of resp.data.value) {
        map[a.Id] = a;
      }
      return map;
    },
  });

  if (entryLoading || linesLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <CircularProgress />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Journal entry not found.</p>
        <button
          onClick={() => navigate('/journal-entries')}
          className="mt-4 text-indigo-600 hover:text-indigo-500"
        >
          Back to Journal Entries
        </button>
      </div>
    );
  }

  const totalDebit = lines.reduce((sum: number, l: JournalEntryLine) => sum + (l.Debit || 0), 0);
  const totalCredit = lines.reduce((sum: number, l: JournalEntryLine) => sum + (l.Credit || 0), 0);

  const statusColors: Record<string, string> = {
    Draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    Posted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    Void: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate('/journal-entries')}
          className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Journal Entry: {entry.Reference || 'N/A'}
        </h1>
        <span
          className={`ml-4 px-2 py-1 text-xs font-semibold rounded-full ${statusColors[entry.Status] || statusColors.Draft}`}
        >
          {entry.Status}
        </span>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        {/* Header Info */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Date</p>
            <p className="text-gray-900 dark:text-gray-100">{formatDate(entry.TransactionDate)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Reference</p>
            <p className="text-gray-900 dark:text-gray-100">{entry.Reference || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Created</p>
            <p className="text-gray-900 dark:text-gray-100">{formatDate(entry.CreatedAt)}</p>
          </div>
        </div>

        {entry.Description && (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Description</p>
            <p className="text-gray-900 dark:text-gray-100">{entry.Description}</p>
          </div>
        )}

        {/* Lines Table */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">Lines</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Credit</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {lines.map((line: JournalEntryLine) => {
                  const account = accountMap[line.AccountId];
                  return (
                    <tr key={line.Id}>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {account ? `${account.Code} - ${account.Name}` : line.AccountId}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {line.Description || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                        {line.Debit > 0 ? formatCurrencyStandalone(line.Debit) : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                        {line.Credit > 0 ? formatCurrencyStandalone(line.Credit) : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 dark:border-gray-600 font-medium">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(totalDebit)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(totalCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {entry.PostedBy && (
          <div className="text-sm text-gray-500 dark:text-gray-400 border-t dark:border-gray-600 pt-4">
            Posted by {entry.PostedBy} on {formatDate(entry.PostedAt)}
          </div>
        )}
      </div>
    </div>
  );
}
