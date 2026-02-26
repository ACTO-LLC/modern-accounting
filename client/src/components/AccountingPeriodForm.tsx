import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';

export const accountingPeriodSchema = z.object({
  FiscalYearStart: z.string().min(1, 'Fiscal year start is required'),
  FiscalYearEnd: z.string().min(1, 'Fiscal year end is required'),
}).refine(
  (data) => {
    const start = new Date(data.FiscalYearStart);
    const end = new Date(data.FiscalYearEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return true;
    return end >= start;
  },
  { message: 'Fiscal year end must be on or after fiscal year start', path: ['FiscalYearEnd'] }
);

export type AccountingPeriodFormData = z.infer<typeof accountingPeriodSchema>;

interface AccountingPeriodFormProps {
  initialValues?: Partial<AccountingPeriodFormData> & { Id?: string };
  onSubmit: (data: AccountingPeriodFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
}

export default function AccountingPeriodForm({ initialValues, onSubmit, title, isSubmitting }: AccountingPeriodFormProps) {
  const navigate = useNavigate();

  const { control, handleSubmit, reset, formState: { errors } } = useForm<AccountingPeriodFormData>({
    resolver: zodResolver(accountingPeriodSchema),
    defaultValues: {
      FiscalYearStart: '',
      FiscalYearEnd: '',
    },
  });

  useEffect(() => {
    if (initialValues) {
      reset({
        FiscalYearStart: initialValues.FiscalYearStart ? initialValues.FiscalYearStart.split('T')[0] : '',
        FiscalYearEnd: initialValues.FiscalYearEnd ? initialValues.FiscalYearEnd.split('T')[0] : '',
      });
    }
  }, [initialValues, reset]);

  const onFormSubmit = async (data: AccountingPeriodFormData) => {
    await onSubmit(data);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/accounting-periods')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Accounting Periods
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="bg-white dark:bg-gray-800 shadow sm:rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="FiscalYearStart"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Fiscal Year Start"
                type="date"
                required
                fullWidth
                error={!!errors.FiscalYearStart}
                helperText={errors.FiscalYearStart?.message}
                InputLabelProps={{ shrink: true }}
              />
            )}
          />
          <Controller
            name="FiscalYearEnd"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Fiscal Year End"
                type="date"
                required
                fullWidth
                error={!!errors.FiscalYearEnd}
                helperText={errors.FiscalYearEnd?.message}
                InputLabelProps={{ shrink: true }}
              />
            )}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/accounting-periods')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : initialValues?.Id ? 'Update Period' : 'Create Period'}
          </Button>
        </div>
      </form>
    </div>
  );
}
