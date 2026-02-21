import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { customersApi, Customer } from '../lib/api';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';

export const projectSchema = z.object({
  Name: z.string().min(1, 'Project name is required'),
  CustomerId: z.string().min(1, 'Customer is required'),
  Description: z.string().optional(),
  Status: z.enum(['Active', 'Completed', 'OnHold']).optional(),
  StartDate: z.string().optional(),
  EndDate: z.string().optional(),
  BudgetedHours: z.coerce.number().min(0).optional().nullable(),
  BudgetedAmount: z.coerce.number().min(0).optional().nullable(),
});

export type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  initialValues?: Partial<ProjectFormData>;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function ProjectForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting,
  submitButtonText = 'Save Project'
}: ProjectFormProps) {
  const navigate = useNavigate();

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });

  const { control, handleSubmit } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      Name: '',
      CustomerId: '',
      Description: '',
      StartDate: '',
      EndDate: '',
      Status: 'Active',
      ...initialValues,
    }
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/projects')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <Controller
          name="Name"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="Project Name"
              required
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
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              select
              label="Customer"
              required
              disabled={customersLoading}
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            >
              <MenuItem value="">Select a customer...</MenuItem>
              {customers.map((customer) => (
                <MenuItem key={customer.Id} value={customer.Id}>{customer.Name}</MenuItem>
              ))}
            </TextField>
          )}
        />

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
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
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
              <MenuItem value="OnHold">On Hold</MenuItem>
              <MenuItem value="Completed">Completed</MenuItem>
            </TextField>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="StartDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Start Date"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
          <Controller
            name="EndDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="End Date"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="BudgetedHours"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Budgeted Hours"
                type="number"
                slotProps={{ htmlInput: { step: '0.5', min: '0' } }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
          <Controller
            name="BudgetedAmount"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Budgeted Amount"
                type="number"
                slotProps={{
                  htmlInput: { step: '0.01', min: '0' },
                  input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                }}
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />
        </div>

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button variant="outlined" onClick={() => navigate('/projects')} sx={{ mr: 1.5 }}>
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
