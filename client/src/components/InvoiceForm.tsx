import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CustomerSelector from './CustomerSelector';
import ProductServiceSelector, { ProductService } from './ProductServiceSelector';
import api from '../lib/api';

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
  Lines: z.array(z.object({
    Id: z.string().nullish(),
    ProductServiceId: z.string().nullish(),
    Description: z.string().min(1, 'Description is required'),
    Quantity: z.number().min(1, 'Quantity must be at least 1'),
    UnitPrice: z.number().min(0, 'Unit price must be positive'),
    Amount: z.number().nullish(),
    IsTaxable: z.boolean().optional()
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
}

export default function InvoiceForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Invoice', headerActions }: InvoiceFormProps) {
  const navigate = useNavigate();

  // Track taxable status for each line item (keyed by ProductServiceId)
  const [lineTaxableStatus, setLineTaxableStatus] = useState<Record<number, boolean>>({});

  // Fetch active tax rates
  const { data: taxRates } = useQuery({
    queryKey: ['taxrates-active'],
    queryFn: async (): Promise<TaxRate[]> => {
      const response = await api.get('/taxrates?$filter=IsActive eq true&$orderby=Name');
      return response.data.value;
    },
  });

  // Get default tax rate
  const defaultTaxRate = useMemo(() => {
    return taxRates?.find(tr => tr.IsDefault);
  }, [taxRates]);

  const { register, control, handleSubmit, setValue, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      Status: 'Draft',
      IssueDate: new Date().toISOString().split('T')[0],
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
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
          <button onClick={() => navigate('/invoices')} className="mr-4 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        </div>
        {headerActions && <div className="flex items-center">{headerActions}</div>}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="InvoiceNumber" className="block text-sm font-medium text-gray-700">Invoice Number</label>
            <input
              id="InvoiceNumber"
              type="text"
              {...register('InvoiceNumber')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="INV-002"
            />
            {errors.InvoiceNumber && <p className="mt-1 text-sm text-red-600">{errors.InvoiceNumber.message}</p>}
          </div>

          <div>
            <label htmlFor="CustomerId" className="block text-sm font-medium text-gray-700">Customer</label>
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
          </div>

          <div>
            <label htmlFor="IssueDate" className="block text-sm font-medium text-gray-700">Issue Date</label>
            <input
              id="IssueDate"
              type="date"
              {...register('IssueDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.IssueDate && <p className="mt-1 text-sm text-red-600">{errors.IssueDate.message}</p>}
          </div>

          <div>
            <label htmlFor="DueDate" className="block text-sm font-medium text-gray-700">Due Date</label>
            <input
              id="DueDate"
              type="date"
              {...register('DueDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.DueDate && <p className="mt-1 text-sm text-red-600">{errors.DueDate.message}</p>}
          </div>

          <div>
            <label htmlFor="Status" className="block text-sm font-medium text-gray-700">Status</label>
            <select
              id="Status"
              {...register('Status')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
            </select>
            {errors.Status && <p className="mt-1 text-sm text-red-600">{errors.Status.message}</p>}
          </div>

          <div>
            <label htmlFor="TaxRateId" className="block text-sm font-medium text-gray-700">Tax Rate</label>
            <select
              id="TaxRateId"
              {...register('TaxRateId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">No Tax</option>
              {taxRates?.map((taxRate) => (
                <option key={taxRate.Id} value={taxRate.Id}>
                  {taxRate.Name} ({formatTaxRate(taxRate.Rate)})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Tax will be applied to taxable line items only
            </p>
          </div>
        </div>

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
            <button
              type="button"
              onClick={() => {
                append({ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0, IsTaxable: true });
                // Set new line as taxable by default
                setLineTaxableStatus(prev => ({ ...prev, [fields.length]: true }));
              }}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </button>
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

              return (
                <div key={field.id} className="bg-gray-50 p-4 rounded-md">
                  <div className="flex gap-4 items-start mb-3">
                    <div className="flex-grow">
                      <label className="block text-xs font-medium text-gray-500">Product/Service</label>
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
                    <div className="flex items-center pt-5">
                      <input
                        type="checkbox"
                        id={`taxable-${index}`}
                        checked={isTaxable}
                        onChange={(e) => {
                          setLineTaxableStatus(prev => ({ ...prev, [index]: e.target.checked }));
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor={`taxable-${index}`} className="ml-2 text-xs text-gray-600">
                        Taxable
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="flex-grow">
                      <label className="block text-xs font-medium text-gray-500">Description</label>
                      <input
                        {...register(`Lines.${index}.Description`)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                        placeholder="Item description"
                      />
                      {errors.Lines?.[index]?.Description && (
                        <p className="mt-1 text-xs text-red-600">{errors.Lines[index]?.Description?.message}</p>
                      )}
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-gray-500">Qty</label>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`Lines.${index}.Quantity`, { valueAsNumber: true })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-500">Unit Price</label>
                      <input
                        type="number"
                        step="0.01"
                        {...register(`Lines.${index}.UnitPrice`, { valueAsNumber: true })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                      />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-500">Amount</label>
                      <div className="mt-1 py-2 px-3 text-sm text-gray-700 font-medium">
                        ${lineAmount.toFixed(2)}
                        {!isTaxable && selectedTaxRate && (
                          <span className="ml-1 text-xs text-gray-400">(no tax)</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
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
                      className="mt-6 text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {errors.Lines && <p className="mt-2 text-sm text-red-600">{errors.Lines.message}</p>}
        </div>

        {/* Totals Section */}
        <div className="border-t pt-4">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium text-gray-900">${calculations.subtotal.toFixed(2)}</span>
              </div>
              {selectedTaxRate && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      Tax ({selectedTaxRate.Name} - {formatTaxRate(selectedTaxRate.Rate)}):
                    </span>
                    <span className="font-medium text-gray-900">${calculations.taxAmount.toFixed(2)}</span>
                  </div>
                  {calculations.taxableAmount !== calculations.subtotal && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Taxable amount:</span>
                      <span>${calculations.taxableAmount.toFixed(2)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span className="text-gray-900">Total:</span>
                <span className="text-gray-900">${calculations.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : submitButtonText}
          </button>
        </div>
      </form>
    </div>
  );
}
