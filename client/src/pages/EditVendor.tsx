import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import VendorForm, { VendorFormData } from '../components/VendorForm';

export default function EditVendor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: vendor,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['vendor', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(
        `/vendors?$filter=Id eq ${id}`
      );
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      // Clean up empty strings to null for optional fields
      const cleanedData = {
        ...data,
        Email: data.Email || null,
        Phone: data.Phone || null,
        Address: data.Address || null,
        PaymentTerms: data.PaymentTerms || null,
        TaxId: data.TaxId || null,
        DefaultExpenseAccountId: data.DefaultExpenseAccountId || null,
      };
      await api.patch(`/vendors/Id/${id}`, cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['vendor', id] });
      navigate('/vendors');
    },
    onError: (error) => {
      console.error('Failed to update vendor:', error);
      alert('Failed to update vendor');
    },
  });

  if (isLoading) return <div className="p-4">Loading vendor...</div>;
  if (error || !vendor)
    return <div className="p-4 text-red-600">Error loading vendor</div>;

  return (
    <VendorForm
      title="Edit Vendor"
      initialValues={vendor}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
