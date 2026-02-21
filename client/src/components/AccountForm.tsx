import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';

const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

const subtypesByType: Record<string, string[]> = {
  Asset: ['Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset'],
  Liability: ['Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability'],
  Equity: ['Owners Equity', 'Retained Earnings', 'Opening Balance Equity'],
  Revenue: ['Income', 'Other Income'],
  Expense: ['Expense', 'Other Expense', 'Cost of Goods Sold'],
};

export const accountSchema = z.object({
  Code: z.string().min(1, 'Code is required').max(50, 'Code must be 50 characters or less'),
  Name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  Type: z.enum(accountTypes, { required_error: 'Type is required' }),
  Subtype: z.string().optional(),
  AccountNumber: z.string().max(50, 'Account number must be 50 characters or less').optional(),
  Description: z.string().optional(),
  IsActive: z.boolean().optional(),
});

export type AccountFormData = z.infer<typeof accountSchema>;

interface AccountFormProps {
  initialValues?: Partial<AccountFormData>;
  onSubmit: (data: AccountFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function AccountForm({ initialValues, onSubmit, title, isSubmitting, submitButtonText = 'Save Account' }: AccountFormProps) {
  const navigate = useNavigate();
  const { control, handleSubmit, watch } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      Code: '',
      Name: '',
      Subtype: '',
      AccountNumber: '',
      Description: '',
      IsActive: true,
      ...initialValues
    }
  });

  const selectedType = watch('Type');
  const availableSubtypes = selectedType ? subtypesByType[selectedType] || [] : [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/accounts')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="Code"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Code"
                required
                placeholder="e.g., 1000"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
          <Controller
            name="AccountNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Account Number"
                placeholder="Optional"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
        </div>

        <Controller
          name="Name"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Name"
              required
              placeholder="e.g., Cash in Bank"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="Type"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Type"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select a type...</MenuItem>
                {accountTypes.map(type => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="Subtype"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Subtype"
                disabled={!selectedType}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">{selectedType ? 'Select a subtype...' : 'Select type first'}</MenuItem>
                {availableSubtypes.map(subtype => (
                  <MenuItem key={subtype} value={subtype}>{subtype}</MenuItem>
                ))}
              </TextField>
            )}
          />
        </div>

        <Controller
          name="Description"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label="Description"
              multiline
              rows={3}
              placeholder="Optional description of the account"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        <Controller
          name="IsActive"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Checkbox {...field} checked={field.value ?? false} />}
              label="Active account"
            />
          )}
        />

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/accounts')}
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
