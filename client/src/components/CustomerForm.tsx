import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import AddressFields, { AddressFieldValues } from './AddressFields';

export const customerSchema = z.object({
  Name: z.string().min(1, 'Name is required'),
  Email: z.string().email('Invalid email address').nullish().or(z.literal('')),
  Phone: z.string().nullish(),
  // Separate address fields (use .nullish() for API compatibility - see CLAUDE.md)
  AddressLine1: z.string().nullish(),
  AddressLine2: z.string().nullish(),
  City: z.string().nullish(),
  State: z.string().nullish(),
  PostalCode: z.string().nullish(),
  Country: z.string().nullish(),
  // Legacy field for backward compatibility
  Address: z.string().nullish(),
});

export type CustomerFormData = z.infer<typeof customerSchema> & AddressFieldValues;

interface CustomerFormProps {
  initialValues?: Partial<CustomerFormData>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function CustomerForm({ initialValues, onSubmit, title, isSubmitting, submitButtonText = 'Save Customer' }: CustomerFormProps) {
  const navigate = useNavigate();
  const { control, register, handleSubmit, setValue, formState: { errors } } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
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
      ...initialValues,
    }
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/customers')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form noValidate onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
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

        {/* Address Section - AddressFields uses register directly */}
        <div className="border-t pt-4 dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Address</h3>
          <AddressFields<CustomerFormData>
            register={register}
            errors={errors}
            setValue={setValue}
            showLine2={true}
            showCountry={false}
          />
        </div>

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button variant="outlined" onClick={() => navigate('/customers')} sx={{ mr: 1.5 }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : submitButtonText}
          </Button>
        </div>
      </form>
    </div>
  );
}
