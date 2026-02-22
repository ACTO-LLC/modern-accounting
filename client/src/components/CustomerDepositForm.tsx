import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import CustomerSelector from './CustomerSelector';
import api from '../lib/api';

// Payment methods available
const PAYMENT_METHODS = [
  'Cash',
  'Check',
  'Credit Card',
  'Debit Card',
  'ACH/Bank Transfer',
  'Wire Transfer',
  'Other'
] as const;

// Schema for deposit form
export const customerDepositSchema = z.object({
  DepositNumber: z.string().min(1, 'Deposit number is required'),
  CustomerId: z.string().uuid('Please select a customer'),
  DepositDate: z.string().min(1, 'Deposit date is required'),
  Amount: z.number().min(0.01, 'Amount must be greater than 0'),
  DepositAccountId: z.string().uuid('Please select a deposit account'),
  LiabilityAccountId: z.string().uuid('Please select a liability account'),
  PaymentMethod: z.string().min(1, 'Payment method is required'),
  Reference: z.string().nullish(),
  Memo: z.string().nullish(),
  ProjectId: z.string().nullish(),
  EstimateId: z.string().nullish(),
});

export type CustomerDepositFormData = z.infer<typeof customerDepositSchema>;

interface Account {
  Id: string;
  Name: string;
  Type: string;
  AccountNumber: string | null;
}

interface Project {
  Id: string;
  Name: string;
  CustomerId: string;
}

interface Estimate {
  Id: string;
  EstimateNumber: string;
  CustomerId: string;
  TotalAmount: number;
  Status: string;
}

interface CustomerDepositFormProps {
  initialValues?: Partial<CustomerDepositFormData>;
  onSubmit: (data: CustomerDepositFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
  headerActions?: ReactNode;
}

export default function CustomerDepositForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting: externalIsSubmitting,
  submitButtonText = 'Receive Deposit',
  headerActions
}: CustomerDepositFormProps) {
  const navigate = useNavigate();

  // Fetch bank accounts (Asset type)
  const { data: bankAccounts } = useQuery({
    queryKey: ['accounts-bank'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get("/accounts?$filter=Type eq 'Asset' and IsActive eq true&$orderby=Name");
      return response.data.value;
    }
  });

  // Fetch liability accounts (for Unearned Revenue)
  const { data: liabilityAccounts } = useQuery({
    queryKey: ['accounts-liability'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get("/accounts?$filter=Type eq 'Liability' and IsActive eq true&$orderby=Name");
      return response.data.value;
    }
  });

  const { control, handleSubmit, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<CustomerDepositFormData>({
    resolver: zodResolver(customerDepositSchema),
    defaultValues: {
      DepositDate: new Date().toISOString().split('T')[0],
      PaymentMethod: 'Check',
      Amount: 0,
      ...initialValues
    }
  });

  const watchedCustomerId = watch('CustomerId');

  // Fetch projects for the selected customer
  const { data: projects } = useQuery({
    queryKey: ['projects', watchedCustomerId],
    queryFn: async (): Promise<Project[]> => {
      if (!watchedCustomerId) return [];
      const response = await api.get(`/projects?$filter=CustomerId eq ${watchedCustomerId} and IsActive eq true&$orderby=Name`);
      return response.data.value;
    },
    enabled: !!watchedCustomerId
  });

  // Fetch estimates for the selected customer that are not yet converted
  const { data: estimates } = useQuery({
    queryKey: ['estimates-open', watchedCustomerId],
    queryFn: async (): Promise<Estimate[]> => {
      if (!watchedCustomerId) return [];
      const response = await api.get(`/estimates?$filter=CustomerId eq ${watchedCustomerId} and Status eq 'Accepted'&$orderby=EstimateNumber`);
      return response.data.value;
    },
    enabled: !!watchedCustomerId
  });

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        </div>
        {headerActions && <div className="flex items-center">{headerActions}</div>}
      </div>

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="DepositNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Deposit Number"
                required
                placeholder="DEP-001"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="CustomerId"
            control={control}
            render={({ field }) => (
              <CustomerSelector
                value={field.value || ''}
                onChange={field.onChange}
                error={errors.CustomerId?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            name="DepositDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Deposit Date"
                type="date"
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
            name="Amount"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                onChange={(e) => field.onChange(e.target.value === '' ? '' : Number(e.target.value))}
                label="Amount"
                type="number"
                required
                placeholder="0.00"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">$</InputAdornment>
                  },
                  htmlInput: { step: '0.01', min: '0.01' }
                }}
              />
            )}
          />

          <Controller
            name="PaymentMethod"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                select
                label="Payment Method"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                {PAYMENT_METHODS.map(method => (
                  <MenuItem key={method} value={method}>{method}</MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="Reference"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Reference / Check #"
                placeholder="Optional reference number"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="DepositAccountId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Deposit To Account"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select bank account</MenuItem>
                {bankAccounts?.map(account => (
                  <MenuItem key={account.Id} value={account.Id}>
                    {account.Name} {account.AccountNumber ? `(${account.AccountNumber})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="LiabilityAccountId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Liability Account (Unearned Revenue)"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select liability account</MenuItem>
                {liabilityAccounts?.map(account => (
                  <MenuItem key={account.Id} value={account.Id}>
                    {account.Name} {account.AccountNumber ? `(${account.AccountNumber})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {/* Optional: Link to Project */}
          {watchedCustomerId && projects && projects.length > 0 && (
            <Controller
              name="ProjectId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Project (Optional)"
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">No project</MenuItem>
                  {projects.map(project => (
                    <MenuItem key={project.Id} value={project.Id}>
                      {project.Name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}

          {/* Optional: Link to Estimate */}
          {watchedCustomerId && estimates && estimates.length > 0 && (
            <Controller
              name="EstimateId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Estimate (Optional)"
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">No estimate</MenuItem>
                  {estimates.map(estimate => (
                    <MenuItem key={estimate.Id} value={estimate.Id}>
                      {estimate.EstimateNumber} (${estimate.TotalAmount.toFixed(2)})
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}

          <div className="sm:col-span-2">
            <Controller
              name="Memo"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Memo"
                  multiline
                  rows={2}
                  placeholder="Optional notes about this deposit"
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>

        {/* Info box about journal entry */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 dark:bg-blue-950 dark:border-blue-800">
          <h4 className="text-sm font-medium text-blue-800 mb-2 dark:text-blue-300">Journal Entry Preview</h4>
          <p className="text-sm text-blue-700 dark:text-blue-400">
            This deposit will create a journal entry:
          </p>
          <ul className="text-sm text-blue-700 dark:text-blue-400 mt-2 space-y-1">
            <li><strong>Debit:</strong> Selected bank account (Asset increases)</li>
            <li><strong>Credit:</strong> Unearned Revenue (Liability increases)</li>
          </ul>
          <p className="text-sm text-blue-600 mt-2 italic dark:text-blue-400">
            When applied to an invoice, the liability is reversed and revenue is recognized.
          </p>
        </div>

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <Button
            variant="outlined"
            onClick={() => navigate(-1)}
            sx={{ mr: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : submitButtonText}
          </Button>
        </div>
      </form>
    </div>
  );
}
