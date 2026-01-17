import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import EmployeeForm, { EmployeeFormData } from '../components/EmployeeForm';

export default function NewEmployee() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      // Transform empty strings to null for optional date fields
      const payload = {
        ...data,
        DateOfBirth: data.DateOfBirth || null,
        TerminationDate: data.TerminationDate || null,
        StateCode: data.StateCode || null,
        StateFilingStatus: data.StateFilingStatus || null,
        BankRoutingNumber: data.BankRoutingNumber || null,
        BankAccountNumber: data.BankAccountNumber || null,
        BankAccountType: data.BankAccountType || null,
        Address: data.Address || null,
        City: data.City || null,
        State: data.State || null,
        ZipCode: data.ZipCode || null,
        Email: data.Email || null,
        Phone: data.Phone || null,
        SSNLast4: data.SSNLast4 || null,
      };
      await api.post('/employees_write', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      navigate('/employees');
    },
    onError: (error) => {
      console.error('Failed to create employee:', error);
      alert('Failed to create employee');
    }
  });

  return (
    <EmployeeForm
      title="New Employee"
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
    />
  );
}
