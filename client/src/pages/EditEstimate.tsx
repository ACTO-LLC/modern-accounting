import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import EstimateForm, { EstimateFormData } from '../components/EstimateForm';
import { formatGuidForOData, isValidUUID } from '../lib/validation';
import { useToast } from '../hooks/useToast';

interface Estimate {
  Id: string;
  EstimateNumber: string;
  CustomerId: string;
  IssueDate: string;
  ExpirationDate?: string;
  TotalAmount: number;
  Status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired' | 'Converted';
  Notes?: string;
  Lines?: EstimateLine[];
}

interface EstimateLine {
  Id?: string;
  EstimateId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}

export default function EditEstimate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Validate ID early
  const isIdValid = isValidUUID(id);

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ['estimate', id],
    queryFn: async () => {
      // Validate ID before using in OData filter
      if (!isValidUUID(id)) {
        throw new Error('Invalid estimate ID');
      }

      // Fetch estimate and lines separately since $expand is not supported
      // Use properly quoted GUID in OData filter
      const [estimateResponse, linesResponse] = await Promise.all([
        api.get<{ value: Estimate[] }>(`/estimates?$filter=Id eq ${formatGuidForOData(id, 'EstimateId')}`),
        api.get<{ value: EstimateLine[] }>(`/estimatelines?$filter=EstimateId eq ${formatGuidForOData(id, 'EstimateId')}`)
      ]);

      const estimate = estimateResponse.data.value[0];
      if (estimate) {
        estimate.Lines = linesResponse.data.value;
      }
      return estimate;
    },
    enabled: isIdValid
  });

  const mutation = useMutation({
    mutationFn: async (data: EstimateFormData) => {
      // Validate ID before using
      if (!isValidUUID(id)) {
        throw new Error('Invalid estimate ID');
      }

      // 1. Update Estimate (exclude Lines)
      const { Lines, ...estimateData } = data;
      await api.patch(`/estimates_write/Id/${id}`, estimateData);

      // 2. Handle Lines Reconciliation
      // Fetch current lines from DB to know what to delete
      // Use properly quoted GUID in OData filter
      const currentLinesResponse = await api.get<{ value: EstimateLine[] }>(
        `/estimatelines?$filter=EstimateId eq ${formatGuidForOData(id, 'EstimateId')}`
      );
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
      showToast('Estimate updated successfully', 'success');
      navigate('/estimates');
    },
    onError: (error) => {
      console.error('Failed to update estimate:', error);
      showToast('Failed to update estimate', 'error');
    }
  });

  if (!isIdValid) {
    return <div className="p-4 text-red-600">Invalid estimate ID</div>;
  }

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
