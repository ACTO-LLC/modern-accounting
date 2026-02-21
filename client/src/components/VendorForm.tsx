import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';
import api from '../lib/api';
import AddressFields, { AddressFieldValues } from './AddressFields';

export const vendorSchema = z.object({
  Name: z.string().min(1, 'Name is required'),
  Email: z.string().email('Invalid email address').optional().or(z.literal('')),
  Phone: z.string().optional(),
  // Separate address fields (use .nullish() for API compatibility - see CLAUDE.md)
  AddressLine1: z.string().nullish(),
  AddressLine2: z.string().nullish(),
  City: z.string().nullish(),
  State: z.string().nullish(),
  PostalCode: z.string().nullish(),
  Country: z.string().nullish(),
  // Legacy field for backward compatibility
  Address: z.string().optional(),
  PaymentTerms: z.string().optional(),
  TaxId: z.string().optional(),
  Is1099Vendor: z.boolean().optional(),
  DefaultExpenseAccountId: z.string().uuid().optional().nullable(),
  Status: z.enum(['Active', 'Inactive']).optional(),
});

export type VendorFormData = z.infer<typeof vendorSchema> & AddressFieldValues;

interface VendorFormProps {
  initialValues?: Partial<VendorFormData>;
  onSubmit: (data: VendorFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function VendorForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting,
  submitButtonText = 'Save Vendor',
}: VendorFormProps) {
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      Name: '',
      Email: '',
      Phone: '',
      AddressLine1: '',
      AddressLine2: '',
      City: '',
      State: '',
      PostalCode: '',
      Country: '',
      Address: '',
      PaymentTerms: '',
      TaxId: '',
      DefaultExpenseAccountId: '',
      ...initialValues,
      Is1099Vendor: initialValues?.Is1099Vendor ?? false,
      Status: initialValues?.Status ?? 'Active',
    },
  });

  // Fetch expense accounts for the dropdown
  const { data: accounts } = useQuery({
    queryKey: ['accounts', 'expense'],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(
        "/accounts?$filter=Type eq 'Expense'"
      );
      return response.data.value;
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate('/vendors')}
          className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white shadow rounded-lg p-6 space-y-6 dark:bg-gray-800"
      >
        <Controller
          name="Name"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Name"
              required
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Controller
            name="Email"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Email"
                type="email"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="Phone"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Phone"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
        </div>

        {/* Address Section */}
        <div className="border-t pt-4 dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Address</h3>
          <AddressFields<VendorFormData>
            register={register}
            errors={errors}
            setValue={setValue}
            showLine2={true}
            showCountry={false}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Controller
            name="PaymentTerms"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Payment Terms"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select payment terms</MenuItem>
                <MenuItem value="Net 15">Net 15</MenuItem>
                <MenuItem value="Net 30">Net 30</MenuItem>
                <MenuItem value="Net 45">Net 45</MenuItem>
                <MenuItem value="Net 60">Net 60</MenuItem>
                <MenuItem value="Due on Receipt">Due on Receipt</MenuItem>
              </TextField>
            )}
          />

          <Controller
            name="Status"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Status"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Inactive">Inactive</MenuItem>
              </TextField>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Controller
            name="TaxId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Tax ID (EIN/SSN)"
                placeholder="XX-XXXXXXX"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="DefaultExpenseAccountId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Default Expense Account"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select an account</MenuItem>
                {accounts?.map((account: any) => (
                  <MenuItem key={account.Id} value={account.Id}>
                    {account.AccountNumber} - {account.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </div>

        <Controller
          name="Is1099Vendor"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Checkbox {...field} checked={field.value ?? false} />}
              label="1099 Vendor (requires tax reporting)"
            />
          )}
        />

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <Button
            variant="outlined"
            onClick={() => navigate('/vendors')}
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
