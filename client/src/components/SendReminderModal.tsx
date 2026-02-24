import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { X, Send, Loader2, CheckCircle, Eye } from 'lucide-react';
import {
  overdueInvoicesApi,
  emailTemplatesApi,
  EmailTemplate,
  OverdueInvoice,
  replaceTemplateVariables,
} from '../lib/emailApi';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { formatDateShort } from '../lib/dateUtils';

interface SendReminderModalProps {
  invoice: OverdueInvoice;
  templates: EmailTemplate[];
  onClose: () => void;
  onSent: () => void;
}

export default function SendReminderModal({
  invoice,
  templates,
  onClose,
  onSent,
}: SendReminderModalProps) {
  const { settings: companySettings } = useCompanySettings();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(invoice.CustomerEmail);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewContent, setPreviewContent] = useState({ subject: '', body: '' });

  // Set default template
  useEffect(() => {
    const defaultTemplate = templates.find((t) => t.IsDefault) || templates[0];
    if (defaultTemplate) {
      setSelectedTemplateId(defaultTemplate.Id || '');
      applyTemplate(defaultTemplate);
    }
  }, [templates]);

  const applyTemplate = (template: EmailTemplate) => {
    // Build template variables
    const templateVars = {
      CustomerName: invoice.CustomerName,
      InvoiceNumber: invoice.InvoiceNumber,
      InvoiceDate: formatDateShort(invoice.IssueDate),
      DueDate: formatDateShort(invoice.DueDate),
      AmountDue: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        invoice.AmountDue
      ),
      DaysOverdue: invoice.DaysOverdue.toString(),
      PaymentLink: `${window.location.origin}/pay/${invoice.InvoiceId}`,
      CompanyName: companySettings.name || '',
      CompanyEmail: companySettings.email || '',
      CompanyPhone: companySettings.phone || '',
    };

    setCustomSubject(replaceTemplateVariables(template.Subject, templateVars));
    setCustomBody(replaceTemplateVariables(template.Body, templateVars));
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.Id === templateId);
    if (template) {
      applyTemplate(template);
    }
  };

  const sendMutation = useMutation({
    mutationFn: () =>
      overdueInvoicesApi.sendReminder(invoice.InvoiceId, {
        recipientEmail,
        recipientName: invoice.CustomerName,
        templateId: selectedTemplateId || undefined,
        customSubject,
        customBody,
        companySettings: {
          name: companySettings.name,
          email: companySettings.email,
          phone: companySettings.phone,
        },
      }),
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        onSent();
      }, 2000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to send reminder');
    },
  });

  const previewMutation = useMutation({
    mutationFn: () => emailTemplatesApi.preview(customSubject, customBody),
    onSuccess: (data) => {
      setPreviewContent(data);
      setPreviewMode(true);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to generate preview');
    },
  });

  const handleSubmit = () => {
    setError(null);

    if (!recipientEmail) {
      setError('Recipient email is required');
      return;
    }
    if (!customSubject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!customBody.trim()) {
      setError('Message body is required');
      return;
    }

    sendMutation.mutate();
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
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden transform transition-all pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Send Payment Reminder
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

            {success ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Reminder Sent!
                </h4>
                <p className="text-gray-500 dark:text-gray-400">
                  Payment reminder has been sent to {recipientEmail}
                </p>
              </div>
            ) : previewMode ? (
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
                      To
                    </label>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {invoice.CustomerName} &lt;{recipientEmail}&gt;
                    </p>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Subject
                    </label>
                    <p className="text-sm text-gray-900 dark:text-white">{previewContent.subject}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Message
                    </label>
                    <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">
                      {previewContent.body}
                    </pre>
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-700/50 rounded-md p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Attachment:</strong> Invoice-{invoice.InvoiceNumber}.pdf will be attached
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Invoice Info */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Invoice:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {invoice.InvoiceNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Amount Due:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        ${invoice.AmountDue.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Customer:</span>{' '}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {invoice.CustomerName}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Days Overdue:</span>{' '}
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {invoice.DaysOverdue}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Template Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Template
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    <option value="">Custom Message</option>
                    {templates.map((template) => (
                      <option key={template.Id} value={template.Id}>
                        {template.Name}
                        {template.IsDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Recipient */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recipient Email *
                  </label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="customer@example.com"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Subject *
                  </label>
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                {/* Body */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Message *
                  </label>
                  <textarea
                    rows={8}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                {/* Attachment Info */}
                <div className="bg-gray-100 dark:bg-gray-700/50 rounded-md p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Attachment:</strong> Invoice-{invoice.InvoiceNumber}.pdf will be attached
                    automatically
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!success && !previewMode && (
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
                disabled={sendMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {sendMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Reminder
                  </>
                )}
              </button>
            </div>
          )}

          {previewMode && !success && (
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={sendMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {sendMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Reminder
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
