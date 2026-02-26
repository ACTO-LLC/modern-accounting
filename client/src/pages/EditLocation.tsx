import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import LocationForm, { LocationFormData } from '../components/LocationForm';
import { formatGuidForOData } from '../lib/validation';

export default function EditLocation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: location, isLoading, error } = useQuery({
    queryKey: ['location', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/locations?$filter=Id eq ${formatGuidForOData(id!, 'Location Id')}`);
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: LocationFormData) => {
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await api.patch(`/locations/Id/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['location', id] });
      showToast('Location updated successfully', 'success');
      navigate('/locations');
    },
    onError: (error) => {
      console.error('Failed to update location:', error);
      showToast('Failed to update location', 'error');
    },
  });

  if (isLoading) return <div className="p-4">Loading location...</div>;
  if (error || !location) return <div className="p-4 text-red-600">Error loading location</div>;

  return (
    <LocationForm
      title="Edit Location"
      initialValues={location}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
