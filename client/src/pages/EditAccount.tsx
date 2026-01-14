import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import AccountForm, { AccountFormData } from '../components/AccountForm';
import { useToast } from '../hooks/useToast';

export default function EditAccount() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: account, isLoading, error } = useQuery({
    queryKey: ['account', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/accounts?$filter=Id eq ${id}`);
      return response.data.value[0];
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: AccountFormData) => {
      await api.patch(`/accounts/Id/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account', id] });
      showToast('Account updated successfully', 'success');
      navigate('/accounts');
    },
    onError: (error) => {
      console.error('Failed to update account:', error);
      showToast('Failed to update account', 'error');
    }
  });

  if (isLoading) return <div className="p-4">Loading account...</div>;
  if (error || !account) return <div className="p-4 text-red-600">Error loading account</div>;

  return (
    <AccountForm
      title="Edit Account"
      initialValues={account}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
