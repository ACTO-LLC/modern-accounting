import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

const mileageSchemaBase = z.object({
  VehicleId: z.string().uuid().nullish(),
  TripDate: z.string().min(1, 'Trip date is required'),
  StartLocation: z.string().min(1, 'Start location is required'),
  EndLocation: z.string().min(1, 'End location is required'),
  StartOdometer: z.number().nullish(),
  EndOdometer: z.number().nullish(),
  Distance: z.number().min(0.1, 'Distance must be greater than 0'),
  Purpose: z.string().min(1, 'Purpose is required'),
  Category: z.enum(['Business', 'Personal', 'Medical', 'Charity']),
  RatePerMile: z.number().nullish(),
  DeductibleAmount: z.number().nullish(),
  CustomerId: z.string().uuid().nullish(),
  ProjectId: z.string().uuid().nullish(),
  Notes: z.string().nullish(),
  IsRoundTrip: z.boolean(),
  IsPersonal: z.boolean(),
  Status: z.enum(['Recorded', 'Pending', 'Approved', 'Voided']),
});

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
      IsPersonal: false,
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

  // Destructure register refs for number fields
  // Use setValueAs to convert empty strings to null (valueAsNumber converts empty to NaN which Zod rejects)
  const numOrNull = (v: string) => { const n = Number(v); return v === '' || isNaN(n) ? null : n; };
  const { ref: distanceRef, ...distanceRest } = register('Distance', { setValueAs: (v) => { const n = Number(v); return v === '' || isNaN(n) ? 0 : n; } });
  const { ref: startOdometerRef, ...startOdometerRest } = register('StartOdometer', { setValueAs: numOrNull });
  const { ref: endOdometerRef, ...endOdometerRest } = register('EndOdometer', { setValueAs: numOrNull });

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
          className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Date and Vehicle */}
          <Controller
            name="TripDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                type="date"
                label="Trip Date"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />

          <Controller
            name="VehicleId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Vehicle"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select vehicle (optional)...</MenuItem>
                {vehicles?.map((vehicle) => (
                  <MenuItem key={vehicle.Id} value={vehicle.Id}>
                    {vehicle.Name}
                    {vehicle.Year ? ` (${vehicle.Year} ${vehicle.Make} ${vehicle.Model})` : ''}
                    {vehicle.IsDefault ? ' - Default' : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {/* Category and Purpose */}
          <Controller
            name="Category"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Category"
                required
                size="small"
                fullWidth
                helperText={applicableRate ? `Rate: $${applicableRate.RatePerMile.toFixed(4)}/mile` : undefined}
              >
                <MenuItem value="Business">Business</MenuItem>
                <MenuItem value="Personal">Personal</MenuItem>
                <MenuItem value="Medical">Medical</MenuItem>
                <MenuItem value="Charity">Charity</MenuItem>
              </TextField>
            )}
          />

          <Controller
            name="Purpose"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Purpose / Business Reason"
                required
                placeholder="e.g., Client meeting, Site visit"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          {/* Locations */}
          <Controller
            name="StartLocation"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Start Location"
                required
                placeholder="e.g., Office, Home"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="EndLocation"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="End Location"
                required
                placeholder="e.g., Client site, Airport"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          {/* Odometer Readings (optional) */}
          <TextField
            {...startOdometerRest}
            inputRef={startOdometerRef}
            type="number"
            label="Start Odometer (optional)"
            placeholder="e.g., 45230"
            size="small"
            fullWidth
          />

          <TextField
            {...endOdometerRest}
            inputRef={endOdometerRef}
            type="number"
            label="End Odometer (optional)"
            placeholder="e.g., 45255"
            size="small"
            fullWidth
          />

          {/* Distance and Round Trip */}
          <TextField
            {...distanceRest}
            inputRef={distanceRef}
            type="number"
            label="One-Way Distance (miles)"
            required
            placeholder="e.g., 25.5"
            error={!!errors.Distance}
            helperText={errors.Distance?.message}
            size="small"
            fullWidth
            slotProps={{ htmlInput: { step: '0.1' } }}
          />

          <div className="flex items-end pb-2 space-x-6">
            <Controller
              name="IsRoundTrip"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value ?? false} />}
                  label="Round Trip (distance x 2)"
                />
              )}
            />
            <Controller
              name="IsPersonal"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value ?? false} />}
                  label="Personal Trip"
                />
              )}
            />
          </div>

          {/* Deductible Amount (calculated) */}
          {category !== 'Personal' && (
            <div className="sm:col-span-2 bg-green-50 rounded-lg p-4 dark:bg-green-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">Estimated Tax Deduction</p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {isRoundTrip ? `${distance || 0} x 2 = ${(distance || 0) * 2} miles` : `${distance || 0} miles`}
                    {applicableRate && ` @ $${applicableRate.RatePerMile.toFixed(4)}/mile`}
                  </p>
                </div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {formatCurrencyStandalone((isRoundTrip ? (distance || 0) * 2 : distance || 0) * (applicableRate?.RatePerMile || 0))}
                </div>
              </div>
            </div>
          )}

          {/* Customer and Project (optional) */}
          <Controller
            name="CustomerId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Customer (optional)"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select customer...</MenuItem>
                {customers?.map((customer) => (
                  <MenuItem key={customer.Id} value={customer.Id}>
                    {customer.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="ProjectId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Project (optional)"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select project...</MenuItem>
                {projects?.map((project) => (
                  <MenuItem key={project.Id} value={project.Id}>
                    {project.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {/* Notes */}
          <div className="sm:col-span-2">
            <Controller
              name="Notes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Notes (optional)"
                  multiline
                  rows={2}
                  placeholder="Additional details about this trip..."
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <Button
            variant="outlined"
            onClick={() => navigate('/mileage')}
            sx={{ mr: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : submitButtonText}
          </Button>
        </div>
      </form>
    </div>
  );
}
