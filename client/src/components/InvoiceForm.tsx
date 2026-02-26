import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Zap, Info, MapPin } from 'lucide-react';
import { useEffect, ReactNode, useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import CustomerSelector from './CustomerSelector';
import ProductServiceSelector, { ProductService } from './ProductServiceSelector';
import ProjectSelector from './ProjectSelector';
import ClassSelector from './ClassSelector';
import api from '../lib/api';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

// Tax calculation settings interface
interface TaxCalculationSettings {
  CalculationMethod: 'manual' | 'zip_api' | 'paid_api';
  FallbackTaxRateId: string | null;
}

// Auto-calculated tax rate result
interface AutoTaxRate {
  rate: number;
  source: string;
  breakdown?: {
    state?: number;
    county?: number;
    city?: number;
    special?: number;
  };
}

// Tax rate interface
interface TaxRate {
  Id: string;
  Name: string;
  Rate: number;
  Description: string | null;
  IsDefault: boolean;
  IsActive: boolean;
}

export const invoiceSchema = z.object({
  InvoiceNumber: z.string().min(1, 'Invoice number is required'),
  CustomerId: z.string().uuid('Please select a customer'),
  IssueDate: z.string().min(1, 'Issue date is required'),
  DueDate: z.string().min(1, 'Due date is required'),
  Subtotal: z.number().min(0, 'Subtotal must be positive'),
  TaxRateId: z.string().nullish(),
  TaxAmount: z.number().min(0, 'Tax amount must be positive'),
  TotalAmount: z.number().min(0, 'Amount must be positive'),
  Status: z.enum(['Draft', 'Sent', 'Paid', 'Overdue']),
  ProjectId: z.string().uuid().nullish(),
  ClassId: z.string().uuid().nullish(),
  Lines: z.array(z.object({
    Id: z.string().nullish(),
    ProductServiceId: z.string().nullish(),
    Description: z.string().min(1, 'Description is required'),
    Quantity: z.number().min(1, 'Quantity must be at least 1'),
    UnitPrice: z.number().min(0, 'Unit price must be positive'),
    Amount: z.number().nullish(),
    IsTaxable: z.boolean().optional(),
    ProjectId: z.string().uuid().nullish(),
    ClassId: z.string().uuid().nullish()
  })).min(1, 'At least one line item is required')
});

export type InvoiceFormData = z.infer<typeof invoiceSchema>;

interface InvoiceFormProps {
  initialValues?: Partial<InvoiceFormData>;
  onSubmit: (data: InvoiceFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
  headerActions?: ReactNode;
  isAutoNumbered?: boolean;
}

export default function InvoiceForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Invoice', headerActions, isAutoNumbered }: InvoiceFormProps) {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();

  // Track taxable status for each line item (keyed by ProductServiceId)
  const [lineTaxableStatus, setLineTaxableStatus] = useState<Record<number, boolean>>({});

  // Track auto-calculated tax rate
  const [autoTaxRate, setAutoTaxRate] = useState<AutoTaxRate | null>(null);
  const [isLoadingAutoTax, setIsLoadingAutoTax] = useState(false);

  // Fetch active tax rates
  const { data: taxRates } = useQuery({
    queryKey: ['taxrates-active'],
    queryFn: async (): Promise<TaxRate[]> => {
      const response = await api.get('/taxrates?$filter=IsActive eq true&$orderby=Name');
      return response.data.value;
    },
  });

  // Fetch tax calculation settings
  const { data: taxSettings } = useQuery({
    queryKey: ['tax-calculation-settings'],
    queryFn: async (): Promise<TaxCalculationSettings | null> => {
      try {
        const response = await api.get('/api/tax/settings');
        return response.data;
      } catch {
        // If settings don't exist, default to manual
        return { CalculationMethod: 'manual', FallbackTaxRateId: null };
      }
    },
  });

  // Get default tax rate
  const defaultTaxRate = useMemo(() => {
    return taxRates?.find(tr => tr.IsDefault);
  }, [taxRates]);

  // Fetch auto tax rate when customer changes (for non-manual modes)
  const fetchAutoTaxRate = useCallback(async (customerId: string) => {
    if (!taxSettings || taxSettings.CalculationMethod === 'manual') {
      setAutoTaxRate(null);
      return;
    }

    try {
      setIsLoadingAutoTax(true);

      // Fetch customer with address fields
      const customerResponse = await api.get(`/customers/Id/${customerId}`);
      const customer = customerResponse.data.value?.[0] || customerResponse.data;

      if (!customer?.PostalCode) {
        console.log('Customer has no postal code, cannot auto-calculate tax');
        setAutoTaxRate(null);
        return;
      }

      // Call tax rate API
      const params = new URLSearchParams({
        postalCode: customer.PostalCode,
        ...(customer.State && { state: customer.State }),
        ...(customer.City && { city: customer.City }),
      });

      const taxResponse = await api.get(`/api/tax/rate?${params}`);
      const taxData = taxResponse.data;

      if (taxData.rate !== undefined) {
        setAutoTaxRate({
          rate: taxData.rate,
          source: taxData.source || 'API',
          breakdown: taxData.breakdown,
        });
      }
    } catch (error) {
      console.error('Failed to fetch auto tax rate:', error);
      setAutoTaxRate(null);
    } finally {
      setIsLoadingAutoTax(false);
    }
  }, [taxSettings]);

  const { register, control, handleSubmit, setValue, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      Status: 'Draft',
      IssueDate: new Date().toISOString().split('T')[0],
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Lines: [{ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0, IsTaxable: true, ProjectId: null, ClassId: null }],
      Subtotal: 0,
      TaxRateId: initialValues?.TaxRateId || null,
      TaxAmount: 0,
      TotalAmount: 0,
      ProjectId: null,
      ClassId: null,
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
  const watchedStatus = watch('Status');

  // Determine if invoice will be auto-posted on save
  const willAutoPost = settings.invoicePostingMode === 'simple' && watchedStatus !== 'Draft';

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

    // Use auto tax rate if available, otherwise use selected tax rate
    const taxRate = autoTaxRate?.rate ?? selectedTaxRate?.Rate ?? 0;
    const taxAmount = taxableAmount * taxRate;
    const total = subtotal + taxAmount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
      taxRate: taxRate,
      isAutoTax: !!autoTaxRate
    };
  }, [lines, lineTaxableStatus, selectedTaxRate, autoTaxRate]);

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
          <button onClick={() => navigate('/invoices')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        </div>
        {headerActions && <div className="flex items-center">{headerActions}</div>}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="InvoiceNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Invoice Number"
                required
                placeholder="INV-0001"
                error={!!fieldState.error}
                helperText={fieldState.error?.message || (isAutoNumbered ? 'Auto-assigned. Clear to enter your own.' : undefined)}
                size="small"
                fullWidth
              />
            )}
          />

          <div>
            <Controller
              name="CustomerId"
              control={control}
              render={({ field }) => (
                <CustomerSelector
                  value={field.value || ''}
                  onChange={(customerId) => {
                    field.onChange(customerId);
                    if (customerId) {
                      fetchAutoTaxRate(customerId);
                    } else {
                      setAutoTaxRate(null);
                    }
                  }}
                  error={errors.CustomerId?.message}
                  disabled={isSubmitting}
                />
              )}
            />
            {isLoadingAutoTax && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Calculating tax rate...
              </p>
            )}
            {autoTaxRate && !isLoadingAutoTax && (
              <p className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Auto: {(autoTaxRate.rate * 100).toFixed(2)}% ({autoTaxRate.source})
              </p>
            )}
          </div>

          <Controller
            name="IssueDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                type="date"
                label="Issue Date"
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
            name="DueDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                type="date"
                label="Due Date"
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
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="Draft">Draft</MenuItem>
                <MenuItem value="Sent">Sent</MenuItem>
                <MenuItem value="Paid">Paid</MenuItem>
                <MenuItem value="Overdue">Overdue</MenuItem>
              </TextField>
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
            name="ProjectId"
            control={control}
            render={({ field }) => (
              <ProjectSelector
                value={field.value || ''}
                onChange={(projectId) => field.onChange(projectId || null)}
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
                onChange={(classId) => field.onChange(classId || null)}
                disabled={isSubmitting}
              />
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
                append({ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0, IsTaxable: true, ProjectId: null, ClassId: null });
                // Set new line as taxable by default
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
                  // Auto-populate description and price from product/service
                  setValue(`Lines.${index}.Description`, productService.Name);
                  if (productService.SalesPrice !== null) {
                    setValue(`Lines.${index}.UnitPrice`, productService.SalesPrice);
                  }
                  // Set taxable status from product/service
                  setLineTaxableStatus(prev => ({ ...prev, [index]: productService.Taxable }));
                } else {
                  // If cleared, default to taxable
                  setLineTaxableStatus(prev => ({ ...prev, [index]: true }));
                }
              };

              const lineAmount = (lines[index]?.Quantity || 0) * (lines[index]?.UnitPrice || 0);
              const isTaxable = lineTaxableStatus[index] ?? true;

              const { ref: descRef, ...descRest } = register(`Lines.${index}.Description`);
              const { ref: qtyRef, ...qtyRest } = register(`Lines.${index}.Quantity`, { valueAsNumber: true });
              const { ref: priceRef, ...priceRest } = register(`Lines.${index}.UnitPrice`, { valueAsNumber: true });

              return (
                <div key={field.id} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
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
                      <div className="mt-1 py-2 px-3 text-sm text-gray-700 dark:text-gray-300 font-medium">
                        ${lineAmount.toFixed(2)}
                        {!isTaxable && selectedTaxRate && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(no tax)</span>
                        )}
                      </div>
                    </div>
                    <IconButton
                      onClick={() => {
                        remove(index);
                        // Update taxable status indices
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
                  <div className="flex gap-4 items-start mt-2">
                    <div className="flex-1">
                      <Controller
                        name={`Lines.${index}.ProjectId`}
                        control={control}
                        render={({ field: pField }) => (
                          <ProjectSelector
                            value={pField.value || ''}
                            onChange={(projectId) => pField.onChange(projectId || null)}
                            disabled={isSubmitting}
                            customerId={watch('CustomerId')}
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
                            onChange={(classId) => cField.onChange(classId || null)}
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
          {errors.Lines && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>}
        </div>

        {/* Totals Section */}
        <div className="border-t dark:border-gray-600 pt-4">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">${calculations.subtotal.toFixed(2)}</span>
              </div>
              {selectedTaxRate && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Tax ({selectedTaxRate.Name} - {formatTaxRate(selectedTaxRate.Rate)}):
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">${calculations.taxAmount.toFixed(2)}</span>
                  </div>
                  {calculations.taxableAmount !== calculations.subtotal && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Taxable amount:</span>
                      <span>${calculations.taxableAmount.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-lg font-bold border-t dark:border-gray-600 pt-2">
                <span className="text-gray-900 dark:text-gray-100">Total:</span>
                <span className="text-gray-900 dark:text-gray-100">${calculations.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-posting indicator */}
        {settings.invoicePostingMode === 'simple' && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            willAutoPost
              ? 'bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-700'
              : 'bg-gray-50 border border-gray-200 dark:bg-gray-800 dark:border-gray-600'
          }`}>
            {willAutoPost ? (
              <>
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-700 dark:text-amber-400">
                  This invoice will <strong>post to your books</strong> when saved (AR + Revenue entries).
                </span>
              </>
            ) : (
              <>
                <Info className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Draft invoices don't affect your books until the status is changed.
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/invoices')}
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
