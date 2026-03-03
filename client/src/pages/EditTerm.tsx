import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import TermForm, { TermFormData } from '../components/TermForm';
import { formatGuidForOData } from '../lib/validation';

export default function EditTerm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: term, isLoading, error } = useQuery({
    queryKey: ['term', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/terms?$filter=Id eq ${formatGuidForOData(id!, 'Term Id')}`);
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: TermFormData) => {
      await api.patch(`/terms/Id/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms'] });
      queryClient.invalidateQueries({ queryKey: ['term', id] });
      showToast('Term updated successfully', 'success');
      navigate('/terms');
    },
    onError: (error) => {
      console.error('Failed to update term:', error);
      showToast('Failed to update term', 'error');
    },
  });

  if (isLoading) return <div className="p-4 dark:text-gray-300">Loading term...</div>;
  if (error || !term) return <div className="p-4 text-red-600 dark:text-red-400">Error loading term</div>;

  return (
    <TermForm
      title="Edit Payment Term"
      initialValues={term}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
