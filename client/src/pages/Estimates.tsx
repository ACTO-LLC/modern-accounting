import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, FileText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface Estimate {
  Id: string;
  EstimateNumber: string;
  CustomerId: string;
  IssueDate: string;
  ExpirationDate: string | null;
  TotalAmount: number;
  Status: string;
  ConvertedToInvoiceId: string | null;
  Notes: string | null;
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800',
  Sent: 'bg-blue-100 text-blue-800',
  Accepted: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  Expired: 'bg-yellow-100 text-yellow-800',
  Converted: 'bg-purple-100 text-purple-800',
};

export default function Estimates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: estimates, isLoading, error } = useQuery({
    queryKey: ['estimates'],
    queryFn: async () => {
      const response = await api.get<{ value: Estimate[] }>('/estimates');
      console.log('Estimates data:', response.data);
      return response.data.value;
    },
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: async (estimate: Estimate) => {
      // 1. Fetch estimate lines
      const linesResponse = await api.get<{ value: any[] }>(`/estimatelines?$filter=EstimateId eq ${estimate.Id}`);
      const lines = linesResponse.data.value;

      // 2. Generate invoice number
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

      // 3. Create invoice
      const invoiceResponse = await api.post('/invoices', {
        InvoiceNumber: invoiceNumber,
        CustomerId: estimate.CustomerId,
        IssueDate: new Date().toISOString().split('T')[0],
        DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        TotalAmount: estimate.TotalAmount,
        Status: 'Draft',
      });
      const invoice = invoiceResponse.data;

      // 4. Create invoice lines
      await Promise.all(
        lines.map((line: any) =>
          api.post('/invoicelines', {
            InvoiceId: invoice.Id,
            Description: line.Description,
            Quantity: line.Quantity,
            UnitPrice: line.UnitPrice,
          })
        )
      );

      // 5. Update estimate status to Converted
      await api.patch(`/estimates/Id/${estimate.Id}`, {
        Status: 'Converted',
        ConvertedToInvoiceId: invoice.Id,
      });

      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/invoices/${invoice.Id}/edit`);
    },
    onError: (error) => {
      console.error('Failed to convert estimate:', error);
      alert('Failed to convert estimate to invoice');
    },
  });

  const filteredEstimates = estimates?.filter((estimate) => {
    if (statusFilter === 'all') return true;
    return estimate.Status === statusFilter;
  });

  if (isLoading) return <div className="p-4">Loading estimates...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading estimates</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Estimates & Quotes</h1>
        <button
          onClick={() => navigate('/estimates/new')}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Estimate
        </button>
      </div>

      {/* Status Filter */}
      <div className="mb-4">
        <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Status
        </label>
        <select
          id="statusFilter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
        >
          <option value="all">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Accepted">Accepted</option>
          <option value="Rejected">Rejected</option>
          <option value="Expired">Expired</option>
          <option value="Converted">Converted</option>
        </select>
      </div>

      <div className="bg-white shadow overflow-hidden rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estimate #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expiration
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredEstimates?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No estimates found.
                </td>
              </tr>
            ) : (
              filteredEstimates?.map((estimate) => (
                <tr key={estimate.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {estimate.EstimateNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {estimate.IssueDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {estimate.ExpirationDate || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${estimate.TotalAmount?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        statusColors[estimate.Status] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {estimate.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 space-x-3">
                    <button
                      onClick={() => navigate(`/estimates/${estimate.Id}/edit`)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    {(estimate.Status === 'Accepted' || estimate.Status === 'Sent' || estimate.Status === 'Draft') &&
                      !estimate.ConvertedToInvoiceId && (
                        <button
                          onClick={() => {
                            if (confirm('Convert this estimate to an invoice?')) {
                              convertToInvoiceMutation.mutate(estimate);
                            }
                          }}
                          disabled={convertToInvoiceMutation.isPending}
                          className="text-green-600 hover:text-green-900 inline-flex items-center"
                        >
                          <ArrowRight className="w-4 h-4 mr-1" />
                          Convert to Invoice
                        </button>
                      )}
                    {estimate.ConvertedToInvoiceId && (
                      <button
                        onClick={() => navigate(`/invoices/${estimate.ConvertedToInvoiceId}/edit`)}
                        className="text-purple-600 hover:text-purple-900 inline-flex items-center"
                      >
                        <FileText className="w-4 h-4 mr-1" />
                        View Invoice
                      </button>
                    )}
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
