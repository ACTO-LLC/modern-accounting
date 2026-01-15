import React, { useState } from 'react';
import { RefreshCw, ExternalLink, Eye, Filter, Clock, CheckCircle, AlertCircle, Loader2, XCircle, GitBranch } from 'lucide-react';
import { Enhancement } from '../../services/enhancementApi';
import { formatDate } from '../../lib/dateUtils';

interface EnhancementListProps {
  enhancements: Enhancement[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectEnhancement: (enhancement: Enhancement) => void;
}

const statusConfig: Record<Enhancement['status'], { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: Clock
  },
  analyzing: {
    label: 'Analyzing',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Loader2
  },
  'in-progress': {
    label: 'In Progress',
    color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    icon: GitBranch
  },
  review: {
    label: 'In Review',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: Eye
  },
  approved: {
    label: 'Approved',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle
  },
  deployed: {
    label: 'Deployed',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: CheckCircle
  },
  rejected: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: XCircle
  }
};

export function EnhancementList({ enhancements, isLoading, onRefresh, onSelectEnhancement }: EnhancementListProps) {
  const [statusFilter, setStatusFilter] = useState<Enhancement['status'] | 'all'>('all');

  const filteredEnhancements = statusFilter === 'all'
    ? enhancements
    : enhancements.filter(e => e.status === statusFilter);

  const statusCounts = enhancements.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      {/* Header with filter and refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Enhancement['status'] | 'all')}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm py-1.5 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Statuses ({enhancements.length})</option>
            {Object.entries(statusConfig).map(([status, config]) => (
              <option key={status} value={status}>
                {config.label} ({statusCounts[status] || 0})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Enhancement list */}
      {isLoading && enhancements.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading enhancements...</span>
        </div>
      ) : filteredEnhancements.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 mx-auto text-gray-400" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {statusFilter === 'all'
              ? 'No enhancement requests yet. Submit your first request above!'
              : `No enhancement requests with status "${statusConfig[statusFilter].label}"`}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-lg">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredEnhancements.map((enhancement) => {
              const statusInfo = statusConfig[enhancement.status];
              const StatusIcon = statusInfo.icon;

              return (
                <li
                  key={enhancement.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  onClick={() => onSelectEnhancement(enhancement)}
                >
                  <div className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {enhancement.description.length > 80
                            ? enhancement.description.substring(0, 80) + '...'
                            : enhancement.description}
                        </p>
                        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span>#{enhancement.id}</span>
                          <span>by {enhancement.requestorName}</span>
                          <span>{formatDate(enhancement.createdAt)}</span>
                        </div>
                      </div>
                      <div className="ml-4 flex items-center gap-3">
                        {enhancement.prUrl && (
                          <a
                            href={enhancement.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                            title="View Pull Request"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                          <StatusIcon className={`w-3 h-3 mr-1 ${enhancement.status === 'analyzing' ? 'animate-spin' : ''}`} />
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>
                    {enhancement.intent && (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
                        Intent: {enhancement.intent}
                      </p>
                    )}
                    {enhancement.branchName && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-500 font-mono">
                        Branch: {enhancement.branchName}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default EnhancementList;
