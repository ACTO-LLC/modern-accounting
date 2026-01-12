import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { 
  generateNextInvoiceNumber, 
  calculateInvoiceTotal, 
  getCurrentDate, 
  getDateNDaysFromNow,
  type Invoice 
} from '../lib/invoiceUtils';
import { useToast } from '../hooks/useToast';

interface InvoiceLine {
  Id: string;
  InvoiceId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
}

export default function Invoices() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const { showToast } = useToast();

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
      const invoiceResponse = await api.get<{ value: Invoice[] }>(`/invoices?$filter=Id eq ${invoiceId}`);
      const originalInvoice = invoiceResponse.data.value[0];
      if (!originalInvoice) {
        throw new Error('Invoice not found');
      }

      // 2. Fetch the invoice lines
      const linesResponse = await api.get<{ value: InvoiceLine[] }>(`/invoicelines?$filter=InvoiceId eq ${invoiceId}`);
      const originalLines = linesResponse.data.value;

      // Validate that invoice has line items
      if (!originalLines || originalLines.length === 0) {
        throw new Error('Cannot duplicate invoice with no line items');
      }

      // 3. Generate new invoice number
      const newInvoiceNumber = generateNextInvoiceNumber(invoices || []);

      // 4. Calculate total amount from lines
      const totalAmount = calculateInvoiceTotal(originalLines);

      // 5. Create new invoice with current date and Draft status
      const newInvoice = {
        InvoiceNumber: newInvoiceNumber,
        CustomerId: originalInvoice.CustomerId,
        IssueDate: getCurrentDate(),
        DueDate: getDateNDaysFromNow(30),
        TotalAmount: totalAmount,
        Status: 'Draft'
      };

      const createResponse = await api.post<Invoice>('/invoices', newInvoice);
      const createdInvoice = createResponse.data;

      // 6. Create line items for the new invoice in parallel
      await Promise.all(
        originalLines.map(line =>
          api.post('/invoicelines', {
            InvoiceId: createdInvoice.Id,
            Description: line.Description,
            Quantity: line.Quantity,
            UnitPrice: line.UnitPrice
          })
        )
      );

      return createdInvoice;
    },
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showToast(`Invoice ${newInvoice.InvoiceNumber} has been duplicated`, 'success');
      // Navigate to edit page for the new invoice
      navigate('/invoices/' + newInvoice.Id + '/edit');
    },
    onError: (error) => {
      console.error('Failed to duplicate invoice:', error);
      const message = error instanceof Error ? error.message : 'Failed to duplicate invoice';
      showToast(message, 'error');
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
