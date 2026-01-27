import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import CreditMemoForm, { CreditMemoFormData } from '../components/CreditMemoForm';

interface CreditMemo {
  Id: string;
  CreditMemoNumber: string;
}

export default function NewCreditMemo() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: CreditMemoFormData) => {
      // Create the credit memo first
      const { Lines, ...creditData } = data;
      await api.post('/creditmemos_write', creditData);

      // DAB doesn't return the created entity, so we need to query for it
      const escapedNumber = String(creditData.CreditMemoNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: CreditMemo[] }>(
        `/creditmemos?$filter=CreditMemoNumber eq '${escapedNumber}'`
      );
      const credit = queryResponse.data.value[0];

      if (!credit?.Id) {
        throw new Error('Failed to retrieve created credit memo');
      }

      // Then create the line items
      if (Lines && Lines.length > 0) {
        await Promise.all(
          Lines.map((line) =>
            api.post('/creditmemolines_write', {
              CreditMemoId: credit.Id,
              AccountId: line.AccountId,
              ProductServiceId: line.ProductServiceId || null,
              Description: line.Description || '',
              Quantity: line.Quantity,
              UnitPrice: line.UnitPrice,
              Amount: line.Amount,
            })
          )
        );
      }

      return credit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditmemos'] });
      navigate('/credit-memos');
    },
    onError: (error) => {
      console.error('Failed to create credit memo:', error);
      setErrorMessage('Failed to create credit memo. Please try again.');
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
      <CreditMemoForm
        title="New Credit Memo"
        onSubmit={async (data) => { await mutation.mutateAsync(data); }}
        isSubmitting={mutation.isPending}
        submitButtonText="Create Credit Memo"
      />
    </div>
  );
}
