import { Link } from 'react-router-dom';
import { Plus, Wrench, Box, Package } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  Description: string | null;
  SalesPrice: number | null;
  PurchaseCost: number | null;
  Category: string | null;
  Taxable: boolean;
  Status: 'Active' | 'Inactive';
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export default function ProductsServices() {
  const columns: GridColDef[] = [
    {
      field: 'Name',
      headerName: 'Name',
      width: 200,
      filterable: true,
      renderCell: (params) => {
        const IconComponent = params.row.Type === 'Service' ? Wrench :
          params.row.Type === 'Inventory' ? Box : Package;
        const iconColor = params.row.Type === 'Service' ? 'text-blue-500' :
          params.row.Type === 'Inventory' ? 'text-green-500' : 'text-orange-500';
        return (
          <div className="flex items-center">
            <IconComponent className={`w-4 h-4 mr-2 ${iconColor}`} />
            <span className="text-sm font-medium text-gray-900">{params.value}</span>
          </div>
        );
      }
    },
    { field: 'SKU', headerName: 'SKU', width: 120, filterable: true, renderCell: (params) => params.value || '-' },
    {
      field: 'Type',
      headerName: 'Type',
      width: 130,
      filterable: true,
      renderCell: (params) => {
        const styles: Record<string, string> = {
          Service: 'bg-blue-100 text-blue-800',
          Inventory: 'bg-green-100 text-green-800',
          NonInventory: 'bg-orange-100 text-orange-800'
        };
        const labels: Record<string, string> = {
          Service: 'Service',
          Inventory: 'Inventory',
          NonInventory: 'Non-Inventory'
        };
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[params.value] || 'bg-gray-100 text-gray-800'}`}>
            {labels[params.value] || params.value}
          </span>
        );
      }
    },
    { field: 'Category', headerName: 'Category', width: 130, filterable: true, renderCell: (params) => params.value || '-' },
    {
      field: 'SalesPrice',
      headerName: 'Sales Price',
      width: 120,
      type: 'number',
      filterable: true,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => formatCurrency(params.value),
    },
    {
      field: 'Taxable',
      headerName: 'Taxable',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          params.value ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {params.value ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 100,
      filterable: true,
      renderCell: (params) => (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          params.value === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {params.value}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Products & Services</h1>
        <Link
          to="/products-services/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Product/Service
        </Link>
      </div>

      <RestDataGrid<ProductService>
        endpoint="/productsservices"
        columns={columns}
        editPath="/products-services/{id}/edit"
        initialPageSize={25}
        emptyMessage="No products or services found."
      />
    </div>
  );
}
