import React from 'react';
import {
  X,
  ExternalLink,
  GitBranch,
  User,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  XCircle,
  Eye,
  FileText
} from 'lucide-react';
import { Enhancement } from '../../services/enhancementApi';
import { formatDate } from '../../lib/dateUtils';

interface EnhancementDetailProps {
  enhancement: Enhancement;
  onClose: () => void;
  onScheduleDeployment?: (enhancement: Enhancement) => void;
}

const statusConfig: Record<Enhancement['status'], { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: {
    label: 'Pending Review',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    icon: Clock
  },
  analyzing: {
    label: 'AI Analyzing',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    icon: Loader2
  },
  'in-progress': {
    label: 'Development In Progress',
    color: 'text-indigo-600 dark:text-indigo-400',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    icon: GitBranch
  },
  review: {
    label: 'Code Review',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    icon: Eye
  },
  approved: {
    label: 'Approved for Deployment',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    icon: CheckCircle
  },
  deployed: {
    label: 'Deployed to Production',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    icon: CheckCircle
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    icon: XCircle
  }
};

const statusTimeline: Enhancement['status'][] = [
  'pending',
  'analyzing',
  'in-progress',
  'review',
  'approved',
  'deployed'
];

export function EnhancementDetail({ enhancement, onClose, onScheduleDeployment }: EnhancementDetailProps) {
  const statusInfo = statusConfig[enhancement.status];
  const StatusIcon = statusInfo.icon;

  const currentStatusIndex = statusTimeline.indexOf(enhancement.status);
  const isRejected = enhancement.status === 'rejected';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Enhancement #{enhancement.id}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
                  <StatusIcon className={`w-3 h-3 mr-1 ${enhancement.status === 'analyzing' ? 'animate-spin' : ''}`} />
                  {statusInfo.label}
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-6">
            {/* Description */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Description
              </h3>
              <p className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                {enhancement.description}
              </p>
            </div>

            {/* AI-Extracted Intent */}
            {enhancement.intent && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                      AI-Extracted Intent
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      {enhancement.intent}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Development Info */}
            {(enhancement.branchName || enhancement.prUrl) && (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Development Details
                </h4>
                {enhancement.branchName && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-300">Branch:</span>
                    <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-800 dark:text-gray-200 font-mono text-xs">
                      {enhancement.branchName}
                    </code>
                  </div>
                )}
                {enhancement.prUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-300">Pull Request:</span>
                    <a
                      href={enhancement.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline"
                    >
                      View on GitHub
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {enhancement.notes && (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                      Notes / Implementation Plan
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {enhancement.notes}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Status Timeline */}
            {!isRejected && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Progress Timeline
                </h4>
                <div className="flex items-center justify-between">
                  {statusTimeline.map((status, index) => {
                    const info = statusConfig[status];
                    const Icon = info.icon;
                    const isCompleted = index < currentStatusIndex;
                    const isCurrent = index === currentStatusIndex;

                    return (
                      <React.Fragment key={status}>
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              isCompleted
                                ? 'bg-green-500 text-white'
                                : isCurrent
                                ? `${info.bgColor} ${info.color}`
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-400'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <Icon className={`w-4 h-4 ${isCurrent && status === 'analyzing' ? 'animate-spin' : ''}`} />
                            )}
                          </div>
                          <span className={`mt-1 text-xs ${isCurrent ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                            {info.label.split(' ')[0]}
                          </span>
                        </div>
                        {index < statusTimeline.length - 1 && (
                          <div
                            className={`flex-1 h-0.5 mx-2 ${
                              index < currentStatusIndex
                                ? 'bg-green-500'
                                : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-4">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>{enhancement.requestorName}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                <span>Created {formatDate(enhancement.createdAt)}</span>
              </div>
              {enhancement.updatedAt !== enhancement.createdAt && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Updated {formatDate(enhancement.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 border-t border-gray-200 dark:border-gray-600 flex justify-end gap-3">
            {enhancement.status === 'approved' && onScheduleDeployment && (
              <button
                onClick={() => onScheduleDeployment(enhancement)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Schedule Deployment
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnhancementDetail;
