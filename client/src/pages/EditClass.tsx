import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import ClassForm, { ClassFormData } from '../components/ClassForm';
import { formatGuidForOData } from '../lib/validation';

export default function EditClass() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: classItem, isLoading, error } = useQuery({
    queryKey: ['class', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/classes?$filter=Id eq ${formatGuidForOData(id!, 'Class Id')}`);
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await api.patch(`/classes/Id/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['class', id] });
      showToast('Class updated successfully', 'success');
      navigate('/classes');
    },
    onError: (error) => {
      console.error('Failed to update class:', error);
      showToast('Failed to update class', 'error');
    },
  });

  if (isLoading) return <div className="p-4">Loading class...</div>;
  if (error || !classItem) return <div className="p-4 text-red-600">Error loading class</div>;

  return (
    <ClassForm
      title="Edit Class"
      initialValues={classItem}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
