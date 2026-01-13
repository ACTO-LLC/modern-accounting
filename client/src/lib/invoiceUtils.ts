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
}

/**
 * Generates the next sequential invoice number based on existing invoices
 * @param invoices - Array of existing invoices
 * @returns The next invoice number in format INV-XXX (e.g., INV-003)
 */
export function generateNextInvoiceNumber(invoices: Invoice[]): string {
  const existingNumbers = invoices
    .map(inv => {
      const match = inv.InvoiceNumber.match(/^INV-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);

  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return 'INV-' + String(maxNumber + 1).padStart(3, '0');
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
