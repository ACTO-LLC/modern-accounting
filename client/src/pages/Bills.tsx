import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';
import { getTimestampColumns } from '../lib/gridColumns';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';

interface Bill {
  Id: string;
  VendorId: string;
  VendorName: string;
  BillNumber: string;
  BillDate: string;
  DueDate: string;
  TotalAmount: number;
  AmountPaid: number;
  BalanceDue: number;
  Status: string;
  Terms: string;
  Memo: string;
  CreatedAt: string;
  UpdatedAt: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Paid': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'Partial': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'Overdue': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'Open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
};

export default function Bills() {
  const [searchParams] = useSearchParams();
  const vendorIdFilter = searchParams.get('vendorId');
  const vendorBaseFilter = vendorIdFilter
    ? `VendorId eq ${vendorIdFilter}`
    : undefined;

  const columns: GridColDef[] = [
    { field: 'BillNumber', headerName: 'Bill #', width: 120, filterable: true },
    { field: 'VendorName', headerName: 'Vendor', width: 180, filterable: true },
    { field: 'BillDate', headerName: 'Bill Date', width: 120, filterable: true, renderCell: (params) => formatDate(params.value) },
    { field: 'DueDate', headerName: 'Due Date', width: 120, filterable: true, renderCell: (params) => formatDate(params.value) },
    {
      field: 'TotalAmount',
      headerName: 'Amount',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => formatCurrencyStandalone(params.value || 0),
    },
    {
      field: 'BalanceDue',
      headerName: 'Balance Due',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => formatCurrencyStandalone(params.value || 0),
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
    ...getTimestampColumns(),
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Bills</h1>
        <Link
          to="/bills/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Bill
        </Link>
      </div>

      {vendorIdFilter && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-md">
          <span className="text-sm text-indigo-800 dark:text-indigo-300">
            Filtered by vendor from AP Aging report
          </span>
          <Link
            to="/bills"
            className="text-sm text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            Clear filter
          </Link>
        </div>
      )}

      <RestDataGrid<Bill>
        key={vendorIdFilter ?? ''}
        gridKey="bills-grid"
        endpoint="/bills"
        columns={columns}
        editPath="/bills/{id}/edit"
        initialPageSize={25}
        emptyMessage="No bills found."
        baseFilter={vendorBaseFilter}
      />
    </div>
  );
}
