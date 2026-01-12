import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, FileText, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { GridColDef } from '@mui/x-data-grid';
import ServerDataGrid from '../components/ServerDataGrid';
import { formatGuidForOData, isValidUUID } from '../lib/validation';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../hooks/useToast';

interface Estimate {
  Id: string;
  EstimateNumber: string;
  CustomerId: string;
  IssueDate: string;
  ExpirationDate: string | null;
  TotalAmount: number;
  Status: string;
  ConvertedToInvoiceId: string | null;
  Notes: string | null;
}

interface EstimateLine {
  Id: string;
  EstimateId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  IssueDate: string;
  DueDate: string;
  TotalAmount: number;
  Status: string;
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800',
  Sent: 'bg-blue-100 text-blue-800',
  Accepted: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  Expired: 'bg-yellow-100 text-yellow-800',
  Converted: 'bg-purple-100 text-purple-800',
};

export default function Estimates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    estimate: Estimate | null;
  }>({ isOpen: false, estimate: null });

  const convertToInvoiceMutation = useMutation({
    mutationFn: async (estimate: Estimate) => {
      if (!isValidUUID(estimate.Id)) {
        throw new Error('Invalid estimate ID');
      }

      const linesResponse = await api.get<{ value: EstimateLine[] }>(
        `/estimatelines?$filter=EstimateId eq ${formatGuidForOData(estimate.Id, 'EstimateId')}`
      );
      const lines = linesResponse.data.value;

      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

      const invoiceResponse = await api.post<Invoice>('/invoices', {
        InvoiceNumber: invoiceNumber,
        CustomerId: estimate.CustomerId,
        IssueDate: new Date().toISOString().split('T')[0],
        DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        TotalAmount: estimate.TotalAmount,
        Status: 'Draft',
      });
      const invoice = invoiceResponse.data;

      await Promise.all(
        lines.map((line: EstimateLine) =>
          api.post('/invoicelines', {
            InvoiceId: invoice.Id,
            Description: line.Description,
            Quantity: line.Quantity,
            UnitPrice: line.UnitPrice,
          })
        )
      );

      await api.patch(`/estimates/Id/${estimate.Id}`, {
        Status: 'Converted',
        ConvertedToInvoiceId: invoice.Id,
      });

      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setRefreshKey(k => k + 1);
      showToast('Estimate converted to invoice successfully', 'success');
      navigate(`/invoices/${invoice.Id}/edit`);
    },
    onError: (error) => {
      console.error('Failed to convert estimate:', error);
      showToast('Failed to convert estimate to invoice', 'error');
    },
  });

  const handleConvertClick = (estimate: Estimate) => {
    setConfirmModal({ isOpen: true, estimate });
  };

  const handleConfirmConvert = () => {
    if (confirmModal.estimate) {
      convertToInvoiceMutation.mutate(confirmModal.estimate);
    }
    setConfirmModal({ isOpen: false, estimate: null });
  };

  const handleCloseModal = () => {
    setConfirmModal({ isOpen: false, estimate: null });
  };

  const columns: GridColDef[] = [
    { field: 'EstimateNumber', headerName: 'Estimate #', width: 130, filterable: true },
    { field: 'IssueDate', headerName: 'Date', width: 120, filterable: true },
    {
      field: 'ExpirationDate',
      headerName: 'Expiration',
      width: 120,
      filterable: true,
      renderCell: (params) => params.value || '-'
    },
    {
      field: 'TotalAmount',
      headerName: 'Amount',
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
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[params.value] || 'bg-gray-100 text-gray-800'}`}>
          {params.value}
        </span>
      ),
    },
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
              navigate(`/estimates/${params.row.Id}/edit`);
            }}
            className="text-indigo-600 hover:text-indigo-900"
          >
            Edit
          </button>
          {(params.row.Status === 'Accepted' || params.row.Status === 'Sent' || params.row.Status === 'Draft') &&
            !params.row.ConvertedToInvoiceId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConvertClick(params.row as Estimate);
                }}
                disabled={convertToInvoiceMutation.isPending}
                className="text-green-600 hover:text-green-900 inline-flex items-center"
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                Convert
              </button>
            )}
          {params.row.ConvertedToInvoiceId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/invoices/${params.row.ConvertedToInvoiceId}/edit`);
              }}
              className="text-purple-600 hover:text-purple-900 inline-flex items-center"
            >
              <FileText className="w-4 h-4 mr-1" />
              Invoice
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Estimates & Quotes</h1>
        <button
          onClick={() => navigate('/estimates/new')}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Estimate
        </button>
      </div>

      <ServerDataGrid<Estimate>
        key={refreshKey}
        entityName="estimates"
        queryFields="Id EstimateNumber CustomerId IssueDate ExpirationDate TotalAmount Status ConvertedToInvoiceId Notes"
        columns={columns}
        editPath="/estimates/{id}/edit"
        initialPageSize={25}
        emptyMessage="No estimates found."
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmConvert}
        title="Convert to Invoice"
        message={`Are you sure you want to convert estimate ${confirmModal.estimate?.EstimateNumber || ''} to an invoice? This action will create a new invoice with the same line items.`}
        confirmText="Convert"
        cancelText="Cancel"
        isLoading={convertToInvoiceMutation.isPending}
      />
    </div>
  );
}
