import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import CustomerDepositForm, { CustomerDepositFormData } from '../components/CustomerDepositForm';

interface CustomerDeposit {
  Id: string;
  DepositNumber: string;
}

export default function NewCustomerDeposit() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch existing deposits to generate next deposit number
  const { data: existingDeposits } = useQuery({
    queryKey: ['customerdeposits-all'],
    queryFn: async () => {
      const response = await api.get<{ value: CustomerDeposit[] }>('/customerdeposits?$orderby=DepositNumber desc&$top=1');
      return response.data.value;
    },
  });

  const generateNextDepositNumber = (): string => {
    if (!existingDeposits || existingDeposits.length === 0) {
      return 'DEP-0001';
    }
    const lastNumber = existingDeposits[0].DepositNumber;
    const match = lastNumber.match(/DEP-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10) + 1;
      return `DEP-${num.toString().padStart(4, '0')}`;
    }
    return `DEP-${Date.now()}`;
  };

  const mutation = useMutation({
    mutationFn: async (data: CustomerDepositFormData) => {
      // Create journal entry for the deposit (Debit Cash, Credit Unearned Revenue)
      let journalEntryId: string | null = null;

      if (data.DepositAccountId && data.LiabilityAccountId && data.Amount > 0) {
        // Create journal entry header
        const jeResponse = await api.post('/journalentries', {
          Reference: `DEP-${data.DepositNumber}`,
          TransactionDate: data.DepositDate,
          Description: `Customer deposit ${data.DepositNumber}`,
          Status: 'Posted',
          CreatedBy: 'system',
        });
        journalEntryId = jeResponse.data.Id || jeResponse.data.value?.[0]?.Id;

        if (journalEntryId) {
          // Debit Cash/Bank account (Asset increases)
          await api.post('/journalentrylines', {
            JournalEntryId: journalEntryId,
            AccountId: data.DepositAccountId,
            Description: `Deposit received - ${data.DepositNumber}`,
            Debit: data.Amount,
            Credit: 0,
          });

          // Credit Unearned Revenue (Liability increases)
          await api.post('/journalentrylines', {
            JournalEntryId: journalEntryId,
            AccountId: data.LiabilityAccountId,
            Description: `Deposit received - ${data.DepositNumber}`,
            Debit: 0,
            Credit: data.Amount,
          });
        }
      }

      // Create the deposit
      const depositData = {
        ...data,
        Status: 'Open',
        AmountApplied: 0,
        JournalEntryId: journalEntryId,
        // Convert empty strings to null for optional UUID fields
        ProjectId: data.ProjectId || null,
        EstimateId: data.EstimateId || null,
        Reference: data.Reference || null,
        Memo: data.Memo || null,
      };

      await api.post('/customerdeposits_write', depositData);

      // Query to get the created deposit
      const escapedDepositNumber = String(data.DepositNumber).replace(/'/g, "''");
      const queryResponse = await api.get<{ value: CustomerDeposit[] }>(
        `/customerdeposits?$filter=DepositNumber eq '${escapedDepositNumber}'`
      );
      const deposit = queryResponse.data.value[0];

      if (!deposit?.Id) {
        throw new Error('Failed to retrieve created deposit');
      }

      return deposit;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerdeposits'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] }); // Refresh account balances
      navigate('/customer-deposits');
    },
    onError: (error) => {
      console.error('Failed to create deposit:', error);
      setErrorMessage('Failed to create deposit. Please try again.');
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
      <CustomerDepositForm
        title="Receive Customer Deposit"
        initialValues={{
          DepositNumber: generateNextDepositNumber()
        }}
        onSubmit={async (data) => { await mutation.mutateAsync(data); }}
        isSubmitting={mutation.isPending}
        submitButtonText="Receive Deposit"
      />
    </div>
  );
}
