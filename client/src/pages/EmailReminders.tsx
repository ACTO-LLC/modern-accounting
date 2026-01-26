import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Mail,
  Plus,
  Edit2,
  Trash2,
  Send,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
  Settings,
  RefreshCw,
  Play,
} from 'lucide-react';
import {
  emailTemplatesApi,
  reminderSettingsApi,
  overdueInvoicesApi,
  EmailTemplate,
  ReminderSetting,
  OverdueInvoice,
} from '../lib/emailApi';
import { formatDate } from '../lib/dateUtils';
import ConfirmModal from '../components/ConfirmModal';
import EmailTemplateEditor from '../components/EmailTemplateEditor';
import ReminderSettingEditor from '../components/ReminderSettingEditor';
import SendReminderModal from '../components/SendReminderModal';

type TabType = 'overview' | 'templates' | 'settings';

export default function EmailReminders() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editingSetting, setEditingSetting] = useState<ReminderSetting | null>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showSettingEditor, setShowSettingEditor] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'template' | 'setting'; id: string } | null>(null);
  const [sendReminderInvoice, setSendReminderInvoice] = useState<OverdueInvoice | null>(null);
  const [processResult, setProcessResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['emailTemplates'],
    queryFn: () => emailTemplatesApi.getAll(),
  });

  // Fetch reminder settings
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['reminderSettings'],
    queryFn: () => reminderSettingsApi.getAll(),
  });

  // Fetch overdue invoices
  const { data: overdueData, isLoading: overdueLoading, refetch: refetchOverdue } = useQuery({
    queryKey: ['overdueInvoices'],
    queryFn: () => overdueInvoicesApi.getAll(),
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => emailTemplatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emailTemplates'] });
      setDeleteConfirm(null);
    },
  });

  // Delete setting mutation
  const deleteSettingMutation = useMutation({
    mutationFn: (id: string) => reminderSettingsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderSettings'] });
      setDeleteConfirm(null);
    },
  });

  // Process reminders mutation
  const processRemindersMutation = useMutation({
    mutationFn: () => overdueInvoicesApi.processReminders(),
    onSuccess: (data) => {
      setProcessResult({ success: true, message: data.message });
      queryClient.invalidateQueries({ queryKey: ['overdueInvoices'] });
    },
    onError: (error: any) => {
      setProcessResult({ success: false, message: error.response?.data?.error || 'Failed to process reminders' });
    },
  });

  const templates = templatesData?.templates || [];
  const reminderSettings = settingsData?.settings || [];
  const overdueInvoices = overdueData?.invoices || [];

  const enabledSettings = reminderSettings.filter((s) => s.IsEnabled);

  const handleEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateEditor(true);
  };

  const handleEditSetting = (setting: ReminderSetting) => {
    setEditingSetting(setting);
    setShowSettingEditor(true);
  };

  const handleNewSetting = () => {
    setEditingSetting(null);
    setShowSettingEditor(true);
  };

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'template') {
      deleteTemplateMutation.mutate(deleteConfirm.id);
    } else {
      deleteSettingMutation.mutate(deleteConfirm.id);
    }
  };

  const getReminderDaysLabel = (days: number) => {
    if (days < 0) return `${Math.abs(days)} days before due`;
    if (days === 0) return 'On due date';
    return `${days} days overdue`;
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Email Reminders</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure automatic email reminders for overdue invoices and manage email templates.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview' as TabType, label: 'Overview', icon: Mail },
            { id: 'templates' as TabType, label: 'Email Templates', icon: FileText },
            { id: 'settings' as TabType, label: 'Reminder Settings', icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Process Result Message */}
      {processResult && (
        <div
          className={`mb-6 p-4 rounded-md ${
            processResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'
          }`}
        >
          <div className="flex items-center">
            {processResult.success ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            )}
            <p
              className={`text-sm font-medium ${
                processResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
              }`}
            >
              {processResult.message}
            </p>
            <button
              onClick={() => setProcessResult(null)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-6 w-6 text-red-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        Overdue Invoices
                      </dt>
                      <dd className="text-lg font-semibold text-gray-900 dark:text-white">
                        {overdueLoading ? '...' : overdueInvoices.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Clock className="h-6 w-6 text-indigo-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        Active Reminders
                      </dt>
                      <dd className="text-lg font-semibold text-gray-900 dark:text-white">
                        {settingsLoading ? '...' : enabledSettings.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <FileText className="h-6 w-6 text-green-500" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        Email Templates
                      </dt>
                      <dd className="text-lg font-semibold text-gray-900 dark:text-white">
                        {templatesLoading ? '...' : templates.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Process Reminders Button */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Process Reminders</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Manually trigger reminder processing for all overdue invoices based on your configured settings.
                </p>
              </div>
              <button
                onClick={() => processRemindersMutation.mutate()}
                disabled={processRemindersMutation.isPending || enabledSettings.length === 0}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processRemindersMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Now
                  </>
                )}
              </button>
            </div>
            {enabledSettings.length === 0 && (
              <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                No reminder settings are enabled. Configure reminder settings first.
              </p>
            )}
          </div>

          {/* Overdue Invoices List */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Overdue Invoices</h3>
              <button
                onClick={() => refetchOverdue()}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Refresh"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-x-auto">
              {overdueLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
              ) : overdueInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="mx-auto h-12 w-12 text-green-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No overdue invoices</h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    All invoices are up to date!
                  </p>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Invoice
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Days Overdue
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Amount Due
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Reminders Sent
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {overdueInvoices.map((invoice) => (
                      <tr key={invoice.InvoiceId}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                          {invoice.InvoiceNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          <div>{invoice.CustomerName}</div>
                          <div className="text-xs text-gray-400">{invoice.CustomerEmail}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(invoice.DueDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              invoice.DaysOverdue > 30
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : invoice.DaysOverdue > 14
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                            }`}
                          >
                            {invoice.DaysOverdue} days
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          ${invoice.AmountDue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {invoice.RemindersSent}
                          {invoice.LastReminderDate && (
                            <div className="text-xs text-gray-400">
                              Last: {formatDate(invoice.LastReminderDate)}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setSendReminderInvoice(invoice)}
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 inline-flex items-center"
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Send Reminder
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* Templates Header */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Create and manage email templates for invoices, reminders, and receipts.
            </p>
            <button
              onClick={handleNewTemplate}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </button>
          </div>

          {/* Templates List */}
          {templatesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 shadow rounded-lg">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No templates</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get started by creating a new email template.
              </p>
              <div className="mt-6">
                <button
                  onClick={handleNewTemplate}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {templates.map((template) => (
                  <li key={template.Id}>
                    <div className="px-4 py-4 sm:px-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {template.Name}
                          </h4>
                          {template.IsDefault && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                            {template.Type}
                          </span>
                          <span className="ml-2">{template.Subject}</span>
                        </p>
                      </div>
                      <div className="ml-4 flex-shrink-0 flex items-center space-x-2">
                        <button
                          onClick={() => handleEditTemplate(template)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="Edit"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'template', id: template.Id! })}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6">
          {/* Settings Header */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure when automatic reminders are sent for overdue invoices.
            </p>
            <button
              onClick={handleNewSetting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Reminder
            </button>
          </div>

          {/* Settings List */}
          {settingsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : reminderSettings.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 shadow rounded-lg">
              <Clock className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No reminder settings</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get started by creating a reminder schedule.
              </p>
              <div className="mt-6">
                <button
                  onClick={handleNewSetting}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Reminder
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {reminderSettings.map((setting) => (
                  <li key={setting.Id}>
                    <div className="px-4 py-4 sm:px-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {setting.Name}
                          </h4>
                          <span
                            className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              setting.IsEnabled
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {setting.IsEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center text-sm text-gray-500 dark:text-gray-400 space-x-4">
                          <span>{getReminderDaysLabel(setting.ReminderDays)}</span>
                          {setting.TemplateName && (
                            <span className="text-xs">Template: {setting.TemplateName}</span>
                          )}
                          <span className="text-xs">
                            Max: {setting.MaxReminders === 0 ? 'Unlimited' : setting.MaxReminders} | Cooldown:{' '}
                            {setting.CooldownDays} days
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 flex-shrink-0 flex items-center space-x-2">
                        <button
                          onClick={() => handleEditSetting(setting)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="Edit"
                        >
                          <Edit2 className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ type: 'setting', id: setting.Id! })}
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <EmailTemplateEditor
          template={editingTemplate}
          onClose={() => {
            setShowTemplateEditor(false);
            setEditingTemplate(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['emailTemplates'] });
            setShowTemplateEditor(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {/* Reminder Setting Editor Modal */}
      {showSettingEditor && (
        <ReminderSettingEditor
          setting={editingSetting}
          templates={templates.filter((t) => t.Type === 'InvoiceReminder')}
          onClose={() => {
            setShowSettingEditor(false);
            setEditingSetting(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['reminderSettings'] });
            setShowSettingEditor(false);
            setEditingSetting(null);
          }}
        />
      )}

      {/* Send Reminder Modal */}
      {sendReminderInvoice && (
        <SendReminderModal
          invoice={sendReminderInvoice}
          templates={templates.filter((t) => t.Type === 'InvoiceReminder')}
          onClose={() => setSendReminderInvoice(null)}
          onSent={() => {
            queryClient.invalidateQueries({ queryKey: ['overdueInvoices'] });
            setSendReminderInvoice(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title={`Delete ${deleteConfirm?.type === 'template' ? 'Template' : 'Reminder Setting'}?`}
        message={`Are you sure you want to delete this ${deleteConfirm?.type === 'template' ? 'email template' : 'reminder setting'}? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        isLoading={deleteTemplateMutation.isPending || deleteSettingMutation.isPending}
        variant="danger"
      />
    </div>
  );
}
