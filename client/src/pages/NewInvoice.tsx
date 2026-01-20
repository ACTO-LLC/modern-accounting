import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import InvoiceForm, { InvoiceFormData } from '../components/InvoiceForm';

export default function NewInvoice() {
  const navigate = useNavigate();

  const onSubmit = async (data: InvoiceFormData) => {
    try {
      await api.post('/invoices_write', data);
      navigate('/invoices');
    } catch (error) {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice');
    }
  };

  return (
    <InvoiceForm 
      title="New Invoice" 
      onSubmit={onSubmit}
      submitButtonText="Create Invoice"
    />
  );
}
