/**
 * Date formatting utilities for consistent date display across the application.
 *
 * Guidelines:
 * - Use formatDate() for business dates (invoices, bills, due dates, etc.)
 * - Use formatDateTime() for audit/timestamp fields (CreatedAt, UpdatedAt)
 * - Use formatDateShort() for compact displays (tables, lists)
 */

/**
 * Normalizes a date string for reliable cross-browser parsing.
 * Handles .NET-style timestamps with >3 fractional second digits (e.g. "2025-11-26T22:21:33.9678004")
 * which are not reliably parsed by `new Date()` in Safari and other browsers.
 * - Trims fractional seconds to 3 digits
 * - Appends 'Z' (UTC) when no timezone indicator is present
 */
function normalizeDateString(date: string): string {
  let normalized = date.replace(/(\.\d{3})\d+/, '$1');
  if (/T\d{2}:\d{2}:\d{2}/.test(normalized) && !/Z$|[+-]\d{2}:\d{2}$/.test(normalized)) {
    normalized += 'Z';
  }
  return normalized;
}

/**
 * Format a date for display (date only, no time)
 * Use for: IssueDate, DueDate, BillDate, StartDate, EndDate, TransactionDate
 * Output: "Jan 13, 2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(normalizeDateString(date)) : date;
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
  const d = typeof date === 'string' ? new Date(normalizeDateString(date)) : date;
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
  const d = typeof date === 'string' ? new Date(normalizeDateString(date)) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US');
}

/**
 * Format a date for ISO input fields (YYYY-MM-DD)
 * Use for: HTML date input values
 */
export function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(normalizeDateString(date)) : date;
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
  const d = typeof date === 'string' ? new Date(normalizeDateString(date)) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format a date for DAB OData filter queries
 * DAB requires ISO 8601 datetime format (with T and Z) for DATE columns
 * Plain dates like 2025-01-01 cause "No mapping exists from Edm.Date" errors
 *
 * @param date - Date string in YYYY-MM-DD format or Date object
 * @param endOfDay - If true, sets time to 23:59:59Z (for "le" comparisons)
 * @returns ISO 8601 datetime string like "2025-01-01T00:00:00Z"
 */
export function formatDateForOData(
  date: string | Date | null | undefined,
  endOfDay = false
): string {
  if (!date) return '';
  // If already has time component, return as-is
  if (typeof date === 'string' && date.includes('T')) {
    return date;
  }
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  return endOfDay ? `${dateStr}T23:59:59Z` : `${dateStr}T00:00:00Z`;
}
