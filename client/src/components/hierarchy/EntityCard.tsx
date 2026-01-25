import { ChevronRight } from 'lucide-react';
import { EntityCardData, CardState } from './types';

interface EntityCardProps {
  data: EntityCardData;
  state?: CardState;
  onClick?: () => void;
  onSelect?: () => void;
  isSelectable?: boolean;
  showDrillIcon?: boolean;
}

const statusVariants = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  neutral: 'bg-gray-100 text-gray-800',
};

const cardStateStyles = {
  default: 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500',
  hover: 'bg-white border-indigo-300 shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500',
  selected: 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200 focus:outline-none',
  disabled: 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed',
};

export default function EntityCard({
  data,
  state = 'default',
  onClick,
  onSelect,
  isSelectable = false,
  showDrillIcon = true,
}: EntityCardProps) {
  const handleClick = () => {
    if (state === 'disabled') return;
    onClick?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (state === 'disabled') return;
    onSelect?.();
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`
        relative rounded-lg border p-4 transition-all duration-200 cursor-pointer
        ${cardStateStyles[state]}
      `}
      role="button"
      tabIndex={state === 'disabled' ? -1 : 0}
      aria-disabled={state === 'disabled'}
    >
      {/* Selection checkbox */}
      {isSelectable && (
        <div className="absolute top-3 left-3">
          <input
            type="checkbox"
            checked={state === 'selected'}
            onChange={handleSelectChange}
            className="h-4 w-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            disabled={state === 'disabled'}
          />
        </div>
      )}

      {/* Drill-down indicator */}
      {showDrillIcon && state !== 'disabled' && (
        <div className="absolute top-3 right-3 text-gray-400">
          <ChevronRight className="w-5 h-5" />
        </div>
      )}

      {/* Card content */}
      <div className={isSelectable ? 'pl-6' : ''}>
        {/* Title and Status */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 pr-6">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {data.title}
            </h3>
            {data.subtitle && (
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {data.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Status badge */}
        {data.status && (
          <div className="mb-3">
            <span
              className={`
                inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                ${statusVariants[data.status.variant]}
              `}
            >
              {data.status.label}
            </span>
          </div>
        )}

        {/* Metadata */}
        {data.metadata && data.metadata.length > 0 && (
          <div className="space-y-1 text-xs">
            {data.metadata.map((item, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-gray-500">{item.label}</span>
                <span className="text-gray-700 font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Amount */}
        {data.amount !== undefined && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Amount</span>
              <span className="text-sm font-semibold text-gray-900">
                ${data.amount.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
