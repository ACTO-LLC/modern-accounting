import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import VendorCreditForm, { VendorCreditFormData } from '../components/VendorCreditForm';

interface VendorCredit {
  Id: string;
  CreditNumber: string;
}

export default function NewVendorCredit() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (data: VendorCreditFormData) => {
      // Create the vendor credit first
      const { Lines, ...creditData } = data;
      await api.post('/vendorcredits_write', {
        ...creditData,
        ProjectId: data.ProjectId || null,
        ClassId: data.ClassId || null,
      });

      // DAB doesn't return the created entity, so we need to query for it
      const escapedCreditNumber = String(creditData.CreditNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: VendorCredit[] }>(
        `/vendorcredits?$filter=CreditNumber eq '${escapedCreditNumber}'`
      );
      const credit = queryResponse.data.value[0];

      if (!credit?.Id) {
        throw new Error('Failed to retrieve created vendor credit');
      }

      // Then create the line items
      if (Lines && Lines.length > 0) {
        await Promise.all(
          Lines.map((line) =>
            api.post('/vendorcreditlines', {
              VendorCreditId: credit.Id,
              AccountId: line.AccountId,
              ProductServiceId: line.ProductServiceId || null,
              Description: line.Description || '',
              Quantity: line.Quantity,
              UnitPrice: line.UnitPrice,
              Amount: line.Amount,
              ProjectId: line.ProjectId || null,
              ClassId: line.ClassId || null,
            })
          )
        );
      }

      return credit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendorcredits'] });
      navigate('/vendor-credits');
    },
    onError: (error) => {
      console.error('Failed to create vendor credit:', error);
      setErrorMessage('Failed to create vendor credit. Please try again.');
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
      <VendorCreditForm
        title="New Vendor Credit"
        onSubmit={async (data) => { await mutation.mutateAsync(data); }}
        isSubmitting={mutation.isPending}
        submitButtonText="Create Vendor Credit"
      />
    </div>
  );
}
