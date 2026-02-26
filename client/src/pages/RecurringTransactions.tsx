import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { Plus, Pause, Play, Trash2, Calendar, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useToast } from '../hooks/useToast';

// Helper to extract error message from API errors
function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    return error.response?.data?.message || error.response?.data?.error || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

interface RecurringTemplate {
  Id: string;
  TemplateName: string;
  TransactionType: 'Invoice' | 'Bill' | 'JournalEntry';
  TemplateData: string;
  Frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  IntervalCount: number;
  DayOfMonth: number | null;
  DayOfWeek: number | null;
  StartDate: string;
  EndDate: string | null;
  MaxOccurrences: number | null;
  OccurrencesCreated: number;
  AutoCreate: boolean;
  AutoSend: boolean;
  ReminderDays: number;
  NextScheduledDate: string | null;
  Status: 'Active' | 'Paused' | 'Completed';
  CreatedAt: string;
}

interface RecurringSchedule {
  Id: string;
  RecurringTemplateId: string;
  CreatedTransactionId: string | null;
  TransactionType: string;
  ScheduledDate: string;
  ActualDate: string | null;
  Status: 'Pending' | 'Created' | 'Skipped' | 'Failed';
  ErrorMessage: string | null;
  CreatedAt: string;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function RecurringTransactions() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<RecurringTemplate | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<RecurringTemplate | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch recurring templates
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['recurring-templates'],
    queryFn: async () => {
      const response = await api.get<{ value: RecurringTemplate[] }>('/recurringtemplates');
      return response.data.value;
    },
  });

  // Fetch schedule history for selected template
  const { data: schedules } = useQuery({
    queryKey: ['recurring-schedules', selectedTemplate?.Id],
    queryFn: async () => {
      if (!selectedTemplate) return [];
      const response = await api.get<{ value: RecurringSchedule[] }>(
        `/recurringschedules?$filter=RecurringTemplateId eq ${selectedTemplate.Id}&$orderby=ScheduledDate desc`
      );
      return response.data.value;
    },
    enabled: !!selectedTemplate && showHistoryModal,
  });

  // Update status mutation (pause/resume)
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await api.patch(`/recurringtemplates/Id/${id}`, { Status: status });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error));
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/recurringtemplates/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
      setErrorMessage(null);
      showToast('Recurring template deleted successfully', 'success');
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error));
      setShowDeleteConfirm(false);
      setTemplateToDelete(null);
    },
  });

  const handleDeleteConfirm = () => {
    if (templateToDelete) {
      deleteMutation.mutate(templateToDelete.Id);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setTemplateToDelete(null);
  };

  const getFrequencyLabel = (template: RecurringTemplate) => {
    const interval = template.IntervalCount > 1 ? `Every ${template.IntervalCount} ` : '';
    switch (template.Frequency) {
      case 'Daily':
        return `${interval}${template.IntervalCount > 1 ? 'days' : 'Daily'}`;
      case 'Weekly':
        const dayName = template.DayOfWeek !== null ? DAYS_OF_WEEK[template.DayOfWeek] : '';
        return `${interval}${template.IntervalCount > 1 ? 'weeks' : 'Weekly'}${dayName ? ` on ${dayName}` : ''}`;
      case 'Monthly':
        const dayOfMonth = template.DayOfMonth === -1 ? 'last day' : `day ${template.DayOfMonth}`;
        return `${interval}${template.IntervalCount > 1 ? 'months' : 'Monthly'} on ${dayOfMonth}`;
      case 'Yearly':
        return `${interval}${template.IntervalCount > 1 ? 'years' : 'Yearly'}`;
      default:
        return template.Frequency;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      Active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      Paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      Completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      Pending: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      Created: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      Skipped: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      Failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  const getTransactionTypeBadge = (type: string) => {
    const colors = {
      Invoice: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      Bill: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      JournalEntry: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  if (isLoading) return <div className="p-4">Loading recurring transactions...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading recurring transactions</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Recurring Transactions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage recurring invoices, bills, and journal entries
          </p>
        </div>
        <Link
          to="/recurring/new"
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Recurring Template
        </Link>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="ml-3 flex-1">
              <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="ml-3 text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-md">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Frequency</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Next Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {templates?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  <RefreshCw className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">No recurring transactions</p>
                  <p className="mt-1">Create a template to automate your recurring transactions.</p>
                </td>
              </tr>
            ) : (
              templates?.map((template) => (
                <tr
                  key={template.Id}
                  onClick={() => navigate(`/recurring/${template.Id}/edit`)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{template.TemplateName}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {template.OccurrencesCreated} created
                      {template.MaxOccurrences && ` of ${template.MaxOccurrences}`}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getTransactionTypeBadge(template.TransactionType)}`}>
                      {template.TransactionType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {getFrequencyLabel(template)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {template.NextScheduledDate || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(template.Status)}`}>
                      {template.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTemplate(template);
                          setShowHistoryModal(true);
                        }}
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                        title="View History"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const newStatus = template.Status === 'Active' ? 'Paused' : 'Active';
                          updateStatusMutation.mutate({ id: template.Id, status: newStatus });
                        }}
                        className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                        title={template.Status === 'Active' ? 'Pause' : 'Resume'}
                      >
                        {template.Status === 'Active' ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTemplateToDelete(template);
                          setShowDeleteConfirm(true);
                        }}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && templateToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Delete Recurring Template</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete &quot;{templateToDelete.TemplateName}&quot;? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                History: {selectedTemplate.TemplateName}
              </h3>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedTemplate(null);
                }}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {schedules?.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No history yet</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Scheduled</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actual</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {schedules?.map((schedule) => (
                      <tr key={schedule.Id}>
                        <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{schedule.ScheduledDate}</td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{schedule.ActualDate || '-'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(schedule.Status)}`}>
                            {schedule.Status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedTemplate(null);
                }}
                className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
