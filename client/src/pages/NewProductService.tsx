import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import ProductServiceForm, { ProductServiceFormData } from '../components/ProductServiceForm';

export default function NewProductService() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: ProductServiceFormData) => {
      // Convert empty strings to null for optional GUID fields (database expects null, not empty string)
      const cleanedData = {
        ...data,
        IncomeAccountId: data.IncomeAccountId || null,
        ExpenseAccountId: data.ExpenseAccountId || null,
        InventoryAssetAccountId: data.InventoryAssetAccountId || null,
        SKU: data.SKU || null,
        Description: data.Description || null,
        Category: data.Category || null,
      };
      await api.post('/productsservices', cleanedData);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['productsservices'] }); navigate('/products-services'); },
    onError: (error) => {
      console.error('Failed to create product/service:', error);
      setErrorMessage('Failed to create product/service. Please try again.');
    }
  });

  return (
    <div>
      {errorMessage && (
        <div className="max-w-2xl mx-auto mb-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4 flex justify-between items-center">
            <p className="text-red-600">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <ProductServiceForm title="New Product/Service" onSubmit={(data) => mutation.mutateAsync(data)} isSubmitting={mutation.isPending} />
    </div>
  );
}
