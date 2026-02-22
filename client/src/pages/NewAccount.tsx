import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import AccountForm, { AccountFormData } from '../components/AccountForm';
import { useToast } from '../hooks/useToast';

export default function NewAccount() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
      // Convert empty strings to null for DAB compatibility (DAB rejects empty strings for nullable columns)
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await api.post('/accounts', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('Account created successfully', 'success');
      navigate('/accounts');
    },
    onError: (error) => {
      console.error('Failed to create account:', error);
      showToast('Failed to create account', 'error');
    }
  });

  return (
    <AccountForm
      title="New Account"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
