import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Plus, Receipt, FileText, User } from 'lucide-react';
import { GridColDef } from '@mui/x-data-grid';
import RestDataGrid from '../components/RestDataGrid';
import { formatDate } from '../lib/dateUtils';

interface Expense {
  Id: string;
  ExpenseNumber: string;
  ExpenseDate: string;
  VendorName: string;
  AccountName: string;
  Amount: number;
  PaymentMethod: string;
  Description: string;
  IsReimbursable: boolean;
  IsPersonal: boolean;
  Status: string;
  ReceiptCount: number;
}

type PersonalFilter = 'all' | 'business' | 'personal';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Recorded':
      return 'bg-green-100 text-green-800';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'Reimbursed':
      return 'bg-blue-100 text-blue-800';
    case 'Voided':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export default function Expenses() {
  const [personalFilter, setPersonalFilter] = useState<PersonalFilter>('business');

  // Build endpoint with filter
  const getEndpoint = () => {
    let endpoint = '/expenses?$orderby=ExpenseDate desc';
    if (personalFilter === 'business') {
      endpoint += '&$filter=IsPersonal eq false';
    } else if (personalFilter === 'personal') {
      endpoint += '&$filter=IsPersonal eq true';
    }
    return endpoint;
  };

  const columns: GridColDef[] = [
    {
      field: 'ExpenseDate',
      headerName: 'Date',
      width: 120,
      filterable: true,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: 'VendorName',
      headerName: 'Vendor / Payee',
      width: 180,
      filterable: true,
      renderCell: (params) => params.value || <span className="text-gray-400 italic">No vendor</span>,
    },
    {
      field: 'AccountName',
      headerName: 'Category',
      width: 180,
      filterable: true,
    },
    {
      field: 'Description',
      headerName: 'Description',
      width: 200,
      filterable: true,
      renderCell: (params) => (
        <span className="truncate" title={params.value}>
          {params.value || '-'}
        </span>
      ),
    },
    {
      field: 'Amount',
      headerName: 'Amount',
      width: 120,
      type: 'number',
      filterable: true,
      renderCell: (params) => `$${(params.value || 0).toFixed(2)}`,
    },
    {
      field: 'PaymentMethod',
      headerName: 'Payment',
      width: 120,
      filterable: true,
      renderCell: (params) => params.value || '-',
    },
    {
      field: 'ReceiptCount',
      headerName: 'Receipts',
      width: 100,
      type: 'number',
      renderCell: (params) => (
        <div className="flex items-center">
          <Receipt className={`w-4 h-4 mr-1 ${params.value > 0 ? 'text-green-600' : 'text-gray-300'}`} />
          <span>{params.value || 0}</span>
        </div>
      ),
    },
    {
      field: 'IsPersonal',
      headerName: 'Type',
      width: 100,
      renderCell: (params) =>
        params.value ? (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
            <User className="w-3 h-3 mr-1" />
            Personal
          </span>
        ) : (
          <span className="text-xs text-gray-500">Business</span>
        ),
    },
    {
      field: 'IsReimbursable',
      headerName: 'Reimb.',
      width: 80,
      renderCell: (params) =>
        params.value ? (
          <span className="text-xs font-medium text-indigo-600">Yes</span>
        ) : (
          <span className="text-xs text-gray-400">No</span>
        ),
    },
    {
      field: 'Status',
      headerName: 'Status',
      width: 110,
      filterable: true,
      renderCell: (params) => (
        <span
          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
            params.value
          )}`}
        >
          {params.value}
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Expenses</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and manage business expenses with receipt capture
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={personalFilter}
            onChange={(e) => setPersonalFilter(e.target.value as PersonalFilter)}
            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm border p-2"
          >
            <option value="business">Business Only</option>
            <option value="personal">Personal Only</option>
            <option value="all">All Expenses</option>
          </select>
          <Link
            to="/receipts"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
          >
            <FileText className="w-4 h-4 mr-2" />
            Receipt Inbox
          </Link>
          <Link
            to="/expenses/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Expense
          </Link>
        </div>
      </div>

      <RestDataGrid<Expense>
        key={personalFilter}
        endpoint={getEndpoint()}
        columns={columns}
        editPath="/expenses/{id}/edit"
        initialPageSize={25}
        emptyMessage="No expenses found. Click 'New Expense' to add one."
      />
    </div>
  );
}
