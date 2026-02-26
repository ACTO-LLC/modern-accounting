import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import TaxRateForm, { TaxRateFormData } from '../components/TaxRateForm';
import { formatGuidForOData } from '../lib/validation';

export default function EditTaxRate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: taxRate, isLoading, error } = useQuery({
    queryKey: ['taxrate', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/taxrates?$filter=Id eq ${formatGuidForOData(id!, 'Tax Rate Id')}`);
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: TaxRateFormData) => {
      await api.patch(`/taxrates/Id/${id}`, {
        ...data,
        Description: data.Description || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxrates'] });
      queryClient.invalidateQueries({ queryKey: ['taxrate', id] });
      showToast('Tax rate updated successfully', 'success');
      navigate('/tax-rates');
    },
    onError: (error) => {
      console.error('Failed to update tax rate:', error);
      showToast('Failed to update tax rate', 'error');
    },
  });

  if (isLoading) return <div className="p-4 dark:text-gray-300">Loading tax rate...</div>;
  if (error || !taxRate) return <div className="p-4 text-red-600 dark:text-red-400">Error loading tax rate</div>;

  return (
    <TaxRateForm
      title="Edit Tax Rate"
      initialValues={taxRate}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
