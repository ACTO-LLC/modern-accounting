import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import BillForm, { BillFormData } from '../components/BillForm';

export default function EditBill() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: bill, isLoading, error } = useQuery({
    queryKey: ['bill', id],
    queryFn: async () => {
      // Fetch bill and lines separately since $expand may not be supported
      const [billResponse, linesResponse] = await Promise.all([
        api.get<{ value: any[] }>(`/bills?$filter=Id eq ${id}`),
        api.get<{ value: any[] }>(`/billlines?$filter=BillId eq ${id}`)
      ]);

      const bill = billResponse.data.value[0];
      if (bill) {
        bill.Lines = linesResponse.data.value;
      }
      return bill;
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: BillFormData) => {
      // 1. Update Bill (exclude Lines)
      const { Lines, ...billData } = data;
      await api.patch(`/bills/Id/${id}`, billData);

      // 2. Handle Lines Reconciliation
      // Fetch current lines from DB to know what to delete
      const currentLinesResponse = await api.get<{ value: any[] }>(`/billlines?$filter=BillId eq ${id}`);
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
      alert('Failed to update bill');
    }
  });

  if (isLoading) return <div className="p-4">Loading bill...</div>;
  if (error || !bill) return <div className="p-4 text-red-600">Error loading bill</div>;

  return (
    <BillForm
      title="Edit Bill"
      initialValues={bill}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
