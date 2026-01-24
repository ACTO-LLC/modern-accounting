import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, Percent } from 'lucide-react';
import { useState } from 'react';
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

interface TaxRateInput {
  Name: string;
  Rate: number;
  Description?: string | null;
  IsDefault?: boolean;
  IsActive?: boolean;
}

// Validation constants
const NAME_MAX_LENGTH = 100;

// Validation error messages
interface ValidationErrors {
  name?: string;
  rate?: string;
}

export default function TaxRates() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingTaxRate, setEditingTaxRate] = useState<TaxRate | null>(null);
  const [formData, setFormData] = useState<TaxRateInput>({
    Name: '',
    Rate: 0,
    Description: '',
    IsDefault: false,
    IsActive: true,
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const { showToast } = useToast();

  const queryClient = useQueryClient();

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

  const createMutation = useMutation({
    mutationFn: async (data: TaxRateInput) => {
      const response = await api.post('/taxrates', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxrates'] });
      showToast('Tax rate created successfully', 'success');
      resetForm();
    },
    onError: (error) => {
      console.error('Failed to create tax rate:', error);
      showToast('Failed to create tax rate', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaxRateInput> }) => {
      const response = await api.patch(`/taxrates/Id/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxrates'] });
      showToast('Tax rate updated successfully', 'success');
      resetForm();
    },
    onError: (error) => {
      console.error('Failed to update tax rate:', error);
      showToast('Failed to update tax rate', 'error');
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
    onError: (error) => {
      console.error('Failed to delete tax rate:', error);
      showToast('Failed to delete tax rate', 'error');
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingTaxRate(null);
    setFormData({
      Name: '',
      Rate: 0,
      Description: '',
      IsDefault: false,
      IsActive: true,
    });
    setValidationErrors({});
  };

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    const trimmedName = formData.Name.trim();

    // Check for empty name
    if (!trimmedName) {
      errors.name = 'Name is required';
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      errors.name = `Name must be ${NAME_MAX_LENGTH} characters or less`;
    } else {
      // Check for duplicate names
      const duplicate = taxRates?.find(
        (tr) =>
          tr.Name.toLowerCase() === trimmedName.toLowerCase() &&
          (!editingTaxRate || tr.Id !== editingTaxRate.Id)
      );
      if (duplicate) {
        errors.name = 'A tax rate with this name already exists';
      }
    }

    // Validate rate
    if (formData.Rate < 0 || formData.Rate > 1) {
      errors.rate = 'Rate must be between 0% and 100%';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitData: TaxRateInput = {
      ...formData,
      Name: formData.Name.trim(),
      Description: formData.Description?.trim() || null,
    };

    if (editingTaxRate) {
      updateMutation.mutate({ id: editingTaxRate.Id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (taxRate: TaxRate) => {
    setEditingTaxRate(taxRate);
    setFormData({
      Name: taxRate.Name,
      Rate: taxRate.Rate,
      Description: taxRate.Description || '',
      IsDefault: taxRate.IsDefault,
      IsActive: taxRate.IsActive,
    });
    setValidationErrors({});
    setShowForm(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the tax rate "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleSetDefault = async (id: string) => {
    // First, unset all other defaults
    const currentDefault = taxRates?.find((tr) => tr.IsDefault);
    if (currentDefault && currentDefault.Id !== id) {
      await api.patch(`/taxrates/Id/${currentDefault.Id}`, { IsDefault: false });
    }
    // Set the new default
    await api.patch(`/taxrates/Id/${id}`, { IsDefault: true });
    queryClient.invalidateQueries({ queryKey: ['taxrates'] });
    showToast('Default tax rate updated', 'success');
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

  if (isLoading) return <div className="p-4">Loading tax rates...</div>;
  if (error)
    return <div className="p-4 text-red-600">Error loading tax rates</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tax Rates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage sales tax rates for your invoices
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Tax Rate
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white shadow sm:rounded-lg mb-6 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">
              {editingTaxRate ? 'Edit Tax Rate' : 'New Tax Rate'}
            </h2>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  maxLength={NAME_MAX_LENGTH}
                  value={formData.Name}
                  onChange={(e) => {
                    setFormData({ ...formData, Name: e.target.value });
                    if (validationErrors.name) {
                      setValidationErrors({ ...validationErrors, name: undefined });
                    }
                  }}
                  placeholder="e.g., California Sales Tax"
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 sm:text-sm border p-2 ${
                    validationErrors.name
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-gray-300 focus:border-indigo-500'
                  }`}
                />
                {validationErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="rate"
                  className="block text-sm font-medium text-gray-700"
                >
                  Rate (%) *
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <input
                    type="number"
                    id="rate"
                    required
                    min="0"
                    max="100"
                    step="0.01"
                    value={(formData.Rate * 100).toFixed(2)}
                    onChange={(e) => {
                      const percentValue = parseFloat(e.target.value) || 0;
                      setFormData({ ...formData, Rate: percentValue / 100 });
                      if (validationErrors.rate) {
                        setValidationErrors({ ...validationErrors, rate: undefined });
                      }
                    }}
                    placeholder="8.25"
                    className={`block w-full pr-10 rounded-md shadow-sm focus:ring-indigo-500 sm:text-sm border p-2 ${
                      validationErrors.rate
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-indigo-500'
                    }`}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Percent className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
                {validationErrors.rate && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.rate}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  rows={2}
                  value={formData.Description || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, Description: e.target.value })
                  }
                  placeholder="Optional description for this tax rate"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.IsDefault}
                    onChange={(e) =>
                      setFormData({ ...formData, IsDefault: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Default tax rate</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.IsActive}
                    onChange={(e) =>
                      setFormData({ ...formData, IsActive: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving...'
                  : editingTaxRate
                  ? 'Update Tax Rate'
                  : 'Create Tax Rate'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tax rates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
        </div>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Rate
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Description
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredTaxRates?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No tax rates found. Create your first tax rate to get started.
                </td>
              </tr>
            ) : (
              filteredTaxRates?.map((taxRate) => (
                <tr key={taxRate.Id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-900">
                        {taxRate.Name}
                      </span>
                      {taxRate.IsDefault && (
                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800">
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                    {formatRate(taxRate.Rate)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {taxRate.Description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        taxRate.IsActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {taxRate.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!taxRate.IsDefault && taxRate.IsActive && (
                      <button
                        onClick={() => handleSetDefault(taxRate.Id)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(taxRate)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(taxRate.Id, taxRate.Name)}
                      className="text-red-600 hover:text-red-900"
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

      <div className="mt-4 text-sm text-gray-500">
        <p>
          Tax rates are automatically applied to taxable line items on invoices.
          The default tax rate will be pre-selected when creating new invoices.
        </p>
      </div>
    </div>
  );
}
