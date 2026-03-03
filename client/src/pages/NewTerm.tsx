import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import TermForm, { TermFormData } from '../components/TermForm';

export default function NewTerm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: TermFormData) => {
      await api.post('/terms', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms'] });
      showToast('Term created successfully', 'success');
      navigate('/terms');
    },
    onError: (error) => {
      console.error('Failed to create term:', error);
      showToast('Failed to create term', 'error');
    },
  });

  return (
    <TermForm
      title="New Payment Term"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
