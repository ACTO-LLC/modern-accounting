import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, CheckCircle, Clock, Eye } from 'lucide-react';
import { formatDate } from '../lib/dateUtils';

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface BankReconciliation {
  Id: string;
  BankAccountId: string;
  StatementDate: string;
  StatementEndingBalance: number;
  BeginningBalance: number;
  ClearedDeposits: number;
  ClearedPayments: number;
  Status: 'InProgress' | 'Completed';
  CompletedAt: string | null;
  CompletedBy: string | null;
  CreatedAt: string;
}

export default function BankReconciliations() {
  const { data: reconciliationsData, isLoading } = useQuery({
    queryKey: ['bank-reconciliations'],
    queryFn: async () => {
      const response = await fetch('/api/bankreconciliations?$orderby=CreatedAt desc');
      if (!response.ok) throw new Error('Failed to fetch reconciliations');
      return (await response.json()).value as BankReconciliation[];
    }
  });

  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await fetch('/api/accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return (await response.json()).value as Account[];
    }
  });

  const reconciliations = reconciliationsData || [];
  const accounts = accountsData || [];

  const getAccountName = (id: string) => accounts.find(a => a.Id === id)?.Name || 'Unknown';

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  // formatDate imported from dateUtils for locale-aware formatting

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bank Reconciliations</h1>
          <p className="mt-2 text-sm text-gray-600">
            Reconcile your bank statements with your accounting records
          </p>
        </div>
        <Link
          to="/reconciliations/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          New Reconciliation
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : reconciliations.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium text-gray-900">No reconciliations yet</p>
            <p className="mt-1">Start by creating a new bank reconciliation.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bank Account
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statement Date
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statement Balance
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cleared Deposits
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cleared Payments
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reconciliations.map((rec) => (
                <tr key={rec.Id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {getAccountName(rec.BankAccountId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {formatDate(rec.StatementDate)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                    {formatCurrency(rec.StatementEndingBalance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600">
                    {formatCurrency(rec.ClearedDeposits)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-red-600">
                    {formatCurrency(rec.ClearedPayments)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {rec.Status === 'Completed' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="h-4 w-4 mr-1" />
                        In Progress
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <Link
                      to={`/reconciliations/${rec.Id}`}
                      className="inline-flex items-center text-indigo-600 hover:text-indigo-900"
                    >
                      <Eye className="h-5 w-5 mr-1" />
                      {rec.Status === 'InProgress' ? 'Continue' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
