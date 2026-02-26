import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import AccountingPeriodForm, { AccountingPeriodFormData } from '../components/AccountingPeriodForm';

export default function NewAccountingPeriod() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: AccountingPeriodFormData) => {
      await api.post('/accountingperiods', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      showToast('Accounting period created successfully', 'success');
      navigate('/accounting-periods');
    },
    onError: (error: any) => {
      console.error('Failed to create accounting period:', error);
      const message = error.response?.data?.message || 'Failed to create accounting period';
      showToast(message, 'error');
    },
  });

  return (
    <AccountingPeriodForm
      title="New Fiscal Year"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
