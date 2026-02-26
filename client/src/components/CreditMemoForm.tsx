import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ProjectSelector from './ProjectSelector';
import ClassSelector from './ClassSelector';

export const creditMemoSchema = z.object({
  CustomerId: z.string().uuid('Please select a customer'),
  ProjectId: z.string().uuid().nullish(),
  ClassId: z.string().uuid().nullish(),
  CreditMemoNumber: z.string().min(1, 'Credit memo number is required'),
  CreditDate: z.string().min(1, 'Credit date is required'),
  Reason: z.string().nullish(),
  Subtotal: z.number().min(0, 'Subtotal must be positive'),
  TaxAmount: z.number().min(0, 'Tax amount must be positive').nullish(),
  TotalAmount: z.number().min(0, 'Total must be positive'),
  AmountApplied: z.number().min(0).nullish(),
  AmountRefunded: z.number().min(0).nullish(),
  Status: z.enum(['Open', 'Applied', 'PartiallyApplied', 'Refunded', 'Voided']),
  Lines: z.array(z.object({
    Id: z.string().nullish(),
    AccountId: z.string().uuid('Please select an account'),
    ProductServiceId: z.string().nullish(),
    ProjectId: z.string().uuid().nullish(),
    ClassId: z.string().uuid().nullish(),
    Description: z.string().nullish(),
    Quantity: z.number().min(0, 'Quantity must be positive'),
    UnitPrice: z.number().min(0, 'Unit price must be positive'),
    Amount: z.number().min(0, 'Amount must be positive')
  })).min(1, 'At least one line item is required')
});

export type CreditMemoFormData = z.infer<typeof creditMemoSchema>;

