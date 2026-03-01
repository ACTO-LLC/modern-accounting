import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Filter } from 'lucide-react';
import api from '../../lib/api';
import { formatDate } from '../../lib/dateUtils';
import ReportHeader from '../../components/reports/ReportHeader';
import DateRangePicker from '../../components/reports/DateRangePicker';
import { formatCurrencyStandalone } from '../../contexts/CurrencyContext';

interface Expense {
  Id: string;
  ExpenseDate: string;
  VendorName: string;
  AccountName: string;
  Amount: number;
  PaymentMethod: string;
  Description: string;
  IsReimbursable: boolean;
  IsPersonal: boolean;
  Status: string;
  CustomerName: string;
  ProjectName: string;
  ClassName: string;
}

type PersonalFilter = 'business' | 'personal' | 'all';

interface GroupedExpenses {
  [category: string]: {
    expenses: Expense[];
    total: number;
  };
}

export default function ExpenseReport() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [groupBy, setGroupBy] = useState<'category' | 'vendor' | 'project'>('category');
  const [showReimbursableOnly, setShowReimbursableOnly] = useState(false);
  const [personalFilter, setPersonalFilter] = useState<PersonalFilter>('business');

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expense-report', startDate, endDate, showReimbursableOnly, personalFilter],
    queryFn: async () => {
      let filter = `ExpenseDate ge ${startDate} and ExpenseDate le ${endDate}`;
      if (showReimbursableOnly) {
        filter += ' and IsReimbursable eq true';
      }
      if (personalFilter === 'business') {
        filter += ' and IsPersonal eq false';
      } else if (personalFilter === 'personal') {
        filter += ' and IsPersonal eq true';
      }
      const response = await api.get<{ value: Expense[] }>(
        `/expenses?$filter=${filter}&$orderby=ExpenseDate desc`
      );
      return response.data.value;
    },
  });

  // Group expenses
  const groupedExpenses: GroupedExpenses = {};
  let grandTotal = 0;

  expenses?.forEach((expense) => {
    let groupKey: string;
    switch (groupBy) {
      case 'vendor':
        groupKey = expense.VendorName || 'No Vendor';
        break;
      case 'project':
        groupKey = expense.ProjectName || 'No Project';
        break;
      case 'category':
      default:
        groupKey = expense.AccountName || 'Uncategorized';
    }

    if (!groupedExpenses[groupKey]) {
      groupedExpenses[groupKey] = { expenses: [], total: 0 };
    }
    groupedExpenses[groupKey].expenses.push(expense);
    groupedExpenses[groupKey].total += expense.Amount || 0;
    grandTotal += expense.Amount || 0;
  });

  const sortedGroups = Object.entries(groupedExpenses).sort(
    (a, b) => b[1].total - a[1].total
  );

  const handleExportCSV = () => {
    if (!expenses || expenses.length === 0) return;

    const headers = ['Date', 'Vendor', 'Category', 'Description', 'Amount', 'Payment Method', 'Reimbursable', 'Personal', 'Status'];
    const rows = expenses.map((e) => [
      e.ExpenseDate,
      e.VendorName || '',
      e.AccountName || '',
      e.Description || '',
      e.Amount.toFixed(2),
      e.PaymentMethod || '',
      e.IsReimbursable ? 'Yes' : 'No',
      e.IsPersonal ? 'Yes' : 'No',
      e.Status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <ReportHeader
        title="Expense Report"
        subtitle={`${formatDate(startDate)} - ${formatDate(endDate)}`}
      />

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group By
            </label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="category">Category</option>
              <option value="vendor">Vendor</option>
              <option value="project">Project</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Show
            </label>
            <select
              value={personalFilter}
              onChange={(e) => setPersonalFilter(e.target.value as PersonalFilter)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="business">Business Only</option>
              <option value="personal">Personal Only</option>
              <option value="all">All Expenses</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              id="reimbursable"
              type="checkbox"
              checked={showReimbursableOnly}
              onChange={(e) => setShowReimbursableOnly(e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="reimbursable" className="ml-2 block text-sm text-gray-900">
              Reimbursable only
            </label>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={!expenses || expenses.length === 0}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Report Content */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : expenses && expenses.length > 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {sortedGroups.map(([groupName, groupData]) => (
            <div key={groupName} className="border-b last:border-b-0">
              <div className="bg-gray-50 px-6 py-3 flex justify-between items-center">
                <h3 className="font-medium text-gray-900">{groupName}</h3>
                <span className="font-semibold text-gray-900">
                  {formatCurrencyStandalone(groupData.total)}
                </span>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    {groupBy !== 'vendor' && (
                      <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Vendor
                      </th>
                    )}
                    {groupBy !== 'category' && (
                      <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Category
                      </th>
                    )}
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Description
                    </th>
                    <th className="px-6 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupData.expenses.map((expense) => (
                    <tr key={expense.Id}>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(expense.ExpenseDate)}
                      </td>
                      {groupBy !== 'vendor' && (
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">
                          {expense.VendorName || '-'}
                        </td>
                      )}
                      {groupBy !== 'category' && (
                        <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-500">
                          {expense.AccountName || '-'}
                        </td>
                      )}
                      <td className="px-6 py-2 text-sm text-gray-500 truncate max-w-xs">
                        {expense.Description || '-'}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatCurrencyStandalone(expense.Amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {/* Grand Total */}
          <div className="bg-indigo-50 px-6 py-4 flex justify-between items-center">
            <span className="font-semibold text-indigo-900">Grand Total</span>
            <span className="text-xl font-bold text-indigo-900">
              {formatCurrencyStandalone(grandTotal)}
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Filter className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-500">No expenses found for the selected date range.</p>
        </div>
      )}
    </div>
  );
}
