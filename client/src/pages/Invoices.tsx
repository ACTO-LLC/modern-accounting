import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  IssueDate: string;
  DueDate: string;
  TotalAmount: number;
  Status: string;
}

interface InvoiceLine {
  Id: string;
  InvoiceId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
}

// Generate next invoice number based on existing invoices
function generateNextInvoiceNumber(invoices: Invoice[]): string {
  const existingNumbers = invoices
    .map(inv => {
      const match = inv.InvoiceNumber.match(/^INV-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);

  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return 'INV-' + String(maxNumber + 1).padStart(3, '0');
}

export default function Invoices() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>('/invoices');
      console.log('Invoices data:', response.data);
      return response.data.value;
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      // 1. Fetch the original invoice
      const invoiceResponse = await api.get<{ value: Invoice[] }>('/invoices?$filter=Id eq ' + invoiceId);
      const originalInvoice = invoiceResponse.data.value[0];
      if (!originalInvoice) {
        throw new Error('Invoice not found');
      }

      // 2. Fetch the invoice lines
      const linesResponse = await api.get<{ value: InvoiceLine[] }>('/invoicelines?$filter=InvoiceId eq ' + invoiceId);
      const originalLines = linesResponse.data.value;

      // 3. Generate new invoice number
      const newInvoiceNumber = generateNextInvoiceNumber(invoices || []);

      // 4. Calculate total amount from lines
      const totalAmount = originalLines.reduce((sum, line) => sum + (line.Quantity * line.UnitPrice), 0);

      // 5. Create new invoice with current date and Draft status
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const newInvoice = {
        InvoiceNumber: newInvoiceNumber,
        CustomerId: originalInvoice.CustomerId,
        IssueDate: today,
        DueDate: dueDate,
        TotalAmount: totalAmount,
        Status: 'Draft'
      };

      const createResponse = await api.post<Invoice>('/invoices', newInvoice);
      const createdInvoice = createResponse.data;

      // 6. Create line items for the new invoice
      for (const line of originalLines) {
        await api.post('/invoicelines', {
          InvoiceId: createdInvoice.Id,
          Description: line.Description,
          Quantity: line.Quantity,
          UnitPrice: line.UnitPrice
        });
      }

      return createdInvoice;
    },
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      // Navigate to edit page for the new invoice
      navigate('/invoices/' + newInvoice.Id + '/edit');
    },
    onError: (error) => {
      console.error('Failed to duplicate invoice:', error);
      alert('Failed to duplicate invoice');
    },
    onSettled: () => {
      setDuplicatingId(null);
    }
  });

  const handleDuplicate = (invoiceId: string) => {
    setDuplicatingId(invoiceId);
    duplicateMutation.mutate(invoiceId);
  };

  if (isLoading) return <div className="p-4">Loading invoices...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading invoices</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
        <button
          onClick={() => navigate('/invoices/new')}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                  No invoices found.
                </td>
              </tr>
            ) : (
              invoices?.map((invoice) => (
                <tr key={invoice.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.InvoiceNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.IssueDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.DueDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${invoice.TotalAmount?.toFixed(2) || '0.00'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {invoice.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 space-x-3">
                    <button
                      onClick={() => navigate('/invoices/' + invoice.Id + '/edit')}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDuplicate(invoice.Id)}
                      disabled={duplicatingId === invoice.Id}
                      className="text-gray-600 hover:text-gray-900 disabled:opacity-50 inline-flex items-center"
                      title="Duplicate invoice"
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      {duplicatingId === invoice.Id ? 'Duplicating...' : 'Duplicate'}
                    </button>
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
