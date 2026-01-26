import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SalesReceiptForm, { SalesReceiptFormData } from '../components/SalesReceiptForm';
import { generateNextSalesReceiptNumber, SalesReceipt } from '../lib/salesReceiptUtils';

export default function NewSalesReceipt() {
  const navigate = useNavigate();

  // Fetch all existing sales receipts to generate the next number
  const { data: existingReceipts } = useQuery({
    queryKey: ['salesreceipts-all'],
    queryFn: async () => {
      const response = await api.get<{ value: SalesReceipt[] }>('/salesreceipts');
      return response.data.value;
    },
  });

  const onSubmit = async (data: SalesReceiptFormData) => {
    try {
      // Separate lines from sales receipt data
      const { Lines, ...salesReceiptData } = data;

      // Create the sales receipt first
      await api.post('/salesreceipts_write', salesReceiptData);

      // DAB doesn't return the created entity, so we need to query for it
      const escapedNumber = String(salesReceiptData.SalesReceiptNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: SalesReceipt[] }>(
        `/salesreceipts?$filter=SalesReceiptNumber eq '${escapedNumber}'`
      );
      const salesReceipt = queryResponse.data.value[0];

      if (!salesReceipt?.Id) {
        throw new Error('Failed to retrieve created sales receipt');
      }

      // Create sales receipt lines
      if (Lines && Lines.length > 0) {
        await Promise.all(
          Lines.map((line, index) =>
            api.post('/salesreceiptlines', {
              SalesReceiptId: salesReceipt.Id,
              ProductServiceId: line.ProductServiceId || null,
              Description: line.Description,
              Quantity: line.Quantity,
              UnitPrice: line.UnitPrice,
              Amount: line.Quantity * line.UnitPrice,
              SortOrder: index,
            })
          )
        );
      }

      navigate('/sales-receipts');
    } catch (error) {
      console.error('Failed to create sales receipt:', error);
      alert('Failed to create sales receipt');
    }
  };

  const nextNumber = existingReceipts ? generateNextSalesReceiptNumber(existingReceipts) : 'SR-001';

  return (
    <SalesReceiptForm
      title="New Sales Receipt"
      onSubmit={onSubmit}
      submitButtonText="Create Sales Receipt"
      initialValues={{
        SalesReceiptNumber: nextNumber,
      }}
    />
  );
}
