import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import EstimateForm, { EstimateFormData } from '../components/EstimateForm';

export default function NewEstimate() {
  const navigate = useNavigate();

  const onSubmit = async (data: EstimateFormData) => {
    try {
      // Separate lines from estimate data
      const { Lines, ...estimateData } = data;

      // Create the estimate first
      const estimateResponse = await api.post('/estimates', estimateData);
      const estimate = estimateResponse.data;

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

      navigate('/estimates');
    } catch (error) {
      console.error('Failed to create estimate:', error);
      alert('Failed to create estimate');
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
