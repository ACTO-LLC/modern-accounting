import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { X, Save, Loader2, Eye, Info } from 'lucide-react';
import { emailTemplatesApi, EmailTemplate, EmailTemplateType } from '../lib/emailApi';

interface EmailTemplateEditorProps {
  template: EmailTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

const TEMPLATE_TYPES: { value: EmailTemplateType; label: string }[] = [
  { value: 'InvoiceReminder', label: 'Invoice Reminder' },
  { value: 'InvoiceDelivery', label: 'Invoice Delivery' },
  { value: 'PaymentReceipt', label: 'Payment Receipt' },
  { value: 'StatementDelivery', label: 'Statement Delivery' },
];

const TEMPLATE_VARIABLES = [
  { name: '{{CustomerName}}', description: 'Customer name' },
  { name: '{{InvoiceNumber}}', description: 'Invoice number' },
  { name: '{{InvoiceDate}}', description: 'Invoice date' },
  { name: '{{DueDate}}', description: 'Payment due date' },
  { name: '{{AmountDue}}', description: 'Amount due (formatted)' },
  { name: '{{DaysOverdue}}', description: 'Days past due date' },
  { name: '{{PaymentLink}}', description: 'Online payment link' },
  { name: '{{CompanyName}}', description: 'Your company name' },
  { name: '{{CompanyEmail}}', description: 'Your company email' },
  { name: '{{CompanyPhone}}', description: 'Your company phone' },
  { name: '{{AmountPaid}}', description: 'Payment amount (for receipts)' },
  { name: '{{PaymentDate}}', description: 'Payment date (for receipts)' },
  { name: '{{PaymentMethod}}', description: 'Payment method (for receipts)' },
  { name: '{{AccountBalance}}', description: 'Remaining balance' },
];

export default function EmailTemplateEditor({ template, onClose, onSaved }: EmailTemplateEditorProps) {
  const [formData, setFormData] = useState<EmailTemplate>({
    Name: '',
    Type: 'InvoiceReminder',
    Subject: '',
    Body: '',
    IsDefault: false,
    IsActive: true,
  });
  const [previewMode, setPreviewMode] = useState(false);
  const [previewContent, setPreviewContent] = useState({ subject: '', body: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (template) {
      setFormData({
        Id: template.Id,
        Name: template.Name,
        Type: template.Type,
        Subject: template.Subject,
        Body: template.Body,
        IsDefault: template.IsDefault || false,
        IsActive: template.IsActive !== false,
      });
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async (data: EmailTemplate) => {
      if (data.Id) {
        return emailTemplatesApi.update(data.Id, data);
      }
      return emailTemplatesApi.save(data);
    },
    onSuccess: () => {
      onSaved();
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to save template');
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => emailTemplatesApi.preview(formData.Subject, formData.Body),
    onSuccess: (data) => {
      setPreviewContent(data);
      setPreviewMode(true);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to generate preview');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.Name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.Subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!formData.Body.trim()) {
      setError('Body is required');
      return;
    }

    saveMutation.mutate(formData);
  };

  const insertVariable = (variable: string) => {
    const textarea = document.getElementById('template-body') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = formData.Body.substring(0, start) + variable + formData.Body.substring(end);
      setFormData({ ...formData, Body: newBody });
      // Set cursor position after insert
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
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
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden transform transition-all pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {template ? 'Edit Email Template' : 'New Email Template'}
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

            {previewMode ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</h4>
                  <button
                    onClick={() => setPreviewMode(false)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                  >
                    Back to Edit
                  </button>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Subject
                    </label>
                    <p className="text-sm text-gray-900 dark:text-white">{previewContent.subject}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Body
                    </label>
                    <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                      {previewContent.body}
                    </pre>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="template-name"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Template Name *
                    </label>
                    <input
                      id="template-name"
                      type="text"
                      value={formData.Name}
                      onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      placeholder="e.g., First Overdue Reminder"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="template-type"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Type *
                    </label>
                    <select
                      id="template-type"
                      value={formData.Type}
                      onChange={(e) => setFormData({ ...formData, Type: e.target.value as EmailTemplateType })}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                      {TEMPLATE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="template-subject"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Subject *
                  </label>
                  <input
                    id="template-subject"
                    type="text"
                    value={formData.Subject}
                    onChange={(e) => setFormData({ ...formData, Subject: e.target.value })}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="e.g., Payment Reminder: Invoice {{InvoiceNumber}} is past due"
                  />
                </div>

                <div>
                  <div className="flex items-start justify-between mb-1">
                    <label
                      htmlFor="template-body"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Body *
                    </label>
                    <div className="relative group">
                      <button type="button" className="text-gray-400 hover:text-gray-600">
                        <Info className="h-4 w-4" />
                      </button>
                      <div className="absolute right-0 w-64 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        <p className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-200">
                          Available Variables (click to insert):
                        </p>
                        <div className="text-xs space-y-1 max-h-48 overflow-y-auto">
                          {TEMPLATE_VARIABLES.map((v) => (
                            <button
                              key={v.name}
                              type="button"
                              onClick={() => insertVariable(v.name)}
                              className="block w-full text-left text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                            >
                              <code className="text-indigo-600 dark:text-indigo-400">{v.name}</code> -{' '}
                              {v.description}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <textarea
                    id="template-body"
                    rows={12}
                    value={formData.Body}
                    onChange={(e) => setFormData({ ...formData, Body: e.target.value })}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Enter your email template body..."
                  />
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.IsDefault}
                      onChange={(e) => setFormData({ ...formData, IsDefault: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Set as default for this type
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.IsActive}
                      onChange={(e) => setFormData({ ...formData, IsActive: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</span>
                  </label>
                </div>
              </form>
            )}
          </div>

          {/* Footer */}
          {!previewMode && (
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {previewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Preview
              </button>
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
                    Save Template
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
