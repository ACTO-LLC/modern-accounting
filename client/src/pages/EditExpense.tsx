import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';
import ExpenseForm, { ExpenseFormData } from '../components/ExpenseForm';

interface Expense {
  Id: string;
  ExpenseNumber: string;
  ExpenseDate: string;
  VendorId: string | null;
  VendorName: string | null;
  AccountId: string;
  Amount: number;
  PaymentAccountId: string | null;
  PaymentMethod: string | null;
  Description: string | null;
  Reference: string | null;
  IsReimbursable: boolean;
  CustomerId: string | null;
  ProjectId: string | null;
  ClassId: string | null;
  Status: string;
}

export default function EditExpense() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: expense, isLoading } = useQuery({
    queryKey: ['expense', id],
    queryFn: async () => {
      const response = await api.get<{ value: Expense[] }>(
        `/expenses?$filter=Id eq ${id}`
      );
      return response.data.value[0];
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async ({ data, receipts }: { data: ExpenseFormData; receipts: File[] }) => {
      // Update the expense
      const expenseData = {
        ...data,
        // Convert empty strings to null for nullable UUID fields
        VendorId: data.VendorId || null,
        PaymentAccountId: data.PaymentAccountId || null,
        CustomerId: data.CustomerId || null,
        ProjectId: data.ProjectId || null,
        ClassId: data.ClassId || null,
      };

      await api.patch(`/expenses_write/Id/${id}`, expenseData);

      // Upload any new receipts
      if (receipts.length > 0) {
        await Promise.all(
          receipts.map(async (file) => {
            const base64Data = await fileToBase64(file);

            await api.post('/receipts_write', {
              ExpenseId: id,
              FileName: file.name,
              FileType: file.type,
              FileSize: file.size,
              FileData: base64Data,
              OcrStatus: 'Pending',
            });
          })
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      navigate('/expenses');
    },
    onError: (error) => {
      console.error('Failed to update expense:', error);
      setErrorMessage('Failed to update expense. Please try again.');
    },
  });

  const handleSubmit = async (data: ExpenseFormData, receipts: File[]) => {
    await mutation.mutateAsync({ data, receipts });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Expense not found.</p>
      </div>
    );
  }

  const initialValues: Partial<ExpenseFormData> = {
    ExpenseNumber: expense.ExpenseNumber,
    ExpenseDate: expense.ExpenseDate?.split('T')[0],
    VendorId: expense.VendorId,
    VendorName: expense.VendorName,
    AccountId: expense.AccountId,
    Amount: expense.Amount,
    PaymentAccountId: expense.PaymentAccountId,
    PaymentMethod: expense.PaymentMethod,
    Description: expense.Description,
    Reference: expense.Reference,
    IsReimbursable: expense.IsReimbursable,
    CustomerId: expense.CustomerId,
    ProjectId: expense.ProjectId,
    ClassId: expense.ClassId,
    Status: expense.Status as ExpenseFormData['Status'],
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
        title="Edit Expense"
        initialValues={initialValues}
        onSubmit={handleSubmit}
        isSubmitting={mutation.isPending}
        submitButtonText="Save Changes"
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
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
