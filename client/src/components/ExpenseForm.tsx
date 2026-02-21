import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, X, Receipt } from 'lucide-react';
import { useRef, useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';

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

  // Amount uses register with valueAsNumber — destructure ref for inputRef pattern
  const { ref: amountRef, ...amountRest } = register('Amount', { valueAsNumber: true });

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
          className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        {/* Receipt Upload Area */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Receipt(s)
          </label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-indigo-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Receipt className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Drag and drop receipt images or PDFs here, or click to browse
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                    <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-600">
                      <span className="text-xs text-gray-600 dark:text-gray-400 text-center px-1 truncate">
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
          <Controller
            name="ExpenseDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                type="date"
                label="Date"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />

          <TextField
            {...amountRest}
            inputRef={amountRef}
            type="number"
            label="Amount"
            required
            placeholder="0.00"
            error={!!errors.Amount}
            helperText={errors.Amount?.message}
            size="small"
            fullWidth
            slotProps={{
              htmlInput: { step: '0.01' },
              input: {
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              },
            }}
          />

          {/* Vendor Selection */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Vendor / Payee
              </span>
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
                className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                {useQuickVendor ? 'Select from list' : 'Enter name manually'}
              </button>
            </div>
            {useQuickVendor ? (
              <Controller
                name="VendorName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label="Vendor Name"
                    placeholder="Enter vendor name..."
                    size="small"
                    fullWidth
                  />
                )}
              />
            ) : (
              <Controller
                name="VendorId"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    select
                    label="Vendor"
                    size="small"
                    fullWidth
                  >
                    <MenuItem value="">Select a vendor (optional)...</MenuItem>
                    {vendors?.map((vendor) => (
                      <MenuItem key={vendor.Id} value={vendor.Id}>
                        {vendor.Name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            )}
          </div>

          {/* Expense Category */}
          <Controller
            name="AccountId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Category / Account"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select a category...</MenuItem>
                {expenseAccounts.map((account) => (
                  <MenuItem key={account.Id} value={account.Id}>
                    {account.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {/* Payment Method */}
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
                <MenuItem value="">Select method...</MenuItem>
                <MenuItem value="Cash">Cash</MenuItem>
                <MenuItem value="Credit Card">Credit Card</MenuItem>
                <MenuItem value="Debit Card">Debit Card</MenuItem>
                <MenuItem value="Check">Check</MenuItem>
                <MenuItem value="Bank Transfer">Bank Transfer</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </TextField>
            )}
          />

          {/* Payment Account */}
          <Controller
            name="PaymentAccountId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Paid From Account"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select account...</MenuItem>
                {paymentAccounts.map((account) => (
                  <MenuItem key={account.Id} value={account.Id}>
                    {account.Name} ({account.Type})
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {/* Reference */}
          <Controller
            name="Reference"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Reference / Check #"
                placeholder="Check # or transaction ID"
                size="small"
                fullWidth
              />
            )}
          />

          {/* Description */}
          <div className="sm:col-span-2">
            <Controller
              name="Description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Description"
                  multiline
                  rows={2}
                  placeholder="What was this expense for?"
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>

          {/* Personal and Reimbursable Checkboxes */}
          <div className="sm:col-span-2 space-y-1">
            <Controller
              name="IsPersonal"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value ?? false} />}
                  label="This is a personal expense (not business-related)"
                />
              )}
            />
            <Controller
              name="IsReimbursable"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Checkbox {...field} checked={field.value ?? false} />}
                  label="This is a reimbursable expense"
                />
              )}
            />
          </div>

          {/* Customer (for billable expenses) */}
          {isReimbursable && (
            <Controller
              name="CustomerId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  select
                  label="Bill to Customer (optional)"
                  size="small"
                  fullWidth
                >
                  <MenuItem value="">Select customer...</MenuItem>
                  {customers?.map((customer) => (
                    <MenuItem key={customer.Id} value={customer.Id}>
                      {customer.Name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}

          {/* Project */}
          <Controller
            name="ProjectId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Project (optional)"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select project...</MenuItem>
                {projects?.map((project) => (
                  <MenuItem key={project.Id} value={project.Id}>
                    {project.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          {/* Class */}
          <Controller
            name="ClassId"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Class (optional)"
                size="small"
                fullWidth
              >
                <MenuItem value="">Select class...</MenuItem>
                {classes?.map((cls) => (
                  <MenuItem key={cls.Id} value={cls.Id}>
                    {cls.Name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <Button
            variant="outlined"
            onClick={() => navigate('/expenses')}
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
