import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import TaxRateForm, { TaxRateFormData } from '../components/TaxRateForm';

export default function NewTaxRate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: TaxRateFormData) => {
      await api.post('/taxrates', {
        ...data,
        Description: data.Description || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxrates'] });
      showToast('Tax rate created successfully', 'success');
      navigate('/tax-rates');
    },
    onError: (error) => {
      console.error('Failed to create tax rate:', error);
      showToast('Failed to create tax rate', 'error');
    },
  });

  return (
    <TaxRateForm
      title="New Tax Rate"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
