import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import ProductServiceForm, { ProductServiceFormData } from '../components/ProductServiceForm';

export default function EditProductService() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: productService, isLoading, error } = useQuery({
    queryKey: ['productservice', id],
    queryFn: async () => { const response = await api.get<{ value: any[] }>(`/productsservices?$filter=Id eq ${id}`); return response.data.value[0]; },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: ProductServiceFormData) => { await api.patch(`/productsservices/Id/${id}`, data); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['productsservices'] }); queryClient.invalidateQueries({ queryKey: ['productservice', id] }); navigate('/products-services'); },
    onError: (error) => { console.error('Failed to update product/service:', error); alert('Failed to update product/service'); }
  });

  if (isLoading) return <div className="p-4">Loading product/service...</div>;
  if (error || !productService) return <div className="p-4 text-red-600">Error loading product/service</div>;

  return <ProductServiceForm title="Edit Product/Service" initialValues={productService} onSubmit={(data) => mutation.mutateAsync(data)} isSubmitting={mutation.isPending} />;
}
