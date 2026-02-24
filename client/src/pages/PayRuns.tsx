import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatCurrency } from '../lib/payrollCalculations';
import { getTimestampColumns } from '../lib/gridColumns';

interface PayRun {
  Id: string;
  PayRunNumber: string;
  PayPeriodStart: string;
  PayPeriodEnd: string;
  PayDate: string;
  Status: string;
  TotalGrossPay: number;
  TotalDeductions: number;
  TotalNetPay: number;
  EmployeeCount: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export default function PayRuns() {
  const columns: GridColDef[] = [
    { field: 'PayRunNumber', headerName: 'Pay Run #', width: 140, filterable: true },
    {
      field: 'PayPeriodStart',
      headerName: 'Period Start',
      width: 110,
      valueFormatter: (params) => {
        const value = params as string;
        return value ? new Date(value).toLocaleDateString() : '';
      }
    },
    {
      field: 'PayPeriodEnd',
      headerName: 'Period End',
      width: 110,
      valueFormatter: (params) => {
        const value = params as string;
        return value ? new Date(value).toLocaleDateString() : '';
      }
    },
    {
      field: 'PayDate',
      headerName: 'Pay Date',
      width: 110,
      valueFormatter: (params) => {
        const value = params as string;
        return value ? new Date(value).toLocaleDateString() : '';
      }
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 110,
      renderCell: (params) => {
        const status = params.value as string;
        let colorClass = 'bg-gray-100 text-gray-800';
        switch (status) {
          case 'Draft':
            colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
            break;
          case 'Processing':
            colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
            break;
          case 'Approved':
            colorClass = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            break;
          case 'Paid':
            colorClass = 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
            break;
          case 'Voided':
            colorClass = 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            break;
        }
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
            {status}
          </span>
        );
      }
    },
    {
      field: 'EmployeeCount',
      headerName: 'Employees',
      width: 100,
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'TotalGrossPay',
      headerName: 'Gross Pay',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (params) => {
        const value = params as number;
        return formatCurrency(value || 0);
      }
    },
    {
      field: 'TotalDeductions',
      headerName: 'Deductions',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (params) => {
        const value = params as number;
        return formatCurrency(value || 0);
      }
    },
    {
      field: 'TotalNetPay',
      headerName: 'Net Pay',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      valueFormatter: (params) => {
        const value = params as number;
        return formatCurrency(value || 0);
      }
    },
    ...getTimestampColumns(),
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Payroll Runs</h1>
        <Link
          to="/payruns/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Pay Run
        </Link>
      </div>

      <RestDataGrid<PayRun>
        endpoint="/payruns"
        columns={columns}
        editPath="/payruns/{id}"
        initialPageSize={25}
        emptyMessage="No pay runs found. Create your first pay run to get started."
      />
    </div>
  );
}
