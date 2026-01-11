import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Package, Wrench, Box } from 'lucide-react';
import api from '../lib/api';

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  Description: string | null;
  SalesPrice: number | null;
  PurchaseCost: number | null;
  IncomeAccountId: string | null;
  ExpenseAccountId: string | null;
  InventoryAssetAccountId: string | null;
  Category: string | null;
  Taxable: boolean;
  Status: 'Active' | 'Inactive';
}
type FilterType = 'All' | 'Service' | 'NonInventory' | 'Inventory';

export default function ProductsServices() {
  const [filterType, setFilterType] = useState<FilterType>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('Active');
  const { data: productsServices, isLoading, error } = useQuery({
    queryKey: ['productsservices'],
    queryFn: async () => { const response = await api.get<{ value: ProductService[] }>('/productsservices'); return response.data.value; }
  });

  const filteredItems = productsServices?.filter(item => {
    const typeMatch = filterType === 'All' || item.Type === filterType;
    const statusMatch = filterStatus === 'All' || item.Status === filterStatus;
    return typeMatch && statusMatch;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Service': return <Wrench className="w-4 h-4 text-blue-500" />;
      case 'Inventory': return <Box className="w-4 h-4 text-green-500" />;
      case 'NonInventory': return <Package className="w-4 h-4 text-orange-500" />;
      default: return <Package className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = { Service: 'bg-blue-100 text-blue-800', Inventory: 'bg-green-100 text-green-800', NonInventory: 'bg-orange-100 text-orange-800' };
    const labels: Record<string, string> = { Service: 'Service', Inventory: 'Inventory', NonInventory: 'Non-Inventory' };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[type] || 'bg-gray-100 text-gray-800'}`}>{labels[type] || type}</span>;
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  if (isLoading) return <div className="p-4">Loading products and services...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading products and services</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Products & Services</h1>
        <Link to="/products-services/new" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4 mr-2" />New Product/Service
        </Link>
      </div>
      <div className="bg-white shadow rounded-lg p-4 mb-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="typeFilter" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select id="typeFilter" value={filterType} onChange={(e) => setFilterType(e.target.value as FilterType)} className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
              <option value="All">All Types</option>
              <option value="Service">Services</option>
              <option value="NonInventory">Non-Inventory</option>
              <option value="Inventory">Inventory</option>
            </select>
          </div>
          <div>
            <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select id="statusFilter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'All' | 'Active' | 'Inactive')} className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div className="flex items-end"><span className="text-sm text-gray-500">Showing {filteredItems?.length || 0} of {productsServices?.length || 0} items</span></div>
        </div>
      </div>
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sales Price</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="relative px-6 py-3"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredItems?.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No products or services found. <Link to="/products-services/new" className="text-indigo-600 hover:text-indigo-900 ml-1">Create your first one.</Link></td></tr>
            ) : (
              filteredItems?.map((item) => (
                <tr key={item.Id} className={item.Status === 'Inactive' ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center">{getTypeIcon(item.Type)}<span className="ml-2 text-sm font-medium text-gray-900">{item.Name}</span></div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.SKU || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getTypeBadge(item.Type)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.Category || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(item.SalesPrice)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.Status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{item.Status}</span></td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"><Link to={`/products-services/${item.Id}/edit`} className="text-indigo-600 hover:text-indigo-900">Edit</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
