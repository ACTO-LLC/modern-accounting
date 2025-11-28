import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import InvoiceForm, { InvoiceFormData } from '../components/InvoiceForm';

export default function EditInvoice() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      // Fetch invoice and lines separately since $expand is not supported
      const [invoiceResponse, linesResponse] = await Promise.all([
        api.get<{ value: any[] }>(`/invoices?$filter=Id eq ${id}`),
        api.get<{ value: any[] }>(`/invoicelines?$filter=InvoiceId eq ${id}`)
      ]);
      
      const invoice = invoiceResponse.data.value[0];
      if (invoice) {
        invoice.Lines = linesResponse.data.value;
      }
      return invoice;
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      // Use PATCH for updates
      await api.patch(`/invoices/Id/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      navigate('/invoices');
    },
    onError: (error) => {
      console.error('Failed to update invoice:', error);
      alert('Failed to update invoice');
    }
  });

  if (isLoading) return <div className="p-4">Loading invoice...</div>;
  if (error || !invoice) return <div className="p-4 text-red-600">Error loading invoice</div>;

  return (
    <InvoiceForm 
      title="Edit Invoice" 
      initialValues={invoice} 
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
