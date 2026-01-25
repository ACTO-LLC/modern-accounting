import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { emailSettingsApi, emailSendApi, replaceTemplateVariables } from '../lib/emailApi';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { formatDate } from '../lib/dateUtils';

interface Customer {
  Id: string;
  Name: string;
  Email?: string;
}

interface EmailStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  startDate: string;
  endDate: string;
  totalDue: number;
}

export default function EmailStatementModal({
  isOpen,
  onClose,
  customer,
  startDate,
  endDate,
  totalDue,
}: EmailStatementModalProps) {
  const { settings: companySettings } = useCompanySettings();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadEmailSettings();
    }
  }, [isOpen, customer, startDate, endDate, totalDue]);

  const loadEmailSettings = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await emailSettingsApi.get();

      if (!response.configured || !response.settings?.SmtpHost) {
        setEmailConfigured(false);
        setError('Email settings not configured. Please configure SMTP settings in Company Settings first.');
        return;
      }

      setEmailConfigured(true);

      // Pre-fill recipient from customer
      setRecipientEmail(customer?.Email || '');
      setRecipientName(customer?.Name || '');

      // Build template variables
      const formatAmount = (amount: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

      const templateVars = {
        CustomerName: customer?.Name || '',
        StatementPeriod: `${formatDate(startDate)} - ${formatDate(endDate)}`,
        TotalDue: formatAmount(totalDue),
        CompanyName: companySettings.name || '',
        CompanyEmail: companySettings.email || '',
        CompanyPhone: companySettings.phone || '',
      };

      // Default statement email template
      const defaultSubject = `Statement from {{CompanyName}} - {{StatementPeriod}}`;
      const defaultBody = `Dear {{CustomerName}},

Please find attached your statement for the period {{StatementPeriod}}.

Total Amount Due: {{TotalDue}}

If you have any questions regarding this statement, please don't hesitate to contact us.

Thank you for your business!

Best regards,
{{CompanyName}}
${companySettings.email ? `Email: {{CompanyEmail}}` : ''}
${companySettings.phone ? `Phone: {{CompanyPhone}}` : ''}`;

      // Replace template variables
      const subjectWithVars = replaceTemplateVariables(defaultSubject, templateVars);
      const bodyWithVars = replaceTemplateVariables(defaultBody, templateVars);

      setSubject(subjectWithVars);
      setBody(bodyWithVars);
    } catch (err) {
      console.error('Failed to load email settings:', err);
      setError('Failed to load email settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!recipientEmail) {
      setError('Recipient email is required');
      return;
    }

    try {
      setIsSending(true);
      setError(null);

      // Note: For now, we just send the email with text.
      // PDF generation would require server-side implementation.
      await emailSendApi.sendStatement(customer.Id, {
        recipientEmail,
        recipientName,
        subject,
        body,
        startDate,
        endDate,
        companySettings: {
          name: companySettings.name,
          email: companySettings.email,
          phone: companySettings.phone,
        },
      });

      setSuccess(true);

      // Close after a short delay to show success
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error('Failed to send email:', err);
      // Check if the API endpoint doesn't exist yet
      if (err.response?.status === 404) {
        setError('Statement email feature is not yet fully implemented on the server. Please use Print to PDF and email manually.');
      } else {
        setError(err.response?.data?.error || 'Failed to send email. Please try again.');
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setRecipientEmail('');
    setRecipientName('');
    setSubject('');
    setBody('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="email-statement-modal">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden transform transition-all pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Email Statement to {customer.Name}
              </h3>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : success ? (
              <div className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Email Sent!</h4>
                <p className="text-gray-500 dark:text-gray-400">
                  Statement has been sent to {recipientEmail}
                </p>
              </div>
            ) : !emailConfigured ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-16 w-16 text-amber-500 mb-4" />
                <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Email Not Configured</h4>
                <p className="text-gray-500 dark:text-gray-400 text-center">
                  Please configure your email settings in the Company Settings page before sending statements.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                {/* Recipient */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="recipient-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Recipient Email *
                    </label>
                    <input
                      id="recipient-email"
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="recipient-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Recipient Name
                    </label>
                    <input
                      id="recipient-name"
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="John Smith"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label htmlFor="email-subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Subject
                  </label>
                  <input
                    id="email-subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                {/* Body */}
                <div>
                  <label htmlFor="email-body" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Message
                  </label>
                  <textarea
                    id="email-body"
                    rows={10}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>

                {/* Attachment Info */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <strong>Note:</strong> For PDF attachments, please use the Print button to save as PDF and attach manually.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!isLoading && !success && emailConfigured && (
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !recipientEmail}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Email
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
