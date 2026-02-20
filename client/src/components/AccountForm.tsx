import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;

const subtypesByType: Record<string, string[]> = {
  Asset: ['Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset'],
  Liability: ['Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability'],
  Equity: ['Owners Equity', 'Retained Earnings', 'Opening Balance Equity'],
  Revenue: ['Income', 'Other Income'],
  Expense: ['Expense', 'Other Expense', 'Cost of Goods Sold'],
};

export const accountSchema = z.object({
  Code: z.string().min(1, 'Code is required').max(50, 'Code must be 50 characters or less'),
  Name: z.string().min(1, 'Name is required').max(200, 'Name must be 200 characters or less'),
  Type: z.enum(accountTypes, { required_error: 'Type is required' }),
  Subtype: z.string().optional(),
  AccountNumber: z.string().max(50, 'Account number must be 50 characters or less').optional(),
  Description: z.string().optional(),
  IsActive: z.boolean().optional(),
});

export type AccountFormData = z.infer<typeof accountSchema>;

interface AccountFormProps {
  initialValues?: Partial<AccountFormData>;
  onSubmit: (data: AccountFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function AccountForm({ initialValues, onSubmit, title, isSubmitting, submitButtonText = 'Save Account' }: AccountFormProps) {
  const navigate = useNavigate();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      IsActive: true,
      ...initialValues
    }
  });

  const selectedType = watch('Type');
  const availableSubtypes = selectedType ? subtypesByType[selectedType] || [] : [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/accounts')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="Code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Code *</label>
            <input
              id="Code"
              type="text"
              placeholder="e.g., 1000"
              {...register('Code')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {errors.Code && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Code.message}</p>}
          </div>

          <div>
            <label htmlFor="AccountNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Account Number</label>
            <input
              id="AccountNumber"
              type="text"
              placeholder="Optional"
              {...register('AccountNumber')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            {errors.AccountNumber && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.AccountNumber.message}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="Name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name *</label>
          <input
            id="Name"
            type="text"
            placeholder="e.g., Cash in Bank"
            {...register('Name')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          {errors.Name && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Name.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="Type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type *</label>
            <select
              id="Type"
              {...register('Type')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Select a type...</option>
              {accountTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            {errors.Type && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Type.message}</p>}
          </div>

          <div>
            <label htmlFor="Subtype" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Subtype</label>
            <select
              id="Subtype"
              {...register('Subtype')}
              disabled={!selectedType}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 disabled:bg-gray-100 dark:disabled:bg-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">{selectedType ? 'Select a subtype...' : 'Select type first'}</option>
              {availableSubtypes.map(subtype => (
                <option key={subtype} value={subtype}>{subtype}</option>
              ))}
            </select>
            {errors.Subtype && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Subtype.message}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="Description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea
            id="Description"
            rows={3}
            placeholder="Optional description of the account"
            {...register('Description')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          {errors.Description && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.Description.message}</p>}
        </div>

        <div className="flex items-center">
          <input
            id="IsActive"
            type="checkbox"
            {...register('IsActive')}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="IsActive" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            Active account
          </label>
        </div>

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <button
            type="button"
            onClick={() => navigate('/accounts')}
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
