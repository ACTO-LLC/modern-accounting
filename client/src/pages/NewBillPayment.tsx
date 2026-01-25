import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import PayBillForm, { PayBillFormData } from '../components/PayBillForm';

interface BillPayment {
  Id: string;
  PaymentNumber: string;
}

export default function NewBillPayment() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch existing bill payments to generate next payment number
  const { data: existingPayments } = useQuery({
    queryKey: ['billpayments-all'],
    queryFn: async () => {
      const response = await api.get<{ value: BillPayment[] }>('/billpayments?$orderby=PaymentNumber desc&$top=1');
      return response.data.value;
    },
  });

  const generateNextPaymentNumber = (): string => {
    if (!existingPayments || existingPayments.length === 0) {
      return 'BP-0001';
    }
    const lastNumber = existingPayments[0].PaymentNumber;
    const match = lastNumber.match(/BP-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      return `BP-${num.toString().padStart(4, '0')}`;
    }
    return `BP-${Date.now()}`;
  };

  const mutation = useMutation({
    mutationFn: async (data: PayBillFormData) => {
      // Create the bill payment first
      const { Applications, ...paymentData } = data;
      await api.post('/billpayments_write', {
        ...paymentData,
        Status: 'Completed'
      });

      // DAB doesn't return the created entity, so we need to query for it
      const escapedPaymentNumber = String(paymentData.PaymentNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: BillPayment[] }>(
        `/billpayments?$filter=PaymentNumber eq '${escapedPaymentNumber}'`
      );
      const payment = queryResponse.data.value[0];

      if (!payment?.Id) {
        throw new Error('Failed to retrieve created bill payment');
      }

      // Create bill payment applications
      for (const app of Applications) {
        await api.post('/billpaymentapplications', {
          BillPaymentId: payment.Id,
          BillId: app.BillId,
          AmountApplied: app.AmountApplied
        });

        // Update the bill's AmountPaid
        // First get the current bill
        const billResponse = await api.get<{ value: { Id: string; AmountPaid: number; TotalAmount: number }[] }>(
          `/bills?$filter=Id eq ${app.BillId}`
        );
        const bill = billResponse.data.value[0];

        if (bill) {
          const newAmountPaid = (bill.AmountPaid || 0) + app.AmountApplied;
          const newStatus = newAmountPaid >= bill.TotalAmount ? 'Paid' : 'Partial';

          await api.patch(`/bills_write/Id/${app.BillId}`, {
            AmountPaid: newAmountPaid,
            Status: newStatus
          });
        }
      }

      return payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billpayments'] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      navigate('/bill-payments');
    },
    onError: (error) => {
      console.error('Failed to create bill payment:', error);
      setErrorMessage('Failed to create bill payment. Please try again.');
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
      <PayBillForm
        title="Pay Bills"
        initialValues={{
          PaymentNumber: generateNextPaymentNumber()
        }}
        onSubmit={async (data) => { await mutation.mutateAsync(data); }}
        isSubmitting={mutation.isPending}
        submitButtonText="Pay Bills"
      />
    </div>
  );
}
