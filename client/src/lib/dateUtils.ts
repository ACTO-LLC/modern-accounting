/**
 * Date formatting utilities for consistent, locale-aware date display across the application.
 *
 * All display formatters use the user's browser locale (navigator.language) by default.
 * This ensures dates are formatted according to the user's regional preferences.
 *
 * Guidelines:
 * - Use formatDate() for business dates (invoices, bills, due dates, etc.)
 * - Use formatDateTime() for audit/timestamp fields (CreatedAt, UpdatedAt)
 * - Use formatDateShort() for compact displays (tables, lists)
 * - Use formatDateLong() for report headers and formal displays
 * - Use formatTime() for time-only displays
 * - Use formatWeekday() for weekday names
 * - Use formatMonthShort() for chart axis labels
 * - Use formatDateForInput() for HTML date input values (always ISO, not locale)
 * - Use formatDateForOData() for API queries (always ISO, not locale)
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
 * Get the user's preferred locale from the browser.
 * Falls back to 'en-US' if navigator is not available (e.g., SSR).
 */
export function getLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-US';
}

/**
 * Parse a date value into a Date object, returning null if invalid.
 * Uses normalizeDateString for cross-browser compatibility with .NET timestamps.
 */
function parseDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(normalizeDateString(date)) : date;
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Format a date for display (date only, no time)
 * Use for: IssueDate, DueDate, BillDate, StartDate, EndDate, TransactionDate
 * Output (en-US): "Jan 13, 2026" | (de-DE): "13. Jan. 2026" | (ja-JP): "2026/01/13"
 */
export function formatDate(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a date with time for audit/timestamp display
 * Use for: CreatedAt, UpdatedAt, submission timestamps
 * Output (en-US): "Jan 13, 2026, 2:30 PM"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleString(getLocale(), {
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
 * Output (en-US): "1/13/2026" | (de-DE): "13.1.2026"
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleDateString(getLocale());
}

/**
 * Format a date in long format for report headers and formal displays
 * Use for: Report subtitles, "As of" dates, generated-on dates
 * Output (en-US): "January 13, 2026" | (de-DE): "13. Januar 2026"
 */
export function formatDateLong(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date for ISO input fields (YYYY-MM-DD)
 * Use for: HTML date input values
 * NOTE: This always returns ISO format regardless of locale (required by HTML spec)
 */
export function formatDateForInput(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toISOString().split('T')[0];
}

/**
 * Format time only
 * Use for: Chat timestamps, time-specific displays
 * Output (en-US): "2:30 PM" | (de-DE): "14:30"
 */
export function formatTime(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleTimeString(getLocale(), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format time in compact 2-digit format
 * Use for: Chat message timestamps, deployment times
 * Output (en-US): "02:30 PM" | (de-DE): "14:30"
 */
export function formatTimeCompact(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a weekday name (short)
 * Use for: Calendar headers, week views
 * Output (en-US): "Mon" | (de-DE): "Mo"
 */
export function formatWeekday(date: string | Date | null | undefined, style: 'short' | 'long' = 'short'): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(), { weekday: style });
}

/**
 * Format a date with weekday for list displays
 * Use for: Time entry lists, activity logs
 * Output (en-US): "Mon, Jan 13" | (de-DE): "Mo, 13. Jan."
 */
export function formatDateWithWeekday(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a month name (short) for chart labels
 * Use for: Dashboard chart X-axis labels
 * Output (en-US): "Jan" | (de-DE): "Jan"
 */
export function formatMonthShort(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleString(getLocale(), { month: 'short' });
}

/**
 * Format a date range with short month/day for compact display
 * Use for: Week range displays ("Jan 13 - Jan 19, 2026")
 * Output (en-US): "Jan 13" | (de-DE): "13. Jan."
 */
export function formatDateMonthDay(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
}

/**
 * Format a date with short month, day, and year
 * Use for: End of week range display with year
 * Output (en-US): "Jan 19, 2026" | (de-DE): "19. Jan. 2026"
 */
export function formatDateMonthDayYear(date: string | Date | null | undefined): string {
  const d = parseDate(date);
  if (!d) return '';
  return d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
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
