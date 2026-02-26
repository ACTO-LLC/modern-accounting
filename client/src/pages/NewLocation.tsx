import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import LocationForm, { LocationFormData } from '../components/LocationForm';

export default function NewLocation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: LocationFormData) => {
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await api.post('/locations', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      showToast('Location created successfully', 'success');
      navigate('/locations');
    },
    onError: (error) => {
      console.error('Failed to create location:', error);
      showToast('Failed to create location', 'error');
    },
  });

  return (
    <LocationForm
      title="New Location"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
