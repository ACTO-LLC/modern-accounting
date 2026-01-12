import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, ReactNode } from 'react';
import CustomerSelector from './CustomerSelector';

export const invoiceSchema = z.object({
  InvoiceNumber: z.string().min(1, 'Invoice number is required'),
  CustomerId: z.string().uuid('Please select a customer'),
  IssueDate: z.string().min(1, 'Issue date is required'),
  DueDate: z.string().min(1, 'Due date is required'),
  TotalAmount: z.number().min(0, 'Amount must be positive'),
  Status: z.enum(['Draft', 'Sent', 'Paid', 'Overdue']),
  Lines: z.array(z.object({
    Id: z.string().optional(),
    Description: z.string().min(1, 'Description is required'),
    Quantity: z.number().min(1, 'Quantity must be at least 1'),
    UnitPrice: z.number().min(0, 'Unit price must be positive'),
    Amount: z.number().optional()
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
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      Status: 'Draft',
      IssueDate: new Date().toISOString().split('T')[0],
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Lines: [{ Description: '', Quantity: 1, UnitPrice: 0 }],
      TotalAmount: 0,
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
        </div>

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
            <button
              type="button"
              onClick={() => append({ Description: '', Quantity: 1, UnitPrice: 0 })}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </button>
          </div>
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-start bg-gray-50 p-4 rounded-md">
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
                    ${((lines[index]?.Quantity || 0) * (lines[index]?.UnitPrice || 0)).toFixed(2)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="mt-6 text-red-600 hover:text-red-800"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          {errors.Lines && <p className="mt-2 text-sm text-red-600">{errors.Lines.message}</p>}
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <div className="text-xl font-bold text-gray-900 mr-6">
            Total: ${lines.reduce((sum, line) => sum + (line.Quantity || 0) * (line.UnitPrice || 0), 0).toFixed(2)}
          </div>
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
