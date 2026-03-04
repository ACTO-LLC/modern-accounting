import { describe, it, expect } from 'vitest';
import { formatDate, formatDateShort, formatDateLong, formatDateForInput } from './dateUtils';

describe('dateUtils timezone handling', () => {
  // These tests verify that date-only strings (YYYY-MM-DD) display the correct
  // calendar date regardless of the user's local timezone. Before the fix,
  // "2025-12-01" would show as "Nov 30" in US timezones (UTC-5/6/7/8).

  it('formatDate preserves date-only strings without timezone shift', () => {
    const result = formatDate('2025-12-01');
    // Should contain "Dec" and "1", not "Nov" and "30"
    expect(result).toMatch(/Dec/);
    expect(result).toMatch(/1/);
    expect(result).not.toMatch(/Nov/);
  });

  it('formatDate handles end-of-month dates correctly', () => {
    const result = formatDate('2025-01-01');
    expect(result).toMatch(/Jan/);
    expect(result).not.toMatch(/Dec/);
  });

  it('formatDateShort preserves date-only strings', () => {
    const result = formatDateShort('2025-12-01');
    // Should show 12/1/2025, not 11/30/2025
    expect(result).toMatch(/12/);
    expect(result).not.toMatch(/11\/30/);
  });

  it('formatDateLong preserves date-only strings', () => {
    const result = formatDateLong('2025-12-01');
    expect(result).toMatch(/December/);
    expect(result).not.toMatch(/November/);
  });

  it('formatDateForInput returns correct ISO date', () => {
    expect(formatDateForInput('2025-12-01')).toBe('2025-12-01');
    expect(formatDateForInput('2025-01-01')).toBe('2025-01-01');
  });

  it('formatDate handles datetime strings (with time) normally', () => {
    // Datetime strings should still work — these have explicit time+tz
    const result = formatDate('2025-12-01T15:30:00Z');
    expect(result).toMatch(/Dec/);
  });

  it('formatDate handles null/undefined/empty gracefully', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });
});
