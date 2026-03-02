import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import CustomerSelector from './CustomerSelector';
import ProductServiceSelector, { ProductService } from './ProductServiceSelector';
import api from '../lib/api';
import { PAYMENT_METHODS } from '../lib/salesReceiptUtils';

// Tax rate interface
interface TaxRate {
  Id: string;
  Name: string;
  Rate: number;
  Description: string | null;
  IsDefault: boolean;
  IsActive: boolean;
}

// Account interface for deposit account selector
interface Account {
  Id: string;
  Name: string;
  Type: string;
  AccountNumber?: string;
}

export const salesReceiptSchema = z.object({
  SalesReceiptNumber: z.string().min(1, 'Sales receipt number is required'),
  CustomerId: z.string().nullish(),
  SaleDate: z.string().min(1, 'Sale date is required'),
  DepositAccountId: z.string().uuid('Please select a deposit account'),
  PaymentMethod: z.string().nullish(),
  Reference: z.string().nullish(),
  Subtotal: z.number().min(0, 'Subtotal must be positive'),
  TaxRateId: z.string().nullish(),
  TaxAmount: z.number().min(0, 'Tax amount must be positive'),
  TotalAmount: z.number().min(0, 'Amount must be positive'),
  Memo: z.string().nullish(),
  Status: z.enum(['Completed', 'Voided']),
  ClassId: z.string().nullish(),
  LocationId: z.string().nullish(),
  Lines: z.array(z.object({
    Id: z.string().nullish(),
    ProductServiceId: z.string().nullish(),
    Description: z.string().min(1, 'Description is required'),
    Quantity: z.number().min(0.0001, 'Quantity must be greater than 0'),
    UnitPrice: z.number().min(0, 'Unit price must be positive'),
    Amount: z.number().nullish(),
    AccountId: z.string().nullish(),
    IsTaxable: z.boolean().optional()
  })).min(1, 'At least one line item is required')
});

export type SalesReceiptFormData = z.infer<typeof salesReceiptSchema>;

