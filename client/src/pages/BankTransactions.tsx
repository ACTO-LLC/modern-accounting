import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Edit2, Trash2, X } from 'lucide-react';
import { formatDate } from '../lib/dateUtils';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';

interface BankTransaction {
  Id: string;
  SourceType: string;
  SourceName: string;
  SourceAccountId: string;
  TransactionDate: string;
  PostDate?: string;
  Amount: number;
  Description: string;
  Merchant: string;
  OriginalCategory?: string;
  TransactionType?: string;
  CardNumber?: string;
  SuggestedAccountId?: string;
  SuggestedCategory: string;
  SuggestedMemo: string;
  ConfidenceScore: number;
  Status: 'Pending' | 'Approved' | 'Rejected' | 'Posted';
  ApprovedAccountId?: string;
  ApprovedCategory?: string;
  ApprovedMemo?: string;
  JournalEntryId?: string;
  CreatedDate: string;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface TransactionFormData {
  SourceAccountId: string;
  TransactionDate: string;
  Amount: number;
  Description: string;
  Merchant: string;
}

export default function BankTransactions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BankTransaction | null>(null);
  const [formData, setFormData] = useState<TransactionFormData>({
    SourceAccountId: '',
    TransactionDate: new Date().toISOString().split('T')[0],
    Amount: 0,
    Description: '',
    Merchant: ''
  });

  const queryClient = useQueryClient();

  // Fetch transactions with pagination
  const { data: transactionsResponse, isLoading } = useQuery({
    queryKey: ['banktransactions', statusFilter, page, pageSize],
    queryFn: async () => {
      const filters = [];
      if (statusFilter !== 'all') {
        filters.push(`Status eq '${statusFilter}'`);
      }
      
      const filterString = filters.length > 0 ? `$filter=${filters.join(' and ')}&` : '';
      const url = `/api/banktransactions?${filterString}$top=${pageSize}&$skip=${page * pageSize}&$count=true`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      const data = await response.json();
      return {
        transactions: data.value as BankTransaction[],
        totalCount: data['@odata.count'] || 0
      };
    }
  });

  // Fetch accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await fetch('/api/accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      const data = await response.json();
      return data.value as Account[];
    }
  });

  const accounts = accountsData || [];
  const transactions = transactionsResponse?.transactions || [];
  const totalCount = transactionsResponse?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Client-side filter for search and source (applied after server pagination)
  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = searchQuery === '' ||
      txn.Description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.Merchant.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSource = sourceFilter === 'all' || txn.SourceAccountId === sourceFilter;
    
    return matchesSearch && matchesSource;
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: TransactionFormData) => {
      const response = await fetch('/api/banktransactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          Id: crypto.randomUUID(),
          SourceType: 'Manual',
          SourceName: accounts.find(a => a.Id === data.SourceAccountId)?.Name || 'Manual Entry',
          Status: 'Pending',
          SuggestedCategory: 'Uncategorized',
          SuggestedMemo: data.Description,
          ConfidenceScore: 0,
          TransactionDate: new Date(data.TransactionDate).toISOString(),
        })
      });
      if (!response.ok) throw new Error('Failed to create transaction');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banktransactions'] });
      setShowModal(false);
      resetForm();
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BankTransaction> }) => {
      const response = await fetch(`/api/banktransactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update transaction');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banktransactions'] });
      setShowModal(false);
      setEditingTransaction(null);
      resetForm();
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/banktransactions/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete transaction');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['banktransactions'] });
    }
  });

  const resetForm = () => {
    setFormData({
      SourceAccountId: '',
      TransactionDate: new Date().toISOString().split('T')[0],
      Amount: 0,
      Description: '',
      Merchant: ''
    });
  };

  const handleCreate = () => {
    setEditingTransaction(null);
    resetForm();
    setShowModal(true);
  };

  const handleEdit = (txn: BankTransaction) => {
    setEditingTransaction(txn);
    setFormData({
      SourceAccountId: txn.SourceAccountId,
      TransactionDate: txn.TransactionDate.split('T')[0],
      Amount: txn.Amount,
      Description: txn.Description,
      Merchant: txn.Merchant
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTransaction) {
      updateMutation.mutate({
        id: editingTransaction.Id,
        data: formData
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string, status: string) => {
    if (status === 'Posted') {
      alert('Cannot delete a transaction that has been posted to journal entries');
      return;
    }
    if (confirm('Are you sure you want to delete this transaction?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'text-blue-600 bg-blue-50';
      case 'Posted': return 'text-green-600 bg-green-50';
      case 'Rejected': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const uniqueSources = Array.from(new Set(transactions.map(t => t.SourceAccountId)))
    .map(id => accounts.find(a => a.Id === id))
    .filter(Boolean);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bank Transactions</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage all bank and credit card transactions
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          New Transaction
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search description or merchant..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Posted">Posted</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Source Account</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Accounts</option>
              {uniqueSources.map(account => account && (
                <option key={account.Id} value={account.Id}>{account.Name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading transactions...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchQuery || sourceFilter !== 'all' ? 'No transactions match your filters' : 'No transactions found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((txn) => (
                  <tr key={txn.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(txn.TransactionDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <div>{txn.SourceName}</div>
                      <div className="text-xs text-gray-400">{txn.SourceType}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{txn.Description}</div>
                      <div className="text-xs text-gray-500">{txn.Merchant}</div>
                      {txn.OriginalCategory && (
                        <div className="text-xs text-gray-400">Category: {txn.OriginalCategory}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-medium">
                        {txn.ApprovedCategory || txn.SuggestedCategory || 'Uncategorized'}
                      </div>
                      {txn.ApprovedMemo || txn.SuggestedMemo ? (
                        <div className="text-xs text-gray-500">
                          {txn.ApprovedMemo || txn.SuggestedMemo}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span className={txn.Amount < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                        {formatCurrencyStandalone(Math.abs(txn.Amount))}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(txn.Status)}`}>
                        {txn.Status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleEdit(txn)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(txn.Id, txn.Status)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, totalCount)} of {totalCount} transactions
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pageNum = i + Math.max(0, page - 2);
                  if (pageNum >= totalPages) return null;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`px-3 py-1 border rounded-md text-sm font-medium ${
                        page === pageNum
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingTransaction ? 'Edit Transaction' : 'New Transaction'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingTransaction(null);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Account *
                  </label>
                  <select
                    value={formData.SourceAccountId}
                    onChange={(e) => setFormData({ ...formData, SourceAccountId: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select account...</option>
                    {accounts.map(acc => (
                      <option key={acc.Id} value={acc.Id}>{acc.Name} ({acc.Type})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transaction Date *
                  </label>
                  <input
                    type="date"
                    value={formData.TransactionDate}
                    onChange={(e) => setFormData({ ...formData, TransactionDate: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount * (negative for expenses, positive for income)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.Amount}
                    onChange={(e) => setFormData({ ...formData, Amount: parseFloat(e.target.value) })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <input
                    type="text"
                    value={formData.Description}
                    onChange={(e) => setFormData({ ...formData, Description: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Merchant
                  </label>
                  <input
                    type="text"
                    value={formData.Merchant}
                    onChange={(e) => setFormData({ ...formData, Merchant: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingTransaction(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300"
                >
                  {editingTransaction ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
