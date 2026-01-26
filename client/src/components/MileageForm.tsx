import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const mileageSchemaBase = z.object({
  VehicleId: z.string().uuid().nullish(),
  TripDate: z.string().min(1, 'Trip date is required'),
  StartLocation: z.string().min(1, 'Start location is required'),
  EndLocation: z.string().min(1, 'End location is required'),
  StartOdometer: z.number().int('Odometer must be a whole number').nullish(),
  EndOdometer: z.number().int('Odometer must be a whole number').nullish(),
  Distance: z.number().min(0.1, 'Distance must be greater than 0'),
  Purpose: z.string().min(1, 'Purpose is required'),
  Category: z.enum(['Business', 'Personal', 'Medical', 'Charity']),
  RatePerMile: z.number().nullish(),
  DeductibleAmount: z.number().nullish(),
  CustomerId: z.string().uuid().nullish(),
  ProjectId: z.string().uuid().nullish(),
  Notes: z.string().nullish(),
  IsRoundTrip: z.boolean(),
  Status: z.enum(['Recorded', 'Pending', 'Approved', 'Voided']),
}).refine(
  (data) => {
    // Validate date is not in the future
    const tripDate = new Date(data.TripDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    return tripDate <= today;
  },
  { message: 'Trip date cannot be in the future', path: ['TripDate'] }
).refine(
  (data) => {
    // Validate date is not unreasonably old (e.g., before 1990)
    const tripDate = new Date(data.TripDate);
    return tripDate.getFullYear() >= 1990;
  },
  { message: 'Trip date is too far in the past', path: ['TripDate'] }
).refine(
  (data) => {
    // Validate end odometer >= start odometer if both are provided
    if (data.StartOdometer != null && data.EndOdometer != null) {
      return data.EndOdometer >= data.StartOdometer;
    }
    return true;
  },
  { message: 'End odometer must be greater than or equal to start odometer', path: ['EndOdometer'] }
).refine(
  (data) => {
    // Validate distance matches odometer difference if both are provided
    if (data.StartOdometer != null && data.EndOdometer != null) {
      const odometerDistance = data.EndOdometer - data.StartOdometer;
      // Allow small rounding tolerance (1 mile)
      return Math.abs(data.Distance - odometerDistance) <= 1;
    }
    return true;
  },
  { message: 'Distance must match the difference between start and end odometer readings', path: ['Distance'] }
);

export const mileageSchema = mileageSchemaBase;

export type MileageFormData = z.infer<typeof mileageSchema>;

interface Vehicle {
  Id: string;
  Name: string;
  Make: string;
  Model: string;
  Year: number;
  IsDefault: boolean;
}

interface MileageRate {
  Id: string;
  Category: string;
  RatePerMile: number;
  EffectiveDate: string;
}

interface Customer {
  Id: string;
  Name: string;
}

interface Project {
  Id: string;
  Name: string;
}

interface MileageFormProps {
  initialValues?: Partial<MileageFormData>;
  onSubmit: (data: MileageFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function MileageForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting: externalIsSubmitting,
  submitButtonText = 'Save Trip',
}: MileageFormProps) {
  const navigate = useNavigate();

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles'],
    queryFn: async () => {
      const response = await api.get<{ value: Vehicle[] }>('/vehicles?$filter=Status eq \'Active\'&$orderby=Name');
      return response.data.value;
    },
  });

  const { data: mileageRates } = useQuery({
    queryKey: ['mileageRates'],
    queryFn: async () => {
      const response = await api.get<{ value: MileageRate[] }>('/mileagerates?$filter=IsActive eq true&$orderby=EffectiveDate desc');
      return response.data.value;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers?$orderby=Name');
      return response.data.value;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get<{ value: Project[] }>('/projects?$orderby=Name');
      return response.data.value;
    },
  });

  // Find default vehicle
  const defaultVehicle = vehicles?.find((v) => v.IsDefault);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting: formIsSubmitting },
  } = useForm<MileageFormData>({
    resolver: zodResolver(mileageSchema),
    defaultValues: {
      TripDate: new Date().toISOString().split('T')[0],
      Status: 'Recorded',
      Category: 'Business',
      IsRoundTrip: false,
      Distance: 0,
      VehicleId: defaultVehicle?.Id || null,
      ...initialValues,
    },
  });

  const category = useWatch({ control, name: 'Category' });
  const distance = useWatch({ control, name: 'Distance' });
  const isRoundTrip = useWatch({ control, name: 'IsRoundTrip' });
  const tripDate = useWatch({ control, name: 'TripDate' });
  const startOdometer = useWatch({ control, name: 'StartOdometer' });
  const endOdometer = useWatch({ control, name: 'EndOdometer' });
  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  // Get the applicable rate for the selected category and date
  const getApplicableRate = () => {
    if (!mileageRates || !category || category === 'Personal' || !tripDate) return null;

    const tripDateObj = new Date(tripDate);
    const applicableRates = mileageRates
      .filter((r) => r.Category === category && new Date(r.EffectiveDate) <= tripDateObj)
      .sort((a, b) => new Date(b.EffectiveDate).getTime() - new Date(a.EffectiveDate).getTime());

    return applicableRates[0];
  };

  const applicableRate = getApplicableRate();

  // Auto-calculate deductible amount when distance, category, or rate changes
  // Note: Distance field stores one-way miles. For round trips, we multiply by 2
  // when calculating the deduction, but store the deduction amount in DeductibleAmount.
  useEffect(() => {
    if (category === 'Personal') {
      setValue('RatePerMile', null);
      setValue('DeductibleAmount', null);
    } else if (applicableRate && distance) {
      const effectiveDistance = isRoundTrip ? distance * 2 : distance;
      const deductible = effectiveDistance * applicableRate.RatePerMile;
      setValue('RatePerMile', applicableRate.RatePerMile);
      setValue('DeductibleAmount', Math.round(deductible * 100) / 100);
    }
  }, [category, distance, isRoundTrip, applicableRate, setValue]);

  // Auto-calculate distance from odometer readings
  useEffect(() => {
    if (startOdometer && endOdometer && endOdometer > startOdometer) {
      setValue('Distance', endOdometer - startOdometer);
    }
  }, [startOdometer, endOdometer, setValue]);

  // Set default vehicle when loaded
  useEffect(() => {
    if (defaultVehicle && !initialValues?.VehicleId) {
      setValue('VehicleId', defaultVehicle.Id);
    }
  }, [defaultVehicle, initialValues?.VehicleId, setValue]);

  const handleFormSubmit = async (data: MileageFormData) => {
    // Clear VehicleId if empty
    if (!data.VehicleId) {
      data.VehicleId = null;
    }
    // Clear customer/project IDs if empty
    if (!data.CustomerId) {
      data.CustomerId = null;
    }
    if (!data.ProjectId) {
      data.ProjectId = null;
    }

    await onSubmit(data);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate('/mileage')}
          className="mr-4 text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Date and Vehicle */}
          <div>
            <label htmlFor="TripDate" className="block text-sm font-medium text-gray-700">
              Trip Date
            </label>
            <input
              id="TripDate"
              type="date"
              max={new Date().toISOString().split('T')[0]}
              {...register('TripDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.TripDate && (
              <p className="mt-1 text-sm text-red-600">{errors.TripDate.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="VehicleId" className="block text-sm font-medium text-gray-700">
              Vehicle
            </label>
            <select
              id="VehicleId"
              {...register('VehicleId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select vehicle (optional)...</option>
              {vehicles?.map((vehicle) => (
                <option key={vehicle.Id} value={vehicle.Id}>
                  {vehicle.Name}
                  {vehicle.Year ? ` (${vehicle.Year} ${vehicle.Make} ${vehicle.Model})` : ''}
                  {vehicle.IsDefault ? ' - Default' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Category and Purpose */}
          <div>
            <label htmlFor="Category" className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="Category"
              {...register('Category')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Business">Business</option>
              <option value="Personal">Personal</option>
              <option value="Medical">Medical</option>
              <option value="Charity">Charity</option>
            </select>
            {applicableRate && (
              <p className="mt-1 text-xs text-gray-500">
                Rate: ${applicableRate.RatePerMile.toFixed(4)}/mile
              </p>
            )}
          </div>

          <div>
            <label htmlFor="Purpose" className="block text-sm font-medium text-gray-700">
              Purpose / Business Reason
            </label>
            <input
              id="Purpose"
              type="text"
              {...register('Purpose')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="e.g., Client meeting, Site visit"
            />
            {errors.Purpose && (
              <p className="mt-1 text-sm text-red-600">{errors.Purpose.message}</p>
            )}
          </div>

          {/* Locations */}
          <div>
            <label htmlFor="StartLocation" className="block text-sm font-medium text-gray-700">
              Start Location
            </label>
            <input
              id="StartLocation"
              type="text"
              {...register('StartLocation')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="e.g., Office, Home"
            />
            {errors.StartLocation && (
              <p className="mt-1 text-sm text-red-600">{errors.StartLocation.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="EndLocation" className="block text-sm font-medium text-gray-700">
              End Location
            </label>
            <input
              id="EndLocation"
              type="text"
              {...register('EndLocation')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="e.g., Client site, Airport"
            />
            {errors.EndLocation && (
              <p className="mt-1 text-sm text-red-600">{errors.EndLocation.message}</p>
            )}
          </div>

          {/* Odometer Readings (optional) */}
          <div>
            <label htmlFor="StartOdometer" className="block text-sm font-medium text-gray-700">
              Start Odometer (optional)
            </label>
            <input
              id="StartOdometer"
              type="number"
              min="0"
              max="999999"
              {...register('StartOdometer', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="e.g., 45230"
            />
            {errors.StartOdometer && (
              <p className="mt-1 text-sm text-red-600">{errors.StartOdometer.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="EndOdometer" className="block text-sm font-medium text-gray-700">
              End Odometer (optional)
            </label>
            <input
              id="EndOdometer"
              type="number"
              min="0"
              max="999999"
              {...register('EndOdometer', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="e.g., 45255"
            />
            {errors.EndOdometer && (
              <p className="mt-1 text-sm text-red-600">{errors.EndOdometer.message}</p>
            )}
          </div>

          {/* Distance and Round Trip */}
          <div>
            <label htmlFor="Distance" className="block text-sm font-medium text-gray-700">
              One-Way Distance (miles)
            </label>
            <input
              id="Distance"
              type="number"
              step="0.1"
              min="0.1"
              max="9999"
              {...register('Distance', { valueAsNumber: true })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="e.g., 25.5"
            />
            {errors.Distance && (
              <p className="mt-1 text-sm text-red-600">{errors.Distance.message}</p>
            )}
          </div>

          <div className="flex items-end pb-2">
            <div className="flex items-center">
              <input
                id="IsRoundTrip"
                type="checkbox"
                {...register('IsRoundTrip')}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="IsRoundTrip" className="ml-2 block text-sm text-gray-900">
                Round Trip (distance x 2)
              </label>
            </div>
          </div>

          {/* Deductible Amount (calculated) */}
          {category !== 'Personal' && (
            <div className="sm:col-span-2 bg-green-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-800">Estimated Tax Deduction</p>
                  <p className="text-xs text-green-600">
                    {isRoundTrip ? `${distance || 0} x 2 = ${(distance || 0) * 2} miles` : `${distance || 0} miles`}
                    {applicableRate && ` @ $${applicableRate.RatePerMile.toFixed(4)}/mile`}
                  </p>
                </div>
                <div className="text-2xl font-bold text-green-700">
                  ${((isRoundTrip ? (distance || 0) * 2 : distance || 0) * (applicableRate?.RatePerMile || 0)).toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Customer and Project (optional) */}
          <div>
            <label htmlFor="CustomerId" className="block text-sm font-medium text-gray-700">
              Customer (optional)
            </label>
            <select
              id="CustomerId"
              {...register('CustomerId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select customer...</option>
              {customers?.map((customer) => (
                <option key={customer.Id} value={customer.Id}>
                  {customer.Name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ProjectId" className="block text-sm font-medium text-gray-700">
              Project (optional)
            </label>
            <select
              id="ProjectId"
              {...register('ProjectId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select project...</option>
              {projects?.map((project) => (
                <option key={project.Id} value={project.Id}>
                  {project.Name}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="sm:col-span-2">
            <label htmlFor="Notes" className="block text-sm font-medium text-gray-700">
              Notes (optional)
            </label>
            <textarea
              id="Notes"
              {...register('Notes')}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="Additional details about this trip..."
            />
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/mileage')}
            className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : submitButtonText}
          </button>
        </div>
      </form>
    </div>
  );
}
