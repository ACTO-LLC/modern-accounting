import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronRight, X, MapPin } from 'lucide-react';
import { useState } from 'react';
import api from '../lib/api';

interface Location {
  Id: string;
  Name: string;
  ParentLocationId: string | null;
  Address: string | null;
  Description: string | null;
  Status: string;
  CreatedAt: string;
  UpdatedAt: string;
}

interface LocationInput {
  Name: string;
  ParentLocationId?: string | null;
  Address?: string;
  Description?: string;
  Status?: string;
}

export default function Locations() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [formData, setFormData] = useState<LocationInput>({
    Name: '',
    ParentLocationId: null,
    Address: '',
    Description: '',
    Status: 'Active',
  });

  const queryClient = useQueryClient();

  const {
    data: locations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const response = await api.get<{ value: Location[] }>('/locations');
      return response.data.value;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: LocationInput) => {
      const response = await api.post('/locations', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LocationInput> }) => {
      const response = await api.patch(`/locations/Id/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/locations/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingLocation(null);
    setFormData({
      Name: '',
      ParentLocationId: null,
      Address: '',
      Description: '',
      Status: 'Active',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      ParentLocationId: formData.ParentLocationId || null,
    };
    if (editingLocation) {
      updateMutation.mutate({ id: editingLocation.Id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setFormData({
      Name: location.Name,
      ParentLocationId: location.ParentLocationId,
      Address: location.Address || '',
      Description: location.Description || '',
      Status: location.Status,
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this location?')) {
      deleteMutation.mutate(id);
    }
  };

  // Build hierarchy map
  const getParentName = (parentId: string | null): string | null => {
    if (!parentId || !locations) return null;
    const parent = locations.find((l) => l.Id === parentId);
    return parent?.Name || null;
  };

  // Filter locations
  const filteredLocations = locations?.filter((location) => {
    const matchesSearch =
      searchTerm === '' ||
      location.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.Address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.Description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || location.Status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Get available parents for selection (exclude self when editing)
  const availableParents = locations?.filter(
    (l) => !editingLocation || l.Id !== editingLocation.Id
  );

  if (isLoading) return <div className="p-4">Loading locations...</div>;
  if (error)
    return <div className="p-4 text-red-600">Error loading locations</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Locations</h1>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Location
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white shadow sm:rounded-lg mb-6 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900">
              {editingLocation ? 'Edit Location' : 'New Location'}
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
                  value={formData.Name}
                  onChange={(e) =>
                    setFormData({ ...formData, Name: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                />
              </div>
              <div>
                <label
                  htmlFor="parentLocation"
                  className="block text-sm font-medium text-gray-700"
                >
                  Parent Location
                </label>
                <select
                  id="parentLocation"
                  value={formData.ParentLocationId || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ParentLocationId: e.target.value || null,
                    })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                >
                  <option value="">None (Top-level)</option>
                  {availableParents?.map((l) => (
                    <option key={l.Id} value={l.Id}>
                      {l.Name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="status"
                  className="block text-sm font-medium text-gray-700"
                >
                  Status
                </label>
                <select
                  id="status"
                  value={formData.Status}
                  onChange={(e) =>
                    setFormData({ ...formData, Status: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="address"
                  className="block text-sm font-medium text-gray-700"
                >
                  Address
                </label>
                <input
                  type="text"
                  id="address"
                  value={formData.Address}
                  onChange={(e) =>
                    setFormData({ ...formData, Address: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                />
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
                  value={formData.Description}
                  onChange={(e) =>
                    setFormData({ ...formData, Description: e.target.value })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                />
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
                  : editingLocation
                  ? 'Update Location'
                  : 'Create Location'}
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
            placeholder="Search locations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
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
                Parent
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Address
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
            {filteredLocations?.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                  No locations found. Create your first location to get started.
                </td>
              </tr>
            ) : (
              filteredLocations?.map((location) => (
                <tr key={location.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center">
                      {location.ParentLocationId && (
                        <ChevronRight className="w-4 h-4 mr-1 text-gray-400" />
                      )}
                      <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                      {location.Name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getParentName(location.ParentLocationId) || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {location.Address || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        location.Status === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {location.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(location)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(location.Id)}
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
          Locations help you track transactions by physical location, region, or store.
          Use parent locations to create a hierarchy (e.g., Region &gt; City &gt; Store).
        </p>
      </div>
    </div>
  );
}
