import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import api from '../lib/api';
import { US_STATES } from './AddressFields';

interface LocationItem {
  Id: string;
  Name: string;
  ParentLocationId: string | null;
  Description: string | null;
  Status: string;
}

export const locationSchema = z.object({
  Name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  ParentLocationId: z.string().nullish(),
  AddressLine1: z.string().nullish(),
  AddressLine2: z.string().nullish(),
  City: z.string().nullish(),
  State: z.string().nullish(),
  PostalCode: z.string().nullish(),
  Country: z.string().nullish(),
  Description: z.string().nullish(),
  Status: z.string(),
});

export type LocationFormData = z.infer<typeof locationSchema>;

interface LocationFormProps {
  initialValues?: Partial<LocationFormData> & { Id?: string };
  onSubmit: (data: LocationFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
}

/**
 * Get all descendant IDs of a given location to prevent circular references.
 */
function getDescendantIds(locationId: string, locations: LocationItem[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [locationId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = locations.filter((l) => l.ParentLocationId === currentId);
    for (const child of children) {
      if (!descendants.has(child.Id)) {
        descendants.add(child.Id);
        queue.push(child.Id);
      }
    }
  }

  return descendants;
}

export default function LocationForm({ initialValues, onSubmit, title, isSubmitting }: LocationFormProps) {
  const navigate = useNavigate();

  const { data: allLocations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => {
      const response = await api.get<{ value: LocationItem[] }>('/locations');
      return response.data.value;
    },
  });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<LocationFormData>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      Name: '',
      ParentLocationId: null,
      AddressLine1: '',
      AddressLine2: '',
      City: '',
      State: '',
      PostalCode: '',
      Country: 'US',
      Description: '',
      Status: 'Active',
    },
  });

  useEffect(() => {
    if (initialValues) {
      reset({
        Name: initialValues.Name || '',
        ParentLocationId: initialValues.ParentLocationId || null,
        AddressLine1: initialValues.AddressLine1 || '',
        AddressLine2: initialValues.AddressLine2 || '',
        City: initialValues.City || '',
        State: initialValues.State || '',
        PostalCode: initialValues.PostalCode || '',
        Country: initialValues.Country || 'US',
        Description: initialValues.Description || '',
        Status: initialValues.Status || 'Active',
      });
    }
  }, [initialValues, reset]);

  // Get available parents - exclude self and descendants
  const availableParents = useMemo(() => {
    if (!allLocations) return [];
    if (!initialValues?.Id) return allLocations;

    const descendantIds = getDescendantIds(initialValues.Id, allLocations);
    return allLocations.filter(
      (l) => l.Id !== initialValues.Id && !descendantIds.has(l.Id)
    );
  }, [allLocations, initialValues?.Id]);

  const onFormSubmit = async (data: LocationFormData) => {
    const trimmedName = data.Name.trim();
    const parentId = data.ParentLocationId || null;

    // Prevent duplicate names at the same parent level
    const hasDuplicate = allLocations?.some((l) => {
      const lParentId = l.ParentLocationId ?? null;
      return (
        l.Id !== initialValues?.Id &&
        lParentId === parentId &&
        l.Name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
    });

    if (hasDuplicate) {
      alert('A location with this name already exists at this level.');
      return;
    }

    await onSubmit({
      ...data,
      Name: trimmedName,
      ParentLocationId: parentId,
      Description: data.Description?.trim() || null,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/locations')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Locations
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="bg-white dark:bg-gray-800 shadow sm:rounded-lg p-6 space-y-4">
        {/* Basic Info */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="Name"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Name"
                required
                fullWidth
                error={!!errors.Name}
                helperText={errors.Name?.message}
                inputProps={{ maxLength: 100 }}
              />
            )}
          />
          <Controller
            name="ParentLocationId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value || ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                label="Parent Location"
                select
                fullWidth
              >
                <MenuItem value="">None (Top-level)</MenuItem>
                {availableParents?.map((l) => (
                  <MenuItem key={l.Id} value={l.Id}>
                    {l.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </div>

        {/* Address Fields */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h3 className="text-md font-medium text-gray-800 dark:text-gray-200 mb-3">Address</h3>
          <div className="space-y-4">
            <Controller
              name="AddressLine1"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label="Street Address"
                  fullWidth
                  placeholder="123 Main St"
                />
              )}
            />
            <Controller
              name="AddressLine2"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value || ''}
                  label="Address Line 2"
                  fullWidth
                  placeholder="Suite, Unit, etc."
                />
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Controller
                name="City"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    label="City"
                    fullWidth
                  />
                )}
              />
              <Controller
                name="State"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    label="State"
                    select
                    fullWidth
                  >
                    {US_STATES.map((s) => (
                      <MenuItem key={s.code} value={s.code}>
                        {s.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="PostalCode"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    label="ZIP Code"
                    fullWidth
                    placeholder="12345"
                    inputProps={{ maxLength: 10 }}
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Status and Description */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="Status"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Status"
                select
                fullWidth
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
              </TextField>
            )}
          />
        </div>
        <Controller
          name="Description"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value || ''}
              label="Description"
              fullWidth
              multiline
              rows={2}
            />
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/locations')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : initialValues?.Id ? 'Update Location' : 'Create Location'}
          </Button>
        </div>
      </form>
    </div>
  );
}
