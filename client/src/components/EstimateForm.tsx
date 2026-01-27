import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import CustomerSelector from './CustomerSelector';
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

// Main estimate schema with date validation
export const estimateSchema = z.object({
  EstimateNumber: z.string().min(1, 'Estimate number is required'),
  CustomerId: z.string().uuid('Please select a valid customer'),
  IssueDate: z.string().min(1, 'Issue date is required'),
  ExpirationDate: z.string().optional(),
  TotalAmount: z.number().min(0, 'Amount must be zero or positive'),
  Status: z.enum(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Converted']),
  Notes: z.string().optional(),
  Lines: z.array(lineItemSchema).min(1, 'At least one line item is required')
}).refine((data) => {
  // Validate that ExpirationDate is on or after IssueDate if both are provided
  if (data.ExpirationDate && data.IssueDate) {
    return new Date(data.ExpirationDate) >= new Date(data.IssueDate);
  }
  return true;
}, {
  message: 'Expiration date must be on or after the issue date',
  path: ['ExpirationDate']
});

export type EstimateFormData = z.infer<typeof estimateSchema>;

export interface EstimateLine {
  Id?: string;
  ProductServiceId?: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}

interface EstimateFormProps {
  initialValues?: Partial<EstimateFormData>;
  onSubmit: (data: EstimateFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function EstimateForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Estimate' }: EstimateFormProps) {
  const navigate = useNavigate();
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<EstimateFormData>({
    resolver: zodResolver(estimateSchema),
    defaultValues: {
      Status: 'Draft',
      IssueDate: new Date().toISOString().split('T')[0],
      ExpirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Lines: [{ ProductServiceId: '', Description: '', Quantity: 1, UnitPrice: 0 }],
      TotalAmount: 0,
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
    const total = lines.reduce((sum, line) => {
      return sum + (line.Quantity || 0) * (line.UnitPrice || 0);
    }, 0);
    setValue('TotalAmount', total);
  }, [lines, setValue]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/estimates')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="EstimateNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Estimate Number <span className="text-red-500">*</span>
            </label>
            <input
              id="EstimateNumber"
              type="text"
              {...register('EstimateNumber')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="EST-001"
            />
            {errors.EstimateNumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.EstimateNumber.message}</p>}
          </div>

          <div>
            <label htmlFor="CustomerId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Customer <span className="text-red-500">*</span>
            </label>
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
            <label htmlFor="IssueDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Issue Date <span className="text-red-500">*</span>
            </label>
            <input
              id="IssueDate"
              type="date"
              {...register('IssueDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {errors.IssueDate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.IssueDate.message}</p>}
          </div>

          <div>
            <label htmlFor="ExpirationDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Expiration Date
            </label>
            <input
              id="ExpirationDate"
              type="date"
              {...register('ExpirationDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {errors.ExpirationDate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.ExpirationDate.message}</p>}
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
              <option value="Accepted">Accepted</option>
              <option value="Rejected">Rejected</option>
              <option value="Expired">Expired</option>
              <option value="Converted">Converted</option>
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
            placeholder="Additional notes for this estimate..."
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
                  if (productService.SalesPrice !== null) {
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
            onClick={() => navigate('/estimates')}
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
