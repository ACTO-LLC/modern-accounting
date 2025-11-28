import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Edit2, FileText } from 'lucide-react';

interface BankTransaction {
  Id: string;
  SourceType: string;
  SourceName: string;
  SourceAccountId: string;
  TransactionDate: string;
  Amount: number;
  Description: string;
  Merchant: string;
  OriginalCategory?: string;
  SuggestedAccountId?: string;
  SuggestedCategory: string;
  SuggestedMemo: string;
  ConfidenceScore: number;
  Status: 'Pending' | 'Approved' | 'Rejected' | 'Posted';
  ApprovedAccountId?: string;
  ApprovedCategory?: string;
  ApprovedMemo?: string;
  JournalEntryId?: string;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

export default function ReviewTransactions() {
  const [statusFilter, setStatusFilter] = useState<string>('Pending');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ accountId: string; memo: string }>({ accountId: '', memo: '' });

  const queryClient = useQueryClient();

  // Fetch transactions
  const { data: transactionsData, isLoading } = useQuery({
    queryKey: ['bank-transactions', statusFilter],
    queryFn: async () => {
      const url = statusFilter === 'all' 
        ? 'http://localhost:5000/api/banktransactions'
        : `http://localhost:5000/api/banktransactions?$filter=Status eq '${statusFilter}'`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      const data = await response.json();
      return data.value as BankTransaction[];
    }
  });

