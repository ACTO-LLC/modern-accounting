import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { RefreshCw, Download, CheckCircle, Clock, Settings } from 'lucide-react';
import PlaidLinkButton from '../components/PlaidLinkButton';

interface BankTransaction {
  Id: string;
  TransactionDate: string;
  Description: string;
  Amount: number;
  Category: string;
  BankName: string;
  Status: string;
}

export default function Banking() {
  const queryClient = useQueryClient();
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['banktransactions'],
    queryFn: async () => {
      const response = await api.get<{ value: BankTransaction[] }>('/banktransactions');
      return response.data.value;
    },
  });

  const simulateFeedMutation = useMutation({
    mutationFn: async () => {
      // Simulate fetching from Plaid by posting dummy data
      const dummyTransactions = [
        {
          TransactionDate: new Date().toISOString().split('T')[0],
          Description: 'Starbucks',
          Amount: -5.40,
          Category: 'Meals & Entertainment',
          BankName: 'Chase',
          Status: 'Posted'
        },
        {
          TransactionDate: new Date().toISOString().split('T')[0],
          Description: 'Office Depot',
          Amount: -124.99,
          Category: 'Office Supplies',
          BankName: 'Wells Fargo',
          Status: 'Posted'
        },
        {
          TransactionDate: new Date().toISOString().split('T')[0],
          Description: 'Client Payment - Acme Corp',
          Amount: 1500.00,
          Category: 'Sales',
          BankName: 'Chase',
          Status: 'Posted'
        }
      ];

      for (const tx of dummyTransactions) {
        await api.post('/banktransactions', tx);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banktransactions'] });
    },
  });

  if (isLoading) return <div className="p-4">Loading transactions...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Banking</h1>
        <div className="flex items-center space-x-3">
          <Link
            to="/plaid-connections"
            className="flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
          >
            <Settings className="w-4 h-4 mr-1" />
            Manage Connections
          </Link>
          <PlaidLinkButton compact />
          <button
            onClick={() => simulateFeedMutation.mutate()}
            disabled={simulateFeedMutation.isPending}
            className="flex items-center px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${simulateFeedMutation.isPending ? 'animate-spin' : ''}`} />
            {simulateFeedMutation.isPending ? 'Syncing...' : 'Sync Bank Feed'}
          </button>
          <button className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            <Download className="w-4 h-4 mr-2" />
            Import CSV
          </button>
        </div>
      </div>

      <div className="bg-white shadow overflow-hidden rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bank</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <p className="text-lg font-medium text-gray-900">No transactions yet</p>
                  <p className="mt-1">Sync your bank feed or import a CSV to get started.</p>
                </td>
              </tr>
            ) : (
              transactions?.map((tx) => (
                <tr key={tx.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tx.TransactionDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.BankName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.Description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tx.Category}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${tx.Amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {tx.Amount < 0 ? '-' : '+'}${Math.abs(tx.Amount).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="flex items-center text-xs leading-5 font-semibold text-green-800">
                      {tx.Status === 'Posted' ? <CheckCircle className="w-4 h-4 text-green-500 mr-1" /> : <Clock className="w-4 h-4 text-yellow-500 mr-1" />}
                      {tx.Status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
