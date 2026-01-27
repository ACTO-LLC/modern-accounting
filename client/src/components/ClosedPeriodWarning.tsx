import { AlertTriangle, Lock } from 'lucide-react';
import { useClosedPeriodCheck } from '../hooks/useClosedPeriodCheck';
import { formatDate } from '../lib/dateUtils';

interface ClosedPeriodWarningProps {
  transactionDate: string | Date | null;
  className?: string;
}

/**
 * Displays a warning when a transaction date falls within a closed/locked accounting period.
 * Use this component in transaction forms (invoices, bills, journal entries, etc.)
 * to alert users before they make changes to closed periods.
 */
export default function ClosedPeriodWarning({ transactionDate, className = '' }: ClosedPeriodWarningProps) {
  const { isLoading, isInClosedPeriod, closedPeriod, message } = useClosedPeriodCheck(transactionDate);

  if (isLoading || !isInClosedPeriod || !closedPeriod) {
    return null;
  }

  const fiscalYear = new Date(closedPeriod.FiscalYearEnd).getFullYear();

  return (
    <div className={`p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {closedPeriod.IsLocked ? (
            <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {closedPeriod.IsLocked ? 'Locked Period' : 'Closed Period Warning'}
          </h4>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            {message}
          </p>
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            <span className="font-medium">Period:</span> FY {fiscalYear} ({formatDate(closedPeriod.FiscalYearStart)} - {formatDate(closedPeriod.FiscalYearEnd)})
            {closedPeriod.ClosingDate && (
              <>
                <br />
                <span className="font-medium">Closing Date:</span> {formatDate(closedPeriod.ClosingDate)}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline badge version for use in lists/tables
 */
export function ClosedPeriodBadge({ transactionDate }: { transactionDate: string | Date | null }) {
  const { isInClosedPeriod, closedPeriod } = useClosedPeriodCheck(transactionDate);

  if (!isInClosedPeriod || !closedPeriod) {
    return null;
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      <Lock className="h-3 w-3 mr-1" />
      Locked Period
    </span>
  );
}
