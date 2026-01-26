import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowLeft, Car, Star, StarOff, Trash2, Edit2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

interface Vehicle {
  Id: string;
  Name: string;
  Make: string | null;
  Model: string | null;
  Year: number | null;
  LicensePlate: string | null;
  OdometerStart: number | null;
  OdometerCurrent: number | null;
  IsDefault: boolean;
  Status: string;
  CreatedAt: string;
}

interface VehicleFormData {
  Name: string;
  Make: string;
  Model: string;
  Year: number | null;
  LicensePlate: string;
  OdometerStart: number | null;
  IsDefault: boolean;
  Status: string;
}

export default function Vehicles() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<VehicleFormData>({
    Name: '',
    Make: '',
    Model: '',
    Year: null,
    LicensePlate: '',
    OdometerStart: null,
    IsDefault: false,
    Status: 'Active',
  });

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const response = await api.get<{ value: Vehicle[] }>('/vehicles?$orderby=Name');
      return response.data.value;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: VehicleFormData) => {
      // If setting as default, unset other defaults first
      if (data.IsDefault) {
        const currentDefault = vehicles?.find((v) => v.IsDefault);
        if (currentDefault) {
          await api.patch(`/vehicles/Id/${currentDefault.Id}`, { IsDefault: false });
        }
      }
      await api.post('/vehicles', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<VehicleFormData> }) => {
      // If setting as default, unset other defaults first
      if (data.IsDefault) {
        const currentDefault = vehicles?.find((v) => v.IsDefault && v.Id !== id);
        if (currentDefault) {
          await api.patch(`/vehicles/Id/${currentDefault.Id}`, { IsDefault: false });
        }
      }
      await api.patch(`/vehicles/Id/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/vehicles/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const resetForm = () => {
    setFormData({
      Name: '',
      Make: '',
      Model: '',
      Year: null,
      LicensePlate: '',
      OdometerStart: null,
      IsDefault: false,
      Status: 'Active',
    });
    setEditingVehicle(null);
    setIsFormOpen(false);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      Name: vehicle.Name,
      Make: vehicle.Make || '',
      Model: vehicle.Model || '',
      Year: vehicle.Year,
      LicensePlate: vehicle.LicensePlate || '',
      OdometerStart: vehicle.OdometerStart,
      IsDefault: vehicle.IsDefault,
      Status: vehicle.Status,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingVehicle) {
      await updateMutation.mutateAsync({ id: editingVehicle.Id, data: formData });
    } else {
      await createMutation.mutateAsync(formData);
    }
  };

  const handleSetDefault = async (vehicle: Vehicle) => {
    await updateMutation.mutateAsync({
      id: vehicle.Id,
      data: { IsDefault: !vehicle.IsDefault },
    });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this vehicle?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Inactive':
        return 'bg-gray-100 text-gray-800';
      case 'Sold':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Link to="/mileage" className="mr-4 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Vehicles</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your vehicles for mileage tracking
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsFormOpen(true);
          }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Vehicle
        </button>
      </div>

      {/* Vehicle Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-lg bg-white">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name *</label>
                <input
                  type="text"
                  value={formData.Name}
                  onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                  placeholder="e.g., Work Car, Personal Van"
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Year</label>
                  <input
                    type="number"
                    value={formData.Year || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        Year: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    placeholder="2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Make</label>
                  <input
                    type="text"
                    value={formData.Make}
                    onChange={(e) => setFormData({ ...formData, Make: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    placeholder="Toyota"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Model</label>
                  <input
                    type="text"
                    value={formData.Model}
                    onChange={(e) => setFormData({ ...formData, Model: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    placeholder="Camry"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">License Plate</label>
                  <input
                    type="text"
                    value={formData.LicensePlate}
                    onChange={(e) => setFormData({ ...formData, LicensePlate: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    placeholder="ABC-123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Starting Odometer
                  </label>
                  <input
                    type="number"
                    value={formData.OdometerStart || ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        OdometerStart: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    placeholder="45000"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={formData.Status}
                  onChange={(e) => setFormData({ ...formData, Status: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Sold">Sold</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.IsDefault}
                  onChange={(e) => setFormData({ ...formData, IsDefault: e.target.checked })}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-900">
                  Set as default vehicle
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingVehicle
                    ? 'Update'
                    : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicles List */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : vehicles && vehicles.length > 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {vehicles.map((vehicle) => (
              <li key={vehicle.Id} className="px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Car className="w-10 h-10 text-gray-400 mr-4" />
                    <div>
                      <div className="flex items-center">
                        <h3 className="text-lg font-medium text-gray-900">{vehicle.Name}</h3>
                        {vehicle.IsDefault && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Star className="w-3 h-3 mr-1" />
                            Default
                          </span>
                        )}
                        <span
                          className={`ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(
                            vehicle.Status
                          )}`}
                        >
                          {vehicle.Status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {vehicle.Year && `${vehicle.Year} `}
                        {vehicle.Make && `${vehicle.Make} `}
                        {vehicle.Model}
                        {vehicle.LicensePlate && ` - ${vehicle.LicensePlate}`}
                      </p>
                      {vehicle.OdometerStart && (
                        <p className="text-xs text-gray-400">
                          Starting odometer: {vehicle.OdometerStart.toLocaleString()} miles
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSetDefault(vehicle)}
                      className={`p-2 rounded-md ${
                        vehicle.IsDefault
                          ? 'text-yellow-600 hover:bg-yellow-50'
                          : 'text-gray-400 hover:bg-gray-100'
                      }`}
                      title={vehicle.IsDefault ? 'Remove as default' : 'Set as default'}
                    >
                      {vehicle.IsDefault ? (
                        <Star className="w-5 h-5 fill-current" />
                      ) : (
                        <StarOff className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleEdit(vehicle)}
                      className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                      title="Edit vehicle"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(vehicle.Id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                      title="Delete vehicle"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Car className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No vehicles</h3>
          <p className="mt-1 text-sm text-gray-500">
            Add a vehicle to start tracking mileage.
          </p>
          <button
            onClick={() => setIsFormOpen(true)}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Vehicle
          </button>
        </div>
      )}
    </div>
  );
}
