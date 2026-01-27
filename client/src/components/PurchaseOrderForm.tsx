import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import ProductServiceSelector, { ProductService } from './ProductServiceSelector';

// Line item schema with proper validation
const lineItemSchema = z.object({
  Id: z.string().nullish(),
  ProductServiceId: z.string().nullish(),
  Description: z.string().min(1, 'Description is required'),
  Quantity: z.number().min(0.0001, 'Quantity must be positive'),
  UnitPrice: z.number().min(0, 'Unit price must be zero or positive'),
  Amount: z.number().nullish()
});

// Main purchase order schema with date validation
export const purchaseOrderSchema = z.object({
  PONumber: z.string().min(1, 'PO number is required'),
  VendorId: z.string().uuid('Please select a valid vendor'),
  PODate: z.string().min(1, 'PO date is required'),
  ExpectedDate: z.string().optional(),
  Subtotal: z.number().min(0, 'Subtotal must be zero or positive'),
  Total: z.number().min(0, 'Total must be zero or positive'),
  Status: z.enum(['Draft', 'Sent', 'Received', 'Partial', 'Cancelled']),
  Notes: z.string().optional(),
  Lines: z.array(lineItemSchema).min(1, 'At least one line item is required')
}).refine((data) => {
  // Validate that ExpectedDate is on or after PODate if both are provided
  if (data.ExpectedDate && data.PODate) {
    return new Date(data.ExpectedDate) >= new Date(data.PODate);
  }
  return true;
}, {
  message: 'Expected date must be on or after the PO date',
  path: ['ExpectedDate']
});

export type PurchaseOrderFormData = z.infer<typeof purchaseOrderSchema>;

export interface PurchaseOrderLine {
  Id?: string;
  ProductServiceId?: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}

interface Vendor {
  Id: string;
  Name: string;
  PaymentTerms: string;
}

interface PurchaseOrderFormProps {
  initialValues?: Partial<PurchaseOrderFormData>;
  onSubmit: (data: PurchaseOrderFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function PurchaseOrderForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Purchase Order' }: PurchaseOrderFormProps) {
  const navigate = useNavigate();

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors');
      return response.data.value;
    },
  });

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      Status: 'Draft',
      PODate: new Date().toISOString().split('T')[0],
      ExpectedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 weeks from now
      Lines: [{ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0 }],
      Subtotal: 0,
      Total: 0,
      Notes: '',
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

  useEffect(() => {
    const subtotal = lines.reduce((sum, line) => {
      return sum + (line.Quantity || 0) * (line.UnitPrice || 0);
    }, 0);
    setValue('Subtotal', subtotal);
    setValue('Total', subtotal); // For now, total equals subtotal (no taxes on POs)
  }, [lines, setValue]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/purchase-orders')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="PONumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              PO Number <span className="text-red-500">*</span>
            </label>
            <input
              id="PONumber"
              type="text"
              {...register('PONumber')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="PO-001"
            />
            {errors.PONumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.PONumber.message}</p>}
          </div>

          <div>
            <label htmlFor="VendorId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Vendor <span className="text-red-500">*</span>
            </label>
            <select
              id="VendorId"
              {...register('VendorId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Select a vendor...</option>
              {vendors?.map((vendor) => (
                <option key={vendor.Id} value={vendor.Id}>
                  {vendor.Name}
                </option>
              ))}
            </select>
            {errors.VendorId && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.VendorId.message}</p>}
          </div>

          <div>
            <label htmlFor="PODate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              PO Date <span className="text-red-500">*</span>
            </label>
            <input
              id="PODate"
              type="date"
              {...register('PODate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {errors.PODate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.PODate.message}</p>}
          </div>

          <div>
            <label htmlFor="ExpectedDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Expected Delivery Date
            </label>
            <input
              id="ExpectedDate"
              type="date"
              {...register('ExpectedDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {errors.ExpectedDate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.ExpectedDate.message}</p>}
          </div>

          <div>
            <label htmlFor="Status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select
              id="Status"
              {...register('Status')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Received">Received</option>
              <option value="Partial">Partial</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            {errors.Status && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Status.message}</p>}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="Notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
          <textarea
            id="Notes"
            rows={3}
            {...register('Notes')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            placeholder="Additional notes for this purchase order..."
          />
        </div>

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Line Items <span className="text-red-500">*</span>
            </h3>
            <button
              type="button"
              onClick={() => append({ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0 })}
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
                  // Use PurchaseCost for purchase orders (not SalesPrice)
                  if (productService.PurchaseCost !== null) {
                    setValue(`Lines.${index}.UnitPrice`, productService.PurchaseCost);
                  } else if (productService.SalesPrice !== null) {
                    // Fall back to sales price if no purchase cost is set
                    setValue(`Lines.${index}.UnitPrice`, productService.SalesPrice);
                  }
                }
              };

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
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="flex-grow">
                      <label className="block text-xs font-medium text-gray-500">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <input
                        {...register(`Lines.${index}.Description`)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="Item description"
                      />
                      {errors.Lines?.[index]?.Description && (
                        <p className="mt-1 text-xs text-red-600">{errors.Lines[index]?.Description?.message}</p>
                      )}
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-medium text-gray-500">
                        Qty <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        {...register(`Lines.${index}.Quantity`, { valueAsNumber: true })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                      {errors.Lines?.[index]?.Quantity && (
                        <p className="mt-1 text-xs text-red-600">{errors.Lines[index]?.Quantity?.message}</p>
                      )}
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-500">
                        Unit Price <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        {...register(`Lines.${index}.UnitPrice`, { valueAsNumber: true })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                      {errors.Lines?.[index]?.UnitPrice && (
                        <p className="mt-1 text-xs text-red-600">{errors.Lines[index]?.UnitPrice?.message}</p>
                      )}
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-medium text-gray-500">Amount</label>
                      <div className="mt-1 py-2 px-3 text-sm text-gray-700 font-medium">
                        ${((lines[index]?.Quantity || 0) * (lines[index]?.UnitPrice || 0)).toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      className="mt-6 text-red-600 hover:text-red-800 disabled:text-gray-300 disabled:cursor-not-allowed"
                      title={fields.length === 1 ? 'At least one line item is required' : 'Remove item'}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {errors.Lines && typeof errors.Lines.message === 'string' && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>
          )}
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <div className="text-xl font-bold text-gray-900 mr-6">
            Total: ${lines.reduce((sum, line) => sum + (line.Quantity || 0) * (line.UnitPrice || 0), 0).toFixed(2)}
          </div>
          <button
            type="button"
            onClick={() => navigate('/purchase-orders')}
            className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
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
