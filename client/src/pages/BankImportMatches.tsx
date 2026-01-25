import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, Search, Filter, ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';

interface BankTransactionMatch {
  Id: string;
  BankTransactionId: string;
  TransactionDate: string;
  TransactionDescription: string;
  TransactionAmount: number;
  InvoiceId: string;
  InvoiceNumber: string;
  InvoiceTotalAmount: number;
  InvoiceAmountPaid: number;
  InvoiceBalanceDue: number;
  CustomerId: string;
  CustomerName: string;
  SuggestedAmount: number;
  Confidence: 'High' | 'Medium' | 'Low';
  MatchReason: string;
  Status: 'Suggested' | 'Accepted' | 'Rejected';
  AcceptedAt: string | null;
  AcceptedBy: string | null;
  CreatedAt: string;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  TotalAmount: number;
  AmountPaid: number;
  BalanceDue: number;
  DueDate: string;
  Status: string;
}

type FilterStatus = 'all' | 'Suggested' | 'Accepted' | 'Rejected';
type FilterConfidence = 'all' | 'High' | 'Medium' | 'Low';

export default function BankImportMatches() {
  const queryClient = useQueryClient();

  // Filter state
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('Suggested');
  const [filterConfidence, setFilterConfidence] = useState<FilterConfidence>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Manual match state
  const [manualMatchTxnId, setManualMatchTxnId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');

  // Fetch matches
  const { data: matchesData, isLoading: loadingMatches, refetch: refetchMatches } = useQuery({
    queryKey: ['bank-transaction-matches', filterStatus, filterConfidence],
    queryFn: async (): Promise<BankTransactionMatch[]> => {
      let filter = '';
      const filters: string[] = [];

      if (filterStatus !== 'all') {
        filters.push(`Status eq '${filterStatus}'`);
      }
      if (filterConfidence !== 'all') {
        filters.push(`Confidence eq '${filterConfidence}'`);
      }

      if (filters.length > 0) {
        filter = `?$filter=${filters.join(' and ')}`;
      }

      const response = await api.get(`/banktransactionmatches${filter}&$orderby=CreatedAt desc`);
      return response.data.value || [];
    }
  });

  // Fetch unpaid invoices for manual matching
  const { data: unpaidInvoices } = useQuery({
    queryKey: ['unpaid-invoices'],
    queryFn: async (): Promise<Invoice[]> => {
      const response = await api.get(
        "/invoices?$filter=Status ne 'Paid' and Status ne 'Draft'&$orderby=DueDate"
      );
      return response.data.value || [];
    },
    enabled: manualMatchTxnId !== null
  });

  // Accept match mutation
  const acceptMatchMutation = useMutation({
    mutationFn: async (match: BankTransactionMatch) => {
      // Update match status
      await api.patch(`/banktransactionmatches_write/Id/${match.Id}`, {
        Status: 'Accepted',
        AcceptedAt: new Date().toISOString(),
        AcceptedBy: 'User'
      });

      // Create payment record
      const paymentResponse = await api.post('/payments_write', {
        PaymentNumber: `PMT-AUTO-${Date.now()}`,
        CustomerId: match.CustomerId,
        PaymentDate: match.TransactionDate,
        TotalAmount: match.SuggestedAmount,
        PaymentMethod: 'Bank Transfer',
        DepositAccountId: await getDepositAccountId(match.BankTransactionId),
        Memo: `Auto-matched from bank import: ${match.TransactionDescription}`,
        Status: 'Completed'
      });

      const paymentId = paymentResponse.data.value?.[0]?.Id || paymentResponse.data.Id;

      // Create payment application
      await api.post('/paymentapplications', {
        PaymentId: paymentId,
        InvoiceId: match.InvoiceId,
        AmountApplied: match.SuggestedAmount
      });

      // Update invoice AmountPaid
      const invoiceResponse = await api.get(`/invoices/Id/${match.InvoiceId}`);
      const invoice = invoiceResponse.data;
      const newAmountPaid = (invoice.AmountPaid || 0) + match.SuggestedAmount;
      const newStatus = newAmountPaid >= invoice.TotalAmount ? 'Paid' : 'Partial';

      await api.patch(`/invoices_write/Id/${match.InvoiceId}`, {
        AmountPaid: newAmountPaid,
        Status: newStatus
      });

      // Update bank transaction
      await api.patch(`/banktransactions/Id/${match.BankTransactionId}`, {
        Status: 'Matched',
        MatchConfidence: match.Confidence,
        MatchedPaymentId: paymentId,
        MatchedAt: new Date().toISOString()
      });

      return { paymentId, match };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transaction-matches'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    }
  });

  // Reject match mutation
  const rejectMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      await api.patch(`/banktransactionmatches_write/Id/${matchId}`, {
        Status: 'Rejected'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transaction-matches'] });
    }
  });

  // Bulk accept high confidence matches
  const bulkAcceptMutation = useMutation({
    mutationFn: async () => {
      const highConfidenceMatches = matches.filter(
        m => m.Confidence === 'High' && m.Status === 'Suggested'
      );

      for (const match of highConfidenceMatches) {
        await acceptMatchMutation.mutateAsync(match);
      }

      return highConfidenceMatches.length;
    },
    onSuccess: (count) => {
      alert(`Successfully accepted ${count} high-confidence matches`);
    }
  });

  // Create manual match mutation
  const createManualMatchMutation = useMutation({
    mutationFn: async ({ txnId, invoiceId }: { txnId: string; invoiceId: string }) => {
      // Get transaction details
      const txnResponse = await api.get(`/banktransactions/Id/${txnId}`);
      const txn = txnResponse.data;

      // Get invoice details
      const invoiceResponse = await api.get(`/invoices/Id/${invoiceId}`);
      const invoice = invoiceResponse.data;

      const suggestedAmount = Math.min(txn.Amount, invoice.BalanceDue);

      // Create match record
      await api.post('/banktransactionmatches_write', {
        BankTransactionId: txnId,
        InvoiceId: invoiceId,
        SuggestedAmount: suggestedAmount,
        Confidence: 'High',
        MatchReason: 'Manual match by user',
        Status: 'Suggested'
      });

      return { txnId, invoiceId };
    },
    onSuccess: () => {
      setManualMatchTxnId(null);
      setSelectedInvoiceId('');
      queryClient.invalidateQueries({ queryKey: ['bank-transaction-matches'] });
    }
  });

  // Helper to get deposit account from transaction
  const getDepositAccountId = async (txnId: string): Promise<string> => {
    const response = await api.get(`/banktransactions/Id/${txnId}`);
    return response.data.SourceAccountId;
  };

  // Filter matches by search term
  const matches = (matchesData || []).filter(match => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      match.TransactionDescription?.toLowerCase().includes(term) ||
      match.CustomerName?.toLowerCase().includes(term) ||
      match.InvoiceNumber?.toLowerCase().includes(term)
    );
  });

  const confidenceColors = {
    High: 'bg-green-100 text-green-800 border-green-200',
    Medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    Low: 'bg-red-100 text-red-800 border-red-200'
  };

  const statusColors = {
    Suggested: 'bg-blue-100 text-blue-800',
    Accepted: 'bg-green-100 text-green-800',
    Rejected: 'bg-gray-100 text-gray-800'
  };

  const highConfidenceCount = matches.filter(
    m => m.Confidence === 'High' && m.Status === 'Suggested'
  ).length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <Link to="/bank-import" className="mr-4 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Review Payment Matches</h1>
            <p className="text-sm text-gray-600">
              Review and accept suggested matches between bank deposits and unpaid invoices.
            </p>
          </div>
        </div>
        {highConfidenceCount > 0 && (
          <button
            onClick={() => bulkAcceptMutation.mutate()}
            disabled={bulkAcceptMutation.isPending}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {bulkAcceptMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            Accept All High Confidence ({highConfidenceCount})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white shadow rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center">
            <Filter className="w-5 h-5 text-gray-400 mr-2" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="status-filter" className="text-sm text-gray-600">Status:</label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="Suggested">Suggested</option>
              <option value="Accepted">Accepted</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="confidence-filter" className="text-sm text-gray-600">Confidence:</label>
            <select
              id="confidence-filter"
              value={filterConfidence}
              onChange={(e) => setFilterConfidence(e.target.value as FilterConfidence)}
              className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="all">All</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          <div className="flex-1 max-w-xs">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customer, invoice, description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            onClick={() => refetchMatches()}
            className="inline-flex items-center px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </button>
        </div>
      </div>

      {/* Matches List */}
      {loadingMatches ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <RefreshCw className="mx-auto h-8 w-8 text-gray-400 animate-spin" />
          <p className="mt-2 text-gray-600">Loading matches...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-gray-600">No matches found.</p>
          <p className="text-sm text-gray-500">
            {filterStatus !== 'all' || filterConfidence !== 'all'
              ? 'Try adjusting your filters.'
              : 'Import bank transactions to generate matches.'}
          </p>
          <Link
            to="/bank-import"
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
          >
            Import Transactions
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <div
              key={match.Id}
              className={`bg-white shadow rounded-lg p-6 border-l-4 ${
                match.Status === 'Accepted' ? 'border-l-green-500' :
                match.Status === 'Rejected' ? 'border-l-gray-400' :
                match.Confidence === 'High' ? 'border-l-green-500' :
                match.Confidence === 'Medium' ? 'border-l-yellow-500' :
                'border-l-red-400'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  {/* Transaction Info */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${confidenceColors[match.Confidence]}`}>
                      {match.Confidence} Confidence
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[match.Status]}`}>
                      {match.Status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Bank Transaction */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Bank Deposit</h4>
                      <p className="text-sm text-gray-900 font-medium">
                        {formatDate(match.TransactionDate)}
                      </p>
                      <p className="text-sm text-gray-700 truncate" title={match.TransactionDescription}>
                        {match.TransactionDescription}
                      </p>
                      <p className="text-lg font-semibold text-green-600 mt-1">
                        +${match.TransactionAmount.toFixed(2)}
                      </p>
                    </div>

                    {/* Invoice */}
                    <div className="bg-indigo-50 rounded-lg p-4">
                      <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">Matched Invoice</h4>
                      <p className="text-sm font-medium text-gray-900">
                        Invoice #{match.InvoiceNumber}
                      </p>
                      <p className="text-sm text-gray-700">{match.CustomerName}</p>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-500">Balance Due:</span>
                        <span className="text-sm font-medium text-gray-900">${match.InvoiceBalanceDue.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">Apply Amount:</span>
                        <span className="text-sm font-semibold text-indigo-600">${match.SuggestedAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Match Reason */}
                  <p className="mt-3 text-sm text-gray-600">
                    <span className="font-medium">Match Reason:</span> {match.MatchReason}
                  </p>
                </div>

                {/* Actions */}
                {match.Status === 'Suggested' && (
                  <div className="ml-4 flex flex-col gap-2">
                    <button
                      onClick={() => acceptMatchMutation.mutate(match)}
                      disabled={acceptMatchMutation.isPending}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Accept
                    </button>
                    <button
                      onClick={() => rejectMatchMutation.mutate(match.Id)}
                      disabled={rejectMatchMutation.isPending}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </button>
                  </div>
                )}

                {match.Status === 'Accepted' && (
                  <div className="ml-4 text-center">
                    <CheckCircle className="w-8 h-8 text-green-500 mx-auto" />
                    <p className="text-xs text-gray-500 mt-1">
                      {match.AcceptedAt && formatDate(match.AcceptedAt)}
                    </p>
                  </div>
                )}

                {match.Status === 'Rejected' && (
                  <div className="ml-4">
                    <XCircle className="w-8 h-8 text-gray-400 mx-auto" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {matches.length > 0 && (
        <div className="mt-6 bg-white shadow rounded-lg p-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{matches.length}</p>
              <p className="text-sm text-gray-500">Total Matches</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {matches.filter(m => m.Confidence === 'High').length}
              </p>
              <p className="text-sm text-gray-500">High Confidence</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">
                {matches.filter(m => m.Status === 'Accepted').length}
              </p>
              <p className="text-sm text-gray-500">Accepted</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-indigo-600">
                ${matches
                  .filter(m => m.Status === 'Accepted')
                  .reduce((sum, m) => sum + m.SuggestedAmount, 0)
                  .toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">Total Applied</p>
            </div>
          </div>
        </div>
      )}

      {/* Manual Match Modal */}
      {manualMatchTxnId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Manual Match</h3>
            <p className="text-sm text-gray-600 mb-4">
              Select an invoice to match with this deposit.
            </p>

            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 mb-4"
            >
              <option value="">Select an invoice...</option>
              {unpaidInvoices?.map(invoice => (
                <option key={invoice.Id} value={invoice.Id}>
                  #{invoice.InvoiceNumber} - {invoice.CustomerName} - ${invoice.BalanceDue.toFixed(2)} due
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setManualMatchTxnId(null);
                  setSelectedInvoiceId('');
                }}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => createManualMatchMutation.mutate({
                  txnId: manualMatchTxnId,
                  invoiceId: selectedInvoiceId
                })}
                disabled={!selectedInvoiceId || createManualMatchMutation.isPending}
                className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                Create Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
