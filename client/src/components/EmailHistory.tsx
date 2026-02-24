import { useState, useEffect } from 'react';
import { Mail, CheckCircle, XCircle, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { emailSendApi, EmailLog } from '../lib/emailApi';
import { formatDateTime } from '../lib/dateUtils';

interface EmailHistoryProps {
  invoiceId: string;
  refreshTrigger?: number;
}

export default function EmailHistory({ invoiceId, refreshTrigger }: EmailHistoryProps) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, [invoiceId, refreshTrigger]);

  const loadLogs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await emailSendApi.getLogs(invoiceId);
      setLogs(response.logs);
    } catch (err) {
      console.error('Failed to load email logs:', err);
      setError('Failed to load email history');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'Failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'Pending':
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Sent':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'Pending':
      default:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 dark:text-red-400 py-2">
        {error}
        <button
          onClick={loadLogs}
          className="ml-2 text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          Retry
        </button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 py-2 flex items-center gap-2">
        <Mail className="h-4 w-4" />
        No emails sent yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email History
        </h4>
        <button
          onClick={loadLogs}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.Id}
            className="bg-gray-50 dark:bg-gray-700/50 rounded-md p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getStatusIcon(log.Status)}
                  <span className="font-medium text-gray-900 dark:text-white truncate">
                    {log.RecipientEmail}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(log.Status)}`}>
                    {log.Status}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 truncate">
                  {log.Subject}
                </p>
                {log.ErrorMessage && (
                  <p className="text-red-600 dark:text-red-400 text-xs mt-1">
                    Error: {log.ErrorMessage}
                  </p>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {log.SentAt
                  ? formatDateTime(log.SentAt)
                  : formatDateTime(log.CreatedAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
