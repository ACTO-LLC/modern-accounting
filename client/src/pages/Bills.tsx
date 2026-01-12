import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { GridColDef } from '@mui/x-data-grid';
import ServerDataGrid from '../components/ServerDataGrid';
import api from '../lib/api';

interface Bill {
  Id: string;
  VendorId: string;
  BillNumber: string;
  BillDate: string;
  DueDate: string;
  TotalAmount: number;
  AmountPaid: number;
  Status: string;
  Terms: string;
  Memo: string;
}

interface Vendor {
  Id: string;
  Name: string;
}

// Helper function to get status badge color for bills
// Handles all known bill statuses with a fallback for unknown statuses
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Paid': return 'bg-green-100 text-green-800';
    case 'Partial': return 'bg-yellow-100 text-yellow-800';
    case 'Overdue': return 'bg-red-100 text-red-800';
    case 'Open': return 'bg-blue-100 text-blue-800';
    case 'Draft': return 'bg-gray-100 text-gray-800';
    // Fallback for any unknown status values
    default: return 'bg-gray-100 text-gray-800';
  }
};

export default function Bills() {
  const { data: vendors, isLoading: vendorsLoading, isError: vendorsError } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors');
      return response.data.value;
    },
  });

  const vendorMap = vendors?.reduce((acc, vendor) => {
    acc[vendor.Id] = vendor.Name;
    return acc;
  }, {} as Record<string, string>) || {};

  const columns: GridColDef[] = [
    { field: 'BillNumber', headerName: 'Bill #', flex: 0.7, minWidth: 120, filterable: true },
    {
      field: 'VendorId',
      headerName: 'Vendor',
      flex: 1,
      minWidth: 180,
      filterable: true,
      renderCell: (params) => {
        if (vendorsLoading) return 'Loading...';
        if (vendorsError) return 'Error loading vendor';
        return vendorMap[params.value] || 'Unknown Vendor';
      }
    },
    { field: 'BillDate', headerName: 'Bill Date', flex: 0.7, minWidth: 120, filterable: true },
    { field: 'DueDate', headerName: 'Due Date', flex: 0.7, minWidth: 120, filterable: true },
    {
      field: 'TotalAmount',
      headerName: 'Amount',
      flex: 0.7,
      minWidth: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
    },
    {
      field: 'balance',
      headerName: 'Balance Due',
      flex: 0.8,
      minWidth: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => `$${((params.row.TotalAmount || 0) - (params.row.AmountPaid || 0)).toFixed(2)}`,
    },
    {
      field: 'Status',
      headerName: 'Status',
      flex: 0.6,
      minWidth: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(params.value)}`}>
          {params.value}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bills</h1>
        <Link
          to="/bills/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Bill
        </Link>
      </div>

      <ServerDataGrid<Bill>
        entityName="bills"
        queryFields="Id VendorId BillNumber BillDate DueDate TotalAmount AmountPaid Status Terms Memo"
        columns={columns}
        editPath="/bills/{id}/edit"
        initialPageSize={25}
        emptyMessage="No bills found."
      />
    </div>
  );
}
