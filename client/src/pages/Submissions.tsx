import { Plus, Eye, Edit } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface Submission {
  Id: string;
  Title: string;
  Type: string;
  Priority: string;
  Status: string;
  CreatedAt: string;
}

const typeColors: Record<string, string> = {
  Bug: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Enhancement: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Question: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

const priorityColors: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  High: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  Critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const statusColors: Record<string, string> = {
  Open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  InProgress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

export default function Submissions() {
  const navigate = useNavigate();

  const columns: GridColDef[] = [
    {
      field: 'Title',
      headerName: 'Title',
      flex: 1,
      minWidth: 200,
      filterable: true
    },
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
    {
      field: 'Priority',
      headerName: 'Priority',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${priorityColors[params.value] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
          {params.value}
        </span>
      ),
    },
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
    {
      field: 'CreatedAt',
      headerName: 'Created',
      width: 120,
      filterable: true,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/submissions/' + params.row.Id + '/edit');
            }}
            className="text-gray-600 hover:text-gray-900 inline-flex items-center"
            title="View details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate('/submissions/' + params.row.Id + '/edit');
            }}
            className="text-indigo-600 hover:text-indigo-900 inline-flex items-center"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Feedback & Submissions</h1>
        <Link
          to="/submissions/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Submission
        </Link>
      </div>

      <RestDataGrid<Submission>
        endpoint="/submissions"
        columns={columns}
        editPath="/submissions/{id}/edit"
        initialPageSize={25}
        emptyMessage="No submissions found. Click 'New Submission' to report a bug or request an enhancement."
      />
    </div>
  );
}
