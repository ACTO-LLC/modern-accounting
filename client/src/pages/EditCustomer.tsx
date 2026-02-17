import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import CustomerForm, { CustomerFormData } from '../components/CustomerForm';

export default function EditCustomer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/customers?$filter=Id eq ${id}`);
      return response.data.value[0];
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      // Convert empty strings to null for DAB compatibility
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await api.patch(`/customers/Id/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      navigate('/customers');
    },
    onError: (error) => {
      console.error('Failed to update customer:', error);
      alert('Failed to update customer');
    }
  });

  if (isLoading) return <div className="p-4">Loading customer...</div>;
  if (error || !customer) return <div className="p-4 text-red-600">Error loading customer</div>;

  return (
    <CustomerForm 
      title="Edit Customer" 
      initialValues={customer}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
