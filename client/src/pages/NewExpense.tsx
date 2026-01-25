import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import ExpenseForm, { ExpenseFormData } from '../components/ExpenseForm';

interface Expense {
  Id: string;
  ExpenseNumber: string;
}

export default function NewExpense() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ data, receipts }: { data: ExpenseFormData; receipts: File[] }) => {
      // Generate expense number
      const expenseNumber = `EXP-${Date.now()}`;

      // Create the expense
      const expenseData = {
        ...data,
        ExpenseNumber: expenseNumber,
        // Convert empty strings to null for nullable UUID fields
        VendorId: data.VendorId || null,
        PaymentAccountId: data.PaymentAccountId || null,
        CustomerId: data.CustomerId || null,
        ProjectId: data.ProjectId || null,
        ClassId: data.ClassId || null,
      };

      await api.post('/expenses_write', expenseData);

      // Query to get the created expense
      const queryResponse = await api.get<{ value: Expense[] }>(
        `/expenses?$filter=ExpenseNumber eq '${expenseNumber}'`
      );
      const expense = queryResponse.data.value[0];

      if (!expense?.Id) {
        throw new Error('Failed to retrieve created expense');
      }

      // Upload receipts if any
      if (receipts.length > 0) {
        await Promise.all(
          receipts.map(async (file) => {
            // Convert file to base64 for storage
            const base64Data = await fileToBase64(file);

            await api.post('/receipts_write', {
              ExpenseId: expense.Id,
              FileName: file.name,
              FileType: file.type,
              FileSize: file.size,
              FileData: base64Data,
              OcrStatus: 'Pending',
            });
          })
        );
      }

      return expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      navigate('/expenses');
    },
    onError: (error) => {
      console.error('Failed to create expense:', error);
      setErrorMessage('Failed to create expense. Please try again.');
    },
  });

  const handleSubmit = async (data: ExpenseFormData, receipts: File[]) => {
    await mutation.mutateAsync({ data, receipts });
  };

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
      <ExpenseForm
        title="New Expense"
        onSubmit={handleSubmit}
        isSubmitting={mutation.isPending}
        submitButtonText="Create Expense"
      />
    </div>
  );
}

// Helper function to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 data without the data URL prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
