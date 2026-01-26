import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { X, Save, Loader2 } from 'lucide-react';
import { reminderSettingsApi, ReminderSetting, EmailTemplate } from '../lib/emailApi';

interface ReminderSettingEditorProps {
  setting: ReminderSetting | null;
  templates: EmailTemplate[];
  onClose: () => void;
  onSaved: () => void;
}

export default function ReminderSettingEditor({
  setting,
  templates,
  onClose,
  onSaved,
}: ReminderSettingEditorProps) {
  const [formData, setFormData] = useState<ReminderSetting>({
    Name: '',
    ReminderDays: 7,
    TemplateId: null,
    IsEnabled: true,
    SendTime: '09:00',
    CooldownDays: 7,
    MaxReminders: 1,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (setting) {
      setFormData({
        Id: setting.Id,
        Name: setting.Name,
        ReminderDays: setting.ReminderDays,
        TemplateId: setting.TemplateId || null,
        IsEnabled: setting.IsEnabled,
        SendTime: setting.SendTime?.substring(0, 5) || '09:00',
        CooldownDays: setting.CooldownDays,
        MaxReminders: setting.MaxReminders,
      });
    }
  }, [setting]);

  const saveMutation = useMutation({
    mutationFn: async (data: ReminderSetting) => {
      // Format SendTime for database
      const payload = {
        ...data,
        SendTime: data.SendTime ? `${data.SendTime}:00` : '09:00:00',
      };
      if (data.Id) {
        return reminderSettingsApi.update(data.Id, payload);
      }
      return reminderSettingsApi.save(payload);
    },
    onSuccess: () => {
      onSaved();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to save reminder setting');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.Name.trim()) {
      setError('Name is required');
      return;
    }
    if (formData.ReminderDays === undefined || formData.ReminderDays === null) {
      setError('Reminder days is required');
      return;
    }

    saveMutation.mutate(formData);
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden transform transition-all pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {setting ? 'Edit Reminder Setting' : 'New Reminder Setting'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="setting-name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Name *
                </label>
                <input
                  id="setting-name"
                  type="text"
                  value={formData.Name}
                  onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="e.g., First Reminder (7 days overdue)"
                />
              </div>

              <div>
                <label
                  htmlFor="reminder-days"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Reminder Days *
                </label>
                <input
                  id="reminder-days"
                  type="number"
                  value={formData.ReminderDays}
                  onChange={(e) => setFormData({ ...formData, ReminderDays: parseInt(e.target.value) || 0 })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Positive number = days after due date. Negative number = days before due date. 0 = on due date.
                </p>
              </div>

              <div>
                <label
                  htmlFor="template-id"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Email Template
                </label>
                <select
                  id="template-id"
                  value={formData.TemplateId || ''}
                  onChange={(e) => setFormData({ ...formData, TemplateId: e.target.value || null })}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">Select a template...</option>
                  {templates.map((template) => (
                    <option key={template.Id} value={template.Id}>
                      {template.Name}
                      {template.IsDefault ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
                {templates.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    No reminder templates available. Create a template first.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="send-time"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Send Time (UTC)
                  </label>
                  <input
                    id="send-time"
                    type="time"
                    value={formData.SendTime}
                    onChange={(e) => setFormData({ ...formData, SendTime: e.target.value })}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cooldown-days"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Cooldown (days)
                  </label>
                  <input
                    id="cooldown-days"
                    type="number"
                    min="1"
                    value={formData.CooldownDays}
                    onChange={(e) =>
                      setFormData({ ...formData, CooldownDays: parseInt(e.target.value) || 1 })
                    }
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Min days between reminders
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="max-reminders"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Maximum Reminders
                </label>
                <input
                  id="max-reminders"
                  type="number"
                  min="0"
                  value={formData.MaxReminders}
                  onChange={(e) =>
                    setFormData({ ...formData, MaxReminders: parseInt(e.target.value) || 0 })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Maximum times this reminder can be sent per invoice. 0 = unlimited.
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is-enabled"
                  checked={formData.IsEnabled}
                  onChange={(e) => setFormData({ ...formData, IsEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="is-enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Enable this reminder
                </label>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
