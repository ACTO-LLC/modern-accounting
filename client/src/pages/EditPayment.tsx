import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import ReceivePaymentForm, { ReceivePaymentFormData } from '../components/ReceivePaymentForm';
import { useToast } from '../hooks/useToast';
import { formatGuidForOData } from '../lib/validation';
import Button from '@mui/material/Button';

interface Payment {
  Id: string;
  PaymentNumber: string;
  ReferenceNumber: string | null;
  CustomerId: string;
  CustomerName: string;
  PaymentDate: string;
  TotalAmount: number;
  PaymentMethod: string;
  DepositAccountId: string;
  DepositAccountName: string;
  Memo: string | null;
  Status: string;
}

interface PaymentApplication {
  Id: string;
  PaymentId: string;
  InvoiceId: string;
  AmountApplied: number;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  TotalAmount: number;
  BalanceDue: number;
}

export default function EditPayment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { showToast } = useToast();

  // Fetch payment details
  const { data: payment, isLoading: isLoadingPayment } = useQuery({
    queryKey: ['payment', id],
    queryFn: async (): Promise<Payment | null> => {
      const response = await api.get<{ value: Payment[] }>(
        `/payments?$filter=Id eq ${formatGuidForOData(id!, 'Payment Id')}`
      );
      return response.data.value[0] || null;
    },
    enabled: !!id
  });

  // Fetch payment applications
  const { data: applications, isLoading: isLoadingApps } = useQuery({
    queryKey: ['payment-applications', id],
    queryFn: async (): Promise<PaymentApplication[]> => {
      const response = await api.get<{ value: PaymentApplication[] }>(
        `/paymentapplications?$filter=PaymentId eq ${formatGuidForOData(id!, 'Payment Id')}`
      );
      return response.data.value;
    },
    enabled: !!id
  });

  // Fetch invoice details for each application
  const { data: invoiceDetails } = useQuery({
    queryKey: ['payment-invoices', applications],
    queryFn: async () => {
      if (!applications || applications.length === 0) return [];
      const details = await Promise.all(
        applications.map(async (app) => {
          try {
            const response = await api.get<{ value: Invoice[] }>(
              `/invoices?$filter=Id eq ${formatGuidForOData(app.InvoiceId, 'Invoice Id')}`
            );
            const inv = response.data.value[0];
            return {
              InvoiceId: app.InvoiceId,
              AmountApplied: app.AmountApplied,
              InvoiceNumber: inv?.InvoiceNumber || 'Unknown',
              InvoiceTotalAmount: inv?.TotalAmount || 0,
              InvoiceBalanceDue: (inv?.BalanceDue || 0) + app.AmountApplied, // Add back what was already applied
            };
          } catch {
            return {
              InvoiceId: app.InvoiceId,
              AmountApplied: app.AmountApplied,
              InvoiceNumber: 'Unknown',
              InvoiceTotalAmount: 0,
              InvoiceBalanceDue: app.AmountApplied,
            };
          }
        })
      );
      return details;
    },
    enabled: !!applications && applications.length > 0
  });

  const mutation = useMutation({
    mutationFn: async (data: ReceivePaymentFormData) => {
      const { Applications, ...paymentData } = data;

      // Update payment record
      await api.patch(`/payments_write/Id/${id}`, {
        PaymentNumber: paymentData.PaymentNumber,
        CustomerId: paymentData.CustomerId,
        PaymentDate: paymentData.PaymentDate,
        TotalAmount: paymentData.TotalAmount,
        PaymentMethod: paymentData.PaymentMethod,
        DepositAccountId: paymentData.DepositAccountId,
        ReferenceNumber: paymentData.ReferenceNumber || null,
        Memo: paymentData.Memo || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment', id] });
      showToast('Payment updated successfully', 'success');
      navigate('/payments');
    },
    onError: (error) => {
      console.error('Failed to update payment:', error);
      setErrorMessage('Failed to update payment. Please try again.');
    },
  });

  const handleVoid = async () => {
    if (!window.confirm('Are you sure you want to void this payment? This cannot be undone.')) return;

    try {
      await api.patch(`/payments_write/Id/${id}`, { Status: 'Voided' });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      showToast('Payment voided', 'success');
      navigate('/payments');
    } catch (error) {
      console.error('Failed to void payment:', error);
      showToast('Failed to void payment', 'error');
    }
  };

  if (isLoadingPayment || isLoadingApps) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading payment...</div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-red-500">Payment not found</div>
      </div>
    );
  }

  const initialValues: Partial<ReceivePaymentFormData> = {
    PaymentNumber: payment.PaymentNumber,
    CustomerId: payment.CustomerId,
    PaymentDate: payment.PaymentDate?.split('T')[0],
    TotalAmount: payment.TotalAmount,
    PaymentMethod: payment.PaymentMethod,
    DepositAccountId: payment.DepositAccountId,
    ReferenceNumber: payment.ReferenceNumber,
    Memo: payment.Memo,
    Applications: invoiceDetails || [],
  };

  return (
    <div>
      {errorMessage && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4 flex justify-between items-center dark:bg-red-900/20 dark:border-red-800">
            <p className="text-red-600 dark:text-red-400">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:text-red-800 dark:text-red-400">
              Dismiss
            </button>
          </div>
        </div>
      )}
      <ReceivePaymentForm
        title={`Payment ${payment.PaymentNumber}`}
        initialValues={initialValues}
        onSubmit={async (data) => { await mutation.mutateAsync(data); }}
        isSubmitting={mutation.isPending}
        submitButtonText="Save Changes"
        headerActions={
          payment.Status !== 'Voided' ? (
            <Button variant="outlined" color="error" onClick={handleVoid} size="small">
              Void Payment
            </Button>
          ) : (
            <span className="px-3 py-1 text-sm font-medium text-red-700 bg-red-100 rounded-full dark:text-red-300 dark:bg-red-900/30">
              Voided
            </span>
          )
        }
      />
    </div>
  );
}
