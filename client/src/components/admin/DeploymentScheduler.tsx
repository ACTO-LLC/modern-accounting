import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Loader2,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Rocket,
  RefreshCw
} from 'lucide-react';
import { Deployment, Enhancement } from '../../services/enhancementApi';
import { formatDate } from '../../lib/dateUtils';

interface DeploymentSchedulerProps {
  deployments: Deployment[];
  approvedEnhancements: Enhancement[];
  isLoading: boolean;
  onSchedule: (enhancementId: number, scheduledDate: Date) => Promise<void>;
  onCancel: (deploymentId: number) => Promise<void>;
  onRefresh: () => void;
}

const statusConfig: Record<Deployment['status'], { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: {
    label: 'Scheduled',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: Clock
  },
  'in-progress': {
    label: 'Deploying',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Loader2
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle
  },
  failed: {
    label: 'Failed',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: XCircle
  },
  cancelled: {
    label: 'Cancelled',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
    icon: XCircle
  }
};

export function DeploymentScheduler({
  deployments: rawDeployments,
  approvedEnhancements: rawApprovedEnhancements,
  isLoading,
  onSchedule,
  onCancel,
  onRefresh
}: DeploymentSchedulerProps) {
  // Defensive: ensure array props are always arrays
  const deployments = Array.isArray(rawDeployments) ? rawDeployments : [];
  const approvedEnhancements = Array.isArray(rawApprovedEnhancements) ? rawApprovedEnhancements : [];
  const [selectedEnhancement, setSelectedEnhancement] = useState<number | ''>('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter out enhancements that already have pending deployments
  const pendingDeploymentEnhancementIds = deployments
    .filter(d => d.status === 'pending' || d.status === 'in-progress')
    .map(d => d.enhancementId);

  const availableEnhancements = approvedEnhancements.filter(
    e => !pendingDeploymentEnhancementIds.includes(e.id)
  );

  const pendingDeployments = deployments.filter(
    d => d.status === 'pending' || d.status === 'in-progress'
  );

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnhancement || !scheduledDate) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const dateTime = new Date(`${scheduledDate}T${scheduledTime}`);
      if (dateTime <= new Date()) {
        throw new Error('Scheduled date must be in the future');
      }
      await onSchedule(selectedEnhancement as number, dateTime);
      setSelectedEnhancement('');
      setScheduledDate('');
      setScheduledTime('09:00');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule deployment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async (deploymentId: number) => {
    setCancellingId(deploymentId);
    try {
      await onCancel(deploymentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel deployment');
    } finally {
      setCancellingId(null);
    }
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Schedule New Deployment */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          Schedule New Deployment
        </h3>

        {availableEnhancements.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <AlertTriangle className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
            <p className="text-gray-600 dark:text-gray-400">
              No approved enhancements available for deployment.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Enhancements must be approved before they can be deployed.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSchedule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="enhancement"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Enhancement
                </label>
                <select
                  id="enhancement"
                  value={selectedEnhancement}
                  onChange={(e) => setSelectedEnhancement(e.target.value ? Number(e.target.value) : '')}
                  className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  required
                >
                  <option value="">Select enhancement...</option>
                  {availableEnhancements.map((e) => (
                    <option key={e.id} value={e.id}>
                      #{e.id} - {e.description.substring(0, 50)}...
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="date"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    id="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={today}
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                    required
                  />
                  <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="time"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Time
                </label>
                <div className="relative">
                  <input
                    type="time"
                    id="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-2 px-3 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                    required
                  />
                  <Clock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3">
                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting || !selectedEnhancement || !scheduledDate}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 mr-2" />
                    Schedule Deployment
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Pending Deployments */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Pending Deployments
          </h3>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {isLoading && pendingDeployments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading deployments...</span>
          </div>
        ) : pendingDeployments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-2" />
            <p>No pending deployments scheduled.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingDeployments.map((deployment) => {
              const statusInfo = statusConfig[deployment.status];
              const StatusIcon = statusInfo.icon;
              const scheduledDateTime = new Date(deployment.scheduledDate);

              return (
                <div
                  key={deployment.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        <StatusIcon className={`w-3 h-3 mr-1 ${deployment.status === 'in-progress' ? 'animate-spin' : ''}`} />
                        {statusInfo.label}
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Enhancement #{deployment.enhancementId}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(deployment.scheduledDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {scheduledDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {deployment.enhancement && (
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 truncate">
                        {deployment.enhancement.description}
                      </p>
                    )}
                  </div>
                  {deployment.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(deployment.id)}
                      disabled={cancellingId === deployment.id}
                      className="ml-4 inline-flex items-center px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md disabled:opacity-50"
                    >
                      {cancellingId === deployment.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 mr-1" />
                          Cancel
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Deployments History */}
      {deployments.filter(d => d.status === 'completed' || d.status === 'failed' || d.status === 'cancelled').length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Deployment History
          </h3>
          <div className="space-y-2">
            {deployments
              .filter(d => d.status === 'completed' || d.status === 'failed' || d.status === 'cancelled')
              .slice(0, 10)
              .map((deployment) => {
                const statusInfo = statusConfig[deployment.status];
                const StatusIcon = statusInfo.icon;

                return (
                  <div
                    key={deployment.id}
                    className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusInfo.label}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        Enhancement #{deployment.enhancementId}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(deployment.updatedAt)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

export default DeploymentScheduler;
