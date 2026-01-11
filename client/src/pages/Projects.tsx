import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, FolderOpen } from 'lucide-react';
import { projectsApi, Project, customersApi, Customer } from '../lib/api';
import clsx from 'clsx';

export default function Projects() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: projects = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.getAll,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });

  const customersMap = new Map(customers.map(c => [c.Id, c.Name]));

  const filteredProjects = statusFilter === 'all'
    ? projects
    : projects.filter(p => p.Status === statusFilter);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-800';
      case 'Completed':
        return 'bg-blue-100 text-blue-800';
      case 'OnHold':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoading) return <div className="p-4">Loading projects...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading projects</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
        <Link
          to="/projects/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Link>
      </div>

      {/* Status Filter */}
      <div className="mb-4 flex space-x-2">
        {['all', 'Active', 'OnHold', 'Completed'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={clsx(
              'px-3 py-1 rounded-full text-sm font-medium transition-colors',
              statusFilter === status
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {status === 'all' ? 'All' : status === 'OnHold' ? 'On Hold' : status}
          </button>
        ))}
      </div>

      {filteredProjects.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
          <p className="mt-1 text-sm text-gray-500">
            {statusFilter === 'all'
              ? 'Get started by creating a new project.'
              : `No projects with status "${statusFilter}".`}
          </p>
          <div className="mt-6">
            <Link
              to="/projects/new"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dates
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Budget
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProjects.map((project) => (
                <tr key={project.Id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{project.Name}</div>
                    {project.Description && (
                      <div className="text-sm text-gray-500 truncate max-w-xs">{project.Description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {customersMap.get(project.CustomerId) || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={clsx(
                      'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                      getStatusBadgeClass(project.Status)
                    )}>
                      {project.Status === 'OnHold' ? 'On Hold' : project.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {project.StartDate && (
                      <div>Start: {new Date(project.StartDate).toLocaleDateString()}</div>
                    )}
                    {project.EndDate && (
                      <div>End: {new Date(project.EndDate).toLocaleDateString()}</div>
                    )}
                    {!project.StartDate && !project.EndDate && '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {project.BudgetedHours && <div>{project.BudgetedHours} hrs</div>}
                    {project.BudgetedAmount && <div>{formatCurrency(project.BudgetedAmount)}</div>}
                    {!project.BudgetedHours && !project.BudgetedAmount && '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link to={`/projects/${project.Id}/edit`} className="text-indigo-600 hover:text-indigo-900">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
