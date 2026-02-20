import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface CreditMemo {
  Id: string;
  CreditMemoNumber: string;
  CustomerId: string;
  CustomerName: string;
  CreditDate: string;
  Reason: string;
  TotalAmount: number;
  AmountApplied: number;
  AmountRefunded: number;
  BalanceRemaining: number;
  Status: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Applied': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'PartiallyApplied': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'Refunded': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'Voided': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'Open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

export default function CreditMemos() {
  const columns: GridColDef[] = [
    { field: 'CreditMemoNumber', headerName: 'Credit Memo #', width: 140, filterable: true },
    { field: 'CustomerName', headerName: 'Customer', width: 180, filterable: true },
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
      width: 130,
      filterable: true,
      renderCell: (params) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(params.value)}`}>
          {params.value}
        </span>
      ),
    },
    { field: 'Reason', headerName: 'Reason', width: 200, filterable: true },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const row = params.row as CreditMemo;
        if (row.Status === 'Open' || row.Status === 'PartiallyApplied') {
          return (
            <Link
              to={`/credit-memos/${row.Id}/apply`}
              className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
            >
              Apply
            </Link>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Credit Memos</h1>
        <Link
          to="/credit-memos/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Credit Memo
        </Link>
      </div>

      <RestDataGrid<CreditMemo>
        endpoint="/creditmemos"
        columns={columns}
        initialPageSize={25}
        emptyMessage="No credit memos found."
      />
    </div>
  );
}
