import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import InvoiceForm, { InvoiceFormData } from '../components/InvoiceForm';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { 
  generateNextInvoiceNumber, 
  calculateInvoiceTotal, 
  getCurrentDate, 
  getDateNDaysFromNow,
  type Invoice 
} from '../lib/invoiceUtils';
import { formatGuidForOData } from '../lib/validation';
import { useToast } from '../hooks/useToast';

interface InvoiceLine {
  Id: string;
  InvoiceId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
}

export default function EditInvoice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isDuplicating, setIsDuplicating] = useState(false);
  const { showToast } = useToast();

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
      if (!id) return null;
      // Fetch invoice and lines separately since $expand is not supported
      const [invoiceResponse, linesResponse] = await Promise.all([
        api.get<{ value: any[] }>(`/invoices?$filter=Id eq ${formatGuidForOData(id, 'Invoice Id')}`),
        api.get<{ value: any[] }>(`/invoicelines?$filter=InvoiceId eq ${formatGuidForOData(id, 'Invoice Id')}`)
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
      if (!id) throw new Error('Invoice ID is required');
      
      // 1. Update Invoice (exclude Lines)
      const { Lines, ...invoiceData } = data;
      await api.patch(`/invoices/Id/${id}`, invoiceData);

      // 2. Handle Lines Reconciliation
      // Fetch current lines from DB to know what to delete
      const currentLinesResponse = await api.get<{ value: any[] }>(`/invoicelines?$filter=InvoiceId eq ${formatGuidForOData(id, 'Invoice Id')}`);
      const currentLines = currentLinesResponse.data.value;
      const currentLineIds = new Set(currentLines.map(l => l.Id));

      const incomingLines = Lines || [];
      const incomingLineIds = new Set(incomingLines.map(l => l.Id).filter(Boolean));

      // Identify operations
      const toDelete = currentLines.filter(l => !incomingLineIds.has(l.Id));
      const toUpdate = incomingLines.filter(l => l.Id && currentLineIds.has(l.Id));
      const toAdd = incomingLines.filter(l => !l.Id);

      // Execute operations in parallel
      await Promise.all([
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
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      showToast('Invoice has been updated', 'success');
      navigate('/invoices');
    },
    onError: (error) => {
      console.error('Failed to update invoice:', error);
      const message = error instanceof Error ? error.message : 'Failed to update invoice';
      showToast(message, 'error');
    }
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !id) {
        throw new Error('Invoice not found');
      }

      // Fetch the invoice lines
      const linesResponse = await api.get<{ value: InvoiceLine[] }>(`/invoicelines?$filter=InvoiceId eq ${formatGuidForOData(id, 'Invoice Id')}`);
      const originalLines = linesResponse.data.value;

      // Validate that invoice has line items
      if (!originalLines || originalLines.length === 0) {
        throw new Error('Cannot duplicate invoice with no line items');
      }

      // Generate new invoice number
      const newInvoiceNumber = generateNextInvoiceNumber(allInvoices || []);

      // Calculate total amount from lines
      const totalAmount = calculateInvoiceTotal(originalLines);

      // Create new invoice with current date and Draft status
      const newInvoice = {
        InvoiceNumber: newInvoiceNumber,
        CustomerId: invoice.CustomerId,
        IssueDate: getCurrentDate(),
        DueDate: getDateNDaysFromNow(30),
        TotalAmount: totalAmount,
        Status: 'Draft'
      };

      const createResponse = await api.post<Invoice>('/invoices', newInvoice);
      const createdInvoice = createResponse.data;

      // Create line items for the new invoice in parallel
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
