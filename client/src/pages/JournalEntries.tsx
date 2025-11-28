import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface JournalEntry {
  Id: string;
  Reference: string; // Was EntryNumber
  TransactionDate: string; // Was EntryDate
  Description: string;
  Status: string;
  TotalAmount: number; // Derived or stored
}

export default function JournalEntries() {
  const navigate = useNavigate();
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const response = await api.get<{ value: JournalEntry[] }>('/journal-entries');
      return response.data.value;
    },
  });

  if (isLoading) return <div className="p-4">Loading ledger...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading ledger</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">General Ledger</h1>
        <button 
          onClick={() => navigate('/journal-entries/new')}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Entry
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {entries?.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  No journal entries found.
                </td>
              </tr>
            ) : (
              entries?.map((entry) => (
                <tr key={entry.Id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entry.Reference}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.TransactionDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.Description}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {entry.Status}
                    </span>
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
