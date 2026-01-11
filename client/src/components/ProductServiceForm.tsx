import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export const productServiceSchema = z.object({
  Name: z.string().min(1, 'Name is required'),
  SKU: z.string().optional().nullable(),
  Type: z.enum(['Inventory', 'NonInventory', 'Service'], { required_error: 'Type is required' }),
  Description: z.string().optional().nullable(),
  SalesPrice: z.union([z.number(), z.string()]).optional().nullable().transform(val => {
    if (val === '' || val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  }).refine(val => val === null || val >= 0, { message: 'Sales price cannot be negative' }),
  PurchaseCost: z.union([z.number(), z.string()]).optional().nullable().transform(val => {
    if (val === '' || val === null || val === undefined) return null;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? null : num;
  }).refine(val => val === null || val >= 0, { message: 'Purchase cost cannot be negative' }),
  IncomeAccountId: z.string().optional().nullable().transform(val => val === '' ? null : val),
  ExpenseAccountId: z.string().optional().nullable().transform(val => val === '' ? null : val),
  InventoryAssetAccountId: z.string().optional().nullable().transform(val => val === '' ? null : val),
  Category: z.string().optional().nullable(),
  Taxable: z.boolean().default(true),
  Status: z.enum(['Active', 'Inactive']).default('Active'),
});

export type ProductServiceFormData = z.infer<typeof productServiceSchema>;

interface Account { Id: string; Name: string; Code: string; Type: string; }

interface ProductServiceFormProps {
  initialValues?: Partial<ProductServiceFormData>;
  onSubmit: (data: ProductServiceFormData) => Promise<void>;
  title: string;
  isSubmitting?: boolean;
  submitButtonText?: string;
}

export default function ProductServiceForm({ initialValues, onSubmit, title, isSubmitting, submitButtonText = 'Save Product/Service' }: ProductServiceFormProps) {
  const navigate = useNavigate();
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => { const response = await api.get<{ value: Account[] }>('/accounts'); return response.data.value; }
  });

  const incomeAccounts = accounts?.filter(a => a.Type === 'Revenue') || [];
  const expenseAccounts = accounts?.filter(a => a.Type === 'Expense') || [];
  const assetAccounts = accounts?.filter(a => a.Type === 'Asset') || [];

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ProductServiceFormData>({
    resolver: zodResolver(productServiceSchema),
    defaultValues: { ...initialValues, Type: initialValues?.Type || 'Service', Taxable: initialValues?.Taxable ?? true, Status: initialValues?.Status || 'Active' }
  });

  const selectedType = watch('Type');

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/products-services')} className="mr-4 text-gray-500 hover:text-gray-700" aria-label="Back to products and services"><ArrowLeft className="w-6 h-6" /></button>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="Name" className="block text-sm font-medium text-gray-700">Name *</label>
          <input id="Name" type="text" {...register('Name')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
          {errors.Name && <p className="mt-1 text-sm text-red-600">{errors.Name.message}</p>}
        </div>
        <div>
          <label htmlFor="Type" className="block text-sm font-medium text-gray-700">Type *</label>
          <select id="Type" {...register('Type')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
            <option value="Service">Service</option>
            <option value="NonInventory">Non-Inventory Product</option>
            <option value="Inventory">Inventory Product</option>
          </select>
          {errors.Type && <p className="mt-1 text-sm text-red-600">{errors.Type.message}</p>}
          <p className="mt-1 text-xs text-gray-500">
            {selectedType === 'Service' && 'Services you provide to customers (e.g., consulting, labor)'}
            {selectedType === 'NonInventory' && 'Products you sell but do not track inventory for'}
            {selectedType === 'Inventory' && 'Products you buy and sell with inventory tracking'}
          </p>
        </div>
        <div>
          <label htmlFor="SKU" className="block text-sm font-medium text-gray-700">SKU / Item Code</label>
          <input id="SKU" type="text" {...register('SKU')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
        </div>
        <div>
          <label htmlFor="Category" className="block text-sm font-medium text-gray-700">Category</label>
          <input id="Category" type="text" {...register('Category')} placeholder="e.g., Professional Services, Hardware" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
        </div>
        <div>
          <label htmlFor="Description" className="block text-sm font-medium text-gray-700">Description</label>
          <textarea id="Description" rows={3} {...register('Description')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
        </div>
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Pricing</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="SalesPrice" className="block text-sm font-medium text-gray-700">Sales Price</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                <input id="SalesPrice" type="number" step="0.01" {...register('SalesPrice')} className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
              </div>
              {errors.SalesPrice && <p className="mt-1 text-sm text-red-600">{errors.SalesPrice.message}</p>}
            </div>
            <div>
              <label htmlFor="PurchaseCost" className="block text-sm font-medium text-gray-700">Purchase Cost</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><span className="text-gray-500 sm:text-sm">$</span></div>
                <input id="PurchaseCost" type="number" step="0.01" {...register('PurchaseCost')} className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
              </div>
              {errors.PurchaseCost && <p className="mt-1 text-sm text-red-600">{errors.PurchaseCost.message}</p>}
            </div>
          </div>
        </div>
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Accounting</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="IncomeAccountId" className="block text-sm font-medium text-gray-700">Income Account</label>
              <select id="IncomeAccountId" {...register('IncomeAccountId')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
                <option value="">Select an account...</option>
                {incomeAccounts.map((account) => (<option key={account.Id} value={account.Id}>{account.Code} - {account.Name}</option>))}
              </select>
            </div>
            <div>
              <label htmlFor="ExpenseAccountId" className="block text-sm font-medium text-gray-700">Expense Account</label>
              <select id="ExpenseAccountId" {...register('ExpenseAccountId')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
                <option value="">Select an account...</option>
                {expenseAccounts.map((account) => (<option key={account.Id} value={account.Id}>{account.Code} - {account.Name}</option>))}
              </select>
            </div>
            {selectedType === 'Inventory' && (
              <div className="col-span-2">
                <label htmlFor="InventoryAssetAccountId" className="block text-sm font-medium text-gray-700">Inventory Asset Account</label>
                <select id="InventoryAssetAccountId" {...register('InventoryAssetAccountId')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
                  <option value="">Select an account...</option>
                  {assetAccounts.map((account) => (<option key={account.Id} value={account.Id}>{account.Code} - {account.Name}</option>))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Account used to track inventory value on the balance sheet</p>
              </div>
            )}
          </div>
        </div>
        <div className="border-t pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center">
              <input id="Taxable" type="checkbox" {...register('Taxable')} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <label htmlFor="Taxable" className="ml-2 block text-sm text-gray-900">Taxable</label>
            </div>
            <div>
              <label htmlFor="Status" className="block text-sm font-medium text-gray-700">Status</label>
              <select id="Status" {...register('Status')} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end items-center border-t pt-4">
          <button type="button" onClick={() => navigate('/products-services')} className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : submitButtonText}</button>
        </div>
      </form>
    </div>
  );
}
