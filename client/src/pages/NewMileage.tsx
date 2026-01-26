import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import MileageForm, { MileageFormData } from '../components/MileageForm';

export default function NewMileage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: MileageFormData) => {
      await api.post('/mileagetrips_write', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mileagetrips'] });
      navigate('/mileage');
    },
    onError: (error) => {
      console.error('Failed to create mileage trip:', error);
      setErrorMessage('Failed to create mileage trip. Please try again.');
    },
  });

  const handleSubmit = async (data: MileageFormData) => {
    await mutation.mutateAsync(data);
  };

  return (
    <div>
      {errorMessage && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4 flex justify-between items-center">
            <p className="text-red-600">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-600 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <MileageForm
        title="Log New Trip"
        onSubmit={handleSubmit}
        isSubmitting={mutation.isPending}
        submitButtonText="Save Trip"
      />
    </div>
  );
}
