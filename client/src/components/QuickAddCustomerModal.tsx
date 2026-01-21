import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api, { Customer } from '../lib/api';

const quickCustomerSchema = z.object({
  Name: z.string().min(1, 'Customer name is required'),
  Email: z.string().email('Invalid email address').optional().or(z.literal('')),
  Phone: z.string().optional(),
});

type QuickCustomerFormData = z.infer<typeof quickCustomerSchema>;

interface QuickAddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customerId: string) => void;
}

export default function QuickAddCustomerModal({
  isOpen,
  onClose,
  onCustomerCreated,
}: QuickAddCustomerModalProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<QuickCustomerFormData>({
    resolver: zodResolver(quickCustomerSchema),
    mode: 'onSubmit',
    defaultValues: {
      Name: '',
      Email: '',
      Phone: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: QuickCustomerFormData) => {
      const response = await api.post<{ value: Customer[] }>('/customers', data);
      return response.data.value[0];
    },
    onSuccess: async (newCustomer) => {
      // Add the new customer to the existing query cache immediately
      queryClient.setQueryData<Customer[]>(['customers'], (old) => {
        return old ? [...old, newCustomer] : [newCustomer];
      });
      // Note: Don't invalidate immediately as it would trigger a refetch that may
      // return stale data and overwrite our optimistic update
      onCustomerCreated(newCustomer.Id);
      reset();
      onClose();
    },
    onError: (err) => {
      console.error('Failed to create customer:', err);
      setError('Failed to create customer. Please try again.');
    },
  });

  const onSubmit = (data: QuickCustomerFormData) => {
    // Double-check validation (defensive)
    if (!data.Name || data.Name.trim().length === 0) {
      setError('Customer name is required');
      return;
    }
    setError(null);
    mutation.mutate(data);
  };

  const handleClose = () => {
    reset();
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      data-testid="quick-add-customer-modal"
    >
      {/* Backdrop - handles clicks outside modal */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all pointer-events-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Quick Add Customer</h3>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="quick-customer-name" className="block text-sm font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="quick-customer-name"
                type="text"
                {...register('Name')}
                placeholder="Customer name"
                autoFocus
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              />
              {errors.Name && <p className="mt-1 text-sm text-red-600">{errors.Name.message}</p>}
            </div>

            <div>
              <label htmlFor="quick-customer-email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="quick-customer-email"
                type="email"
                {...register('Email')}
                placeholder="email@example.com"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              />
              {errors.Email && <p className="mt-1 text-sm text-red-600">{errors.Email.message}</p>}
            </div>

            <div>
              <label htmlFor="quick-customer-phone" className="block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                id="quick-customer-phone"
                type="text"
                {...register('Phone')}
                placeholder="(555) 123-4567"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              />
              {errors.Phone && <p className="mt-1 text-sm text-red-600">{errors.Phone.message}</p>}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Customer'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside CustomerSelector's DOM tree
  // This fixes the click outside handler issue in CustomerSelector
  return createPortal(modalContent, document.body);
}
