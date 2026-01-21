import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import EstimateForm, { EstimateFormData } from '../components/EstimateForm';
import { useToast } from '../hooks/useToast';

interface CreateEstimateResponse {
  Id: string;
  EstimateNumber: string;
  CustomerId: string;
  IssueDate: string;
  ExpirationDate: string | null;
  TotalAmount: number;
  Status: string;
  Notes: string | null;
}

export default function NewEstimate() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const onSubmit = async (data: EstimateFormData) => {
    try {
      // Separate lines from estimate data
      const { Lines, ...estimateData } = data;

      // Create the estimate first
      await api.post('/estimates_write', estimateData);

      // DAB doesn't return the created entity, so we need to query for it
      const queryResponse = await api.get<{ value: CreateEstimateResponse[] }>(
        `/estimates?$filter=EstimateNumber eq '${estimateData.EstimateNumber}'`
      );
      const estimate = queryResponse.data.value[0];

      if (!estimate?.Id) {
        throw new Error('Failed to retrieve created estimate');
      }

      // Create estimate lines
      await Promise.all(
        Lines.map((line) =>
          api.post('/estimatelines', {
            EstimateId: estimate.Id,
            Description: line.Description,
            Quantity: line.Quantity,
            UnitPrice: line.UnitPrice,
          })
        )
      );

      showToast('Estimate created successfully', 'success');
      navigate('/estimates');
    } catch (error) {
      console.error('Failed to create estimate:', error);
      showToast('Failed to create estimate', 'error');
      throw error; // Re-throw to keep the form in submitting state
    }
  };

  return (
    <EstimateForm
      title="New Estimate"
      onSubmit={onSubmit}
      submitButtonText="Create Estimate"
    />
  );
}
