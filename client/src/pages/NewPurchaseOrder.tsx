import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import PurchaseOrderForm, { PurchaseOrderFormData } from '../components/PurchaseOrderForm';
import { useToast } from '../hooks/useToast';

interface CreatePurchaseOrderResponse {
  Id: string;
  PONumber: string;
  VendorId: string;
  PODate: string;
  ExpectedDate: string | null;
  Subtotal: number;
  Total: number;
  Status: string;
  Notes: string | null;
}

export default function NewPurchaseOrder() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const onSubmit = async (data: PurchaseOrderFormData) => {
    try {
      // Separate lines from purchase order data
      const { Lines, ...poData } = data;

      // Create the purchase order first
      await api.post('/purchaseorders_write', {
        ...poData,
        ProjectId: data.ProjectId || null,
        ClassId: data.ClassId || null,
      });

      // DAB doesn't return the created entity, so we need to query for it
      const escapedPONumber = String(poData.PONumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: CreatePurchaseOrderResponse[] }>(
        `/purchaseorders?$filter=PONumber eq '${escapedPONumber}'`
      );
      const purchaseOrder = queryResponse.data.value[0];

      if (!purchaseOrder?.Id) {
        throw new Error('Failed to retrieve created purchase order');
      }

      // Create purchase order lines
      await Promise.all(
        Lines.map((line) =>
          api.post('/purchaseorderlines', {
            PurchaseOrderId: purchaseOrder.Id,
            ProductServiceId: line.ProductServiceId || null,
            Description: line.Description,
            Quantity: line.Quantity,
            UnitPrice: line.UnitPrice,
            ProjectId: line.ProjectId || null,
            ClassId: line.ClassId || null,
          })
        )
      );

      showToast('Purchase order created successfully', 'success');
      navigate('/purchase-orders');
    } catch (error) {
      console.error('Failed to create purchase order:', error);
      showToast('Failed to create purchase order', 'error');
      throw error; // Re-throw to keep the form in submitting state
    }
  };

  return (
    <PurchaseOrderForm
      title="New Purchase Order"
      onSubmit={onSubmit}
      submitButtonText="Create Purchase Order"
    />
  );
}
