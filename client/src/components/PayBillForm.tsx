import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, ReactNode, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import VendorSelector from './VendorSelector';
import api from '../lib/api';

// Payment methods available
const PAYMENT_METHODS = [
  'Check',
  'ACH/Bank Transfer',
  'Credit Card',
  'Wire Transfer',
  'Cash',
  'Other'
] as const;

// Schema for bill payment form
export const payBillSchema = z.object({
  PaymentNumber: z.string().min(1, 'Payment number is required'),
  VendorId: z.string().uuid('Please select a vendor'),
  PaymentDate: z.string().min(1, 'Payment date is required'),
  TotalAmount: z.number().min(0.01, 'Amount must be greater than 0'),
  PaymentMethod: z.string().min(1, 'Payment method is required'),
  PaymentAccountId: z.string().uuid('Please select a payment account'),
  Memo: z.string().nullish(),
  Applications: z.array(z.object({
    BillId: z.string().uuid('Please select a bill'),
    AmountApplied: z.number().min(0, 'Amount must be positive'),
    BillNumber: z.string().optional(),
    BillTotalAmount: z.number().optional(),
    BillBalanceDue: z.number().optional()
  })).min(1, 'At least one bill application is required')
});

export type PayBillFormData = z.infer<typeof payBillSchema>;

interface Account {
  Id: string;
  Name: string;
  Type: string;
  AccountNumber: string | null;
}

interface Bill {
  Id: string;
  BillNumber: string;
  VendorId: string;
  VendorName: string;
  TotalAmount: number;
  AmountPaid: number;
  BalanceDue: number;
  Status: string;
  DueDate: string;
}

