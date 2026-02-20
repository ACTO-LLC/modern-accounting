import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface BillPayment {
  Id: string;
  PaymentNumber: string;
  VendorId: string;
  VendorName: string;
  PaymentDate: string;
  TotalAmount: number;
  PaymentMethod: string;
  PaymentAccountName: string;
  Status: string;
}

const statusColors: Record<string, string> = {
  Completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Voided: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function BillPayments() {
  const columns: GridColDef[] = [
    { field: 'PaymentNumber', headerName: 'Payment #', width: 130, filterable: true },
    { field: 'VendorName', headerName: 'Vendor', width: 180, filterable: true },
    { field: 'PaymentDate', headerName: 'Date', width: 120, filterable: true, renderCell: (params) => formatDate(params.value) },
    {
      field: 'TotalAmount',
      headerName: 'Amount',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
    },
    { field: 'PaymentMethod', headerName: 'Method', width: 130, filterable: true },
    { field: 'PaymentAccountName', headerName: 'From Account', width: 160, filterable: true },
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
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bill Payments</h1>
        <Link
          to="/bill-payments/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Pay Bills
        </Link>
      </div>

      <RestDataGrid<BillPayment>
        endpoint="/billpayments"
        columns={columns}
        initialPageSize={25}
        emptyMessage="No bill payments found."
      />
    </div>
  );
}
