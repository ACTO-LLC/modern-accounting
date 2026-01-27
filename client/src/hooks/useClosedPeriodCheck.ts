import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface AccountingPeriod {
  Id: string;
  FiscalYearStart: string;
  FiscalYearEnd: string;
  ClosingDate: string | null;
  IsLocked: boolean;
}

interface ClosedPeriodCheckResult {
  isLoading: boolean;
  isInClosedPeriod: boolean;
  closedPeriod: AccountingPeriod | null;
  message: string | null;
}

/**
 * Hook to check if a transaction date falls within a closed/locked accounting period.
 * Returns information about the closed period if applicable.
 *
 * @param transactionDate - The date to check (ISO string or Date object)
 * @returns ClosedPeriodCheckResult with isInClosedPeriod flag and period details
 */
export function useClosedPeriodCheck(transactionDate: string | Date | null): ClosedPeriodCheckResult {
  const { data: periods, isLoading } = useQuery({
    queryKey: ['accounting-periods-all'],
    queryFn: async () => {
      const response = await api.get<{ value: AccountingPeriod[] }>('/accountingperiods');
      return response.data.value;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading || !transactionDate) {
    return {
      isLoading,
      isInClosedPeriod: false,
      closedPeriod: null,
      message: null,
    };
  }

  const date = typeof transactionDate === 'string' ? new Date(transactionDate) : transactionDate;
  const dateStr = date.toISOString().split('T')[0];

  // Find if the date falls within any locked period
  const closedPeriod = periods?.find(period => {
    if (!period.IsLocked) return false;
    const start = period.FiscalYearStart;
    const end = period.FiscalYearEnd;
    return dateStr >= start && dateStr <= end;
  }) || null;

  if (closedPeriod) {
    const fiscalYear = new Date(closedPeriod.FiscalYearEnd).getFullYear();
    return {
      isLoading: false,
      isInClosedPeriod: true,
      closedPeriod,
      message: `This transaction falls within the locked fiscal year ${fiscalYear}. Changes to closed periods may affect financial statements. Proceed with caution.`,
    };
  }

  // Also check if date is before any closing date (soft close)
  const periodWithClosingDate = periods?.find(period => {
    if (!period.ClosingDate) return false;
    return dateStr <= period.ClosingDate;
  }) || null;

  if (periodWithClosingDate) {
    return {
      isLoading: false,
      isInClosedPeriod: true,
      closedPeriod: periodWithClosingDate,
      message: `This transaction date is before the closing date (${periodWithClosingDate.ClosingDate}). Changes may require additional authorization.`,
    };
  }

  return {
    isLoading: false,
    isInClosedPeriod: false,
    closedPeriod: null,
    message: null,
  };
}

/**
 * Simple function to check if a date is in a closed period.
 * Use this for synchronous checks when you already have the periods data.
 */
export function isDateInClosedPeriod(
  date: string | Date,
  periods: AccountingPeriod[]
): { isClosed: boolean; period: AccountingPeriod | null } {
  const dateStr = typeof date === 'string'
    ? date.split('T')[0]
    : date.toISOString().split('T')[0];

  const closedPeriod = periods.find(period => {
    if (!period.IsLocked) return false;
    return dateStr >= period.FiscalYearStart && dateStr <= period.FiscalYearEnd;
  }) || null;

  return {
    isClosed: !!closedPeriod,
    period: closedPeriod,
  };
}