interface Customer {
  Id: string;
  Name: string;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface ProductService {
  Id: string;
  Name: string;
  SalesPrice: number | null;
  IncomeAccountId: string | null;
}

interface CreditMemoFormProps {
  initialValues?: Partial<CreditMemoFormData>;
  onSubmit: (data: CreditMemoFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function CreditMemoForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Credit Memo' }: CreditMemoFormProps) {
  const navigate = useNavigate();

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers');
      return response.data.value;
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get<{ value: Account[] }>('/accounts');
      return response.data.value;
    },
  });

  const { data: productsServices } = useQuery({
    queryKey: ['productsservices'],
    queryFn: async () => {
      const response = await api.get<{ value: ProductService[] }>('/productsservices');
      return response.data.value;
    },
  });

  // Filter to revenue/income accounts for credit memo line items
  const revenueAccounts = accounts?.filter(
    (acc) => acc.Type === 'Revenue' || acc.Type === 'Income' || acc.Type === 'Other Income'
  ) || [];

  const { register, control, handleSubmit, setValue, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<CreditMemoFormData>({
    resolver: zodResolver(creditMemoSchema),
    defaultValues: {
      CustomerId: '',
      CreditMemoNumber: '',
      ProjectId: null,
      ClassId: null,
      Status: 'Open',
      CreditDate: new Date().toISOString().split('T')[0],
      Reason: '',
      Lines: [{ AccountId: '', ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0, Amount: 0, ProjectId: null, ClassId: null }],
      Subtotal: 0,
      TaxAmount: 0,
      TotalAmount: 0,
      AmountApplied: 0,
      AmountRefunded: 0,
      ...initialValues
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Lines"
  });

  const lines = useWatch({
    control,
    name: "Lines"
  });

  // Update totals when lines change
  useEffect(() => {
    const subtotal = lines.reduce((sum, line) => {
      return sum + (line.Amount || 0);
    }, 0);
    setValue('Subtotal', subtotal);
    setValue('TotalAmount', subtotal);
  }, [lines, setValue]);

  // Update line amount when quantity or unit price changes
  const updateLineAmount = (index: number, quantity: number, unitPrice: number) => {
    const amount = quantity * unitPrice;
    setValue(`Lines.${index}.Amount`, amount);
  };

  // Handle product selection - auto-fill price and account
  const handleProductChange = (index: number, productId: string) => {
    if (!productId || !productsServices) return;

    const product = productsServices.find(p => p.Id === productId);
    if (product) {
      if (product.SalesPrice) {
        setValue(`Lines.${index}.UnitPrice`, product.SalesPrice);
        const quantity = lines[index]?.Quantity || 1;
        setValue(`Lines.${index}.Amount`, quantity * product.SalesPrice);
      }
      if (product.IncomeAccountId) {
        setValue(`Lines.${index}.AccountId`, product.IncomeAccountId);
      }
    }
  };

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/credit-memos')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select a customer...</MenuItem>
                {customers?.map((customer) => (
                  <MenuItem key={customer.Id} value={customer.Id}>
                    {customer.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="CreditMemoNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Credit Memo Number"
                required
                placeholder="CM-001"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="CreditDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Credit Date"
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
                <MenuItem value="Open">Open</MenuItem>
                <MenuItem value="Applied">Applied</MenuItem>
                <MenuItem value="PartiallyApplied">Partially Applied</MenuItem>
                <MenuItem value="Refunded">Refunded</MenuItem>
                <MenuItem value="Voided">Voided</MenuItem>
              </TextField>
            )}
          />

          <Controller
            name="ProjectId"
            control={control}
            render={({ field }) => (
              <ProjectSelector
                value={field.value || ''}
                onChange={field.onChange}
                disabled={isSubmitting}
                customerId={watch('CustomerId')}
              />
            )}
          />

          <Controller
            name="ClassId"
            control={control}
            render={({ field }) => (
              <ClassSelector
                value={field.value || ''}
                onChange={field.onChange}
                disabled={isSubmitting}
              />
            )}
          />

          <div className="sm:col-span-2">
            <Controller
              name="Reason"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Reason / Notes"
                  multiline
                  rows={2}
                  placeholder="Reason for credit memo (e.g., returned goods, price adjustment, billing error)..."
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Line Items</h3>
            <Button
              type="button"
              variant="outlined"
              size="small"
              startIcon={<Plus className="w-4 h-4" />}
              onClick={() => append({ AccountId: '', ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0, Amount: 0, ProjectId: null, ClassId: null })}
            >
              Add Item
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-start bg-gray-50 p-4 rounded-md flex-wrap dark:bg-gray-700">
                <div className="w-40">
                  <Controller
                    name={`Lines.${index}.ProductServiceId`}
                    control={control}
                    render={({ field: f }) => (
                      <TextField
                        {...f}
                        value={f.value ?? ''}
                        select
                        label="Product/Service"
                        size="small"
                        fullWidth
                        onChange={(e) => {
                          f.onChange(e);
                          handleProductChange(index, e.target.value);
                        }}
                      >
                        <MenuItem value="">Optional...</MenuItem>
                        {productsServices?.map((ps) => (
                          <MenuItem key={ps.Id} value={ps.Id}>
                            {ps.Name}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                </div>
                <div className="w-40">
                  <Controller
                    name={`Lines.${index}.AccountId`}
                    control={control}
                    render={({ field: f, fieldState }) => (
                      <TextField
                        {...f}
                        value={f.value ?? ''}
                        select
                        label="Account"
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                        size="small"
                        fullWidth
                      >
                        <MenuItem value="">Select account...</MenuItem>
                        {revenueAccounts.map((account) => (
                          <MenuItem key={account.Id} value={account.Id}>
                            {account.Name}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                </div>
                <div className="flex-grow min-w-32">
                  <Controller
                    name={`Lines.${index}.Description`}
                    control={control}
                    render={({ field: f }) => (
                      <TextField
                        {...f}
                        value={f.value ?? ''}
                        label="Description"
                        placeholder="Item description"
                        size="small"
                        fullWidth
                      />
                    )}
                  />
                </div>
                <div className="w-20">
                  {(() => {
                    const { ref, ...rest } = register(`Lines.${index}.Quantity`, {
                      valueAsNumber: true,
                      onChange: (e) => {
                        const qty = parseFloat(e.target.value) || 0;
                        const price = lines[index]?.UnitPrice || 0;
                        updateLineAmount(index, qty, price);
                      }
                    });
                    return (
                      <TextField
                        {...rest}
                        inputRef={ref}
                        type="number"
                        label="Qty"
                        slotProps={{ htmlInput: { step: '0.01' } }}
                        size="small"
                        fullWidth
                      />
                    );
                  })()}
                </div>
                <div className="w-24">
                  {(() => {
                    const { ref, ...rest } = register(`Lines.${index}.UnitPrice`, {
                      valueAsNumber: true,
                      onChange: (e) => {
                        const price = parseFloat(e.target.value) || 0;
                        const qty = lines[index]?.Quantity || 0;
                        updateLineAmount(index, qty, price);
                      }
                    });
                    return (
                      <TextField
                        {...rest}
                        inputRef={ref}
                        type="number"
                        label="Unit Price"
                        slotProps={{ htmlInput: { step: '0.01' } }}
                        size="small"
                        fullWidth
                      />
                    );
                  })()}
                </div>
                <div className="w-24">
                  {(() => {
                    const { ref, ...rest } = register(`Lines.${index}.Amount`, { valueAsNumber: true });
                    return (
                      <TextField
                        {...rest}
                        inputRef={ref}
                        type="number"
                        label="Amount"
                        slotProps={{ htmlInput: { step: '0.01', readOnly: true } }}
                        error={!!errors.Lines?.[index]?.Amount}
                        helperText={errors.Lines?.[index]?.Amount?.message}
                        size="small"
                        fullWidth
                      />
                    );
                  })()}
                </div>
                <IconButton
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  color="error"
                  sx={{ mt: 0.5 }}
                >
                  <Trash2 className="w-5 h-5" />
                </IconButton>
                <div className="flex gap-4 items-start mt-2 w-full">
                  <div className="flex-1">
                    <Controller
                      name={`Lines.${index}.ProjectId`}
                      control={control}
                      render={({ field: pField }) => (
                        <ProjectSelector
                          value={pField.value || ''}
                          onChange={pField.onChange}
                          disabled={isSubmitting}
                        />
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <Controller
                      name={`Lines.${index}.ClassId`}
                      control={control}
                      render={({ field: cField }) => (
                        <ClassSelector
                          value={cField.value || ''}
                          onChange={cField.onChange}
                          disabled={isSubmitting}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {errors.Lines && typeof errors.Lines === 'object' && 'message' in errors.Lines && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>
          )}
        </div>

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mr-6">
            Total Credit: ${lines.reduce((sum, line) => sum + (line.Amount || 0), 0).toFixed(2)}
          </div>
          <Button
            variant="outlined"
            onClick={() => navigate('/credit-memos')}
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
