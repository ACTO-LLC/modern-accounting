import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';

export const productServiceSchema = z.object({
  Name: z.string().min(1, 'Name is required'),
  SKU: z.string().optional().nullable(),
  Type: z.enum(['Inventory', 'NonInventory', 'Service'], { required_error: 'Type is required' }),
  Description: z.string().optional().nullable(),
  SalesPrice: z.coerce.number().min(0, 'Sales price cannot be negative').optional().nullable(),
  PurchaseCost: z.coerce.number().min(0, 'Purchase cost cannot be negative').optional().nullable(),
  IncomeAccountId: z.string().optional().nullable(),
  ExpenseAccountId: z.string().optional().nullable(),
  InventoryAssetAccountId: z.string().optional().nullable(),
  Category: z.string().optional().nullable(),
  Taxable: z.boolean().optional(),
  Status: z.enum(['Active', 'Inactive']).optional(),
});

export type ProductServiceFormData = z.infer<typeof productServiceSchema>;

interface Account { Id: string; Name: string; Code: string; Type: string; }

interface ProductServiceFormProps {
  initialValues?: Partial<ProductServiceFormData>;
  onSubmit: (data: ProductServiceFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function ProductServiceForm({ initialValues, onSubmit, title, isSubmitting, submitButtonText = 'Save Product/Service' }: ProductServiceFormProps) {
  const navigate = useNavigate();
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => { const response = await api.get<{ value: Account[] }>('/accounts'); return response.data.value; }
  });

  const incomeAccounts = accounts?.filter(a => a.Type === 'Revenue') || [];
  const expenseAccounts = accounts?.filter(a => a.Type === 'Expense') || [];
  const assetAccounts = accounts?.filter(a => a.Type === 'Asset') || [];

  const { control, handleSubmit, watch } = useForm<ProductServiceFormData>({
    resolver: zodResolver(productServiceSchema),
    defaultValues: {
      Name: '',
      SKU: '',
      Description: '',
      Category: '',
      IncomeAccountId: '',
      ExpenseAccountId: '',
      InventoryAssetAccountId: '',
      ...initialValues,
      Type: initialValues?.Type || 'Service',
      Taxable: initialValues?.Taxable ?? true,
      Status: initialValues?.Status || 'Active',
    }
  });

  const selectedType = watch('Type');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/products-services')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" aria-label="Back to products and services">
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
          name="Type"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              label="Type"
              required
              error={!!fieldState.error}
              helperText={fieldState.error?.message || (
                field.value === 'Service' ? 'Services you provide to customers (e.g., consulting, labor)' :
                field.value === 'NonInventory' ? 'Products you sell but do not track inventory for' :
                field.value === 'Inventory' ? 'Products you buy and sell with inventory tracking' : undefined
              )}
              size="small"
              fullWidth
            >
              <MenuItem value="Service">Service</MenuItem>
              <MenuItem value="NonInventory">Non-Inventory Product</MenuItem>
              <MenuItem value="Inventory">Inventory Product</MenuItem>
            </TextField>
          )}
        />

        <Controller
          name="SKU"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label="SKU / Item Code"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
          )}
        />

        <Controller
          name="Category"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label="Category"
              placeholder="e.g., Professional Services, Hardware"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              size="small"
              fullWidth
            />
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

        {/* Pricing Section */}
        <div className="border-t pt-6 dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Pricing</h3>
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="SalesPrice"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Sales Price"
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
            <Controller
              name="PurchaseCost"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Purchase Cost"
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
        </div>

        {/* Accounting Section */}
        <div className="border-t pt-6 dark:border-gray-600">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Accounting</h3>
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="IncomeAccountId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Income Account"
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">Select an account...</MenuItem>
                  {incomeAccounts.map((account) => (
                    <MenuItem key={account.Id} value={account.Id}>{account.Code} - {account.Name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="ExpenseAccountId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Expense Account"
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">Select an account...</MenuItem>
                  {expenseAccounts.map((account) => (
                    <MenuItem key={account.Id} value={account.Id}>{account.Code} - {account.Name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            {selectedType === 'Inventory' && (
              <Controller
                name="InventoryAssetAccountId"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    select
                    label="Inventory Asset Account"
                    helperText="Account used to track inventory value on the balance sheet"
                    size="small"
                    fullWidth
                    className="col-span-2"
                  >
                    <MenuItem value="">Select an account...</MenuItem>
                    {assetAccounts.map((account) => (
                      <MenuItem key={account.Id} value={account.Id}>{account.Code} - {account.Name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            )}
          </div>
        </div>

        {/* Status & Taxable */}
        <div className="border-t pt-6 dark:border-gray-600">
          <div className="grid grid-cols-2 gap-4 items-center">
            <Controller
              name="Taxable"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value ?? false} />}
                  label="Taxable"
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
                  <MenuItem value="Inactive">Inactive</MenuItem>
                </TextField>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button variant="outlined" onClick={() => navigate('/products-services')} sx={{ mr: 1.5 }}>
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
