import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';
import RecurringTemplateForm, { RecurringTemplateFormData } from '../components/RecurringTemplateForm';
import { formatGuidForOData } from '../lib/validation';

export default function EditRecurringTemplate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: template, isLoading, error } = useQuery({
    queryKey: ['recurring-template', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/recurringtemplates?$filter=Id eq ${formatGuidForOData(id!, 'Template Id')}`);
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async (data: RecurringTemplateFormData) => {
      await api.patch(`/recurringtemplates/Id/${id}`, {
        TemplateName: data.TemplateName,
        TransactionType: data.TransactionType,
        TemplateData: data.TemplateData,
        Frequency: data.Frequency,
        IntervalCount: data.IntervalCount,
        DayOfMonth: data.DayOfMonth,
        DayOfWeek: data.DayOfWeek,
        StartDate: data.StartDate,
        EndDate: data.EndDate || null,
        MaxOccurrences: data.MaxOccurrences || null,
        AutoCreate: data.AutoCreate,
        AutoSend: data.AutoSend,
        ReminderDays: data.ReminderDays,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-template', id] });
      showToast('Recurring template updated successfully', 'success');
      navigate('/recurring');
    },
    onError: (error) => {
      console.error('Failed to update recurring template:', error);
      showToast('Failed to update recurring template', 'error');
    },
  });

  if (isLoading) return <div className="p-4">Loading template...</div>;
  if (error || !template) return <div className="p-4 text-red-600">Error loading template</div>;

  return (
    <RecurringTemplateForm
      title="Edit Recurring Template"
      initialValues={template}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
