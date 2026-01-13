/**
 * Date formatting utilities for consistent date display across the application.
 *
 * Guidelines:
 * - Use formatDate() for business dates (invoices, bills, due dates, etc.)
 * - Use formatDateTime() for audit/timestamp fields (CreatedAt, UpdatedAt)
 * - Use formatDateShort() for compact displays (tables, lists)
 */

/**
 * Format a date for display (date only, no time)
 * Use for: IssueDate, DueDate, BillDate, StartDate, EndDate, TransactionDate
 * Output: "Jan 13, 2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date with time for audit/timestamp display
 * Use for: CreatedAt, UpdatedAt, submission timestamps
 * Output: "Jan 13, 2026, 2:30 PM"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a date in short format for compact displays
 * Use for: Table cells, lists where space is limited
 * Output: "1/13/2026"
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US');
}

/**
 * Format a date for ISO input fields (YYYY-MM-DD)
 * Use for: HTML date input values
 */
export function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/**
 * Format time only
 * Use for: Chat timestamps, time-specific displays
 * Output: "2:30 PM"
 */
export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
