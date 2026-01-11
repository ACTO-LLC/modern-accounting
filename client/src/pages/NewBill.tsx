import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import BillForm, { BillFormData } from '../components/BillForm';

interface BillResponse {
  Id: string;
}

export default function NewBill() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      // Create the bill first
      const { Lines, ...billData } = data;
      const billResponse = await api.post<BillResponse>('/bills', billData);
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
      // Use proper error state instead of alert
      setErrorMessage('Failed to create bill. Please try again.');
    },
  });

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
      <BillForm
        title="New Bill"
        onSubmit={async (data) => { await mutation.mutateAsync(data); }}
        isSubmitting={mutation.isPending}
        submitButtonText="Create Bill"
      />
    </div>
  );
}
