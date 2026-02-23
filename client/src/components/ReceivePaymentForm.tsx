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
import CustomerSelector from './CustomerSelector';
import api from '../lib/api';

// Payment methods available
const PAYMENT_METHODS = [
  'Cash',
  'Check',
  'Credit Card',
  'Debit Card',
  'ACH/Bank Transfer',
  'Wire Transfer',
  'Other'
] as const;

// Schema for payment form
export const receivePaymentSchema = z.object({
  PaymentNumber: z.string().min(1, 'Payment number is required'),
  CustomerId: z.string().uuid('Please select a customer'),
  PaymentDate: z.string().min(1, 'Payment date is required'),
  TotalAmount: z.number().min(0.01, 'Amount must be greater than 0'),
  PaymentMethod: z.string().min(1, 'Payment method is required'),
  DepositAccountId: z.string().uuid('Please select a deposit account'),
  ReferenceNumber: z.string().nullish(),
  Memo: z.string().nullish(),
  Applications: z.array(z.object({
    InvoiceId: z.string().uuid('Please select an invoice'),
    AmountApplied: z.number().min(0, 'Amount must be positive'),
    InvoiceNumber: z.string().optional(),
    InvoiceTotalAmount: z.number().optional(),
    InvoiceBalanceDue: z.number().optional()
  })).min(1, 'At least one invoice application is required')
});

export type ReceivePaymentFormData = z.infer<typeof receivePaymentSchema>;

interface Account {
  Id: string;
  Name: string;
  Type: string;
  AccountNumber: string | null;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  TotalAmount: number;
  AmountPaid: number;
  BalanceDue: number;
  Status: string;
  DueDate: string;
}

