/**
 * Sales Receipt utility functions
 */

export interface SalesReceipt {
  Id: string;
  SalesReceiptNumber: string;
  CustomerId?: string;
  CustomerName?: string;
  SaleDate: string;
  DepositAccountId: string;
  DepositAccountName?: string;
  PaymentMethod?: string;
  Reference?: string;
  Subtotal: number;
  TaxRateId?: string;
  TaxRateName?: string;
  TaxRate?: number;
  TaxAmount: number;
  TotalAmount: number;
  Memo?: string;
  Status: string;
  JournalEntryId?: string;
  ClassId?: string;
  ClassName?: string;
  LocationId?: string;
  LocationName?: string;
}

export interface SalesReceiptLine {
  Id?: string;
  SalesReceiptId?: string;
  ProductServiceId?: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
  AccountId?: string;
  TaxRateId?: string;
  ClassId?: string;
  SortOrder?: number;
}

/**
 * Generates the next sequential sales receipt number based on existing receipts
 * @param receipts - Array of existing sales receipts
 * @returns The next sales receipt number in format SR-XXX (e.g., SR-003)
 */
export function generateNextSalesReceiptNumber(receipts: SalesReceipt[]): string {
  const existingNumbers = receipts
    .map(sr => {
      const match = sr.SalesReceiptNumber.match(/^SR-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);

  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return 'SR-' + String(maxNumber + 1).padStart(3, '0');
}

/**
 * Calculates the subtotal from sales receipt line items
 * @param lines - Array of sales receipt line items
 * @returns The subtotal amount
 */
export function calculateSubtotal(lines: { Quantity: number; UnitPrice: number }[]): number {
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
 * Payment method options for sales receipts
 */
export const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Check', label: 'Check' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'Debit Card', label: 'Debit Card' },
  { value: 'ACH', label: 'ACH/Bank Transfer' },
  { value: 'Other', label: 'Other' },
] as const;

/**
 * Status options for sales receipts
 */
export const SALES_RECEIPT_STATUSES = [
  { value: 'Completed', label: 'Completed' },
  { value: 'Voided', label: 'Voided' },
] as const;
