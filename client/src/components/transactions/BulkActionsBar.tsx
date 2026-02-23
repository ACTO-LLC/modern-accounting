import { CheckCircle, XCircle, Tag, X, Zap } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  highConfidenceCount: number;
  onApproveSelected: () => void;
  onRejectSelected: () => void;
  onApproveHighConfidence: () => void;
  onCategorizeSelected: () => void;
  onClearSelection: () => void;
  isLoading: boolean;
}

/** Height of the bulk actions bar in pixels (used by grid height calculation). */
export const BULK_ACTIONS_BAR_HEIGHT = 100;

export default function BulkActionsBar({
  selectedCount,
  highConfidenceCount,
  onApproveSelected,
  onRejectSelected,
  onApproveHighConfidence,
  onCategorizeSelected,
  onClearSelection,
  isLoading,
}: BulkActionsBarProps) {
  const isVisible = selectedCount > 0 || highConfidenceCount > 0;

  return (
    <div
      role="region"
      aria-label="Bulk actions toolbar"
      aria-live="polite"
      aria-atomic="true"
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-200 ease-in-out print:hidden ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="bg-indigo-50 dark:bg-indigo-900/50 border-t border-indigo-200 dark:border-indigo-800 shadow-lg pl-6 pr-24 py-3">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Selection info */}
          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                {selectedCount} selected
              </span>
              <button
                onClick={onClearSelection}
                disabled={isLoading}
                className="p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                title="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Divider */}
          {selectedCount > 0 && (
            <div className="h-6 w-px bg-indigo-300 dark:bg-indigo-700" />
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Approve High Confidence */}
            {highConfidenceCount > 0 && (
              <button
                onClick={onApproveHighConfidence}
                disabled={isLoading}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                <Zap className="h-4 w-4 mr-1.5" />
                Approve High Confidence ({highConfidenceCount})
              </button>
            )}

            {selectedCount > 0 && (
              <>
                {/* Approve Selected */}
                <button
                  onClick={onApproveSelected}
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  Approve Selected
                </button>

                {/* Reject Selected */}
                <button
                  onClick={onRejectSelected}
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-red-700 dark:text-red-100 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Reject
                </button>

                {/* Categorize Selected */}
                <button
                  onClick={onCategorizeSelected}
                  disabled={isLoading}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  <Tag className="h-4 w-4 mr-1.5" />
                  Categorize
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
