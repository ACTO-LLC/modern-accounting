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
import api from '../lib/api';

export const termSchema = z.object({
  Name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  DueDays: z.number().min(0, 'Due days must be 0 or higher').max(365, 'Due days must be 365 or lower'),
  IsActive: z.boolean(),
});

export type TermFormData = z.infer<typeof termSchema>;

interface TermItem {
  Id: string;
  Name: string;
}

interface TermFormProps {
  initialValues?: Partial<TermFormData> & { Id?: string };
  onSubmit: (data: TermFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
}

export default function TermForm({ initialValues, onSubmit, title, isSubmitting }: TermFormProps) {
  const navigate = useNavigate();

  const { data: allTerms } = useQuery({
    queryKey: ['terms-names'],
    queryFn: async () => {
      const response = await api.get<{ value: TermItem[] }>('/terms?$filter=IsActive eq true&$select=Id,Name');
      return response.data.value;
    },
  });

  const { control, handleSubmit, reset, formState: { errors } } = useForm<TermFormData>({
    resolver: zodResolver(termSchema),
    defaultValues: {
      Name: '',
      DueDays: 0,
      IsActive: true,
    },
  });

  useEffect(() => {
    if (initialValues) {
      reset({
        Name: initialValues.Name || '',
        DueDays: initialValues.DueDays ?? 0,
        IsActive: initialValues.IsActive ?? true,
      });
    }
  }, [initialValues, reset]);

  const onFormSubmit = async (data: TermFormData) => {
    const trimmedName = data.Name.trim();

    const hasDuplicate = allTerms?.some(
      (t) => t.Id !== initialValues?.Id && t.Name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (hasDuplicate) {
      alert('A term with this name already exists.');
      return;
    }

    await onSubmit({
      ...data,
      Name: trimmedName,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/terms')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Terms
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
                placeholder="e.g., Net 30"
                inputProps={{ maxLength: 100 }}
              />
            )}
          />
          <Controller
            name="DueDays"
            control={control}
            render={({ field }) => (
              <TextField
                label="Due Days"
                required
                fullWidth
                type="number"
                error={!!errors.DueDays}
                helperText={errors.DueDays?.message || 'Number of days until payment is due'}
                value={field.value}
                onChange={(e) => {
                  field.onChange(parseInt(e.target.value) || 0);
                }}
                inputProps={{ min: 0, max: 365, step: 1 }}
              />
            )}
          />
        </div>
        <div className="flex items-center">
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
            onClick={() => navigate('/terms')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : initialValues?.Id ? 'Update Term' : 'Create Term'}
          </Button>
        </div>
      </form>
    </div>
  );
}
