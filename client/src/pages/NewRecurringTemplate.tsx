import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import RecurringTemplateForm, { RecurringTemplateFormData } from '../components/RecurringTemplateForm';

export default function NewRecurringTemplate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: RecurringTemplateFormData) => {
      const payload = {
        ...data,
        NextScheduledDate: data.StartDate,
        Status: 'Active',
        OccurrencesCreated: 0,
      };
      await api.post('/recurringtemplates', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      showToast('Recurring template created successfully', 'success');
      navigate('/recurring');
    },
    onError: (error) => {
      console.error('Failed to create recurring template:', error);
      showToast('Failed to create recurring template', 'error');
    },
  });

  return (
    <RecurringTemplateForm
      title="New Recurring Template"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
