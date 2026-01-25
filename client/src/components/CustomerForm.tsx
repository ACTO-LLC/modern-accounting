import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AddressFields, { AddressFieldValues } from './AddressFields';

export const customerSchema = z.object({
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
});

export type CustomerFormData = z.infer<typeof customerSchema> & AddressFieldValues;

interface CustomerFormProps {
  initialValues?: Partial<CustomerFormData>;
  onSubmit: (data: CustomerFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function CustomerForm({ initialValues, onSubmit, title, isSubmitting, submitButtonText = 'Save Customer' }: CustomerFormProps) {
  const navigate = useNavigate();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: initialValues
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/customers')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="Name" className="block text-sm font-medium text-gray-700">Name</label>
          <input
            id="Name"
            type="text"
            {...register('Name')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Name && <p className="mt-1 text-sm text-red-600">{errors.Name.message}</p>}
        </div>

        <div>
          <label htmlFor="Email" className="block text-sm font-medium text-gray-700">Email</label>
          <input
            id="Email"
            type="email"
            {...register('Email')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Email && <p className="mt-1 text-sm text-red-600">{errors.Email.message}</p>}
        </div>

        <div>
          <label htmlFor="Phone" className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            id="Phone"
            type="text"
            {...register('Phone')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Phone && <p className="mt-1 text-sm text-red-600">{errors.Phone.message}</p>}
        </div>

        {/* Address Section */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Address</h3>
          <AddressFields<CustomerFormData>
            register={register}
            errors={errors}
            setValue={setValue}
            showLine2={true}
            showCountry={false}
          />
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/customers')}
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
