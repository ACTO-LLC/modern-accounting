import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface VendorCredit {
  Id: string;
  CreditNumber: string;
  VendorId: string;
  VendorName: string;
  CreditDate: string;
  Reason: string;
  TotalAmount: number;
  AmountApplied: number;
  BalanceRemaining: number;
  Status: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Applied': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'Partial': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'Voided': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'Open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

export default function VendorCredits() {
  const columns: GridColDef[] = [
    { field: 'CreditNumber', headerName: 'Credit #', width: 120, filterable: true },
    { field: 'VendorName', headerName: 'Vendor', width: 180, filterable: true },
    { field: 'CreditDate', headerName: 'Date', width: 120, filterable: true, renderCell: (params) => formatDate(params.value) },
    {
      field: 'TotalAmount',
      headerName: 'Amount',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
    },
    {
      field: 'AmountApplied',
      headerName: 'Applied',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
    },
    {
      field: 'BalanceRemaining',
      headerName: 'Balance',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(params.value)}`}>
          {params.value}
        </span>
      ),
    },
    { field: 'Reason', headerName: 'Reason', width: 200, filterable: true },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Vendor Credits</h1>
        <Link
          to="/vendor-credits/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Vendor Credit
        </Link>
      </div>

      <RestDataGrid<VendorCredit>
        endpoint="/vendorcredits"
        columns={columns}
        editPath="/vendor-credits/{id}/edit"
        initialPageSize={25}
        emptyMessage="No vendor credits found."
      />
    </div>
  );
}
