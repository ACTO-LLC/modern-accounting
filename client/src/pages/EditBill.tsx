import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import BillForm, { BillFormData } from '../components/BillForm';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(id: string | undefined): id is string {
  return id !== undefined && UUID_REGEX.test(id);
}

interface BillLine {
  Id: string;
  BillId: string;
  AccountId: string;
  Description: string;
  Amount: number;
}

interface Bill {
  Id: string;
  VendorId: string;
  BillNumber: string;
  BillDate: string;
  DueDate: string;
  TotalAmount: number;
  AmountPaid: number;
  Status: string;
  Terms: string;
  Memo: string;
  Lines?: BillLine[];
}

export default function EditBill() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Validate ID before using in query
  const isIdValid = isValidUUID(id);

  const { data: bill, isLoading, error } = useQuery({
    queryKey: ['bill', id],
    queryFn: async () => {
      if (!isIdValid) {
        throw new Error('Invalid bill ID format');
      }
      // Fix SQL injection: Quote GUID values in OData filter
      const [billResponse, linesResponse] = await Promise.all([
        api.get<{ value: Bill[] }>(`/bills?$filter=Id eq '${id}'`),
        api.get<{ value: BillLine[] }>(`/billlines?$filter=BillId eq '${id}'`)
      ]);

      const billData = billResponse.data.value[0];
      if (billData) {
        billData.Lines = linesResponse.data.value;
      }
      return billData;
    },
    enabled: isIdValid
  });

  const mutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      if (!isIdValid) {
        throw new Error('Invalid bill ID format');
      }

      // 1. Update Bill (exclude Lines)
      const { Lines, ...billData } = data;
      await api.patch(`/bills/Id/${id}`, billData);

      // 2. Handle Lines Reconciliation
      // Fix SQL injection: Quote GUID value in OData filter
      const currentLinesResponse = await api.get<{ value: BillLine[] }>(`/billlines?$filter=BillId eq '${id}'`);
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
        ...toDelete.map(l => api.delete(`/billlines/Id/${l.Id}`)),
        ...toUpdate.map(l => api.patch(`/billlines/Id/${l.Id}`, {
          AccountId: l.AccountId,
          Description: l.Description || '',
          Amount: l.Amount
        })),
        ...toAdd.map(l => api.post('/billlines', {
          BillId: id,
          AccountId: l.AccountId,
          Description: l.Description || '',
          Amount: l.Amount
        }))
      ];

      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['bill', id] });
      navigate('/bills');
    },
    onError: (error) => {
      console.error('Failed to update bill:', error);
      // Use proper error state instead of alert
      setErrorMessage('Failed to update bill. Please try again.');
    }
  });

  if (!isIdValid) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Invalid bill ID format</p>
          <button
            onClick={() => navigate('/bills')}
            className="mt-2 text-indigo-600 hover:text-indigo-800"
          >
            Return to Bills
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-4">Loading bill...</div>;
  if (error || !bill) return <div className="p-4 text-red-600">Error loading bill</div>;

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
        title="Edit Bill"
        initialValues={bill}
        onSubmit={(data) => mutation.mutateAsync(data)}
        isSubmitting={mutation.isPending}
      />
    </div>
  );
}
