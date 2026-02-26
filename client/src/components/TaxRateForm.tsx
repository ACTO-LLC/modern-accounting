import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import InputAdornment from '@mui/material/InputAdornment';
import api from '../lib/api';

export const taxRateSchema = z.object({
  Name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  Rate: z.number().min(0, 'Rate must be 0% or higher').max(1, 'Rate must be 100% or lower'),
  Description: z.string().nullish(),
  IsDefault: z.boolean(),
  IsActive: z.boolean(),
});

export type TaxRateFormData = z.infer<typeof taxRateSchema>;

interface TaxRateItem {
  Id: string;
  Name: string;
}

interface TaxRateFormProps {
  initialValues?: Partial<TaxRateFormData> & { Id?: string };
  onSubmit: (data: TaxRateFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
}

export default function TaxRateForm({ initialValues, onSubmit, title, isSubmitting }: TaxRateFormProps) {
  const navigate = useNavigate();

  const { data: allTaxRates } = useQuery({
    queryKey: ['taxrates'],
    queryFn: async () => {
      const response = await api.get<{ value: TaxRateItem[] }>('/taxrates?$select=Id,Name');
      return response.data.value;
    },
  });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<TaxRateFormData>({
    resolver: zodResolver(taxRateSchema),
    defaultValues: {
      Name: '',
      Rate: 0,
      Description: '',
      IsDefault: false,
      IsActive: true,
    },
  });

  useEffect(() => {
    if (initialValues) {
      reset({
        Name: initialValues.Name || '',
        Rate: initialValues.Rate ?? 0,
        Description: initialValues.Description || '',
        IsDefault: initialValues.IsDefault ?? false,
        IsActive: initialValues.IsActive ?? true,
      });
    }
  }, [initialValues, reset]);

  const onFormSubmit = async (data: TaxRateFormData) => {
    const trimmedName = data.Name.trim();

    // Prevent duplicate tax rate names
    const hasDuplicate = allTaxRates?.some(
      (t) => t.Id !== initialValues?.Id && t.Name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (hasDuplicate) {
      alert('A tax rate with this name already exists.');
      return;
    }

    await onSubmit({
      ...data,
      Name: trimmedName,
      Description: data.Description?.trim() || null,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/tax-rates')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Tax Rates
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="bg-white dark:bg-gray-800 shadow sm:rounded-lg p-6 space-y-4">
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
                placeholder="e.g., California Sales Tax"
                inputProps={{ maxLength: 100 }}
              />
            )}
          />
          <Controller
            name="Rate"
            control={control}
            render={({ field }) => (
              <TextField
                label="Rate (%)"
                required
                fullWidth
                type="number"
                error={!!errors.Rate}
                helperText={errors.Rate?.message}
                value={(field.value * 100).toFixed(2)}
                onChange={(e) => {
                  const percentValue = parseFloat(e.target.value) || 0;
                  field.onChange(percentValue / 100);
                }}
                placeholder="8.25"
                inputProps={{ min: 0, max: 100, step: 0.01 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                }}
              />
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
              placeholder="Optional description for this tax rate"
            />
          )}
        />
        <div className="flex items-center gap-6">
          <Controller
            name="IsDefault"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={field.value}
                    onChange={field.onChange}
                  />
                }
                label="Default tax rate"
              />
            )}
          />
          <Controller
            name="IsActive"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={field.value}
                    onChange={field.onChange}
                  />
                }
                label="Active"
              />
            )}
          />
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/tax-rates')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : initialValues?.Id ? 'Update Tax Rate' : 'Create Tax Rate'}
          </Button>
        </div>
      </form>
    </div>
  );
}
