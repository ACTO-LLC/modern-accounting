import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface CustomerDeposit {
  Id: string;
  DepositNumber: string;
  CustomerId: string;
  CustomerName: string;
  DepositDate: string;
  Amount: number;
  AmountApplied: number;
  BalanceRemaining: number;
  DepositAccountName: string;
  PaymentMethod: string;
  Status: string;
}

const statusColors: Record<string, string> = {
  Open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PartiallyApplied: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Applied: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Refunded: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function CustomerDeposits() {
  const columns: GridColDef[] = [
    { field: 'DepositNumber', headerName: 'Deposit #', width: 130, filterable: true },
    { field: 'CustomerName', headerName: 'Customer', width: 180, filterable: true },
    {
      field: 'DepositDate',
      headerName: 'Date',
      width: 120,
      filterable: true,
      renderCell: (params) => formatDate(params.value)
    },
    {
      field: 'Amount',
      headerName: 'Amount',
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
    { field: 'PaymentMethod', headerName: 'Method', width: 130, filterable: true },
    { field: 'DepositAccountName', headerName: 'Deposit Account', width: 160, filterable: true },
    {
      field: 'Status',
      headerName: 'Status',
      width: 140,
      filterable: true,
      renderCell: (params) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[params.value] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
          {params.value === 'PartiallyApplied' ? 'Partial' : params.value}
        </span>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <div className="flex gap-2">
          {(params.row.Status === 'Open' || params.row.Status === 'PartiallyApplied') && (
            <Link
              to={`/customer-deposits/${params.row.Id}/apply`}
              className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
            >
              Apply
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Customer Deposits</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage customer prepayments and unearned revenue
          </p>
        </div>
        <Link
          to="/customer-deposits/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Receive Deposit
        </Link>
      </div>

      <RestDataGrid<CustomerDeposit>
        endpoint="/customerdeposits"
        columns={columns}
        initialPageSize={25}
        emptyMessage="No customer deposits found."
      />
    </div>
  );
}