interface SalesReceiptFormProps {
  initialValues?: Partial<SalesReceiptFormData>;
  onSubmit: (data: SalesReceiptFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
  headerActions?: ReactNode;
}

export default function SalesReceiptForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting: externalIsSubmitting,
  submitButtonText = 'Save Sales Receipt',
  headerActions
}: SalesReceiptFormProps) {
  const navigate = useNavigate();

  // Track taxable status for each line item
  const [lineTaxableStatus, setLineTaxableStatus] = useState<Record<number, boolean>>({});

  // Fetch active tax rates
  const { data: taxRates } = useQuery({
    queryKey: ['taxrates-active'],
    queryFn: async (): Promise<TaxRate[]> => {
      const response = await api.get('/taxrates?$filter=IsActive eq true&$orderby=Name');
      return response.data.value;
    },
  });

  // Fetch bank/cash accounts for deposit
  const { data: depositAccounts } = useQuery({
    queryKey: ['deposit-accounts'],
    queryFn: async (): Promise<Account[]> => {
      // Get Bank and Cash type accounts
      const response = await api.get("/accounts?$filter=Type eq 'Asset' and (Subtype eq 'Bank' or Subtype eq 'Cash' or Subtype eq 'Checking' or Subtype eq 'Savings')&$orderby=Name");
      return response.data.value;
    },
  });

  // Get default tax rate
  const defaultTaxRate = useMemo(() => {
    return taxRates?.find(tr => tr.IsDefault);
  }, [taxRates]);

  const { register, control, handleSubmit, setValue, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<SalesReceiptFormData>({
    resolver: zodResolver(salesReceiptSchema),
    defaultValues: {
      Status: 'Completed',
      SaleDate: new Date().toISOString().split('T')[0],
      Lines: [{ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0, IsTaxable: true }],
      Subtotal: 0,
      TaxRateId: initialValues?.TaxRateId || null,
      TaxAmount: 0,
      TotalAmount: 0,
      ...initialValues
    }
  });

  // Set default tax rate when tax rates load and no initial value
  useEffect(() => {
    if (defaultTaxRate && !initialValues?.TaxRateId) {
      setValue('TaxRateId', defaultTaxRate.Id);
    }
  }, [defaultTaxRate, initialValues?.TaxRateId, setValue]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Lines"
  });

  const lines = useWatch({
    control,
    name: "Lines"
  });

  const selectedTaxRateId = watch('TaxRateId');

  // Get the selected tax rate
  const selectedTaxRate = useMemo(() => {
    if (!selectedTaxRateId || !taxRates) return null;
    return taxRates.find(tr => tr.Id === selectedTaxRateId) || null;
  }, [selectedTaxRateId, taxRates]);

  // Calculate subtotal, taxable amount, tax, and total
  const calculations = useMemo(() => {
    let subtotal = 0;
    let taxableAmount = 0;

    lines.forEach((line, index) => {
      const lineAmount = (line.Quantity || 0) * (line.UnitPrice || 0);
      subtotal += lineAmount;

      // Check if this line is taxable
      const isTaxable = lineTaxableStatus[index] ?? true; // Default to taxable
      if (isTaxable) {
        taxableAmount += lineAmount;
      }
    });

    const taxRate = selectedTaxRate?.Rate || 0;
    const taxAmount = taxableAmount * taxRate;
    const total = subtotal + taxAmount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
      taxRate: taxRate
    };
  }, [lines, lineTaxableStatus, selectedTaxRate]);

  // Update form values when calculations change
  useEffect(() => {
    setValue('Subtotal', calculations.subtotal);
    setValue('TaxAmount', calculations.taxAmount);
    setValue('TotalAmount', calculations.total);
  }, [calculations, setValue]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  // Format tax rate for display
  const formatTaxRate = (rate: number) => {
    return `${(rate * 100).toFixed(2)}%`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => navigate('/sales-receipts')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        </div>
        {headerActions && <div className="flex items-center">{headerActions}</div>}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="SalesReceiptNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Sales Receipt #"
                required
                placeholder="SR-001"
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
            name="SaleDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                type="date"
                label="Sale Date"
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
            name="DepositAccountId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Deposit To"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select deposit account...</MenuItem>
                {depositAccounts?.map((account) => (
                  <MenuItem key={account.Id} value={account.Id}>
                    {account.Name} {account.AccountNumber ? `(${account.AccountNumber})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="PaymentMethod"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Payment Method"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select payment method...</MenuItem>
                {PAYMENT_METHODS.map((method) => (
                  <MenuItem key={method.value} value={method.value}>
                    {method.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="Reference"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Reference # (Check #, etc.)"
                placeholder="Optional"
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="TaxRateId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Tax Rate"
                size="small"
                fullWidth
                helperText="Tax will be applied to taxable line items only"
              >
                <MenuItem value="">No Tax</MenuItem>
                {taxRates?.map((taxRate) => (
                  <MenuItem key={taxRate.Id} value={taxRate.Id}>
                    {taxRate.Name} ({formatTaxRate(taxRate.Rate)})
                  </MenuItem>
                ))}
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
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="Completed">Completed</MenuItem>
                <MenuItem value="Voided">Voided</MenuItem>
              </TextField>
            )}
          />
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
              onClick={() => {
                append({ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0, IsTaxable: true });
                setLineTaxableStatus(prev => ({ ...prev, [fields.length]: true }));
              }}
            >
              Add Item
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => {
              const handleProductServiceSelect = (productServiceId: string, productService?: ProductService) => {
                setValue(`Lines.${index}.ProductServiceId`, productServiceId);
                if (productService) {
                  setValue(`Lines.${index}.Description`, productService.Name);
                  if (productService.SalesPrice !== null) {
                    setValue(`Lines.${index}.UnitPrice`, productService.SalesPrice);
                  }
                  setLineTaxableStatus(prev => ({ ...prev, [index]: productService.Taxable }));
                } else {
                  setLineTaxableStatus(prev => ({ ...prev, [index]: true }));
                }
              };

              const lineAmount = (lines[index]?.Quantity || 0) * (lines[index]?.UnitPrice || 0);
              const isTaxable = lineTaxableStatus[index] ?? true;

              const { ref: descRef, ...descRest } = register(`Lines.${index}.Description`);
              const { ref: qtyRef, ...qtyRest } = register(`Lines.${index}.Quantity`, { valueAsNumber: true });
              const { ref: priceRef, ...priceRest } = register(`Lines.${index}.UnitPrice`, { valueAsNumber: true });

              return (
                <div key={field.id} className="bg-gray-50 p-4 rounded-md dark:bg-gray-700">
                  <div className="flex gap-4 items-start mb-3">
                    <div className="flex-grow">
                      <Controller
                        name={`Lines.${index}.ProductServiceId`}
                        control={control}
                        render={({ field: psField }) => (
                          <ProductServiceSelector
                            value={psField.value || ''}
                            onChange={handleProductServiceSelect}
                            disabled={isSubmitting}
                            placeholder="Select or type description below"
                          />
                        )}
                      />
                    </div>
                    <div className="flex items-center pt-1">
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={isTaxable}
                            onChange={(e) => {
                              setLineTaxableStatus(prev => ({ ...prev, [index]: e.target.checked }));
                            }}
                            size="small"
                          />
                        }
                        label="Taxable"
                        slotProps={{ typography: { variant: 'caption' } }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="flex-grow">
                      <TextField
                        {...descRest}
                        inputRef={descRef}
                        label="Description"
                        placeholder="Item description"
                        error={!!errors.Lines?.[index]?.Description}
                        helperText={errors.Lines?.[index]?.Description?.message}
                        size="small"
                        fullWidth
                      />
                    </div>
                    <div className="w-24">
                      <TextField
                        {...qtyRest}
                        inputRef={qtyRef}
                        type="number"
                        label="Qty"
                        size="small"
                        fullWidth
                        slotProps={{ htmlInput: { step: '0.01' } }}
                      />
                    </div>
                    <div className="w-32">
                      <TextField
                        {...priceRest}
                        inputRef={priceRef}
                        type="number"
                        label="Unit Price"
                        size="small"
                        fullWidth
                        slotProps={{ htmlInput: { step: '0.01' } }}
                      />
                    </div>
                    <div className="w-32">
                      <div className="mt-1 py-2 px-3 text-sm text-gray-700 font-medium dark:text-gray-300">
                        {formatCurrencyStandalone(lineAmount)}
                        {!isTaxable && selectedTaxRate && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(no tax)</span>
                        )}
                      </div>
                    </div>
                    <IconButton
                      onClick={() => {
                        remove(index);
                        setLineTaxableStatus(prev => {
                          const newStatus: Record<number, boolean> = {};
                          Object.keys(prev).forEach(key => {
                            const keyNum = parseInt(key);
                            if (keyNum < index) {
                              newStatus[keyNum] = prev[keyNum];
                            } else if (keyNum > index) {
                              newStatus[keyNum - 1] = prev[keyNum];
                            }
                          });
                          return newStatus;
                        });
                      }}
                      color="error"
                      size="small"
                      sx={{ mt: 1 }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
          {errors.Lines && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>}
        </div>

        {/* Memo */}
        <Controller
          name="Memo"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              value={field.value ?? ''}
              label="Memo / Message"
              multiline
              rows={2}
              placeholder="Notes or message to customer"
              size="small"
              fullWidth
            />
          )}
        />

        {/* Totals Section */}
        <div className="border-t pt-4 dark:border-gray-600">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrencyStandalone(calculations.subtotal)}</span>
              </div>
              {selectedTaxRate && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Tax ({selectedTaxRate.Name} - {formatTaxRate(selectedTaxRate.Rate)}):
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrencyStandalone(calculations.taxAmount)}</span>
                  </div>
                  {calculations.taxableAmount !== calculations.subtotal && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Taxable amount:</span>
                      <span>{formatCurrencyStandalone(calculations.taxableAmount)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2 dark:border-gray-600">
                <span className="text-gray-900 dark:text-gray-100">Total:</span>
                <span className="text-gray-900 dark:text-gray-100">{formatCurrencyStandalone(calculations.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <Button
            variant="outlined"
            onClick={() => navigate('/sales-receipts')}
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
