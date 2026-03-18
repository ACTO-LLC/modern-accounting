import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import InvoiceForm, { InvoiceFormData } from '../components/InvoiceForm';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
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
  const { showToast } = useToast();

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

      // Create the invoice first (convert empty strings to null for DAB UUID columns)
      await api.post('/invoices_write', {
        ...invoiceData,
        TaxRateId: invoiceData.TaxRateId || null,
        ProjectId: invoiceData.ProjectId || null,
        ClassId: invoiceData.ClassId || null,
        TermId: invoiceData.TermId || null,
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
              Amount: (line.Quantity || 0) * (line.UnitPrice || 0),
              IsTaxable: line.IsTaxable ?? true,
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
          await api.post(`/invoices/${invoice.Id}/post`, { userId: user?.name || user?.username || 'System' });
        } catch (postingError) {
          const msg = postingError instanceof Error ? postingError.message : 'GL posting failed';
          showToast(`Invoice created, but ${msg}`, 'warning');
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
