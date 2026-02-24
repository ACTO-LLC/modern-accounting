import { GridColDef } from '@mui/x-data-grid';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface JournalEntry {
  Id: string;
  Reference: string;
  TransactionDate: string;
  Description: string;
  Status: string;
  CreatedAt: string;
}

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  Posted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Void: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const columns: GridColDef[] = [
  { field: 'Reference', headerName: 'Entry #', width: 130, filterable: true },
  {
    field: 'TransactionDate',
    headerName: 'Date',
    width: 130,
    filterable: true,
    renderCell: (params) => formatDate(params.value),
  },
  { field: 'Description', headerName: 'Description', width: 300, filterable: true },
  {
    field: 'Status',
    headerName: 'Status',
    width: 120,
    filterable: true,
    renderCell: (params) => (
      <span
        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[params.value] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}
      >
        {params.value}
      </span>
    ),
  },
  {
    field: 'CreatedAt',
    headerName: 'Created',
    width: 130,
    filterable: true,
    renderCell: (params) => formatDate(params.value),
  },
];

export default function JournalEntries() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">General Ledger</h1>
        <Link
          to="/journal-entries/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Entry
        </Link>
      </div>

      <RestDataGrid<JournalEntry>
        endpoint="/journalentries"
        columns={columns}
        editPath="/journal-entries/{id}/edit"
        initialPageSize={25}
        emptyMessage="No journal entries found."
      />
    </div>
  );
}
