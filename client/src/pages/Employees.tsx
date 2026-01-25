import { Link } from 'react-router-dom';
import { Plus, ShieldCheck, ShieldAlert } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';

interface Employee {
  Id: string;
  EmployeeNumber: string;
  FirstName: string;
  LastName: string;
  FullName: string;
  Email: string;
  Phone: string;
  PayType: string;
  PayRate: number;
  PayFrequency: string;
  Status: string;
  HireDate: string;
  BankVerificationStatus?: string;
  BankRoutingNumber?: string;
}

export default function Employees() {
  const columns: GridColDef[] = [
    { field: 'EmployeeNumber', headerName: 'Employee #', width: 110, filterable: true },
    { field: 'FullName', headerName: 'Name', width: 180, filterable: true },
    { field: 'Email', headerName: 'Email', width: 200, filterable: true },
    { field: 'Phone', headerName: 'Phone', width: 130, filterable: true },
    { field: 'PayType', headerName: 'Pay Type', width: 100, filterable: true },
    {
      field: 'PayRate',
      headerName: 'Pay Rate',
      width: 120,
      valueFormatter: (params) => {
        const value = params as number;
        return value ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';
      }
    },
    { field: 'PayFrequency', headerName: 'Frequency', width: 110, filterable: true },
    {
      field: 'HireDate',
      headerName: 'Hire Date',
      width: 110,
      valueFormatter: (params) => {
        const value = params as string;
        return value ? new Date(value).toLocaleDateString() : '';
      }
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 100,
      renderCell: (params) => {
        const status = params.value as string;
        const colorClass = status === 'Active'
          ? 'bg-green-100 text-green-800'
          : status === 'Inactive'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800';
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>
            {status}
          </span>
        );
      }
    },
    {
      field: 'BankVerificationStatus',
      headerName: 'Bank Verified',
      width: 120,
      renderCell: (params) => {
        const row = params.row as Employee;
        const status = row.BankVerificationStatus;
        const hasBankInfo = !!row.BankRoutingNumber;

        if (!hasBankInfo) {
          return (
            <span className="text-xs text-gray-400">No bank info</span>
          );
        }

        if (status === 'Verified') {
          return (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <ShieldCheck className="w-3 h-3" />
              Verified
            </span>
          );
        }

        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <ShieldAlert className="w-3 h-3" />
            Unverified
          </span>
        );
      }
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Employees</h1>
        <Link
          to="/employees/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Employee
        </Link>
      </div>

      <RestDataGrid<Employee>
        endpoint="/employees"
        columns={columns}
        editPath="/employees/{id}/edit"
        initialPageSize={25}
        emptyMessage="No employees found."
      />
    </div>
  );
}
