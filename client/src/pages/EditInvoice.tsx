import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import InvoiceForm, { InvoiceFormData } from '../components/InvoiceForm';
import { Copy } from 'lucide-react';
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

export default function EditInvoice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDuplicating, setIsDuplicating] = useState(false);

  // Fetch all invoices to generate new invoice number
  const { data: allInvoices } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>('/invoices');
      return response.data.value;
    },
  });

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      // Fetch invoice and lines separately since $expand is not supported
      const [invoiceResponse, linesResponse] = await Promise.all([
        api.get<{ value: any[] }>(`/invoices?$filter=Id eq ${id}`),
        api.get<{ value: any[] }>(`/invoicelines?$filter=InvoiceId eq ${id}`)
      ]);
      
      const invoice = invoiceResponse.data.value[0];
      if (invoice) {
        invoice.Lines = linesResponse.data.value;
      }
      return invoice;
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      // 1. Update Invoice (exclude Lines)
      const { Lines, ...invoiceData } = data;
      await api.patch(`/invoices/Id/${id}`, invoiceData);

      // 2. Handle Lines Reconciliation
      // Fetch current lines from DB to know what to delete
      const currentLinesResponse = await api.get<{ value: any[] }>(`/invoicelines?$filter=InvoiceId eq ${id}`);
      const currentLines = currentLinesResponse.data.value;
      const currentLineIds = new Set(currentLines.map(l => l.Id));

      const incomingLines = Lines || [];
      const incomingLineIds = new Set(incomingLines.map(l => l.Id).filter(Boolean));

      // Identify operations
      const toDelete = currentLines.filter(l => !incomingLineIds.has(l.Id));
      const toUpdate = incomingLines.filter(l => l.Id && currentLineIds.has(l.Id));
      const toAdd = incomingLines.filter(l => !l.Id);

      // Execute operations
      const promises = [
        ...toDelete.map(l => api.delete(`/invoicelines/Id/${l.Id}`)),
        ...toUpdate.map(l => api.patch(`/invoicelines/Id/${l.Id}`, {
          Description: l.Description,
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice
        })),
        ...toAdd.map(l => api.post('/invoicelines', {
          InvoiceId: id,
          Description: l.Description,
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice
        }))
      ];

      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      navigate('/invoices');
    },
    onError: (error) => {
      console.error('Failed to update invoice:', error);
      alert('Failed to update invoice');
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !id) {
        throw new Error('Invoice not found');
      }

      // Fetch the invoice lines
      const linesResponse = await api.get<{ value: InvoiceLine[] }>('/invoicelines?$filter=InvoiceId eq ' + id);
      const originalLines = linesResponse.data.value;

      // Generate new invoice number
      const newInvoiceNumber = generateNextInvoiceNumber(allInvoices || []);

      // Calculate total amount from lines
      const totalAmount = originalLines.reduce((sum, line) => sum + (line.Quantity * line.UnitPrice), 0);

      // Create new invoice with current date and Draft status
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const newInvoice = {
        InvoiceNumber: newInvoiceNumber,
        CustomerId: invoice.CustomerId,
        IssueDate: today,
        DueDate: dueDate,
        TotalAmount: totalAmount,
        Status: 'Draft'
      };

      const createResponse = await api.post<Invoice>('/invoices', newInvoice);
      const createdInvoice = createResponse.data;

      // Create line items for the new invoice
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
      setIsDuplicating(false);
    }
  });

  const handleDuplicate = () => {
    setIsDuplicating(true);
    duplicateMutation.mutate();
  };

  if (isLoading) return <div className="p-4">Loading invoice...</div>;
  if (error || !invoice) return <div className="p-4 text-red-600">Error loading invoice</div>;

  const duplicateButton = (
    <button
      onClick={handleDuplicate}
      disabled={isDuplicating}
      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
      title="Duplicate invoice"
    >
      <Copy className="w-4 h-4 mr-2" />
      {isDuplicating ? 'Duplicating...' : 'Duplicate'}
    </button>
  );

  return (
    <InvoiceForm
      title="Edit Invoice"
      initialValues={invoice}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
      headerActions={duplicateButton}
    />
  );
}
