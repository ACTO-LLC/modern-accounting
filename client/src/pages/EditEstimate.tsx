import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import EstimateForm, { EstimateFormData } from '../components/EstimateForm';

export default function EditEstimate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ['estimate', id],
    queryFn: async () => {
      // Fetch estimate and lines separately since $expand is not supported
      const [estimateResponse, linesResponse] = await Promise.all([
        api.get<{ value: any[] }>(`/estimates?$filter=Id eq ${id}`),
        api.get<{ value: any[] }>(`/estimatelines?$filter=EstimateId eq ${id}`)
      ]);

      const estimate = estimateResponse.data.value[0];
      if (estimate) {
        estimate.Lines = linesResponse.data.value;
      }
      return estimate;
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: EstimateFormData) => {
      // 1. Update Estimate (exclude Lines)
      const { Lines, ...estimateData } = data;
      await api.patch(`/estimates/Id/${id}`, estimateData);

      // 2. Handle Lines Reconciliation
      // Fetch current lines from DB to know what to delete
      const currentLinesResponse = await api.get<{ value: any[] }>(`/estimatelines?$filter=EstimateId eq ${id}`);
      const currentLines = currentLinesResponse.data.value;
      const currentLineIds = new Set(currentLines.map(l => l.Id));

      const incomingLines = Lines || [];
      const incomingLineIds = new Set(incomingLines.map(l => l.Id).filter(Boolean));

      // Identify operations
      const toDelete = currentLines.filter(l => !incomingLineIds.has(l.Id));
      const toUpdate = incomingLines.filter(l => l.Id && currentLineIds.has(l.Id));
      const toAdd = incomingLines.filter(l => !l.Id);

      // Execute operations
      const promises = [
        ...toDelete.map(l => api.delete(`/estimatelines/Id/${l.Id}`)),
        ...toUpdate.map(l => api.patch(`/estimatelines/Id/${l.Id}`, {
          Description: l.Description,
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice
        })),
        ...toAdd.map(l => api.post('/estimatelines', {
          EstimateId: id,
          Description: l.Description,
          Quantity: l.Quantity,
          UnitPrice: l.UnitPrice
        }))
      ];

      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      navigate('/estimates');
    },
    onError: (error) => {
      console.error('Failed to update estimate:', error);
      alert('Failed to update estimate');
    }
  });

  if (isLoading) return <div className="p-4">Loading estimate...</div>;
  if (error || !estimate) return <div className="p-4 text-red-600">Error loading estimate</div>;

  return (
    <EstimateForm
      title="Edit Estimate"
      initialValues={estimate}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
