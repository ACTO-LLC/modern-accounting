import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';
import {
  HierarchyView,
  HierarchyLevel,
  EntityCardData,
  Vendor,
  PurchaseOrder,
  Bill,
  PurchaseOrderLine,
  BillLine,
} from '../components/hierarchy';

type DocumentType = 'purchaseorders' | 'bills';

const statusVariants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  Draft: 'neutral',
  Sent: 'info',
  Received: 'success',
  Partial: 'warning',
  Cancelled: 'error',
  Converted: 'info',
  Open: 'info',
  Paid: 'success',
  Overdue: 'error',
};

export default function VendorHierarchy() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [currentDocumentType, setCurrentDocumentType] = useState<DocumentType | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);

  // Redirect if no id
  useEffect(() => {
    if (!id) {
      navigate('/vendors');
    }
  }, [id, navigate]);

  // Fetch vendor details
  const { data: vendor, isLoading: vendorLoading, isError: vendorError } = useQuery({
    queryKey: ['vendor', id],
    queryFn: async () => {
      const response = await api.get<Vendor>(`/vendors/Id/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Fetch purchase orders for this vendor
  const { data: purchaseOrders, isLoading: posLoading, isError: posError } = useQuery({
    queryKey: ['vendor-purchaseorders', id],
    queryFn: async () => {
      const response = await api.get<{ value: PurchaseOrder[] }>(
        `/purchaseorders?$filter=VendorId eq ${encodeURIComponent(id!)}`
      );
      return response.data.value;
    },
    enabled: !!id && currentLevel === 0,
  });

  // Fetch bills for this vendor
  const { data: bills, isLoading: billsLoading, isError: billsError } = useQuery({
    queryKey: ['vendor-bills', id],
    queryFn: async () => {
      const response = await api.get<{ value: Bill[] }>(
        `/bills?$filter=VendorId eq ${encodeURIComponent(id!)}`
      );
      return response.data.value;
    },
    enabled: !!id && currentLevel === 0,
  });

  // Fetch purchase order lines
  const { data: poLines, isLoading: poLinesLoading, isError: poLinesError } = useQuery({
    queryKey: ['purchaseorder-lines', selectedDocumentId],
    queryFn: async () => {
      const response = await api.get<{ value: PurchaseOrderLine[] }>(
        `/purchaseorderlines?$filter=PurchaseOrderId eq ${encodeURIComponent(selectedDocumentId!)}`
      );
      return response.data.value;
    },
    enabled: !!selectedDocumentId && currentDocumentType === 'purchaseorders',
  });

  // Fetch bill lines
  const { data: billLines, isLoading: billLinesLoading, isError: billLinesError } = useQuery({
    queryKey: ['bill-lines', selectedDocumentId],
    queryFn: async () => {
      const response = await api.get<{ value: BillLine[] }>(
        `/billlines?$filter=BillId eq ${encodeURIComponent(selectedDocumentId!)}`
      );
      return response.data.value;
    },
    enabled: !!selectedDocumentId && currentDocumentType === 'bills',
  });

  // Convert POs and Bills to card data for level 0
  const documentCards: EntityCardData[] = [
    ...(purchaseOrders || []).map((po): EntityCardData => ({
      id: po.Id,
      title: `PO #${po.PONumber}`,
      subtitle: formatDate(po.PODate),
      entityType: 'purchaseorder',
      status: {
        label: po.Status,
        variant: statusVariants[po.Status] || 'neutral',
      },
      amount: po.Total,
      metadata: [
        { label: 'Expected', value: formatDate(po.ExpectedDate) || 'Not set' },
      ],
    })),
    ...(bills || []).map((bill): EntityCardData => ({
      id: bill.Id,
      title: `Bill #${bill.BillNumber}`,
      subtitle: formatDate(bill.BillDate),
      entityType: 'bill',
      status: {
        label: bill.Status,
        variant: statusVariants[bill.Status] || 'neutral',
      },
      amount: bill.TotalAmount,
      metadata: [
        { label: 'Due Date', value: formatDate(bill.DueDate) },
        { label: 'Balance', value: `$${(bill.BalanceDue || 0).toFixed(2)}` },
      ],
    })),
  ];

  // Convert line items to card data for level 1
  const lineItemCards: EntityCardData[] = currentDocumentType === 'purchaseorders'
    ? (poLines || []).map((line): EntityCardData => ({
        id: line.Id,
        title: line.Description || 'Line Item',
        subtitle: line.ProductServiceName || undefined,
        entityType: 'purchaseorderline',
        amount: (line.Quantity || 0) * (line.UnitPrice || 0),
        metadata: [
          { label: 'Quantity', value: String(line.Quantity || 0) },
          { label: 'Unit Price', value: `$${(line.UnitPrice || 0).toFixed(2)}` },
        ],
      }))
    : (billLines || []).map((line): EntityCardData => ({
        id: line.Id,
        title: line.Description || 'Line Item',
        subtitle: line.AccountName || undefined,
        entityType: 'billline',
        amount: line.Amount || 0,
        metadata: [
          { label: 'Account', value: line.AccountName || 'N/A' },
        ],
      }));

  const handleLevelChange = useCallback((level: number, selectedIds: string[]) => {
    setCurrentLevel(level);

    if (level === 0) {
      setSelectedDocumentId(null);
      setCurrentDocumentType(null);
    } else if (level === 1 && selectedIds.length > 0) {
      const selectedId = selectedIds[0];
      setSelectedDocumentId(selectedId);

      // Determine document type
      const isPO = purchaseOrders?.some(po => po.Id === selectedId);
      setCurrentDocumentType(isPO ? 'purchaseorders' : 'bills');
    }
  }, [purchaseOrders]);

  // Build hierarchy levels
  const levels: HierarchyLevel[] = [
    {
      entityType: 'purchaseorder', // Combined view of POs and Bills
      items: documentCards,
      loading: posLoading || billsLoading,
      emptyMessage: posError || billsError 
        ? 'Error loading purchase orders or bills. Please try again.'
        : 'No purchase orders or bills found for this vendor',
    },
    {
      entityType: currentDocumentType === 'purchaseorders' ? 'purchaseorderline' : 'billline',
      items: lineItemCards,
      loading: poLinesLoading || billLinesLoading,
      emptyMessage: poLinesError || billLinesError
        ? 'Error loading line items. Please try again.'
        : 'No line items found',
    },
  ];

  if (vendorLoading || !vendor) {
    return (
      <div className="max-w-7xl mx-auto">
        {vendorError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-800 font-semibold mb-2">Error Loading Vendor</h2>
            <p className="text-red-600 text-sm">
              Failed to load vendor details. Please try again or contact support if the problem persists.
            </p>
          </div>
        ) : (
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <HierarchyView
      rootEntityType="vendor"
      rootEntity={{
        id: vendor.Id,
        name: vendor.Name,
      }}
      levels={levels}
      onLevelChange={handleLevelChange}
    />
  );
}
