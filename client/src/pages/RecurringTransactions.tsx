import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { Plus, Pause, Play, Trash2, Calendar, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { isAxiosError } from 'axios';

// Type aliases for better type safety
type TransactionType = 'Invoice' | 'Bill' | 'JournalEntry';
type FrequencyType = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

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

// Validation error interface
interface ValidationError {
  field: string;
  message: string;
}

// Validate form data before submission
function validateTemplateForm(data: CreateTemplateFormData): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!data.TemplateName.trim()) {
    errors.push({ field: 'TemplateName', message: 'Template name is required' });
  }
  if (data.IntervalCount < 1 || data.IntervalCount > 365) {
    errors.push({ field: 'IntervalCount', message: 'Interval must be between 1 and 365' });
  }
  if (!data.StartDate) {
    errors.push({ field: 'StartDate', message: 'Start date is required' });
  }
  if (data.EndDate && data.StartDate && data.EndDate < data.StartDate) {
    errors.push({ field: 'EndDate', message: 'End date must be on or after start date' });
  }
  if (data.Frequency === 'Weekly' && (data.DayOfWeek === null || data.DayOfWeek < 0 || data.DayOfWeek > 6)) {
    errors.push({ field: 'DayOfWeek', message: 'Day of week is required for weekly frequency' });
  }
  if (data.Frequency === 'Monthly' && (data.DayOfMonth === null || (data.DayOfMonth < 1 && data.DayOfMonth !== -1) || data.DayOfMonth > 31)) {
    errors.push({ field: 'DayOfMonth', message: 'Day of month is required for monthly frequency' });
  }
  if (data.MaxOccurrences !== null && (data.MaxOccurrences < 1 || data.MaxOccurrences > 9999)) {
    errors.push({ field: 'MaxOccurrences', message: 'Max occurrences must be between 1 and 9999' });
  }
  if (data.ReminderDays < 0 || data.ReminderDays > 365) {
    errors.push({ field: 'ReminderDays', message: 'Reminder days must be between 0 and 365' });
  }
  return errors;
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

interface CreateTemplateFormData {
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
  AutoCreate: boolean;
  AutoSend: boolean;
  ReminderDays: number;
}

