import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Zap, Info } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

export const billSchema = z.object({
  VendorId: z.string().uuid('Please select a vendor'),
  BillNumber: z.string().optional(),
  BillDate: z.string().min(1, 'Bill date is required'),
  DueDate: z.string().min(1, 'Due date is required'),
  TotalAmount: z.number().min(0, 'Amount must be positive'),
  AmountPaid: z.number().min(0, 'Amount paid must be positive').optional(),
  Status: z.enum(['Draft', 'Open', 'Partial', 'Paid', 'Overdue']),
  Terms: z.string().optional(),
  Memo: z.string().optional(),
  Lines: z.array(z.object({
    Id: z.string().nullish(),
    AccountId: z.string().uuid('Please select an account'),
    Description: z.string().nullish(),
    Amount: z.number().min(0, 'Amount must be positive')
  })).min(1, 'At least one line item is required')
});

export type BillFormData = z.infer<typeof billSchema>;

interface Vendor {
  Id: string;
  Name: string;
  PaymentTerms: string;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface BillFormProps {
  initialValues?: Partial<BillFormData>;
  onSubmit: (data: BillFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function BillForm({ initialValues, onSubmit, title, isSubmitting: externalIsSubmitting, submitButtonText = 'Save Bill' }: BillFormProps) {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();

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

  // Filter to expense accounts for bill line items
  const expenseAccounts = accounts?.filter(
    (acc) => acc.Type === 'Expense' || acc.Type === 'Cost of Goods Sold'
  ) || [];

  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<BillFormData>({
    resolver: zodResolver(billSchema),
    defaultValues: {
      Status: 'Open',
      BillDate: new Date().toISOString().split('T')[0],
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      Lines: [{ AccountId: '', Description: '', Amount: 0 }],
      TotalAmount: 0,
      AmountPaid: 0,
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

  const selectedVendorId = useWatch({
    control,
    name: "VendorId"
  });

  const watchedStatus = useWatch({
    control,
    name: "Status"
  });

  // Determine if bill will be auto-posted on save
  const willAutoPost = settings.invoicePostingMode === 'simple' && watchedStatus !== 'Draft';

  // Update Terms when vendor is selected
  useEffect(() => {
    if (selectedVendorId && vendors) {
      const vendor = vendors.find(v => v.Id === selectedVendorId);
      if (vendor?.PaymentTerms) {
        setValue('Terms', vendor.PaymentTerms);
      }
    }
  }, [selectedVendorId, vendors, setValue]);

  useEffect(() => {
    const total = lines.reduce((sum, line) => {
      return sum + (line.Amount || 0);
    }, 0);
    setValue('TotalAmount', total);
  }, [lines, setValue]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/bills')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="VendorId" className="block text-sm font-medium text-gray-700">Vendor</label>
            <select
              id="VendorId"
              {...register('VendorId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select a vendor...</option>
              {vendors?.map((vendor) => (
                <option key={vendor.Id} value={vendor.Id}>
                  {vendor.Name}
                </option>
              ))}
            </select>
            {errors.VendorId && <p className="mt-1 text-sm text-red-600">{errors.VendorId.message}</p>}
          </div>

          <div>
            <label htmlFor="BillNumber" className="block text-sm font-medium text-gray-700">Bill Number</label>
            <input
              id="BillNumber"
              type="text"
              {...register('BillNumber')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="BILL-001"
            />
            {errors.BillNumber && <p className="mt-1 text-sm text-red-600">{errors.BillNumber.message}</p>}
          </div>

          <div>
            <label htmlFor="BillDate" className="block text-sm font-medium text-gray-700">Bill Date</label>
            <input
              id="BillDate"
              type="date"
              {...register('BillDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.BillDate && <p className="mt-1 text-sm text-red-600">{errors.BillDate.message}</p>}
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
            <label htmlFor="Terms" className="block text-sm font-medium text-gray-700">Payment Terms</label>
            <select
              id="Terms"
              {...register('Terms')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select terms...</option>
              <option value="Due on Receipt">Due on Receipt</option>
              <option value="Net 15">Net 15</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 45">Net 45</option>
              <option value="Net 60">Net 60</option>
            </select>
          </div>

          <div>
            <label htmlFor="Status" className="block text-sm font-medium text-gray-700">Status</label>
            <select
              id="Status"
              {...register('Status')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Draft">Draft</option>
              <option value="Open">Open</option>
              <option value="Partial">Partial</option>
              <option value="Paid">Paid</option>
              <option value="Overdue">Overdue</option>
            </select>
            {errors.Status && <p className="mt-1 text-sm text-red-600">{errors.Status.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="Memo" className="block text-sm font-medium text-gray-700">Memo</label>
            <textarea
              id="Memo"
              {...register('Memo')}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="Add notes about this bill..."
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Line Items</h3>
            <button
              type="button"
              onClick={() => append({ AccountId: '', Description: '', Amount: 0 })}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-start bg-gray-50 p-4 rounded-md">
                <div className="w-48">
                  <label className="block text-xs font-medium text-gray-500">Account</label>
                  <select
                    {...register(`Lines.${index}.AccountId`)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                  >
                    <option value="">Select account...</option>
                    {expenseAccounts.map((account) => (
                      <option key={account.Id} value={account.Id}>
                        {account.Name}
                      </option>
                    ))}
                  </select>
                  {errors.Lines?.[index]?.AccountId && (
                    <p className="mt-1 text-xs text-red-600">{errors.Lines[index]?.AccountId?.message}</p>
                  )}
                </div>
                <div className="flex-grow">
                  <label className="block text-xs font-medium text-gray-500">Description</label>
                  <input
                    {...register(`Lines.${index}.Description`)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                    placeholder="Item description"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-medium text-gray-500">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`Lines.${index}.Amount`, { valueAsNumber: true })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                  />
                  {errors.Lines?.[index]?.Amount && (
                    <p className="mt-1 text-xs text-red-600">{errors.Lines[index]?.Amount?.message}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="mt-6 text-red-600 hover:text-red-800"
                  disabled={fields.length === 1}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
          {errors.Lines && typeof errors.Lines === 'object' && 'message' in errors.Lines && (
            <p className="mt-2 text-sm text-red-600">{errors.Lines.message}</p>
          )}
        </div>

        {/* Auto-posting indicator */}
        {settings.invoicePostingMode === 'simple' && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            willAutoPost
              ? 'bg-amber-50 border border-amber-200'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            {willAutoPost ? (
              <>
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-700">
                  This bill will <strong>post to your books</strong> when saved (AP + Expense entries).
                </span>
              </>
            ) : (
              <>
                <Info className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Draft bills don't affect your books until the status is changed.
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end items-center border-t pt-4">
          <div className="text-xl font-bold text-gray-900 mr-6">
            Total: ${lines.reduce((sum, line) => sum + (line.Amount || 0), 0).toFixed(2)}
          </div>
          <button
            type="button"
            onClick={() => navigate('/bills')}
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
