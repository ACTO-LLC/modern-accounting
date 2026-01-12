import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { GridColDef } from '@mui/x-data-grid';
import ServerDataGrid from '../components/ServerDataGrid';
import { customersApi, Customer } from '../lib/api';

interface Project {
  Id: string;
  Name: string;
  CustomerId: string;
  Description?: string;
  Status: 'Active' | 'Completed' | 'OnHold';
  StartDate?: string;
  EndDate?: string;
  BudgetedHours?: number;
  BudgetedAmount?: number;
  CreatedAt: string;
  UpdatedAt: string;
}

const formatCurrency = (amount?: number) => {
  if (amount === undefined || amount === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'Active':
      return 'bg-green-100 text-green-800';
    case 'Completed':
      return 'bg-blue-100 text-blue-800';
    case 'OnHold':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default function Projects() {
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });

  const customersMap = new Map(customers.map(c => [c.Id, c.Name]));

  const columns: GridColDef[] = [
    {
      field: 'Name',
      headerName: 'Project Name',
      width: 200,
      filterable: true,
      renderCell: (params) => (
        <div>
          <div className="font-medium">{params.value}</div>
          {params.row.Description && (
            <div className="text-sm text-gray-500 truncate max-w-xs">{params.row.Description}</div>
          )}
        </div>
      ),
    },
    {
      field: 'CustomerId',
      headerName: 'Customer',
      width: 180,
      filterable: true,
      renderCell: (params) => customersMap.get(params.value) || 'Unknown',
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 110,
      filterable: true,
      renderCell: (params) => (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(params.value)}`}>
          {params.value === 'OnHold' ? 'On Hold' : params.value}
        </span>
      ),
    },
    {
      field: 'StartDate',
      headerName: 'Start Date',
      width: 120,
      filterable: true,
      renderCell: (params) => params.value ? new Date(params.value).toLocaleDateString() : '-',
    },
    {
      field: 'EndDate',
      headerName: 'End Date',
      width: 120,
      filterable: true,
      renderCell: (params) => params.value ? new Date(params.value).toLocaleDateString() : '-',
    },
    {
      field: 'BudgetedAmount',
      headerName: 'Budget',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => formatCurrency(params.value),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
        <Link
          to="/projects/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Link>
      </div>

      <ServerDataGrid<Project>
        entityName="projects"
        queryFields="Id Name CustomerId Description Status StartDate EndDate BudgetedHours BudgetedAmount"
        columns={columns}
        editPath="/projects/{id}/edit"
        initialPageSize={25}
        emptyMessage="No projects found."
      />
    </div>
  );
}
