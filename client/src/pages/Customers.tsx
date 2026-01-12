import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import ServerDataGrid from '../components/ServerDataGrid';

interface Customer {
  Id: string;
  Name: string;
  Email: string;
  Phone: string;
  Address: string;
}

export default function Customers() {
  const columns: GridColDef[] = [
    { field: 'Name', headerName: 'Name', width: 200, filterable: true },
    { field: 'Email', headerName: 'Email', width: 200, filterable: true },
    { field: 'Phone', headerName: 'Phone', width: 150, filterable: true },
    { field: 'Address', headerName: 'Address', width: 250, filterable: true },
  ];

  return (
    <div className="max-w-6xl mx-auto">
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

      <ServerDataGrid<Customer>
        entityName="customers"
        queryFields="Id Name Email Phone Address"
        columns={columns}
        editPath="/customers/{id}/edit"
        initialPageSize={25}
        emptyMessage="No customers found."
      />
    </div>
  );
}
