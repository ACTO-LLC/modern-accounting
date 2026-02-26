import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import InvoiceForm, { InvoiceFormData } from '../components/InvoiceForm';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { createInvoiceJournalEntry } from '../lib/autoPostingService';
import { useAuth } from '../contexts/AuthContext';
import { generateNextInvoiceNumber, type Invoice } from '../lib/invoiceUtils';

interface InvoiceWithCustomer {
  Id: string;
  InvoiceNumber: string;
  CustomerName?: string;
}

export default function NewInvoice() {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const { user } = useAuth();

  // Fetch existing invoices to generate the next invoice number
  const { data: allInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices-for-numbering'],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>('/invoices?$select=InvoiceNumber');
      return response.data.value;
    },
  });

  const nextInvoiceNumber = allInvoices
    ? generateNextInvoiceNumber(allInvoices, settings.invoiceNumberPrefix)
    : '';

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      // Separate lines from invoice data
      const { Lines, ...invoiceData } = data;

      // Create the invoice first (include ProjectId/ClassId)
      await api.post('/invoices_write', {
        ...invoiceData,
        ProjectId: invoiceData.ProjectId || null,
        ClassId: invoiceData.ClassId || null,
      });

      // DAB doesn't return the created entity, so we need to query for it
      const escapedInvoiceNumber = String(invoiceData.InvoiceNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: InvoiceWithCustomer[] }>(
        `/invoices?$filter=InvoiceNumber eq '${escapedInvoiceNumber}'`
      );
      const invoice = queryResponse.data.value[0];

      if (!invoice?.Id) {
        throw new Error('Failed to retrieve created invoice');
      }

      // Create invoice lines
      if (Lines && Lines.length > 0) {
        await Promise.all(
          Lines.map((line) =>
            api.post('/invoicelines', {
              InvoiceId: invoice.Id,
              Description: line.Description,
              Quantity: line.Quantity,
              UnitPrice: line.UnitPrice,
              ProductServiceId: line.ProductServiceId || null,
              ProjectId: line.ProjectId || null,
              ClassId: line.ClassId || null,
            })
          )
        );
      }

      // In Simple mode, auto-post to GL
      if (settings.invoicePostingMode === 'simple' && invoiceData.Status !== 'Draft') {
        try {
          await createInvoiceJournalEntry(
            invoice.Id,
            invoiceData.TotalAmount,
            invoiceData.TaxAmount,
            invoiceData.InvoiceNumber,
            invoice.CustomerName || 'Customer',
            invoiceData.IssueDate,
            user?.name || user?.username,
            data.ProjectId || null,
            data.ClassId || null
          );
        } catch (postingError) {
          console.warn('Auto-posting failed, invoice still created:', postingError);
          // Don't fail the whole operation if posting fails
        }
      }

      navigate('/invoices');
    } catch (error) {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice');
    }
  };

  if (isLoadingInvoices) {
    return null;
  }

  return (
    <InvoiceForm
      title="New Invoice"
      initialValues={nextInvoiceNumber ? { InvoiceNumber: nextInvoiceNumber } : undefined}
      onSubmit={onSubmit}
      submitButtonText="Create Invoice"
      isAutoNumbered={!!nextInvoiceNumber}
    />
  );
}
