import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import ProductServiceForm, { ProductServiceFormData } from '../components/ProductServiceForm';

export default function EditProductService() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: productService, isLoading, error } = useQuery({
    queryKey: ['productservice', id],
    queryFn: async () => { const response = await api.get<{ value: any[] }>(`/productsservices?$filter=Id eq ${id}`); return response.data.value[0]; },
    enabled: !!id
  });

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
      await api.patch(`/productsservices/Id/${id}`, cleanedData);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['productsservices'] }); queryClient.invalidateQueries({ queryKey: ['productservice', id] }); navigate('/products-services'); },
    onError: (error) => {
      console.error('Failed to update product/service:', error);
      setErrorMessage('Failed to update product/service. Please try again.');
    }
  });

  if (isLoading) return <div className="p-4">Loading product/service...</div>;
  if (error || !productService) return <div className="p-4 text-red-600">Error loading product/service</div>;

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
      <ProductServiceForm title="Edit Product/Service" initialValues={productService} onSubmit={(data) => mutation.mutateAsync(data)} isSubmitting={mutation.isPending} />
    </div>
  );
}
