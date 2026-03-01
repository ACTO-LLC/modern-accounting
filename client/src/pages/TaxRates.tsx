import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';

interface TaxRate {
  Id: string;
  Name: string;
  Rate: number;
  Description: string | null;
  IsDefault: boolean;
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

export default function TaxRates() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const {
    data: taxRates,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['taxrates'],
    queryFn: async () => {
      const response = await api.get<{ value: TaxRate[] }>('/taxrates?$orderby=Name');
      return response.data.value;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/taxrates/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxrates'] });
      showToast('Tax rate deleted successfully', 'success');
    },
    onError: () => {
      showToast('Failed to delete tax rate', 'error');
    },
  });

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete the tax rate "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleSetDefault = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      const currentDefault = taxRates?.find((tr) => tr.IsDefault);
      if (currentDefault && currentDefault.Id !== id) {
        await api.patch(`/taxrates/Id/${currentDefault.Id}`, { IsDefault: false });
      }
      await api.patch(`/taxrates/Id/${id}`, { IsDefault: true });
      queryClient.invalidateQueries({ queryKey: ['taxrates'] });
      showToast('Default tax rate updated', 'success');
    } catch (error) {
      console.error('Failed to set default tax rate:', error);
      showToast('Failed to set default tax rate', 'error');
    }
  };

  // Format rate as percentage for display
  const formatRate = (rate: number): string => {
    return `${(rate * 100).toFixed(2)}%`;
  };

  // Filter tax rates
  const filteredTaxRates = taxRates?.filter((taxRate) => {
    const matchesSearch =
      searchTerm === '' ||
      taxRate.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      taxRate.Description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && taxRate.IsActive) ||
      (statusFilter === 'inactive' && !taxRate.IsActive);
    return matchesSearch && matchesStatus;
  });

  if (isLoading) return <div className="p-4 dark:text-gray-300">Loading tax rates...</div>;
  if (error)
    return <div className="p-4 text-red-600 dark:text-red-400">Error loading tax rates</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Tax Rates</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage sales tax rates for your invoices
          </p>
        </div>
        <Link
          to="/tax-rates/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Tax Rate
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tax rates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
        </div>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Rate
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Description
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Status
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredTaxRates?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No tax rates found. Create your first tax rate to get started.
                </td>
              </tr>
            ) : (
              filteredTaxRates?.map((taxRate) => (
                <tr
                  key={taxRate.Id}
                  onClick={() => navigate(`/tax-rates/${taxRate.Id}/edit`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {taxRate.Name}
                      </span>
                      {taxRate.IsDefault && (
                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                    {formatRate(taxRate.Rate)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                    {taxRate.Description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        taxRate.IsActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {taxRate.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!taxRate.IsDefault && taxRate.IsActive && (
                      <button
                        onClick={(e) => handleSetDefault(e, taxRate.Id)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, taxRate.Id, taxRate.Name)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <p>
          Tax rates are automatically applied to taxable line items on invoices.
          The default tax rate will be pre-selected when creating new invoices.
        </p>
      </div>
    </div>
  );
}
