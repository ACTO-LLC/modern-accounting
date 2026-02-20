import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export const vendorCreditSchema = z.object({
  VendorId: z.string().uuid('Please select a vendor'),
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
      Lines: [{ AccountId: '', Description: '', Quantity: 1, UnitPrice: 0, Amount: 0 }],
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
          <div>
            <label htmlFor="VendorId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vendor</label>
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
            <label htmlFor="CreditNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Credit Number</label>
            <input
              id="CreditNumber"
              type="text"
              {...register('CreditNumber')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="VC-001"
            />
            {errors.CreditNumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.CreditNumber.message}</p>}
          </div>

          <div>
            <label htmlFor="CreditDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Credit Date</label>
            <input
              id="CreditDate"
              type="date"
              {...register('CreditDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {errors.CreditDate && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.CreditDate.message}</p>}
          </div>

          <div>
            <label htmlFor="Status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select
              id="Status"
              {...register('Status')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="Open">Open</option>
              <option value="Applied">Applied</option>
              <option value="Partial">Partial</option>
              <option value="Voided">Voided</option>
            </select>
            {errors.Status && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Status.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="Reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reason / Notes</label>
            <textarea
              id="Reason"
              {...register('Reason')}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Reason for credit (e.g., returned goods, price adjustment)..."
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Line Items</h3>
            <button
              type="button"
              onClick={() => append({ AccountId: '', Description: '', Quantity: 1, UnitPrice: 0, Amount: 0 })}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:text-indigo-300 dark:bg-indigo-900 dark:hover:bg-indigo-800"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-4 items-start bg-gray-50 p-4 rounded-md flex-wrap dark:bg-gray-700">
                <div className="w-40">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Product/Service</label>
                  <select
                    {...register(`Lines.${index}.ProductServiceId`)}
                    onChange={(e) => handleProductChange(index, e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="">Optional...</option>
                    {productsServices?.map((ps) => (
                      <option key={ps.Id} value={ps.Id}>
                        {ps.Name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-40">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Account</label>
                  <select
                    {...register(`Lines.${index}.AccountId`)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  >
                    <option value="">Select account...</option>
                    {expenseAccounts.map((account) => (
                      <option key={account.Id} value={account.Id}>
                        {account.Name}
                      </option>
                    ))}
                  </select>
                  {errors.Lines?.[index]?.AccountId && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.Lines[index]?.AccountId?.message}</p>
                  )}
                </div>
                <div className="flex-grow min-w-32">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
                  <input
                    {...register(`Lines.${index}.Description`)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                    placeholder="Item description"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Qty</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`Lines.${index}.Quantity`, {
                      valueAsNumber: true,
                      onChange: (e) => {
                        const qty = parseFloat(e.target.value) || 0;
                        const price = lines[index]?.UnitPrice || 0;
                        updateLineAmount(index, qty, price);
                      }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Unit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`Lines.${index}.UnitPrice`, {
                      valueAsNumber: true,
                      onChange: (e) => {
                        const price = parseFloat(e.target.value) || 0;
                        const qty = lines[index]?.Quantity || 0;
                        updateLineAmount(index, qty, price);
                      }
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register(`Lines.${index}.Amount`, { valueAsNumber: true })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-gray-100 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-100"
                    readOnly
                  />
                  {errors.Lines?.[index]?.Amount && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.Lines[index]?.Amount?.message}</p>
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
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Lines.message}</p>
          )}
        </div>

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mr-6">
            Total Credit: ${lines.reduce((sum, line) => sum + (line.Amount || 0), 0).toFixed(2)}
          </div>
          <button
            type="button"
            onClick={() => navigate('/vendor-credits')}
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
