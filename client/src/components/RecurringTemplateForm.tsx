import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Yearly'] as const;
const TRANSACTION_TYPES = ['Invoice', 'Bill', 'JournalEntry'] as const;
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const recurringTemplateSchema = z.object({
  TemplateName: z.string().min(1, 'Template name is required'),
  TransactionType: z.enum(TRANSACTION_TYPES),
  TemplateData: z.string(),
  Frequency: z.enum(FREQUENCY_OPTIONS),
  IntervalCount: z.number().min(1, 'Interval must be at least 1').max(365, 'Interval must be 365 or less'),
  DayOfMonth: z.number().nullish(),
  DayOfWeek: z.number().nullish(),
  StartDate: z.string().min(1, 'Start date is required'),
  EndDate: z.string().nullish(),
  MaxOccurrences: z.number().nullish(),
  AutoCreate: z.boolean(),
  AutoSend: z.boolean(),
  ReminderDays: z.number().min(0).max(365),
});

export type RecurringTemplateFormData = z.infer<typeof recurringTemplateSchema>;

interface RecurringTemplateFormProps {
  initialValues?: Partial<RecurringTemplateFormData> & { Id?: string };
  onSubmit: (data: RecurringTemplateFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
}

export default function RecurringTemplateForm({ initialValues, onSubmit, title, isSubmitting }: RecurringTemplateFormProps) {
  const navigate = useNavigate();

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<RecurringTemplateFormData>({
    resolver: zodResolver(recurringTemplateSchema),
    defaultValues: {
      TemplateName: '',
      TransactionType: 'Invoice',
      TemplateData: '{}',
      Frequency: 'Monthly',
      IntervalCount: 1,
      DayOfMonth: 1,
      DayOfWeek: null,
      StartDate: new Date().toISOString().split('T')[0],
      EndDate: null,
      MaxOccurrences: null,
      AutoCreate: false,
      AutoSend: false,
      ReminderDays: 3,
    },
  });

  const frequency = watch('Frequency');
  const transactionType = watch('TransactionType');

  useEffect(() => {
    if (initialValues) {
      reset({
        TemplateName: initialValues.TemplateName || '',
        TransactionType: initialValues.TransactionType || 'Invoice',
        TemplateData: initialValues.TemplateData || '{}',
        Frequency: initialValues.Frequency || 'Monthly',
        IntervalCount: initialValues.IntervalCount ?? 1,
        DayOfMonth: initialValues.DayOfMonth ?? 1,
        DayOfWeek: initialValues.DayOfWeek ?? null,
        StartDate: initialValues.StartDate || new Date().toISOString().split('T')[0],
        EndDate: initialValues.EndDate || null,
        MaxOccurrences: initialValues.MaxOccurrences ?? null,
        AutoCreate: initialValues.AutoCreate ?? false,
        AutoSend: initialValues.AutoSend ?? false,
        ReminderDays: initialValues.ReminderDays ?? 3,
      });
    }
  }, [initialValues, reset]);

  // Reset day fields when frequency changes
  useEffect(() => {
    if (frequency === 'Weekly') {
      setValue('DayOfMonth', null);
      if (watch('DayOfWeek') === null) setValue('DayOfWeek', 1);
    } else if (frequency === 'Monthly') {
      setValue('DayOfWeek', null);
      if (watch('DayOfMonth') === null) setValue('DayOfMonth', 1);
    } else {
      setValue('DayOfWeek', null);
      setValue('DayOfMonth', null);
    }
  }, [frequency, setValue, watch]);

  const onFormSubmit = async (data: RecurringTemplateFormData) => {
    await onSubmit({
      ...data,
      TemplateName: data.TemplateName.trim(),
      EndDate: data.EndDate || null,
      MaxOccurrences: data.MaxOccurrences || null,
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/recurring')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Recurring Transactions
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onFormSubmit)} className="bg-white dark:bg-gray-800 shadow sm:rounded-lg p-6 space-y-4">
        {/* Template Name */}
        <Controller
          name="TemplateName"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Template Name"
              required
              fullWidth
              error={!!errors.TemplateName}
              helperText={errors.TemplateName?.message}
              placeholder="e.g., Monthly Rent Invoice"
            />
          )}
        />

        {/* Transaction Type */}
        <Controller
          name="TransactionType"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Transaction Type"
              select
              fullWidth
            >
              {TRANSACTION_TYPES.map((type) => (
                <MenuItem key={type} value={type}>{type === 'JournalEntry' ? 'Journal Entry' : type}</MenuItem>
              ))}
            </TextField>
          )}
        />

        {/* Frequency */}
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="Frequency"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Frequency"
                select
                fullWidth
              >
                {FREQUENCY_OPTIONS.map((freq) => (
                  <MenuItem key={freq} value={freq}>{freq}</MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="IntervalCount"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value}
                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                label="Every"
                type="number"
                fullWidth
                error={!!errors.IntervalCount}
                helperText={errors.IntervalCount?.message}
                inputProps={{ min: 1 }}
              />
            )}
          />
        </div>

        {/* Day of Week (for Weekly) */}
        {frequency === 'Weekly' && (
          <Controller
            name="DayOfWeek"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? 1}
                onChange={(e) => field.onChange(parseInt(e.target.value))}
                label="Day of Week"
                select
                fullWidth
              >
                {DAYS_OF_WEEK.map((day, index) => (
                  <MenuItem key={day} value={index}>{day}</MenuItem>
                ))}
              </TextField>
            )}
          />
        )}

        {/* Day of Month (for Monthly) */}
        {frequency === 'Monthly' && (
          <Controller
            name="DayOfMonth"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? 1}
                onChange={(e) => field.onChange(parseInt(e.target.value))}
                label="Day of Month"
                select
                fullWidth
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <MenuItem key={day} value={day}>{day}</MenuItem>
                ))}
                <MenuItem value={-1}>Last day of month</MenuItem>
              </TextField>
            )}
          />
        )}

        {/* Date Range */}
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="StartDate"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Start Date"
                type="date"
                required
                fullWidth
                error={!!errors.StartDate}
                helperText={errors.StartDate?.message}
                InputLabelProps={{ shrink: true }}
              />
            )}
          />
          <Controller
            name="EndDate"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value || ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                label="End Date (Optional)"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
          />
        </div>

        {/* Max Occurrences */}
        <Controller
          name="MaxOccurrences"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
              label="Max Occurrences (Optional)"
              type="number"
              fullWidth
              placeholder="Leave empty for unlimited"
              inputProps={{ min: 1 }}
            />
          )}
        />

        {/* Settings */}
        <div className="flex flex-col gap-1">
          <Controller
            name="AutoCreate"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={field.value}
                    onChange={field.onChange}
                  />
                }
                label="Auto-create transactions on schedule"
              />
            )}
          />
          {transactionType === 'Invoice' && (
            <Controller
              name="AutoSend"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  }
                  label="Auto-send invoices to customers"
                />
              )}
            />
          )}
        </div>

        {/* Reminder Days */}
        <Controller
          name="ReminderDays"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value}
              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
              label="Reminder Days Before"
              type="number"
              fullWidth
              error={!!errors.ReminderDays}
              helperText={errors.ReminderDays?.message}
              inputProps={{ min: 0 }}
            />
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/recurring')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : initialValues?.Id ? 'Update Template' : 'Create Template'}
          </Button>
        </div>
      </form>
    </div>
  );
}
