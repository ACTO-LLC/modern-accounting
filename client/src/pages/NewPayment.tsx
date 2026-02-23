import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import ReceivePaymentForm, { ReceivePaymentFormData } from '../components/ReceivePaymentForm';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { createPaymentJournalEntry } from '../lib/autoPostingService';

interface Payment {
  Id: string;
  PaymentNumber: string;
  CustomerName?: string;
}

export default function NewPayment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { settings } = useCompanySettings();

  // Fetch existing payments to generate next payment number
  const { data: existingPayments } = useQuery({
    queryKey: ['payments-all'],
    queryFn: async () => {
      const response = await api.get<{ value: Payment[] }>('/payments?$orderby=PaymentNumber desc&$top=1');
      return response.data.value;
    },
  });

  const generateNextPaymentNumber = (): string => {
    if (!existingPayments || existingPayments.length === 0) {
      return 'PMT-0001';
    }
    const lastNumber = existingPayments[0].PaymentNumber;
    const match = lastNumber.match(/PMT-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      return `PMT-${num.toString().padStart(4, '0')}`;
    }
    return `PMT-${Date.now()}`;
  };

  const mutation = useMutation({
    mutationFn: async (data: ReceivePaymentFormData) => {
      // Create the payment first
      const { Applications, ...paymentData } = data;
      await api.post('/payments_write', {
        ...paymentData,
        ReferenceNumber: paymentData.ReferenceNumber || null,
        Memo: paymentData.Memo || null,
        Status: 'Completed'
      });

      // DAB doesn't return the created entity, so we need to query for it
      const escapedPaymentNumber = String(paymentData.PaymentNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: Payment[] }>(
        `/payments?$filter=PaymentNumber eq '${escapedPaymentNumber}'`
      );
      const payment = queryResponse.data.value[0];

      if (!payment?.Id) {
        throw new Error('Failed to retrieve created payment');
      }

      // Create payment applications
      for (const app of Applications) {
        await api.post('/paymentapplications', {
          PaymentId: payment.Id,
          InvoiceId: app.InvoiceId,
          AmountApplied: app.AmountApplied
        });

        // Update the invoice's AmountPaid
        // First get the current invoice
        const invoiceResponse = await api.get<{ value: { Id: string; AmountPaid: number; TotalAmount: number }[] }>(
          `/invoices?$filter=Id eq ${app.InvoiceId}`
        );
        const invoice = invoiceResponse.data.value[0];

        if (invoice) {
          const newAmountPaid = (invoice.AmountPaid || 0) + app.AmountApplied;
          const newStatus = newAmountPaid >= invoice.TotalAmount ? 'Paid' : 'Partial';

          await api.patch(`/invoices_write/Id/${app.InvoiceId}`, {
            AmountPaid: newAmountPaid,
            Status: newStatus
          });
        }
      }

      // In Simple mode, auto-post journal entry (Debit Bank, Credit AR)
      if (settings.invoicePostingMode === 'simple') {
        try {
          await createPaymentJournalEntry(
            payment.Id,
            paymentData.TotalAmount,
            paymentData.PaymentNumber,
            payment.CustomerName || 'Customer',
            paymentData.PaymentDate,
            paymentData.DepositAccountId
          );
        } catch (postingError) {
          console.warn('Auto-posting failed, payment still created:', postingError);
        }
      }

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/payments');
    },
    onError: (error) => {
      console.error('Failed to create payment:', error);
      setErrorMessage('Failed to create payment. Please try again.');
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
      <ReceivePaymentForm
        title="Receive Payment"
        initialValues={{
          PaymentNumber: generateNextPaymentNumber()
        }}
        onSubmit={async (data) => { await mutation.mutateAsync(data); }}
        isSubmitting={mutation.isPending}
        submitButtonText="Receive Payment"
      />
    </div>
  );
}
