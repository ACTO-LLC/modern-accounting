import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import AddressFields, { AddressFieldValues } from './AddressFields';

export const vendorSchema = z.object({
  Name: z.string().min(1, 'Name is required'),
  Email: z.string().email('Invalid email address').optional().or(z.literal('')),
  Phone: z.string().optional(),
  // Separate address fields (use .nullish() for API compatibility - see CLAUDE.md)
  AddressLine1: z.string().nullish(),
  AddressLine2: z.string().nullish(),
  City: z.string().nullish(),
  State: z.string().nullish(),
  PostalCode: z.string().nullish(),
  Country: z.string().nullish(),
  // Legacy field for backward compatibility
  Address: z.string().optional(),
  PaymentTerms: z.string().optional(),
  TaxId: z.string().optional(),
  Is1099Vendor: z.boolean().optional(),
  DefaultExpenseAccountId: z.string().uuid().optional().nullable(),
  Status: z.enum(['Active', 'Inactive']).optional(),
});

export type VendorFormData = z.infer<typeof vendorSchema> & AddressFieldValues;

interface VendorFormProps {
  initialValues?: Partial<VendorFormData>;
  onSubmit: (data: VendorFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function VendorForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting,
  submitButtonText = 'Save Vendor',
}: VendorFormProps) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      ...initialValues,
      Is1099Vendor: initialValues?.Is1099Vendor ?? false,
      Status: initialValues?.Status ?? 'Active',
    },
  });

  // Fetch expense accounts for the dropdown
  const { data: accounts } = useQuery({
    queryKey: ['accounts', 'expense'],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(
        "/accounts?$filter=Type eq 'Expense'"
      );
      return response.data.value;
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button
          onClick={() => navigate('/vendors')}
          className="mr-4 text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white shadow rounded-lg p-6 space-y-6"
      >
        <div>
          <label
            htmlFor="Name"
            className="block text-sm font-medium text-gray-700"
          >
            Name
          </label>
          <input
            id="Name"
            type="text"
            {...register('Name')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Name && (
            <p className="mt-1 text-sm text-red-600">{errors.Name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="Email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="Email"
              type="email"
              {...register('Email')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.Email && (
              <p className="mt-1 text-sm text-red-600">{errors.Email.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="Phone"
              className="block text-sm font-medium text-gray-700"
            >
              Phone
            </label>
            <input
              id="Phone"
              type="text"
              {...register('Phone')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.Phone && (
              <p className="mt-1 text-sm text-red-600">{errors.Phone.message}</p>
            )}
          </div>
        </div>

        {/* Address Section */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Address</h3>
          <AddressFields<VendorFormData>
            register={register}
            errors={errors}
            setValue={setValue}
            showLine2={true}
            showCountry={false}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="PaymentTerms"
              className="block text-sm font-medium text-gray-700"
            >
              Payment Terms
            </label>
            <select
              id="PaymentTerms"
              {...register('PaymentTerms')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select payment terms</option>
              <option value="Net 15">Net 15</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 45">Net 45</option>
              <option value="Net 60">Net 60</option>
              <option value="Due on Receipt">Due on Receipt</option>
            </select>
            {errors.PaymentTerms && (
              <p className="mt-1 text-sm text-red-600">
                {errors.PaymentTerms.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="Status"
              className="block text-sm font-medium text-gray-700"
            >
              Status
            </label>
            <select
              id="Status"
              {...register('Status')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            {errors.Status && (
              <p className="mt-1 text-sm text-red-600">{errors.Status.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="TaxId"
              className="block text-sm font-medium text-gray-700"
            >
              Tax ID (EIN/SSN)
            </label>
            <input
              id="TaxId"
              type="text"
              {...register('TaxId')}
              placeholder="XX-XXXXXXX"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.TaxId && (
              <p className="mt-1 text-sm text-red-600">{errors.TaxId.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="DefaultExpenseAccountId"
              className="block text-sm font-medium text-gray-700"
            >
              Default Expense Account
            </label>
            <select
              id="DefaultExpenseAccountId"
              {...register('DefaultExpenseAccountId')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select an account</option>
              {accounts?.map((account: any) => (
                <option key={account.Id} value={account.Id}>
                  {account.AccountNumber} - {account.Name}
                </option>
              ))}
            </select>
            {errors.DefaultExpenseAccountId && (
              <p className="mt-1 text-sm text-red-600">
                {errors.DefaultExpenseAccountId.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center">
          <input
            id="Is1099Vendor"
            type="checkbox"
            {...register('Is1099Vendor')}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label
            htmlFor="Is1099Vendor"
            className="ml-2 block text-sm text-gray-700"
          >
            1099 Vendor (requires tax reporting)
          </label>
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/vendors')}
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
