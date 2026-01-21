import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import InvoiceForm, { InvoiceFormData } from '../components/InvoiceForm';

interface Invoice {
  Id: string;
  InvoiceNumber: string;
}

export default function NewInvoice() {
  const navigate = useNavigate();

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      // Separate lines from invoice data
      const { Lines, ...invoiceData } = data;

      // Create the invoice first
      await api.post('/invoices_write', invoiceData);

      // DAB doesn't return the created entity, so we need to query for it
      const escapedInvoiceNumber = String(invoiceData.InvoiceNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: Invoice[] }>(
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
            })
          )
        );
      }

      navigate('/invoices');
    } catch (error) {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice');
    }
  };

  return (
    <InvoiceForm
      title="New Invoice"
      onSubmit={onSubmit}
      submitButtonText="Create Invoice"
    />
  );
}
