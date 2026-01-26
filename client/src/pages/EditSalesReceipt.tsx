import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import SalesReceiptForm, { SalesReceiptFormData } from '../components/SalesReceiptForm';
import { SalesReceipt, SalesReceiptLine } from '../lib/salesReceiptUtils';
import { formatGuidForOData } from '../lib/validation';

export default function EditSalesReceipt() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch the sales receipt
  const { data: salesReceipt, isLoading: loadingReceipt } = useQuery({
    queryKey: ['salesreceipt', id],
    queryFn: async () => {
      const response = await api.get<{ value: SalesReceipt[] }>(
        `/salesreceipts?$filter=Id eq ${formatGuidForOData(id!, 'Sales Receipt Id')}`
      );
      return response.data.value[0];
    },
    enabled: !!id,
  });

  // Fetch the sales receipt lines
  const { data: lines, isLoading: loadingLines } = useQuery({
    queryKey: ['salesreceiptlines', id],
    queryFn: async () => {
      const response = await api.get<{ value: SalesReceiptLine[] }>(
        `/salesreceiptlines?$filter=SalesReceiptId eq ${formatGuidForOData(id!, 'Sales Receipt Id')}&$orderby=SortOrder`
      );
      return response.data.value;
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SalesReceiptFormData) => {
      const { Lines, ...salesReceiptData } = data;

      // Update the sales receipt
      await api.patch(`/salesreceipts_write/Id/${id}`, salesReceiptData);

      // Get existing line IDs
      const existingLineIds = new Set(lines?.map(l => l.Id) || []);
      const newLineIds = new Set(Lines.filter(l => l.Id).map(l => l.Id!));

      // Delete removed lines
      const linesToDelete = [...existingLineIds].filter(lineId => lineId && !newLineIds.has(lineId));
      await Promise.all(
        linesToDelete.map(lineId =>
          lineId ? api.delete(`/salesreceiptlines/Id/${lineId}`) : Promise.resolve()
        )
      );

      // Update existing lines and create new ones
      await Promise.all(
        Lines.map(async (line, index) => {
          const lineData = {
            SalesReceiptId: id,
            ProductServiceId: line.ProductServiceId || null,
            Description: line.Description,
            Quantity: line.Quantity,
            UnitPrice: line.UnitPrice,
            Amount: line.Quantity * line.UnitPrice,
            SortOrder: index,
          };

          if (line.Id && existingLineIds.has(line.Id)) {
            // Update existing line
            await api.patch(`/salesreceiptlines/Id/${line.Id}`, lineData);
          } else {
            // Create new line
            await api.post('/salesreceiptlines', lineData);
          }
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesreceipt', id] });
      queryClient.invalidateQueries({ queryKey: ['salesreceiptlines', id] });
      queryClient.invalidateQueries({ queryKey: ['salesreceipts'] });
      navigate('/sales-receipts');
    },
    onError: (error) => {
      console.error('Failed to update sales receipt:', error);
      alert('Failed to update sales receipt');
    },
  });

  const isLoading = loadingReceipt || loadingLines;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!salesReceipt) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <div className="text-center text-red-500">Sales receipt not found</div>
      </div>
    );
  }

  // Transform data for the form
  const initialValues: Partial<SalesReceiptFormData> = {
    SalesReceiptNumber: salesReceipt.SalesReceiptNumber,
    CustomerId: salesReceipt.CustomerId || undefined,
    SaleDate: salesReceipt.SaleDate,
    DepositAccountId: salesReceipt.DepositAccountId,
    PaymentMethod: salesReceipt.PaymentMethod || undefined,
    Reference: salesReceipt.Reference || undefined,
    Subtotal: salesReceipt.Subtotal,
    TaxRateId: salesReceipt.TaxRateId || undefined,
    TaxAmount: salesReceipt.TaxAmount,
    TotalAmount: salesReceipt.TotalAmount,
    Memo: salesReceipt.Memo || undefined,
    Status: salesReceipt.Status as 'Completed' | 'Voided',
    ClassId: salesReceipt.ClassId || undefined,
    LocationId: salesReceipt.LocationId || undefined,
    Lines: lines?.map(line => ({
      Id: line.Id,
      ProductServiceId: line.ProductServiceId || '',
      Description: line.Description,
      Quantity: line.Quantity,
      UnitPrice: line.UnitPrice,
      Amount: line.Amount,
    })) || [{ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0 }],
  };

  return (
    <SalesReceiptForm
      title={`Edit Sales Receipt ${salesReceipt.SalesReceiptNumber}`}
      initialValues={initialValues}
      onSubmit={(data) => updateMutation.mutateAsync(data)}
      submitButtonText="Save Changes"
      isSubmitting={updateMutation.isPending}
    />
  );
}
