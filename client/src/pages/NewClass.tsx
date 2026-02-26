import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import ClassForm, { ClassFormData } from '../components/ClassForm';

export default function NewClass() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await api.post('/classes', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      showToast('Class created successfully', 'success');
      navigate('/classes');
    },
    onError: (error) => {
      console.error('Failed to create class:', error);
      showToast('Failed to create class', 'error');
    },
  });

  return (
    <ClassForm
      title="New Class"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
