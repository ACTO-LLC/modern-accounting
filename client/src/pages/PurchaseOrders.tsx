import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, FileText, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatGuidForOData, isValidUUID } from '../lib/validation';
import { formatDate } from '../lib/dateUtils';
import { getTimestampColumns } from '../lib/gridColumns';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../hooks/useToast';

interface PurchaseOrder {
  Id: string;
  PONumber: string;
  VendorId: string;
  VendorName: string;
  PODate: string;
  ExpectedDate: string | null;
  Total: number;
  Status: string;
  ConvertedToBillId: string | null;
  Notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
}

interface PurchaseOrderLine {
  Id: string;
  PurchaseOrderId: string;
  ProductServiceId: string | null;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}

interface Bill {
  Id: string;
  BillNumber: string;
  VendorId: string;
  BillDate: string;
  DueDate: string;
  TotalAmount: number;
  Status: string;
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  Sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Received: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Converted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    purchaseOrder: PurchaseOrder | null;
  }>({ isOpen: false, purchaseOrder: null });

  const convertToBillMutation = useMutation({
    mutationFn: async (purchaseOrder: PurchaseOrder) => {
      if (!isValidUUID(purchaseOrder.Id)) {
        throw new Error('Invalid purchase order ID');
      }

      // Fetch purchase order lines
      const linesResponse = await api.get<{ value: PurchaseOrderLine[] }>(
        `/purchaseorderlines?\$filter=PurchaseOrderId eq ${formatGuidForOData(purchaseOrder.Id, 'PurchaseOrderId')}`
      );
      const lines = linesResponse.data.value;

      // Generate bill number
      const billNumber = `BILL-${Date.now().toString().slice(-6)}`;

      // Create the bill
      const billResponse = await api.post<Bill>('/bills_write', {
        BillNumber: billNumber,
        VendorId: purchaseOrder.VendorId,
        BillDate: new Date().toISOString().split('T')[0],
        DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        TotalAmount: purchaseOrder.Total,
        AmountPaid: 0,
        Status: 'Open',
        Terms: 'Net 30',
        Memo: `Converted from PO ${purchaseOrder.PONumber}`,
      });
      const bill = billResponse.data;

      // Fetch all expense accounts to find a default
      const accountsResponse = await api.get<{ value: { Id: string; Name: string; Type: string }[] }>(
        `/accounts?\$filter=Type eq 'Expense'&\$top=1`
      );
      const defaultAccountId = accountsResponse.data.value[0]?.Id;

      if (!defaultAccountId) {
        throw new Error('No expense account found for bill lines');
      }

      // Create bill lines from purchase order lines
      await Promise.all(
        lines.map((line: PurchaseOrderLine) =>
          api.post('/billlines', {
            BillId: bill.Id,
            AccountId: defaultAccountId, // Use default expense account
            Description: line.Description,
            Amount: (line.Quantity || 0) * (line.UnitPrice || 0),
          })
        )
      );

      // Update purchase order status and link to bill
      await api.patch(`/purchaseorders_write/Id/${purchaseOrder.Id}`, {
        Status: 'Received',
        ConvertedToBillId: bill.Id,
      });

      return bill;
    },
    onSuccess: (bill) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseorders'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setRefreshKey(k => k + 1);
      showToast('Purchase order converted to bill successfully', 'success');
      navigate(`/bills/${bill.Id}/edit`);
    },
    onError: (error) => {
      console.error('Failed to convert purchase order:', error);
      showToast('Failed to convert purchase order to bill', 'error');
    },
  });

  const handleConvertClick = (purchaseOrder: PurchaseOrder) => {
    setConfirmModal({ isOpen: true, purchaseOrder });
  };

  const handleConfirmConvert = () => {
    if (confirmModal.purchaseOrder) {
      convertToBillMutation.mutate(confirmModal.purchaseOrder);
    }
    setConfirmModal({ isOpen: false, purchaseOrder: null });
  };

  const handleCloseModal = () => {
    setConfirmModal({ isOpen: false, purchaseOrder: null });
  };

  const columns: GridColDef[] = [
    { field: 'PONumber', headerName: 'PO #', width: 130, filterable: true },
    { field: 'VendorName', headerName: 'Vendor', width: 180, filterable: true },
    { field: 'PODate', headerName: 'Date', width: 120, filterable: true, renderCell: (params) => formatDate(params.value) },
    {
      field: 'ExpectedDate',
      headerName: 'Expected',
      width: 120,
      filterable: true,
      renderCell: (params) => formatDate(params.value) || '-'
    },
    {
      field: 'Total',
      headerName: 'Total',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 120,
      filterable: true,
      renderCell: (params) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[params.value] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
          {params.value}
        </span>
      ),
    },
    ...getTimestampColumns(),
    {
      field: 'actions',
      headerName: 'Actions',
      width: 250,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/purchase-orders/${params.row.Id}/edit`);
            }}
            className="text-indigo-600 hover:text-indigo-900"
          >
            Edit
          </button>
          {(params.row.Status === 'Sent' || params.row.Status === 'Draft') &&
            !params.row.ConvertedToBillId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConvertClick(params.row as PurchaseOrder);
                }}
                disabled={convertToBillMutation.isPending}
                className="text-green-600 hover:text-green-900 inline-flex items-center"
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                Convert to Bill
              </button>
            )}
          {params.row.ConvertedToBillId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/bills/${params.row.ConvertedToBillId}/edit`);
              }}
              className="text-purple-600 hover:text-purple-900 inline-flex items-center"
            >
              <FileText className="w-4 h-4 mr-1" />
              View Bill
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Purchase Orders</h1>
        <Link
          to="/purchase-orders/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Purchase Order
        </Link>
      </div>

      <RestDataGrid<PurchaseOrder>
        key={refreshKey}
        endpoint="/purchaseorders"
        columns={columns}
        editPath="/purchase-orders/{id}/edit"
        initialPageSize={25}
        emptyMessage="No purchase orders found."
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmConvert}
        title="Convert to Bill"
        message={`Are you sure you want to convert purchase order ${confirmModal.purchaseOrder?.PONumber || ''} to a bill? This action will create a new bill with the same line items.`}
        confirmText="Convert"
        cancelText="Cancel"
        isLoading={convertToBillMutation.isPending}
      />
    </div>
  );
}
