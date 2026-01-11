import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { customersApi, Customer } from '../lib/api';

export const projectSchema = z.object({
  Name: z.string().min(1, 'Project name is required'),
  CustomerId: z.string().min(1, 'Customer is required'),
  Description: z.string().optional(),
  Status: z.enum(['Active', 'Completed', 'OnHold']).default('Active'),
  StartDate: z.string().optional(),
  EndDate: z.string().optional(),
  BudgetedHours: z.coerce.number().min(0).optional().nullable(),
  BudgetedAmount: z.coerce.number().min(0).optional().nullable(),
});

export type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  initialValues?: Partial<ProjectFormData>;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function ProjectForm({
  initialValues,
  onSubmit,
  title,
  isSubmitting,
  submitButtonText = 'Save Project'
}: ProjectFormProps) {
  const navigate = useNavigate();

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });

  const { register, handleSubmit, formState: { errors } } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      Status: 'Active',
      ...initialValues,
    }
  });

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/projects')} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="Name" className="block text-sm font-medium text-gray-700">Project Name</label>
          <input
            id="Name"
            type="text"
            {...register('Name')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Name && <p className="mt-1 text-sm text-red-600">{errors.Name.message}</p>}
        </div>

        <div>
          <label htmlFor="CustomerId" className="block text-sm font-medium text-gray-700">Customer</label>
          <select
            id="CustomerId"
            {...register('CustomerId')}
            disabled={customersLoading}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          >
            <option value="">Select a customer...</option>
            {customers.map((customer) => (
              <option key={customer.Id} value={customer.Id}>
                {customer.Name}
              </option>
            ))}
          </select>
          {errors.CustomerId && <p className="mt-1 text-sm text-red-600">{errors.CustomerId.message}</p>}
        </div>

        <div>
          <label htmlFor="Description" className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            id="Description"
            rows={3}
            {...register('Description')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
          {errors.Description && <p className="mt-1 text-sm text-red-600">{errors.Description.message}</p>}
        </div>

        <div>
          <label htmlFor="Status" className="block text-sm font-medium text-gray-700">Status</label>
          <select
            id="Status"
            {...register('Status')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          >
            <option value="Active">Active</option>
            <option value="OnHold">On Hold</option>
            <option value="Completed">Completed</option>
          </select>
          {errors.Status && <p className="mt-1 text-sm text-red-600">{errors.Status.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="StartDate" className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              id="StartDate"
              type="date"
              {...register('StartDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.StartDate && <p className="mt-1 text-sm text-red-600">{errors.StartDate.message}</p>}
          </div>

          <div>
            <label htmlFor="EndDate" className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              id="EndDate"
              type="date"
              {...register('EndDate')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.EndDate && <p className="mt-1 text-sm text-red-600">{errors.EndDate.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="BudgetedHours" className="block text-sm font-medium text-gray-700">Budgeted Hours</label>
            <input
              id="BudgetedHours"
              type="number"
              step="0.5"
              min="0"
              {...register('BudgetedHours')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.BudgetedHours && <p className="mt-1 text-sm text-red-600">{errors.BudgetedHours.message}</p>}
          </div>

          <div>
            <label htmlFor="BudgetedAmount" className="block text-sm font-medium text-gray-700">Budgeted Amount ($)</label>
            <input
              id="BudgetedAmount"
              type="number"
              step="0.01"
              min="0"
              {...register('BudgetedAmount')}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
            {errors.BudgetedAmount && <p className="mt-1 text-sm text-red-600">{errors.BudgetedAmount.message}</p>}
          </div>
        </div>

        <div className="flex justify-end items-center border-t pt-4">
          <button
            type="button"
            onClick={() => navigate('/projects')}
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
