/**
 * Invoice utility functions
 */

export interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName?: string;
  IssueDate: string;
  DueDate: string;
  TotalAmount: number;
  Status: string;
  CreatedAt?: string;
  UpdatedAt?: string;
}

/** Default invoice number prefix */
export const DEFAULT_INVOICE_PREFIX = 'INV-';

/** Default minimum digits for the numeric portion */
export const DEFAULT_INVOICE_PADDING = 4;

/**
 * Generates the next sequential invoice number based on existing invoices.
 * Supports a configurable prefix (e.g., "INV-", "ACME-") and zero-padding width.
 *
 * @param invoices - Array of existing invoices
 * @param prefix   - The prefix to use (default: "INV-")
 * @param padding  - Minimum digits for the numeric portion (default: 4)
 * @returns The next invoice number (e.g., INV-0001, INV-0002)
 */
export function generateNextInvoiceNumber(
  invoices: Invoice[],
  prefix: string = DEFAULT_INVOICE_PREFIX,
  padding: number = DEFAULT_INVOICE_PADDING,
): string {
  // Escape the prefix for use in a regex
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);

  const existingNumbers = invoices
    .map(inv => {
      const match = inv.InvoiceNumber.match(pattern);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);

  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return prefix + String(maxNumber + 1).padStart(padding, '0');
}

/**
 * Calculates the total amount from invoice line items
 * @param lines - Array of invoice line items
 * @returns The total amount
 */
export function calculateInvoiceTotal(lines: { Quantity: number; UnitPrice: number }[]): number {
  return lines.reduce((sum, line) => sum + (line.Quantity * line.UnitPrice), 0);
}

/**
 * Gets the current date in ISO format (YYYY-MM-DD)
 * @returns Current date string
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gets a date N days from now in ISO format (YYYY-MM-DD)
 * @param days - Number of days to add
 * @returns Date string
 */
export function getDateNDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}
