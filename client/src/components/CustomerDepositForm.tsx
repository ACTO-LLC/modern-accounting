import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
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

// Schema for deposit form
export const customerDepositSchema = z.object({
  DepositNumber: z.string().min(1, 'Deposit number is required'),
  CustomerId: z.string().uuid('Please select a customer'),
  DepositDate: z.string().min(1, 'Deposit date is required'),
  Amount: z.number().min(0.01, 'Amount must be greater than 0'),
  DepositAccountId: z.string().uuid('Please select a deposit account'),
  LiabilityAccountId: z.string().uuid('Please select a liability account'),
  PaymentMethod: z.string().min(1, 'Payment method is required'),
  Reference: z.string().nullish(),
  Memo: z.string().nullish(),
  ProjectId: z.string().nullish(),
  EstimateId: z.string().nullish(),
});

export type CustomerDepositFormData = z.infer<typeof customerDepositSchema>;

interface Account {
  Id: string;
  Name: string;
  Type: string;
  AccountNumber: string | null;
}

interface Project {
  Id: string;
  Name: string;
  CustomerId: string;
}

interface Estimate {
  Id: string;
  EstimateNumber: string;
  CustomerId: string;
  TotalAmount: number;
  Status: string;
}

interface CustomerDepositFormProps {
  initialValues?: Partial<CustomerDepositFormData>;
  onSubmit: (data: CustomerDepositFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
  headerActions?: ReactNode;
}

export default function CustomerDepositForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting: externalIsSubmitting,
  submitButtonText = 'Receive Deposit',
  headerActions
}: CustomerDepositFormProps) {
  const navigate = useNavigate();

  // Fetch bank accounts (Asset type)
  const { data: bankAccounts } = useQuery({
    queryKey: ['accounts-bank'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get("/accounts?$filter=Type eq 'Asset' and Status eq 'Active'&$orderby=Name");
      return response.data.value;
    }
  });

  // Fetch liability accounts (for Unearned Revenue)
  const { data: liabilityAccounts } = useQuery({
    queryKey: ['accounts-liability'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get("/accounts?$filter=Type eq 'Liability' and Status eq 'Active'&$orderby=Name");
      return response.data.value;
    }
  });

  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting: formIsSubmitting } } = useForm<CustomerDepositFormData>({
    resolver: zodResolver(customerDepositSchema),
    defaultValues: {
      DepositDate: new Date().toISOString().split('T')[0],
      PaymentMethod: 'Check',
      Amount: 0,
      ...initialValues
    }
  });

  const watchedCustomerId = watch('CustomerId');

  // Fetch projects for the selected customer
  const { data: projects } = useQuery({
    queryKey: ['projects', watchedCustomerId],
    queryFn: async (): Promise<Project[]> => {
      if (!watchedCustomerId) return [];
      const response = await api.get(`/projects?$filter=CustomerId eq ${watchedCustomerId} and Status eq 'Active'&$orderby=Name`);
      return response.data.value;
    },
    enabled: !!watchedCustomerId
  });

  // Fetch estimates for the selected customer that are not yet converted
  const { data: estimates } = useQuery({
    queryKey: ['estimates-open', watchedCustomerId],
    queryFn: async (): Promise<Estimate[]> => {
      if (!watchedCustomerId) return [];
      const response = await api.get(`/estimates?$filter=CustomerId eq ${watchedCustomerId} and Status eq 'Accepted'&$orderby=EstimateNumber`);
      return response.data.value;
    },
    enabled: !!watchedCustomerId
  });

  const isSubmitting = externalIsSubmitting || formIsSubmitting;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        </div>
        {headerActions && <div className="flex items-center">{headerActions}</div>}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="DepositNumber" className="block text-sm font-medium text-gray-700">Deposit Number</label>
            <input
              id="DepositNumber"
              type="text"
              {...register('DepositNumber')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="DEP-001"
            />
            {errors.DepositNumber && <p className="mt-1 text-sm text-red-600">{errors.DepositNumber.message}</p>}
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
            <label htmlFor="DepositDate" className="block text-sm font-medium text-gray-700">Deposit Date</label>
            <input
              id="DepositDate"
              type="date"
              {...register('DepositDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.DepositDate && <p className="mt-1 text-sm text-red-600">{errors.DepositDate.message}</p>}
          </div>

          <div>
            <label htmlFor="Amount" className="block text-sm font-medium text-gray-700">Amount</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-gray-500 sm:text-sm">$</span>
              </div>
              <input
                id="Amount"
                type="number"
                step="0.01"
                min="0.01"
                {...register('Amount', { valueAsNumber: true })}
                className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                placeholder="0.00"
              />
            </div>
            {errors.Amount && <p className="mt-1 text-sm text-red-600">{errors.Amount.message}</p>}
          </div>

          <div>
            <label htmlFor="PaymentMethod" className="block text-sm font-medium text-gray-700">Payment Method</label>
            <select
              id="PaymentMethod"
              {...register('PaymentMethod')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              {PAYMENT_METHODS.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
            {errors.PaymentMethod && <p className="mt-1 text-sm text-red-600">{errors.PaymentMethod.message}</p>}
          </div>

          <div>
            <label htmlFor="Reference" className="block text-sm font-medium text-gray-700">Reference / Check #</label>
            <input
              id="Reference"
              type="text"
              {...register('Reference')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="Optional reference number"
            />
          </div>

          <div>
            <label htmlFor="DepositAccountId" className="block text-sm font-medium text-gray-700">Deposit To Account</label>
            <select
              id="DepositAccountId"
              {...register('DepositAccountId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select bank account</option>
              {bankAccounts?.map(account => (
                <option key={account.Id} value={account.Id}>
                  {account.Name} {account.AccountNumber ? `(${account.AccountNumber})` : ''}
                </option>
              ))}
            </select>
            {errors.DepositAccountId && <p className="mt-1 text-sm text-red-600">{errors.DepositAccountId.message}</p>}
          </div>

          <div>
            <label htmlFor="LiabilityAccountId" className="block text-sm font-medium text-gray-700">
              Liability Account (Unearned Revenue)
            </label>
            <select
              id="LiabilityAccountId"
              {...register('LiabilityAccountId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select liability account</option>
              {liabilityAccounts?.map(account => (
                <option key={account.Id} value={account.Id}>
                  {account.Name} {account.AccountNumber ? `(${account.AccountNumber})` : ''}
                </option>
              ))}
            </select>
            {errors.LiabilityAccountId && <p className="mt-1 text-sm text-red-600">{errors.LiabilityAccountId.message}</p>}
          </div>

          {/* Optional: Link to Project */}
          {watchedCustomerId && projects && projects.length > 0 && (
            <div>
              <label htmlFor="ProjectId" className="block text-sm font-medium text-gray-700">
                Project (Optional)
              </label>
              <select
                id="ProjectId"
                {...register('ProjectId')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              >
                <option value="">No project</option>
                {projects.map(project => (
                  <option key={project.Id} value={project.Id}>
                    {project.Name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Optional: Link to Estimate */}
          {watchedCustomerId && estimates && estimates.length > 0 && (
            <div>
              <label htmlFor="EstimateId" className="block text-sm font-medium text-gray-700">
                Estimate (Optional)
              </label>
              <select
                id="EstimateId"
                {...register('EstimateId')}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              >
                <option value="">No estimate</option>
                {estimates.map(estimate => (
                  <option key={estimate.Id} value={estimate.Id}>
                    {estimate.EstimateNumber} (${estimate.TotalAmount.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-2">
            <label htmlFor="Memo" className="block text-sm font-medium text-gray-700">Memo</label>
            <textarea
              id="Memo"
              {...register('Memo')}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="Optional notes about this deposit"
            />
          </div>
        </div>

        {/* Info box about journal entry */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2">Journal Entry Preview</h4>
          <p className="text-sm text-blue-700">
            This deposit will create a journal entry:
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1">
            <li><strong>Debit:</strong> Selected bank account (Asset increases)</li>
            <li><strong>Credit:</strong> Unearned Revenue (Liability increases)</li>
          </ul>
          <p className="text-sm text-blue-600 mt-2 italic">
            When applied to an invoice, the liability is reversed and revenue is recognized.
          </p>
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Processing...' : submitButtonText}
          </button>
        </div>
      </form>
    </div>
  );
}