const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Yearly'] as const;
const TRANSACTION_TYPES = ['Invoice', 'Bill', 'JournalEntry'] as const;
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function RecurringTransactions() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateTemplateFormData) => {
      const payload = {
        ...data,
        NextScheduledDate: data.StartDate,
        Status: 'Active',
        OccurrencesCreated: 0,
      };
      const response = await api.post('/recurringtemplates', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      setShowCreateModal(false);
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error));
    },
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
      Active: 'bg-green-100 text-green-800',
      Paused: 'bg-yellow-100 text-yellow-800',
      Completed: 'bg-gray-100 text-gray-800',
      Pending: 'bg-blue-100 text-blue-800',
      Created: 'bg-green-100 text-green-800',
      Skipped: 'bg-yellow-100 text-yellow-800',
      Failed: 'bg-red-100 text-red-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getTransactionTypeBadge = (type: string) => {
    const colors = {
      Invoice: 'bg-indigo-100 text-indigo-800',
      Bill: 'bg-orange-100 text-orange-800',
      JournalEntry: 'bg-purple-100 text-purple-800',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) return <div className="p-4">Loading recurring transactions...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading recurring transactions</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Recurring Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage recurring invoices, bills, and journal entries
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Recurring Template
        </button>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="ml-3 flex-1">
              <p className="text-sm text-red-700">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="ml-3 text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden rounded-md">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {templates?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  <RefreshCw className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">No recurring transactions</p>
                  <p className="mt-1">Create a template to automate your recurring transactions.</p>
                </td>
              </tr>
            ) : (
              templates?.map((template) => (
                <tr key={template.Id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{template.TemplateName}</div>
                    <div className="text-sm text-gray-500">
                      {template.OccurrencesCreated} created
                      {template.MaxOccurrences && ` of ${template.MaxOccurrences}`}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getTransactionTypeBadge(template.TransactionType)}`}>
                      {template.TransactionType}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getFrequencyLabel(template)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {template.NextScheduledDate || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(template.Status)}`}>
                      {template.Status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowHistoryModal(true);
                        }}
                        className="text-gray-600 hover:text-gray-900"
                        title="View History"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const newStatus = template.Status === 'Active' ? 'Paused' : 'Active';
                          updateStatusMutation.mutate({ id: template.Id, status: newStatus });
                        }}
                        className="text-gray-600 hover:text-gray-900"
                        title={template.Status === 'Active' ? 'Pause' : 'Resume'}
                      >
                        {template.Status === 'Active' ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setTemplateToDelete(template);
                          setShowDeleteConfirm(true);
                        }}
                        className="text-red-600 hover:text-red-900"
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900">Delete Recurring Template</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Are you sure you want to delete "{templateToDelete.TemplateName}"? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
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

      {/* Create Template Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
          error={createMutation.error ? getErrorMessage(createMutation.error) : null}
        />
      )}

      {/* History Modal */}
      {showHistoryModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">
                History: {selectedTemplate.TemplateName}
              </h3>
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedTemplate(null);
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                &times;
              </button>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {schedules?.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No history yet</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scheduled</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actual</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {schedules?.map((schedule) => (
                      <tr key={schedule.Id}>
                        <td className="px-4 py-2 text-sm text-gray-900">{schedule.ScheduledDate}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{schedule.ActualDate || '-'}</td>
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
            <div className="px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowHistoryModal(false);
                  setSelectedTemplate(null);
                }}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
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

interface CreateTemplateModalProps {
  onClose: () => void;
  onSubmit: (data: CreateTemplateFormData) => void;
  isSubmitting: boolean;
  error: string | null;
}

function CreateTemplateModal({ onClose, onSubmit, isSubmitting, error }: CreateTemplateModalProps) {
  const [formData, setFormData] = useState<CreateTemplateFormData>({
    TemplateName: '',
    TransactionType: 'Invoice',
    TemplateData: '{}',
    Frequency: 'Monthly',
    IntervalCount: 1,
    DayOfMonth: 1,
    DayOfWeek: null,
    StartDate: new Date().toISOString().split('T')[0],
    EndDate: null,
    MaxOccurrences: null,
    AutoCreate: false,
    AutoSend: false,
    ReminderDays: 3,
  });

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateTemplateForm(formData);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    onSubmit(formData);
  };

  

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Create Recurring Template</h3>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* API Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="flex items-center">
                <AlertTriangle className="w-4 h-4 text-red-600 mr-2" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Validation Errors Summary */}
          {validationErrors.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <div className="flex items-start">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mr-2 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Please fix the following errors:</p>
                  <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Template Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Template Name</label>
            <input
              type="text"
              required
              value={formData.TemplateName}
              onChange={(e) => setFormData({ ...formData, TemplateName: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., Monthly Rent Invoice"
            />
          </div>

          {/* Transaction Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Transaction Type</label>
            <select
              value={formData.TransactionType}
              onChange={(e) => setFormData({ ...formData, TransactionType: e.target.value as TransactionType })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              {TRANSACTION_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Frequency</label>
              <select
                value={formData.Frequency}
                onChange={(e) => {
                  const freq = e.target.value as FrequencyType;
                  setFormData({
                    ...formData,
                    Frequency: freq,
                    DayOfWeek: freq === 'Weekly' ? 1 : null,
                    DayOfMonth: freq === 'Monthly' ? 1 : null,
                  });
                }}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                {FREQUENCY_OPTIONS.map((freq) => (
                  <option key={freq} value={freq}>{freq}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Every</label>
              <input
                type="number"
                min="1"
                value={formData.IntervalCount}
                onChange={(e) => setFormData({ ...formData, IntervalCount: parseInt(e.target.value) || 1 })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Day of Week (for Weekly) */}
          {formData.Frequency === 'Weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Day of Week</label>
              <select
                value={formData.DayOfWeek ?? 1}
                onChange={(e) => setFormData({ ...formData, DayOfWeek: parseInt(e.target.value) })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                {DAYS_OF_WEEK.map((day, index) => (
                  <option key={day} value={index}>{day}</option>
                ))}
              </select>
            </div>
          )}

          {/* Day of Month (for Monthly) */}
          {formData.Frequency === 'Monthly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Day of Month</label>
              <select
                value={formData.DayOfMonth ?? 1}
                onChange={(e) => setFormData({ ...formData, DayOfMonth: parseInt(e.target.value) })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
                <option value={-1}>Last day of month</option>
              </select>
            </div>
          )}

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Date</label>
              <input
                type="date"
                required
                value={formData.StartDate}
                onChange={(e) => setFormData({ ...formData, StartDate: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">End Date (Optional)</label>
              <input
                type="date"
                value={formData.EndDate || ''}
                onChange={(e) => setFormData({ ...formData, EndDate: e.target.value || null })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Max Occurrences */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Max Occurrences (Optional)</label>
            <input
              type="number"
              min="1"
              value={formData.MaxOccurrences || ''}
              onChange={(e) => setFormData({ ...formData, MaxOccurrences: e.target.value ? parseInt(e.target.value) : null })}
              placeholder="Leave empty for unlimited"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Settings */}
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.AutoCreate}
                onChange={(e) => setFormData({ ...formData, AutoCreate: e.target.checked })}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="ml-2 text-sm text-gray-700">Auto-create transactions on schedule</span>
            </label>
            {formData.TransactionType === 'Invoice' && (
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.AutoSend}
                  onChange={(e) => setFormData({ ...formData, AutoSend: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Auto-send invoices to customers</span>
              </label>
            )}
          </div>

          {/* Reminder Days */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Reminder Days Before</label>
            <input
              type="number"
              min="0"
              value={formData.ReminderDays}
              onChange={(e) => setFormData({ ...formData, ReminderDays: parseInt(e.target.value) || 0 })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
