import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ProjectSelector from './ProjectSelector';
import ClassSelector from './ClassSelector';
import api from '../lib/api';

export const vendorCreditSchema = z.object({
  VendorId: z.string().uuid('Please select a vendor'),
  ProjectId: z.string().uuid().nullish(),
  ClassId: z.string().uuid().nullish(),
  CreditNumber: z.string().min(1, 'Credit number is required'),
  CreditDate: z.string().min(1, 'Credit date is required'),
  Reason: z.string().nullish(),
  Subtotal: z.number().min(0, 'Subtotal must be positive'),
  TaxAmount: z.number().min(0, 'Tax amount must be positive').nullish(),
  TotalAmount: z.number().min(0, 'Total must be positive'),
  AmountApplied: z.number().min(0, 'Amount applied must be positive').nullish(),
  Status: z.enum(['Open', 'Applied', 'Partial', 'Voided']),
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

export type VendorCreditFormData = z.infer<typeof vendorCreditSchema>;

interface Vendor {
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
  PurchaseCost: number | null;
  ExpenseAccountId: string | null;
}

interface VendorCreditFormProps {
  initialValues?: Partial<VendorCreditFormData>;
  onSubmit: (data: VendorCreditFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function VendorCreditForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Vendor Credit' }: VendorCreditFormProps) {
  const navigate = useNavigate();

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors');
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

  // Filter to expense accounts for credit line items
  const expenseAccounts = accounts?.filter(
    (acc) => acc.Type === 'Expense' || acc.Type === 'Cost of Goods Sold'
  ) || [];

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<VendorCreditFormData>({
    resolver: zodResolver(vendorCreditSchema),
    defaultValues: {
      Status: 'Open',
      CreditDate: new Date().toISOString().split('T')[0],
      ProjectId: null,
      ClassId: null,
      Lines: [{ AccountId: '', Description: '', Quantity: 1, UnitPrice: 0, Amount: 0, ProjectId: null, ClassId: null }],
      Subtotal: 0,
      TaxAmount: 0,
      TotalAmount: 0,
      AmountApplied: 0,
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
    // For now, total equals subtotal (tax calculation can be added later)
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
      if (product.PurchaseCost) {
        setValue(`Lines.${index}.UnitPrice`, product.PurchaseCost);
        const quantity = lines[index]?.Quantity || 1;
        setValue(`Lines.${index}.Amount`, quantity * product.PurchaseCost);
      }
      if (product.ExpenseAccountId) {
        setValue(`Lines.${index}.AccountId`, product.ExpenseAccountId);
      }
    }
  };

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/vendor-credits')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="VendorId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Vendor"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select a vendor...</MenuItem>
                {vendors?.map((vendor) => (
                  <MenuItem key={vendor.Id} value={vendor.Id}>
                    {vendor.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="CreditNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Credit Number"
                required
                placeholder="VC-001"
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
                <MenuItem value="Partial">Partial</MenuItem>
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
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Reason / Notes"
                  multiline
                  rows={2}
                  placeholder="Reason for credit (e.g., returned goods, price adjustment)..."
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
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
              onClick={() => append({ AccountId: '', Description: '', Quantity: 1, UnitPrice: 0, Amount: 0, ProjectId: null, ClassId: null })}
            >
              Add Item
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => {
              const qtyReg = register(`Lines.${index}.Quantity`, {
                valueAsNumber: true,
                onChange: (e) => {
                  const qty = parseFloat(e.target.value) || 0;
                  const price = lines[index]?.UnitPrice || 0;
                  updateLineAmount(index, qty, price);
                }
              });
              const priceReg = register(`Lines.${index}.UnitPrice`, {
                valueAsNumber: true,
                onChange: (e) => {
                  const price = parseFloat(e.target.value) || 0;
                  const qty = lines[index]?.Quantity || 0;
                  updateLineAmount(index, qty, price);
                }
              });
              const amountReg = register(`Lines.${index}.Amount`, { valueAsNumber: true });

              return (
                <div key={field.id} className="flex gap-4 items-start bg-gray-50 p-4 rounded-md flex-wrap dark:bg-gray-700">
                  <div className="w-40">
                    <Controller
                      name={`Lines.${index}.ProductServiceId`}
                      control={control}
                      render={({ field: psField }) => (
                        <TextField
                          {...psField}
                          value={psField.value ?? ''}
                          select
                          label="Product/Service"
                          size="small"
                          fullWidth
                          onChange={(e) => {
                            psField.onChange(e);
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
                      render={({ field: accField, fieldState }) => (
                        <TextField
                          {...accField}
                          value={accField.value ?? ''}
                          select
                          label="Account"
                          required
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          size="small"
                          fullWidth
                        >
                          <MenuItem value="">Select account...</MenuItem>
                          {expenseAccounts.map((account) => (
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
                      render={({ field: descField, fieldState }) => (
                        <TextField
                          {...descField}
                          value={descField.value ?? ''}
                          label="Description"
                          placeholder="Item description"
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          size="small"
                          fullWidth
                        />
                      )}
                    />
                  </div>
                  <div className="w-20">
                    <TextField
                      {...qtyReg}
                      inputRef={qtyReg.ref}
                      type="number"
                      label="Qty"
                      slotProps={{ htmlInput: { step: '0.01' } }}
                      error={!!errors.Lines?.[index]?.Quantity}
                      helperText={errors.Lines?.[index]?.Quantity?.message}
                      size="small"
                      fullWidth
                    />
                  </div>
                  <div className="w-24">
                    <TextField
                      {...priceReg}
                      inputRef={priceReg.ref}
                      type="number"
                      label="Unit Price"
                      slotProps={{ htmlInput: { step: '0.01' } }}
                      error={!!errors.Lines?.[index]?.UnitPrice}
                      helperText={errors.Lines?.[index]?.UnitPrice?.message}
                      size="small"
                      fullWidth
                    />
                  </div>
                  <div className="w-24">
                    <TextField
                      {...amountReg}
                      inputRef={amountReg.ref}
                      type="number"
                      label="Amount"
                      slotProps={{ htmlInput: { step: '0.01', readOnly: true } }}
                      error={!!errors.Lines?.[index]?.Amount}
                      helperText={errors.Lines?.[index]?.Amount?.message}
                      size="small"
                      fullWidth
                      sx={{ '& .MuiInputBase-input': { backgroundColor: 'action.hover' } }}
                    />
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
              );
            })}
          </div>
          {errors.Lines && typeof errors.Lines === 'object' && 'message' in errors.Lines && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>
          )}
        </div>

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mr-6">
            Total Credit: {formatCurrencyStandalone(lines.reduce((sum, line) => sum + (line.Amount || 0), 0))}
          </div>
          <Button
            variant="outlined"
            onClick={() => navigate('/vendor-credits')}
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