interface ReceivePaymentFormProps {
  initialValues?: Partial<ReceivePaymentFormData>;
  onSubmit: (data: ReceivePaymentFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
  headerActions?: ReactNode;
}

export default function ReceivePaymentForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting: externalIsSubmitting,
  submitButtonText = 'Receive Payment',
  headerActions
}: ReceivePaymentFormProps) {
  const navigate = useNavigate();

  // Fetch bank accounts (Asset type, typically Bank subtype)
  const { data: bankAccounts } = useQuery({
    queryKey: ['accounts-bank'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get("/accounts?$filter=Type eq 'Asset' and IsActive eq true&$orderby=Name");
      return response.data.value;
    }
  });

  const { register, control, handleSubmit, setValue, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<ReceivePaymentFormData>({
    resolver: zodResolver(receivePaymentSchema),
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

  const watchedCustomerId = watch('CustomerId');
  const watchedApplications = watch('Applications');

  // Fetch unpaid invoices for the selected customer
  const { data: unpaidInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices-unpaid', watchedCustomerId],
    queryFn: async (): Promise<Invoice[]> => {
      if (!watchedCustomerId) return [];
      const response = await api.get(
        `/invoices?$filter=CustomerId eq ${watchedCustomerId} and Status ne 'Paid' and Status ne 'Draft'&$orderby=DueDate`
      );
      return response.data.value;
    },
    enabled: !!watchedCustomerId
  });

  // Calculate total amount from applications
  const calculatedTotal = useMemo(() => {
    return watchedApplications?.reduce((sum, app) => sum + (app.AmountApplied || 0), 0) || 0;
  }, [watchedApplications]);

  // Update total amount when applications change
  useEffect(() => {
    setValue('TotalAmount', Math.round(calculatedTotal * 100) / 100);
  }, [calculatedTotal, setValue]);

  // Clear applications when customer changes
  useEffect(() => {
    if (watchedCustomerId && fields.length > 0) {
      // Check if any existing applications are for a different customer
      const existingInvoiceIds = fields.map(f => f.InvoiceId);
      const customerInvoiceIds = unpaidInvoices?.map(i => i.Id) || [];
      const hasInvalidApplications = existingInvoiceIds.some(id => !customerInvoiceIds.includes(id));

      if (hasInvalidApplications && unpaidInvoices?.length) {
        // Clear applications for different customer
        while (fields.length > 0) {
          remove(0);
        }
      }
    }
  }, [watchedCustomerId, unpaidInvoices]);

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  // Get invoices that haven't been added yet
  const availableInvoices = useMemo(() => {
    const appliedInvoiceIds = new Set(watchedApplications?.map(a => a.InvoiceId) || []);
    return unpaidInvoices?.filter(inv => !appliedInvoiceIds.has(inv.Id)) || [];
  }, [unpaidInvoices, watchedApplications]);

  const handleAddInvoice = (invoice: Invoice) => {
    append({
      InvoiceId: invoice.Id,
      AmountApplied: invoice.BalanceDue,
      InvoiceNumber: invoice.InvoiceNumber,
      InvoiceTotalAmount: invoice.TotalAmount,
      InvoiceBalanceDue: invoice.BalanceDue
    });
  };

  // Real-time overpayment detection (no useMemo — needs to react to every render)
  const overpaymentErrors: { index: number; applied: number; balance: number }[] = [];
  fields.forEach((field, index) => {
    const applied = watchedApplications?.[index]?.AmountApplied ?? 0;
    const balance = field.InvoiceBalanceDue ?? 0;
    if (balance > 0 && applied > balance) {
      overpaymentErrors.push({ index, applied, balance });
    }
  });
  const hasOverpayment = overpaymentErrors.length > 0;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getAgingInfo = (dueDateStr: string): { label: string; className: string } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysOverdue <= 0) return { label: 'Current', className: 'text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30' };
    if (daysOverdue <= 30) return { label: `${daysOverdue}d overdue`, className: 'text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30' };
    if (daysOverdue <= 60) return { label: `${daysOverdue}d overdue`, className: 'text-orange-700 bg-orange-100 dark:text-orange-300 dark:bg-orange-900/30' };
    return { label: `${daysOverdue}d overdue`, className: 'text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30' };
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
                placeholder="PMT-001"
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                size="small"
                fullWidth
              />
            )}
          />

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
            name="ReferenceNumber"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label="Reference Number"
                placeholder="Check #, transaction ID, etc."
                size="small"
                fullWidth
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
            name="DepositAccountId"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                select
                label="Deposit To Account"
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

        {/* Invoice Applications */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Apply to Invoices</h3>
          </div>

          {!watchedCustomerId ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-md dark:text-gray-400 dark:bg-gray-700">
              Select a customer to see their unpaid invoices
            </div>
          ) : isLoadingInvoices ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading invoices...</div>
          ) : (
            <>
              {/* Available Invoices */}
              {availableInvoices.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Available Invoices</h4>
                  <div className="bg-gray-50 rounded-md overflow-hidden dark:bg-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                      <thead className="bg-gray-100 dark:bg-gray-600">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Invoice #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Due Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Aging</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Balance Due</th>
                          <th className="px-4 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {availableInvoices.map(invoice => (
                          <tr key={invoice.Id}>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{invoice.InvoiceNumber}</td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{formatDate(invoice.DueDate)}</td>
                            <td className="px-4 py-2 text-sm">
                              {(() => {
                                const aging = getAgingInfo(invoice.DueDate);
                                return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${aging.className}`}>{aging.label}</span>;
                              })()}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 text-right">${invoice.TotalAmount.toFixed(2)}</td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 text-right">${invoice.BalanceDue.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleAddInvoice(invoice)}
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

              {/* Applied Invoices */}
              {fields.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2 dark:text-gray-300">Payment Applied To</h4>
                  <div className="space-y-3">
                    {fields.map((field, index) => {
                      const { ref, ...rest } = register(`Applications.${index}.AmountApplied`, { valueAsNumber: true });
                      return (
                        <div key={field.id} className="bg-indigo-50 p-4 rounded-md flex items-center gap-4 dark:bg-indigo-950">
                          <input type="hidden" {...register(`Applications.${index}.InvoiceId`)} />
                          <div className="flex-grow">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Invoice #{field.InvoiceNumber}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Balance due: ${(field.InvoiceBalanceDue || 0).toFixed(2)}
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
                              error={!!errors.Applications?.[index]?.AmountApplied || overpaymentErrors.some(e => e.index === index)}
                              helperText={errors.Applications?.[index]?.AmountApplied?.message || (overpaymentErrors.find(e => e.index === index) ? `Amount exceeds balance due ($${(field.InvoiceBalanceDue || 0).toFixed(2)})` : undefined)}
                              slotProps={{
                                input: {
                                  startAdornment: <InputAdornment position="start">$</InputAdornment>
                                },
                                htmlInput: { step: '0.01', min: '0', max: field.InvoiceBalanceDue || undefined }
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

              {fields.length === 0 && availableInvoices.length === 0 && (
                <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-md dark:text-gray-400 dark:bg-gray-700">
                  No unpaid invoices found for this customer
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
            disabled={isSubmitting || fields.length === 0 || hasOverpayment}
          >
            {isSubmitting ? 'Processing...' : submitButtonText}
          </Button>
        </div>
      </form>
    </div>
  );
}
