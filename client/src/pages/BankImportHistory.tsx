import { Link } from 'react-router-dom';
import { Plus, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface BankTransactionImport {
  Id: string;
  BankAccountId: string;
  BankAccountName: string;
  BankAccountNumber: string | null;
  FileName: string;
  FileType: string;
  ImportDate: string;
  TransactionCount: number;
  MatchedCount: number;
  Status: 'Pending' | 'Processing' | 'Completed' | 'Failed';
  ImportedBy: string;
  ErrorMessage: string | null;
  CreatedAt: string;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  Pending: { icon: <Clock className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-800' },
  Processing: { icon: <RefreshCw className="w-4 h-4 animate-spin" />, color: 'bg-blue-100 text-blue-800' },
  Completed: { icon: <CheckCircle className="w-4 h-4" />, color: 'bg-green-100 text-green-800' },
  Failed: { icon: <AlertCircle className="w-4 h-4" />, color: 'bg-red-100 text-red-800' },
};

export default function BankImportHistory() {
  const columns: GridColDef[] = [
    {
      field: 'ImportDate',
      headerName: 'Import Date',
      width: 140,
      filterable: true,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: 'FileName',
      headerName: 'File',
      width: 200,
      filterable: true,
      renderCell: (params) => (
        <div className="flex items-center">
          <FileText className="w-4 h-4 mr-2 text-gray-400" />
          <span className="truncate" title={params.value}>{params.value}</span>
        </div>
      ),
    },
    {
      field: 'FileType',
      headerName: 'Type',
      width: 80,
      filterable: true,
      renderCell: (params) => (
        <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-700">
          {params.value}
        </span>
      ),
    },
    {
      field: 'BankAccountName',
      headerName: 'Bank Account',
      width: 180,
      filterable: true,
      renderCell: (params) => (
        <div>
          <div className="text-sm text-gray-900">{params.value}</div>
          {params.row.BankAccountNumber && (
            <div className="text-xs text-gray-500">({params.row.BankAccountNumber})</div>
          )}
        </div>
      ),
    },
    {
      field: 'TransactionCount',
      headerName: 'Transactions',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => (
        <span className="font-medium">{params.value}</span>
      ),
    },
    {
      field: 'MatchedCount',
      headerName: 'Matched',
      width: 100,
      type: 'number',
      filterable: true,
      renderCell: (params) => {
        const total = params.row.TransactionCount || 0;
        const matched = params.value || 0;
        const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
        return (
          <div className="flex items-center">
            <span className="font-medium text-green-600">{matched}</span>
            <span className="text-xs text-gray-500 ml-1">({pct}%)</span>
          </div>
        );
      },
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 130,
      filterable: true,
      renderCell: (params) => {
        const config = statusConfig[params.value] || statusConfig.Pending;
        return (
          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
            {config.icon}
            <span className="ml-1">{params.value}</span>
          </span>
        );
      },
    },
    {
      field: 'ImportedBy',
      headerName: 'Imported By',
      width: 120,
      filterable: true,
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Link
          to={`/transactions?importId=${params.row.Id}`}
          className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
        >
          View Txns
        </Link>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Bank Import History</h1>
          <p className="text-sm text-gray-600">
            View all bank transaction imports and their status.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/bank-import/matches"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Review Matches
          </Link>
          <Link
            to="/bank-import"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Import
          </Link>
        </div>
      </div>

      <RestDataGrid<BankTransactionImport>
        endpoint="/banktransactionimports"
        columns={columns}
        initialPageSize={25}
        emptyMessage="No imports found. Click 'New Import' to import bank transactions."
      />
    </div>
  );
}
