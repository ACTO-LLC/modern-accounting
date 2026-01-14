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
      await api.post('/accounts', data);
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
