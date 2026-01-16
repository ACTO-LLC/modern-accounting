import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import api from '../lib/api';
import { generatePayRunNumber, calculatePayPeriodDates } from '../lib/payrollCalculations';

const PAY_FREQUENCIES = [
  { value: 'Weekly', label: 'Weekly' },
  { value: 'Biweekly', label: 'Biweekly' },
  { value: 'Semimonthly', label: 'Semimonthly' },
  { value: 'Monthly', label: 'Monthly' },
];

export default function NewPayRun() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const today = new Date();
  const defaultPayDate = today.toISOString().split('T')[0];

  const [payFrequency, setPayFrequency] = useState('Biweekly');
  const [payDate, setPayDate] = useState(defaultPayDate);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');

  // Auto-calculate period dates when pay date or frequency changes
  const handlePayDateChange = (newDate: string) => {
    setPayDate(newDate);
    if (newDate) {
      const { start, end } = calculatePayPeriodDates(new Date(newDate), payFrequency);
      setPeriodStart(start.toISOString().split('T')[0]);
      setPeriodEnd(end.toISOString().split('T')[0]);
    }
  };

  const handleFrequencyChange = (newFrequency: string) => {
    setPayFrequency(newFrequency);
    if (payDate) {
      const { start, end } = calculatePayPeriodDates(new Date(payDate), newFrequency);
      setPeriodStart(start.toISOString().split('T')[0]);
      setPeriodEnd(end.toISOString().split('T')[0]);
    }
  };

  // Initialize period dates
  useState(() => {
    const { start, end } = calculatePayPeriodDates(new Date(payDate), payFrequency);
    setPeriodStart(start.toISOString().split('T')[0]);
    setPeriodEnd(end.toISOString().split('T')[0]);
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payRunNumber = generatePayRunNumber(new Date(payDate));
      const payload = {
        PayRunNumber: payRunNumber,
        PayPeriodStart: periodStart,
        PayPeriodEnd: periodEnd,
        PayDate: payDate,
        Status: 'Draft',
        TotalGrossPay: 0,
        TotalDeductions: 0,
        TotalNetPay: 0,
        EmployeeCount: 0,
      };
      const response = await api.post('/payruns_write', payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payruns'] });
      // Navigate to the pay run detail page
      navigate(`/payruns/${data.Id}`);
    },
    onError: (error) => {
      console.error('Failed to create pay run:', error);
      alert('Failed to create pay run');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const inputClass = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate('/payruns')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Create New Pay Run</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-6">
        <div>
          <label htmlFor="payFrequency" className={labelClass}>Pay Frequency</label>
          <select
            id="payFrequency"
            value={payFrequency}
            onChange={(e) => handleFrequencyChange(e.target.value)}
            className={inputClass}
          >
            {PAY_FREQUENCIES.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Select the pay frequency for this pay run
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="periodStart" className={labelClass}>Pay Period Start</label>
            <input
              id="periodStart"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="periodEnd" className={labelClass}>Pay Period End</label>
            <input
              id="periodEnd"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className={inputClass}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="payDate" className={labelClass}>Pay Date</label>
          <input
            id="payDate"
            type="date"
            value={payDate}
            onChange={(e) => handlePayDateChange(e.target.value)}
            className={inputClass}
            required
          />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            The date employees will be paid
          </p>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
          <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Next Steps</h3>
          <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
            After creating the pay run, you'll be able to:
          </p>
          <ul className="mt-2 text-sm text-blue-600 dark:text-blue-400 list-disc list-inside">
            <li>Enter hours for hourly employees</li>
            <li>Review calculated taxes and deductions</li>
            <li>Approve and process the payroll</li>
          </ul>
        </div>

        <div className="flex justify-end items-center border-t dark:border-gray-600 pt-4">
          <button
            type="button"
            onClick={() => navigate('/payruns')}
            className="mr-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Pay Run'}
          </button>
        </div>
      </form>
    </div>
  );
}
