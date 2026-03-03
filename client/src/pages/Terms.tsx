import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';

interface Term {
  Id: string;
  Name: string;
  DueDays: number;
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

export default function Terms() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const {
    data: terms,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['terms'],
    queryFn: async () => {
      const response = await api.get<{ value: Term[] }>('/terms?$orderby=DueDays asc');
      return response.data.value;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/terms/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms'] });
      showToast('Term deleted successfully', 'success');
    },
    onError: () => {
      showToast('Failed to delete term', 'error');
    },
  });

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete the term "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const filteredTerms = terms?.filter((term) => {
    const matchesSearch =
      searchTerm === '' ||
      term.Name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && term.IsActive) ||
      (statusFilter === 'inactive' && !term.IsActive);
    return matchesSearch && matchesStatus;
  });

  if (isLoading) return <div className="p-4 dark:text-gray-300">Loading terms...</div>;
  if (error)
    return <div className="p-4 text-red-600 dark:text-red-400">Error loading terms</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Payment Terms</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage payment terms for invoices and customers
          </p>
        </div>
        <Link
          to="/terms/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Term
        </Link>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search terms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
          />
        </div>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Due Days
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                Status
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredTerms?.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No terms found. Create your first payment term to get started.
                </td>
              </tr>
            ) : (
              filteredTerms?.map((term) => (
                <tr
                  key={term.Id}
                  onClick={() => navigate(`/terms/${term.Id}/edit`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {term.Name}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                    {term.DueDays === 0 ? 'Immediate' : `${term.DueDays} days`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        term.IsActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {term.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={(e) => handleDelete(e, term.Id, term.Name)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <p>
          Payment terms define when invoices are due. Set default terms at the company or customer level,
          or override on individual invoices.
        </p>
      </div>
    </div>
  );
}
