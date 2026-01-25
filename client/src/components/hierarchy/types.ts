// Entity types for the hierarchy drill-down view

export interface BreadcrumbItem {
  id: string;
  label: string;
  entityType: EntityType;
}

export type EntityType =
  | 'vendor'
  | 'customer'
  | 'purchaseorder'
  | 'bill'
  | 'invoice'
  | 'estimate'
  | 'purchaseorderline'
  | 'billline'
  | 'invoiceline'
  | 'estimateline';

export type CardState = 'default' | 'hover' | 'selected' | 'disabled';

export interface EntityCardData {
  id: string;
  title: string;
  subtitle?: string;
  metadata?: { label: string; value: string }[];
  status?: {
    label: string;
    variant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  };
  amount?: number;
  entityType: EntityType;
  isDisabled?: boolean;
}

// API response types
export interface Vendor {
  Id: string;
  Name: string;
  Email: string;
  Phone: string;
  PaymentTerms: string;
  Status: string;
  Is1099Vendor: boolean;
}

export interface Customer {
  Id: string;
  Name: string;
  Email: string;
  Phone: string;
  Address: string;
}

export interface PurchaseOrder {
  Id: string;
  PONumber: string;
  VendorId: string;
  VendorName: string;
  PODate: string;
  ExpectedDate: string | null;
  Total: number;
  Status: string;
  ConvertedToBillId: string | null;
  Notes: string | null;
}

export interface Bill {
  Id: string;
  VendorId: string;
  VendorName: string;
  BillNumber: string;
  BillDate: string;
  DueDate: string;
  TotalAmount: number;
  AmountPaid: number;
  BalanceDue: number;
  Status: string;
  Terms: string;
  Memo: string;
}

export interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  IssueDate: string;
  DueDate: string;
  TotalAmount: number;
  Status: string;
}

export interface Estimate {
  Id: string;
  EstimateNumber: string;
  CustomerId: string;
  CustomerName?: string;
  IssueDate: string;
  ExpirationDate: string | null;
  TotalAmount: number;
  Status: string;
  ConvertedToInvoiceId: string | null;
  Notes: string | null;
}

export interface PurchaseOrderLine {
  Id: string;
  PurchaseOrderId: string;
  ProductServiceId: string | null;
  ProductServiceName?: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}

export interface BillLine {
  Id: string;
  BillId: string;
  AccountId: string;
  AccountName?: string;
  Description: string;
  Amount: number;
}

export interface InvoiceLine {
  Id: string;
  InvoiceId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  ProductServiceId?: string;
  ProductServiceName?: string;
}

export interface EstimateLine {
  Id: string;
  EstimateId: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount?: number;
}
