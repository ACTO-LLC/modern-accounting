import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { getTimestampColumns } from '../lib/gridColumns';

interface Account {
  Id: string;
  Code: string;
  Name: string;
  Type: string;
  Subtype: string;
  AccountNumber: string;
  Description: string;
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

const typeColors: Record<string, string> = {
  Asset: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Liability: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Equity: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Revenue: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Expense: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

export default function ChartOfAccounts() {
  const columns: GridColDef[] = [
    { field: 'Code', headerName: 'Code', width: 100, filterable: true },
    { field: 'AccountNumber', headerName: 'Acct #', width: 100, filterable: true },
    { field: 'Name', headerName: 'Name', width: 250, filterable: true },
    {
      field: 'Type',
      headerName: 'Type',
      width: 120,
      filterable: true,
      renderCell: (params) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${typeColors[params.value] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
          {params.value}
        </span>
      ),
    },
    { field: 'Subtype', headerName: 'Subtype', width: 150, filterable: true },
    {
      field: 'IsActive',
      headerName: 'Status',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${params.value ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
          {params.value ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...getTimestampColumns(),
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Chart of Accounts</h1>
        <Link
          to="/accounts/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Account
        </Link>
      </div>

      <RestDataGrid<Account>
        gridKey="accounts-grid"
        endpoint="/accounts"
        columns={columns}
        editPath="/accounts/{id}/edit"
        initialPageSize={25}
        emptyMessage="No accounts found. Create your first account to get started."
      />
    </div>
  );
}
