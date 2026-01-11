import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import BillForm, { BillFormData } from '../components/BillForm';

export default function NewBill() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      // Create the bill first
      const { Lines, ...billData } = data;
      const billResponse = await api.post<{ Id: string }>('/bills', billData);
      const billId = billResponse.data.Id;

      // Then create the line items
      if (Lines && Lines.length > 0) {
        await Promise.all(
          Lines.map((line) =>
            api.post('/billlines', {
              BillId: billId,
              AccountId: line.AccountId,
              Description: line.Description || '',
              Amount: line.Amount,
            })
          )
        );
      }

      return billResponse.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      navigate('/bills');
    },
    onError: (error) => {
      console.error('Failed to create bill:', error);
      alert('Failed to create bill');
    },
  });

  return (
    <BillForm
      title="New Bill"
      onSubmit={async (data) => { await mutation.mutateAsync(data); }}
      isSubmitting={mutation.isPending}
      submitButtonText="Create Bill"
    />
  );
}
