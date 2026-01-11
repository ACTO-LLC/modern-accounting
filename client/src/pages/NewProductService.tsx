import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import ProductServiceForm, { ProductServiceFormData } from '../components/ProductServiceForm';

export default function NewProductService() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: ProductServiceFormData) => { await api.post('/productsservices', data); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['productsservices'] }); navigate('/products-services'); },
    onError: (error) => { console.error('Failed to create product/service:', error); alert('Failed to create product/service'); }
  });

  return <ProductServiceForm title="New Product/Service" onSubmit={(data) => mutation.mutateAsync(data)} isSubmitting={mutation.isPending} />;
}
