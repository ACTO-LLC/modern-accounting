import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import AccountingPeriodForm, { AccountingPeriodFormData } from '../components/AccountingPeriodForm';
import { formatGuidForOData } from '../lib/validation';

export default function EditAccountingPeriod() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: period, isLoading, error } = useQuery({
    queryKey: ['accounting-period', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/accountingperiods?$filter=Id eq ${formatGuidForOData(id!, 'Period Id')}`);
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: AccountingPeriodFormData) => {
      await api.patch(`/accountingperiods/Id/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-period', id] });
      showToast('Accounting period updated successfully', 'success');
      navigate('/accounting-periods');
    },
    onError: (error: any) => {
      console.error('Failed to update accounting period:', error);
      const message = error.response?.data?.message || 'Failed to update accounting period';
      showToast(message, 'error');
    },
  });

  if (isLoading) return <div className="p-4">Loading accounting period...</div>;
  if (error || !period) return <div className="p-4 text-red-600">Error loading accounting period</div>;

  return (
    <AccountingPeriodForm
      title="Edit Fiscal Year"
      initialValues={period}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
