import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import VendorForm, { VendorFormData } from '../components/VendorForm';

export default function NewVendor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
      await api.post('/vendors', cleanedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      navigate('/vendors');
    },
    onError: (error) => {
      console.error('Failed to create vendor:', error);
      alert('Failed to create vendor');
    },
  });

  return (
    <VendorForm
      title="New Vendor"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