  // Fetch accounts for editing
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await fetch('http://localhost:5000/api/accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      const data = await response.json();
      return data.value as Account[];
    }
  });

  const accounts = accountsData || [];
  const transactions = transactionsData || [];

  // Filter by confidence
  const filteredTransactions = transactions.filter(txn => {
    if (confidenceFilter === 'all') return true;
    if (confidenceFilter === 'high') return txn.ConfidenceScore >= 80;
    if (confidenceFilter === 'medium') return txn.ConfidenceScore >= 60 && txn.ConfidenceScore < 80;
    if (confidenceFilter === 'low') return txn.ConfidenceScore < 60;
    return true;
  });

  // Update transaction mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BankTransaction> }) => {
      const response = await fetch(`http://localhost:5000/api/banktransactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to update transaction');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      setEditingId(null);
      setSelectedIds(new Set());
    }
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map(id => {
          const txn = transactions.find(t => t.Id === id);
          return fetch(`http://localhost:5000/api/banktransactions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              Status: 'Approved',
              ApprovedAccountId: txn?.SuggestedAccountId,
              ApprovedCategory: txn?.SuggestedCategory,
              ApprovedMemo: txn?.SuggestedMemo
            })
          });
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      setSelectedIds(new Set());
    }
  });

  const handleApprove = (id: string) => {
    const txn = transactions.find(t => t.Id === id);
    if (!txn) return;
    
    updateMutation.mutate({
      id,
      data: {
        Status: 'Approved',
        ApprovedAccountId: txn.SuggestedAccountId,
        ApprovedCategory: txn.SuggestedCategory,
        ApprovedMemo: txn.SuggestedMemo
      }
    });
  };

  const handleReject = (id: string) => {
    updateMutation.mutate({ id, data: { Status: 'Rejected' } });
  };

  const handleEdit = (txn: BankTransaction) => {
    setEditingId(txn.Id);
    setEditForm({
      accountId: txn.SuggestedAccountId || '',
      memo: txn.SuggestedMemo
    });
  };

  const handleSaveEdit = (id: string) => {
    updateMutation.mutate({
      id,
      data: {
        SuggestedAccountId: editForm.accountId,
        SuggestedMemo: editForm.memo,
        Status: 'Approved',
        ApprovedAccountId: editForm.accountId,
        ApprovedMemo: editForm.memo
      }
    });
  };

  const handleBulkApprove = () => {
    bulkApproveMutation.mutate(Array.from(selectedIds));
  };

  const handleApproveHighConfidence = () => {
    const highConfidenceIds = transactions
      .filter(t => t.ConfidenceScore >= 80 && t.Status === 'Pending')
      .map(t => t.Id);
    bulkApproveMutation.mutate(highConfidenceIds);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map(t => t.Id)));
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'text-blue-600 bg-blue-50';
      case 'Posted': return 'text-green-600 bg-green-50';
      case 'Rejected': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const highConfidenceCount = transactions.filter(t => t.ConfidenceScore >= 80 && t.Status === 'Pending').length;

  // Post transactions mutation
  const postMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fetch('http://localhost:7072/api/post-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: ids })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to post transactions');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      alert(`Successfully posted ${data.count} transactions to the journal!`);
    },
    onError: (error) => {
      alert(`Error posting transactions: ${error.message}`);
    }
  });

  const handlePostApproved = () => {
    const approvedIds = transactions
      .filter(t => t.Status === 'Approved')
      .map(t => t.Id);
    
    if (approvedIds.length === 0) {
      alert('No approved transactions to post');
      return;
    }

    if (confirm(`Are you sure you want to post ${approvedIds.length} transactions to the General Ledger? This will create journal entries.`)) {
      postMutation.mutate(approvedIds);
    }
  };

  const approvedCount = transactions.filter(t => t.Status === 'Approved').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Review Imported Transactions</h1>
          <p className="mt-2 text-sm text-gray-600">
            Review AI categorizations and approve transactions for journal entry posting
          </p>
        </div>
        <div>
          {approvedCount > 0 && (
            <button
              onClick={handlePostApproved}
              disabled={postMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300"
            >
              <FileText className="h-5 w-5 mr-2" />
              Post {approvedCount} Approved
            </button>
          )}
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Confidence</label>
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="high">High (≥80%)</option>
              <option value="medium">Medium (60-79%)</option>
              <option value="low">Low (&lt;60%)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {highConfidenceCount > 0 && (
            <button
              onClick={handleApproveHighConfidence}
              disabled={bulkApproveMutation.isPending}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300"
            >
              Approve High Confidence ({highConfidenceCount})
            </button>
          )}
          
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproveMutation.isPending}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300"
            >
              Approve Selected ({selectedIds.size})
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading transactions...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No transactions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI Category</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((txn) => (
                  <tr key={txn.Id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(txn.Id)}
                        onChange={() => toggleSelect(txn.Id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(txn.TransactionDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {txn.SourceName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="max-w-xs">
                        <div className="font-medium">{txn.Description}</div>
                        {txn.OriginalCategory && (
                          <div className="text-xs text-gray-500">Bank: {txn.OriginalCategory}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <span className={txn.Amount < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                        ${Math.abs(txn.Amount).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {editingId === txn.Id ? (
                        <div className="space-y-2">
                          <select
                            value={editForm.accountId}
                            onChange={(e) => setEditForm({ ...editForm, accountId: e.target.value })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                          >
                            <option value="">Select account...</option>
                            {accounts.map(acc => (
                              <option key={acc.Id} value={acc.Id}>{acc.Name}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={editForm.memo}
                            onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                            placeholder="Memo"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium">{txn.SuggestedCategory}</div>
                          <div className="text-xs text-gray-500">{txn.SuggestedMemo}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConfidenceColor(txn.ConfidenceScore)}`}>
                        {txn.ConfidenceScore}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(txn.Status)}`}>
                        {txn.Status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {editingId === txn.Id ? (
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => handleSaveEdit(txn.Id)}
                            className="text-green-600 hover:text-green-900"
                            title="Save"
                          >
                            <CheckCircle className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-gray-600 hover:text-gray-900"
                            title="Cancel"
                          >
                            <XCircle className="h-5 w-5" />
                          </button>
                        </div>
                      ) : txn.Status === 'Pending' ? (
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => handleEdit(txn)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit"
                          >
                            <Edit2 className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleApprove(txn.Id)}
                            className="text-green-600 hover:text-green-900"
                            title="Approve"
                          >
                            <CheckCircle className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleReject(txn.Id)}
                            className="text-red-600 hover:text-red-900"
                            title="Reject"
                          >
                            <XCircle className="h-5 w-5" />
                          </button>
                        </div>
                      ) : txn.JournalEntryId ? (
                        <button
                          onClick={() => window.location.href = '/journal-entries'}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="View Journal Entry"
                        >
                          <FileText className="h-5 w-5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
