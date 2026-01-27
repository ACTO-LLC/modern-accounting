import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Receipt } from 'lucide-react';
import { useRef, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const expenseSchemaBase = z.object({
  ExpenseNumber: z.string().nullish(),
  ExpenseDate: z.string().min(1, 'Expense date is required'),
  VendorId: z.string().uuid().nullish(),
  VendorName: z.string().nullish(), // For quick entry without vendor record
  AccountId: z.string().uuid('Please select an expense category'),
  Amount: z.number().min(0.01, 'Amount must be greater than 0'),
  PaymentAccountId: z.string().uuid().nullish(),
  PaymentMethod: z.string().nullish(),
  Description: z.string().nullish(),
  Reference: z.string().nullish(),
  IsReimbursable: z.boolean(),
  IsPersonal: z.boolean(),
  CustomerId: z.string().uuid().nullish(),
  ProjectId: z.string().uuid().nullish(),
  ClassId: z.string().uuid().nullish(),
  Status: z.enum(['Recorded', 'Pending', 'Reimbursed', 'Voided']),
});

export const expenseSchema = expenseSchemaBase;

export type ExpenseFormData = z.infer<typeof expenseSchema>;

interface Vendor {
  Id: string;
  Name: string;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface Customer {
  Id: string;
  Name: string;
}

interface Project {
  Id: string;
  Name: string;
}

interface Class {
  Id: string;
  Name: string;
}

interface ReceiptFile {
  file: File;
  preview: string;
}

interface ExpenseFormProps {
  initialValues?: Partial<ExpenseFormData>;
  onSubmit: (data: ExpenseFormData, receipts: File[]) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function ExpenseForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting: externalIsSubmitting,
  submitButtonText = 'Save Expense',
}: ExpenseFormProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<ReceiptFile[]>([]);
  const [useQuickVendor, setUseQuickVendor] = useState(false);

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors?$orderby=Name');
      return response.data.value;
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get<{ value: Account[] }>('/accounts?$orderby=Name');
      return response.data.value;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers?$orderby=Name');
      return response.data.value;
    },
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get<{ value: Project[] }>('/projects?$orderby=Name');
      return response.data.value;
    },
  });

  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const response = await api.get<{ value: Class[] }>('/classes?$orderby=Name');
      return response.data.value;
    },
  });

  // Filter accounts for expense categories and payment accounts
  const expenseAccounts = accounts?.filter(
    (acc) => acc.Type === 'Expense' || acc.Type === 'Cost of Goods Sold'
  ) || [];

  const paymentAccounts = accounts?.filter(
    (acc) => acc.Type === 'Bank' || acc.Type === 'Credit Card' || acc.Type === 'Asset'
  ) || [];

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting: formIsSubmitting },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      ExpenseDate: new Date().toISOString().split('T')[0],
      Status: 'Recorded',
      IsReimbursable: false,
      IsPersonal: false,
      Amount: 0,
      ...initialValues,
    },
  });

  const isReimbursable = useWatch({ control, name: 'IsReimbursable' });
  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type.startsWith('image/') || file.type === 'application/pdf'
    );
    addFiles(files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addFiles = (files: File[]) => {
    const newReceipts = files.map((file) => ({
      file,
      preview: file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : '/pdf-icon.png', // Placeholder for PDFs
    }));
    setReceipts((prev) => [...prev, ...newReceipts]);
  };

  const removeReceipt = (index: number) => {
    setReceipts((prev) => {
      const receipt = prev[index];
      if (receipt.preview.startsWith('blob:')) {
        URL.revokeObjectURL(receipt.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      receipts.forEach((receipt) => {
        if (receipt.preview.startsWith('blob:')) {
          URL.revokeObjectURL(receipt.preview);
        }
      });
    };
  }, []);

  const handleFormSubmit = async (data: ExpenseFormData) => {
    // Clear VendorId if using quick vendor entry
    if (useQuickVendor) {
      data.VendorId = null;
    } else {
      data.VendorName = null;
    }

    await onSubmit(data, receipts.map((r) => r.file));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate('/expenses')}
          className="mr-4 text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Receipt Upload Area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Receipt(s)
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Receipt className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              Drag and drop receipt images or PDFs here, or click to browse
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Supports JPG, PNG, and PDF files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Receipt Previews */}
          {receipts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-4">
              {receipts.map((receipt, index) => (
                <div
                  key={index}
                  className="relative group w-24 h-24 border rounded-lg overflow-hidden"
                >
                  {receipt.file.type.startsWith('image/') ? (
                    <img
                      src={receipt.preview}
                      alt={receipt.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <span className="text-xs text-gray-600 text-center px-1 truncate">
                        {receipt.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeReceipt(index);
                    }}
                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Date and Amount */}
          <div>
            <label htmlFor="ExpenseDate" className="block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              id="ExpenseDate"
              type="date"
              {...register('ExpenseDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.ExpenseDate && (
              <p className="mt-1 text-sm text-red-600">{errors.ExpenseDate.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="Amount" className="block text-sm font-medium text-gray-700">
              Amount
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                id="Amount"
                type="number"
                step="0.01"
                {...register('Amount', { valueAsNumber: true })}
                className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                placeholder="0.00"
              />
            </div>
            {errors.Amount && (
              <p className="mt-1 text-sm text-red-600">{errors.Amount.message}</p>
            )}
          </div>

          {/* Vendor Selection */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Vendor / Payee
              </label>
              <button
                type="button"
                onClick={() => {
                  setUseQuickVendor(!useQuickVendor);
                  if (!useQuickVendor) {
                    setValue('VendorId', null);
                  } else {
                    setValue('VendorName', null);
                  }
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                {useQuickVendor ? 'Select from list' : 'Enter name manually'}
              </button>
            </div>
            {useQuickVendor ? (
              <input
                type="text"
                {...register('VendorName')}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                placeholder="Enter vendor name..."
              />
            ) : (
              <select
                {...register('VendorId')}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              >
                <option value="">Select a vendor (optional)...</option>
                {vendors?.map((vendor) => (
                  <option key={vendor.Id} value={vendor.Id}>
                    {vendor.Name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Expense Category */}
          <div>
            <label htmlFor="AccountId" className="block text-sm font-medium text-gray-700">
              Category / Account
            </label>
            <select
              id="AccountId"
              {...register('AccountId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select a category...</option>
              {expenseAccounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name}
                </option>
              ))}
            </select>
            {errors.AccountId && (
              <p className="mt-1 text-sm text-red-600">{errors.AccountId.message}</p>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label htmlFor="PaymentMethod" className="block text-sm font-medium text-gray-700">
              Payment Method
            </label>
            <select
              id="PaymentMethod"
              {...register('PaymentMethod')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select method...</option>
              <option value="Cash">Cash</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Debit Card">Debit Card</option>
              <option value="Check">Check</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Payment Account */}
          <div>
            <label htmlFor="PaymentAccountId" className="block text-sm font-medium text-gray-700">
              Paid From Account
            </label>
            <select
              id="PaymentAccountId"
              {...register('PaymentAccountId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select account...</option>
              {paymentAccounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name} ({account.Type})
                </option>
              ))}
            </select>
          </div>

          {/* Reference */}
          <div>
            <label htmlFor="Reference" className="block text-sm font-medium text-gray-700">
              Reference / Check #
            </label>
            <input
              id="Reference"
              type="text"
              {...register('Reference')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="Check # or transaction ID"
            />
          </div>

          {/* Description */}
          <div className="sm:col-span-2">
            <label htmlFor="Description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="Description"
              {...register('Description')}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="What was this expense for?"
            />
          </div>

          {/* Personal and Reimbursable Checkboxes */}
          <div className="sm:col-span-2 space-y-3">
            <div className="flex items-center">
              <input
                id="IsPersonal"
                type="checkbox"
                {...register('IsPersonal')}
                className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
              />
              <label htmlFor="IsPersonal" className="ml-2 block text-sm text-gray-900">
                This is a personal expense (not business-related)
              </label>
            </div>
            <div className="flex items-center">
              <input
                id="IsReimbursable"
                type="checkbox"
                {...register('IsReimbursable')}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="IsReimbursable" className="ml-2 block text-sm text-gray-900">
                This is a reimbursable expense
              </label>
            </div>
          </div>

          {/* Customer (for billable expenses) */}
          {isReimbursable && (
            <div>
              <label htmlFor="CustomerId" className="block text-sm font-medium text-gray-700">
                Bill to Customer (optional)
              </label>
              <select
                id="CustomerId"
                {...register('CustomerId')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              >
                <option value="">Select customer...</option>
                {customers?.map((customer) => (
                  <option key={customer.Id} value={customer.Id}>
                    {customer.Name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Project */}
          <div>
            <label htmlFor="ProjectId" className="block text-sm font-medium text-gray-700">
              Project (optional)
            </label>
            <select
              id="ProjectId"
              {...register('ProjectId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select project...</option>
              {projects?.map((project) => (
                <option key={project.Id} value={project.Id}>
                  {project.Name}
                </option>
              ))}
            </select>
          </div>

          {/* Class */}
          <div>
            <label htmlFor="ClassId" className="block text-sm font-medium text-gray-700">
              Class (optional)
            </label>
            <select
              id="ClassId"
              {...register('ClassId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select class...</option>
              {classes?.map((cls) => (
                <option key={cls.Id} value={cls.Id}>
                  {cls.Name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/expenses')}
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
