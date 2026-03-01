import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GridColDef } from '@mui/x-data-grid';
import api from '../lib/api';
import CustomerForm, { CustomerFormData } from '../components/CustomerForm';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  Sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Void: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
};

const invoiceColumns: GridColDef[] = [
  { field: 'InvoiceNumber', headerName: 'Invoice #', width: 130, filterable: true },
  { field: 'IssueDate', headerName: 'Date', width: 120, filterable: true, renderCell: (params) => formatDate(params.value) },
  { field: 'DueDate', headerName: 'Due Date', width: 120, filterable: true, renderCell: (params) => formatDate(params.value) },
  {
    field: 'TotalAmount',
    headerName: 'Amount',
    width: 120,
    type: 'number',
    filterable: true,
    renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
  },
  {
    field: 'Status',
    headerName: 'Status',
    width: 120,
    filterable: true,
    renderCell: (params) => (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[params.value] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
        {params.value}
      </span>
    ),
  },
];

export default function EditCustomer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/customers?$filter=Id eq ${id}`);
      return response.data.value[0];
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      // Convert empty strings to null for DAB compatibility
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? null : v])
      );
      await api.patch(`/customers/Id/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      navigate('/customers');
    },
    onError: (error) => {
      console.error('Failed to update customer:', error);
      alert('Failed to update customer');
    }
  });

  if (isLoading) return <div className="p-4">Loading customer...</div>;
  if (error || !customer) return <div className="p-4 text-red-600">Error loading customer</div>;

  return (
    <div>
      <CustomerForm
        title="Edit Customer"
        initialValues={customer}
        onSubmit={(data) => mutation.mutateAsync(data)}
        isSubmitting={mutation.isPending}
      />

      <div className="max-w-2xl mx-auto mt-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Invoices</h2>
        <RestDataGrid
          endpoint="/invoices"
          columns={invoiceColumns}
          editPath="/invoices/{id}/edit"
          baseFilter={`CustomerId eq ${id}`}
          initialPageSize={10}
          emptyMessage="No invoices for this customer."
        />
      </div>
    </div>
  );
}
