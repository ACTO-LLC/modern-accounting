import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import api from '../lib/api';

interface Bill {
  Id: string;
  VendorId: string;
  BillNumber: string;
  BillDate: string;
  DueDate: string;
  TotalAmount: number;
  AmountPaid: number;
  Status: string;
  Terms: string;
  Memo: string;
}

interface Vendor {
  Id: string;
  Name: string;
}

export default function Bills() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: bills, isLoading, error } = useQuery({
    queryKey: ['bills'],
    queryFn: async () => {
      const response = await api.get<{ value: Bill[] }>('/bills');
      return response.data.value;
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors');
      return response.data.value;
    },
  });

  const vendorMap = vendors?.reduce((acc, vendor) => {
    acc[vendor.Id] = vendor.Name;
    return acc;
  }, {} as Record<string, string>) || {};

  const filteredBills = bills?.filter((bill) => {
    const vendorName = vendorMap[bill.VendorId] || '';
    const matchesSearch =
      searchTerm === '' ||
      bill.BillNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendorName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || bill.Status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'bg-green-100 text-green-800';
      case 'Partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'Overdue':
        return 'bg-red-100 text-red-800';
      case 'Open':
        return 'bg-blue-100 text-blue-800';
      case 'Draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) return <div className="p-4">Loading bills...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading bills</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bills</h1>
        <Link
          to="/bills/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Bill
        </Link>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search bills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
        >
          <option value="all">All Status</option>
          <option value="Draft">Draft</option>
          <option value="Open">Open</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
        </select>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Bill #
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Vendor
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Bill Date
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Due Date
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Amount
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Balance Due
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                Status
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBills?.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                  No bills found.
                </td>
              </tr>
            ) : (
              filteredBills?.map((bill) => (
                <tr key={bill.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {bill.BillNumber || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {vendorMap[bill.VendorId] || 'Unknown Vendor'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bill.BillDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {bill.DueDate}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${bill.TotalAmount?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${((bill.TotalAmount || 0) - (bill.AmountPaid || 0)).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(bill.Status)}`}
                    >
                      {bill.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      to={`/bills/${bill.Id}/edit`}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