interface PayBillFormProps {
  initialValues?: Partial<PayBillFormData>;
  onSubmit: (data: PayBillFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
  headerActions?: ReactNode;
}

export default function PayBillForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting: externalIsSubmitting,
  submitButtonText = 'Pay Bills',
  headerActions
}: PayBillFormProps) {
  const navigate = useNavigate();

  // Fetch bank accounts (Asset type for payment)
  const { data: bankAccounts } = useQuery({
    queryKey: ['accounts-bank'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get("/accounts?$filter=Type eq 'Asset' and Status eq 'Active'&$orderby=Name");
      return response.data.value;
    }
  });

  const { register, control, handleSubmit, setValue, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<PayBillFormData>({
    resolver: zodResolver(payBillSchema),
    defaultValues: {
      PaymentDate: new Date().toISOString().split('T')[0],
      PaymentMethod: 'Check',
      TotalAmount: 0,
      Applications: [],
      ...initialValues
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Applications"
  });

  const watchedVendorId = watch('VendorId');
  const watchedApplications = watch('Applications');

  // Fetch unpaid bills for the selected vendor
  const { data: unpaidBills, isLoading: isLoadingBills } = useQuery({
    queryKey: ['bills-unpaid', watchedVendorId],
    queryFn: async (): Promise<Bill[]> => {
      if (!watchedVendorId) return [];
      const response = await api.get(
        `/bills?$filter=VendorId eq ${watchedVendorId} and Status ne 'Paid'&$orderby=DueDate`
      );
      return response.data.value;
    },
    enabled: !!watchedVendorId
  });

  // Calculate total amount from applications
  const calculatedTotal = useMemo(() => {
    return watchedApplications?.reduce((sum, app) => sum + (app.AmountApplied || 0), 0) || 0;
  }, [watchedApplications]);

  // Update total amount when applications change
  useEffect(() => {
    setValue('TotalAmount', Math.round(calculatedTotal * 100) / 100);
  }, [calculatedTotal, setValue]);

  // Clear applications when vendor changes
  useEffect(() => {
    if (watchedVendorId && fields.length > 0) {
      // Check if any existing applications are for a different vendor
      const existingBillIds = fields.map(f => f.BillId);
      const vendorBillIds = unpaidBills?.map(b => b.Id) || [];
      const hasInvalidApplications = existingBillIds.some(id => !vendorBillIds.includes(id));

      if (hasInvalidApplications && unpaidBills?.length) {
        // Clear applications for different vendor
        while (fields.length > 0) {
          remove(0);
        }
      }
    }
  }, [watchedVendorId, unpaidBills]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  // Get bills that haven't been added yet
  const availableBills = useMemo(() => {
    const appliedBillIds = new Set(watchedApplications?.map(a => a.BillId) || []);
    return unpaidBills?.filter(bill => !appliedBillIds.has(bill.Id)) || [];
  }, [unpaidBills, watchedApplications]);

  const handleAddBill = (bill: Bill) => {
    append({
      BillId: bill.Id,
      AmountApplied: bill.BalanceDue,
      BillNumber: bill.BillNumber,
      BillTotalAmount: bill.TotalAmount,
      BillBalanceDue: bill.BalanceDue
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        </div>
        {headerActions && <div className="flex items-center">{headerActions}</div>}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Controller
            name="PaymentNumber"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Payment Number"
                required
                placeholder="BP-001"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

          <Controller
            name="VendorId"
            control={control}
            render={({ field }) => (
              <VendorSelector
                value={field.value || ''}
                onChange={field.onChange}
                error={errors.VendorId?.message}
                disabled={isSubmitting}
              />
            )}
          />

          <Controller
            name="PaymentDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                label="Payment Date"
                type="date"
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
            name="PaymentMethod"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                select
                label="Payment Method"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                {PAYMENT_METHODS.map(method => (
                  <MenuItem key={method} value={method}>{method}</MenuItem>
                ))}
              </TextField>
            )}
          />

          <Controller
            name="PaymentAccountId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Pay From Account"
                required
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              >
                <MenuItem value="">Select an account</MenuItem>
                {bankAccounts?.map(account => (
                  <MenuItem key={account.Id} value={account.Id}>
                    {account.Name} {account.AccountNumber ? `(${account.AccountNumber})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />

          <div>
            <div className="text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Total Amount</div>
            <div className="block w-full rounded-md border-gray-300 bg-gray-50 p-2 text-lg font-semibold text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              ${calculatedTotal.toFixed(2)}
            </div>
            <input type="hidden" {...register('TotalAmount', { valueAsNumber: true })} />
          </div>

          <div className="sm:col-span-2">
            <Controller
              name="Memo"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="Memo"
                  multiline
                  rows={2}
                  placeholder="Optional notes about this payment"
                  size="small"
                  fullWidth
                />
              )}
            />
          </div>
        </div>

        {/* Bill Applications */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Apply to Bills</h3>
          </div>

          {!watchedVendorId ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-md dark:text-gray-400 dark:bg-gray-700">
              Select a vendor to see their unpaid bills
            </div>
          ) : isLoadingBills ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading bills...</div>
          ) : (
            <>
              {/* Available Bills */}
              {availableBills.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Available Bills</h4>
                  <div className="bg-gray-50 rounded-md overflow-hidden dark:bg-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                      <thead className="bg-gray-100 dark:bg-gray-600">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Bill #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Due Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Balance Due</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {availableBills.map(bill => (
                          <tr key={bill.Id}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{bill.BillNumber}</td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{formatDate(bill.DueDate)}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 text-right">${bill.TotalAmount.toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 text-right">${bill.BalanceDue.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleAddBill(bill)}
                                className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded dark:text-indigo-300 dark:bg-indigo-900 dark:hover:bg-indigo-800"
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Apply
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Applied Bills */}
              {fields.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Payment Applied To</h4>
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const { ref, ...rest } = register(`Applications.${index}.AmountApplied`, { valueAsNumber: true });
                      return (
                        <div key={field.id} className="bg-green-50 p-4 rounded-md flex items-center gap-4 dark:bg-green-950">
                          <div className="flex-grow">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Bill #{field.BillNumber}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Balance due: ${(field.BillBalanceDue || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="w-40">
                            <TextField
                              {...rest}
                              inputRef={ref}
                              type="number"
                              label="Amount to Apply"
                              size="small"
                              fullWidth
                              slotProps={{
                                input: {
                                  startAdornment: <InputAdornment position="start">$</InputAdornment>
                                },
                                htmlInput: { step: '0.01', min: '0', max: field.BillBalanceDue || undefined }
                              }}
                            />
                          </div>
                          <IconButton
                            onClick={() => remove(index)}
                            color="error"
                            size="small"
                          >
                            <Trash2 className="w-5 h-5" />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {fields.length === 0 && availableBills.length === 0 && (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-md dark:text-gray-400 dark:bg-gray-700">
                  No unpaid bills found for this vendor
                </div>
              )}
            </>
          )}

          {errors.Applications && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.Applications.message}</p>
          )}
        </div>

        {/* Totals Section */}
        <div className="border-t pt-4 dark:border-gray-600">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-gray-900 dark:text-gray-100">Total Payment:</span>
                <span className="text-gray-900 dark:text-gray-100">${calculatedTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end items-center border-t pt-4 dark:border-gray-600">
          <Button
            variant="outlined"
            onClick={() => navigate(-1)}
            sx={{ mr: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting || fields.length === 0}
          >
            {isSubmitting ? 'Processing...' : submitButtonText}
          </Button>
        </div>
      </form>
    </div>
  );
}
