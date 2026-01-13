import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Copy, Eye } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { GridColDef } from '@mui/x-data-grid';
import ServerDataGrid from '../components/ServerDataGrid';
import {
  generateNextInvoiceNumber,
  calculateInvoiceTotal,
  getCurrentDate,
  getDateNDaysFromNow,
  type Invoice
} from '../lib/invoiceUtils';
import { formatGuidForOData } from '../lib/validation';
import { useToast } from '../hooks/useToast';

interface InvoiceLine {
  Id: string;
  InvoiceId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800',
  Sent: 'bg-blue-100 text-blue-800',
  Paid: 'bg-green-100 text-green-800',
  Overdue: 'bg-red-100 text-red-800',
  Partial: 'bg-yellow-100 text-yellow-800',
};

export default function Invoices() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { showToast } = useToast();

  const { data: allInvoices } = useQuery({
    queryKey: ['invoices-all'],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>('/invoices');
      return response.data.value;
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const invoiceResponse = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=Id eq ${formatGuidForOData(invoiceId, 'Invoice Id')}`
      );
      const originalInvoice = invoiceResponse.data.value[0];
      if (!originalInvoice) {
        throw new Error('Invoice not found');
      }

      const linesResponse = await api.get<{ value: InvoiceLine[] }>(
        `/invoicelines?$filter=InvoiceId eq ${formatGuidForOData(invoiceId, 'Invoice Id')}`
      );
      const originalLines = linesResponse.data.value;

      if (!originalLines || originalLines.length === 0) {
        throw new Error('Cannot duplicate invoice with no line items');
      }

      const newInvoiceNumber = generateNextInvoiceNumber(allInvoices || []);
      const totalAmount = calculateInvoiceTotal(originalLines);

      const newInvoice = {
        InvoiceNumber: newInvoiceNumber,
        CustomerId: originalInvoice.CustomerId,
        IssueDate: getCurrentDate(),
        DueDate: getDateNDaysFromNow(30),
        TotalAmount: totalAmount,
        Status: 'Draft'
      };

      const createResponse = await api.post<Invoice>('/invoices', newInvoice);
      const createdInvoice = createResponse.data;

      await Promise.all(
        originalLines.map(line =>
          api.post('/invoicelines', {
            InvoiceId: createdInvoice.Id,
            Description: line.Description,
            Quantity: line.Quantity,
            UnitPrice: line.UnitPrice
          })
        )
      );

      return createdInvoice;
    },
    onSuccess: (newInvoice) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices-all'] });
      setRefreshKey(k => k + 1);
      showToast(`Invoice ${newInvoice.InvoiceNumber} has been duplicated`, 'success');
      navigate('/invoices/' + newInvoice.Id + '/edit');
    },
    onError: (error) => {
      console.error('Failed to duplicate invoice:', error);
      const message = error instanceof Error ? error.message : 'Failed to duplicate invoice';
      showToast(message, 'error');
    },
    onSettled: () => {
      setDuplicatingId(null);
    }
  });

  const handleDuplicate = (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    setDuplicatingId(invoiceId);
    duplicateMutation.mutate(invoiceId);
  };

  const columns: GridColDef[] = [
    { field: 'InvoiceNumber', headerName: 'Invoice #', width: 130, filterable: true },
    { field: 'IssueDate', headerName: 'Date', width: 120, filterable: true },
    { field: 'DueDate', headerName: 'Due Date', width: 120, filterable: true },
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
      width: 180,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/invoices/' + params.row.Id);
            }}
            className="text-gray-600 hover:text-gray-900 inline-flex items-center"
            title="View invoice"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/invoices/' + params.row.Id + '/edit');
            }}
            className="text-indigo-600 hover:text-indigo-900"
          >
            Edit
          </button>
          <button
            onClick={(e) => handleDuplicate(e, params.row.Id)}
            disabled={duplicatingId === params.row.Id}
            className="text-gray-600 hover:text-gray-900 disabled:opacity-50 inline-flex items-center"
            title="Duplicate invoice"
          >
            <Copy className="w-4 h-4 mr-1" />
            {duplicatingId === params.row.Id ? '...' : ''}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
        <Link
          to="/invoices/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Invoice
        </Link>
      </div>

      <ServerDataGrid<Invoice>
        key={refreshKey}
        entityName="invoices"
        queryFields="Id InvoiceNumber CustomerId IssueDate DueDate TotalAmount Status"
        columns={columns}
        editPath="/invoices/{id}/edit"
        initialPageSize={25}
        emptyMessage="No invoices found."
      />
    </div>
  );
}
