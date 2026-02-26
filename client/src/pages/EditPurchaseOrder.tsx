import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import PurchaseOrderForm, { PurchaseOrderFormData } from '../components/PurchaseOrderForm';
import { formatGuidForOData, isValidUUID } from '../lib/validation';
import { useToast } from '../hooks/useToast';

interface PurchaseOrder {
  Id: string;
  PONumber: string;
  VendorId: string;
  PODate: string;
  ExpectedDate?: string;
  Subtotal: number;
  Total: number;
  Status: 'Draft' | 'Sent' | 'Received' | 'Partial' | 'Cancelled';
  Notes?: string;
  ProjectId?: string | null;
  ClassId?: string | null;
  Lines?: PurchaseOrderLine[];
}

interface PurchaseOrderLine {
  Id?: string;
  PurchaseOrderId: string;
  ProductServiceId?: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
  ProjectId?: string | null;
  ClassId?: string | null;
}

export default function EditPurchaseOrder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Validate ID early
  const isIdValid = isValidUUID(id);

  const { data: purchaseOrder, isLoading, error } = useQuery({
    queryKey: ['purchaseorder', id],
    queryFn: async () => {
      // Validate ID before using in OData filter
      if (!isValidUUID(id)) {
        throw new Error('Invalid purchase order ID');
      }

      // Fetch purchase order and lines separately since $expand is not supported
      // Use properly quoted GUID in OData filter
      const [poResponse, linesResponse] = await Promise.all([
        api.get<{ value: PurchaseOrder[] }>(`/purchaseorders?$filter=Id eq ${formatGuidForOData(id, 'PurchaseOrderId')}`),
        api.get<{ value: PurchaseOrderLine[] }>(`/purchaseorderlines?$filter=PurchaseOrderId eq ${formatGuidForOData(id, 'PurchaseOrderId')}`)
      ]);

      const purchaseOrder = poResponse.data.value[0];
      if (purchaseOrder) {
        purchaseOrder.Lines = linesResponse.data.value;
      }
      return purchaseOrder;
    },
    enabled: isIdValid
  });

  const mutation = useMutation({
    mutationFn: async (data: PurchaseOrderFormData) => {
      // Validate ID before using
      if (!isValidUUID(id)) {
        throw new Error('Invalid purchase order ID');
      }

      // 1. Update PurchaseOrder (exclude Lines)
      const { Lines, ...poData } = data;
      await api.patch(`/purchaseorders_write/Id/${id}`, {
        ...poData,
        ProjectId: data.ProjectId || null,
        ClassId: data.ClassId || null,
      });

      // 2. Handle Lines Reconciliation
      // Fetch current lines from DB to know what to delete
      // Use properly quoted GUID in OData filter
      const currentLinesResponse = await api.get<{ value: PurchaseOrderLine[] }>(
        `/purchaseorderlines?$filter=PurchaseOrderId eq ${formatGuidForOData(id, 'PurchaseOrderId')}`
      );
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
        ...toDelete.map(l => api.delete(`/purchaseorderlines/Id/${l.Id}`)),
        ...toUpdate.map(l => api.patch(`/purchaseorderlines/Id/${l.Id}`, {
          ProductServiceId: l.ProductServiceId || null,
          Description: l.Description,
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice,
          ProjectId: l.ProjectId || null,
          ClassId: l.ClassId || null,
        })),
        ...toAdd.map(l => api.post('/purchaseorderlines', {
          PurchaseOrderId: id,
          ProductServiceId: l.ProductServiceId || null,
          Description: l.Description,
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice,
          ProjectId: l.ProjectId || null,
          ClassId: l.ClassId || null,
        }))
      ];

      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchaseorders'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseorder', id] });
      showToast('Purchase order updated successfully', 'success');
      navigate('/purchase-orders');
    },
    onError: (error) => {
      console.error('Failed to update purchase order:', error);
      showToast('Failed to update purchase order', 'error');
    }
  });

  if (!isIdValid) {
    return <div className="p-4 text-red-600">Invalid purchase order ID</div>;
  }

  if (isLoading) return <div className="p-4">Loading purchase order...</div>;
  if (error || !purchaseOrder) return <div className="p-4 text-red-600">Error loading purchase order</div>;

  return (
    <PurchaseOrderForm
      title="Edit Purchase Order"
      initialValues={purchaseOrder}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
