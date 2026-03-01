import { Link, useNavigate } from 'react-router-dom';
import { Plus, GitBranch } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { getTimestampColumns } from '../lib/gridColumns';

interface Customer {
  Id: string;
  Name: string;
  Email: string;
  Phone: string;
  Address: string;
  Status: string;
  CreatedAt: string;
  UpdatedAt: string;
}

export default function Customers() {
  const navigate = useNavigate();

  const columns: GridColDef[] = [
    { field: 'Name', headerName: 'Name', width: 200, filterable: true },
    { field: 'Email', headerName: 'Email', width: 200, filterable: true },
    { field: 'Phone', headerName: 'Phone', width: 150, filterable: true },
    { field: 'Address', headerName: 'Address', width: 250, filterable: true },
    {
      field: 'Status',
      headerName: 'Status',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          params.value === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
        }`}>
          {params.value}
        </span>
      ),
    },
    ...getTimestampColumns(),
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/customers/${params.row.Id}/edit`);
            }}
            className="text-indigo-600 hover:text-indigo-900"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/customers/${params.row.Id}/hierarchy`);
            }}
            className="text-gray-600 hover:text-gray-900 inline-flex items-center"
            title="View related documents"
          >
            <GitBranch className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
        <Link
          to="/customers/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </Link>
      </div>

      <RestDataGrid<Customer>
        endpoint="/customers"
        columns={columns}
        editPath="/customers/{id}/edit"
        initialPageSize={25}
        baseFilter="Status eq 'Active'"
        emptyMessage="No customers found."
      />
    </div>
  );
}
