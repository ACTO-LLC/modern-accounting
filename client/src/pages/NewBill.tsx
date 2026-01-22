import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import BillForm, { BillFormData } from '../components/BillForm';

interface Bill {
  Id: string;
  BillNumber: string;
}

export default function NewBill() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      // Create the bill first
      const { Lines, ...billData } = data;
      await api.post('/bills_write', billData);

      // DAB doesn't return the created entity, so we need to query for it
      const escapedBillNumber = String(billData.BillNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: Bill[] }>(
        `/bills?$filter=BillNumber eq '${escapedBillNumber}'`
      );
      const bill = queryResponse.data.value[0];

      if (!bill?.Id) {
        throw new Error('Failed to retrieve created bill');
      }

      // Then create the line items
      if (Lines && Lines.length > 0) {
        await Promise.all(
          Lines.map((line) =>
            api.post('/billlines', {
              BillId: bill.Id,
              AccountId: line.AccountId,
              Description: line.Description || '',
              Amount: line.Amount,
            })
          )
        );
      }

      return bill;
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
