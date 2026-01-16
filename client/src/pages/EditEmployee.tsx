import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import EmployeeForm, { EmployeeFormData } from '../components/EmployeeForm';

export default function EditEmployee() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ['employee', id],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(`/employees?$filter=Id eq ${id}`);
      const emp = response.data.value[0];
      // Convert dates to input-friendly format (YYYY-MM-DD)
      if (emp) {
        if (emp.DateOfBirth) emp.DateOfBirth = emp.DateOfBirth.split('T')[0];
        if (emp.HireDate) emp.HireDate = emp.HireDate.split('T')[0];
        if (emp.TerminationDate) emp.TerminationDate = emp.TerminationDate.split('T')[0];
      }
      return emp;
    },
    enabled: !!id
  });

  const mutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      // Transform empty strings to null for optional fields
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
      await api.patch(`/employees_write/Id/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      navigate('/employees');
    },
    onError: (error) => {
      console.error('Failed to update employee:', error);
      alert('Failed to update employee');
    }
  });

  if (isLoading) return <div className="p-4">Loading employee...</div>;
  if (error || !employee) return <div className="p-4 text-red-600">Error loading employee</div>;

  return (
    <EmployeeForm
      title="Edit Employee"
      initialValues={employee}
      onSubmit={(data) => mutation.mutateAsync(data)}
      isSubmitting={mutation.isPending}
      submitButtonText="Update Employee"
    />
  );
}
