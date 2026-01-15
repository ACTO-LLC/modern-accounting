import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';

interface Vendor {
  Id: string;
  Name: string;
  Email: string;
  Phone: string;
  PaymentTerms: string;
  Status: string;
  Is1099Vendor: boolean;
}

export default function Vendors() {
  const columns: GridColDef[] = [
    { field: 'Name', headerName: 'Name', width: 180, filterable: true },
    { field: 'Email', headerName: 'Email', width: 180, filterable: true },
    { field: 'Phone', headerName: 'Phone', width: 130, filterable: true },
    { field: 'PaymentTerms', headerName: 'Payment Terms', width: 130, filterable: true },
    {
      field: 'Status',
      headerName: 'Status',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          params.value === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {params.value}
        </span>
      ),
    },
    {
      field: 'Is1099Vendor',
      headerName: '1099',
      width: 80,
      filterable: true,
      renderCell: (params) => params.value ? (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Yes</span>
      ) : (
        <span className="text-gray-400">No</span>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
        <Link
          to="/vendors/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Vendor
        </Link>
      </div>

      <RestDataGrid<Vendor>
        endpoint="/vendors"
        columns={columns}
        editPath="/vendors/{id}/edit"
        initialPageSize={25}
        emptyMessage="No vendors found."
      />
    </div>
  );
}
