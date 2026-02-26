/**
 * Auto-Posting Service
 *
 * Handles automatic creation of journal entries when invoices/bills are saved
 * in "Simple" mode (QBO-like behavior).
 *
 * Simple Mode:
 * - Invoices: Debit AR, Credit Revenue on save
 * - Bills: Debit Expense, Credit AP on save
 *
 * Advanced Mode:
 * - Documents remain in Draft until explicitly posted
 * - User has control over when GL impact occurs
 */

import api from './api';

interface AccountDefault {
  Id: string;
  AccountType: string;
  AccountId: string;
  Description: string | null;
}

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface JournalEntryLine {
  AccountId: string;
  Description: string;
  DebitAmount: number;
  CreditAmount: number;
  ProjectId?: string | null;
  ClassId?: string | null;
}

interface JournalEntry {
  Id: string;
  EntryNumber: string;
  EntryDate: string;
  Description: string;
  Status: string;
}

// Cache for account defaults
let accountDefaultsCache: AccountDefault[] | null = null;
let accountsCacheByType: Record<string, Account[]> | null = null;

/**
 * Fetches account defaults from the database
 */
async function getAccountDefaults(): Promise<AccountDefault[]> {
  if (accountDefaultsCache) {
    return accountDefaultsCache;
  }

  try {
    const response = await api.get<{ value: AccountDefault[] }>('/accountdefaults');
    accountDefaultsCache = response.data.value;
    return accountDefaultsCache;
  } catch (error) {
    console.error('Failed to fetch account defaults:', error);
    return [];
  }
}

/**
 * Fetches accounts by type
 */
async function getAccountsByType(type: string): Promise<Account[]> {
  if (accountsCacheByType && accountsCacheByType[type]) {
    return accountsCacheByType[type];
  }

  try {
    const response = await api.get<{ value: Account[] }>(`/accounts?$filter=Type eq '${type}'`);
    if (!accountsCacheByType) accountsCacheByType = {};
    accountsCacheByType[type] = response.data.value;
    return accountsCacheByType[type];
  } catch (error) {
    console.error(`Failed to fetch ${type} accounts:`, error);
    return [];
  }
}

/**
 * Gets the default account for a specific type
 */
async function getDefaultAccount(accountType: string): Promise<string | null> {
  const defaults = await getAccountDefaults();
  const defaultAccount = defaults.find(d => d.AccountType === accountType);
  return defaultAccount?.AccountId || null;
}

/**
 * Finds or creates an AR account
 */
async function getARAccountId(): Promise<string | null> {
  // First check for configured default
  const defaultId = await getDefaultAccount('AccountsReceivable');
  if (defaultId) return defaultId;

  // Fallback: find any AR account
  const arAccounts = await getAccountsByType('Accounts Receivable');
  return arAccounts[0]?.Id || null;
}

/**
 * Finds or creates an AP account
 */
async function getAPAccountId(): Promise<string | null> {
  // First check for configured default
  const defaultId = await getDefaultAccount('AccountsPayable');
  if (defaultId) return defaultId;

  // Fallback: find any AP account
  const apAccounts = await getAccountsByType('Accounts Payable');
  return apAccounts[0]?.Id || null;
}

/**
 * Finds or gets a default revenue account
 */
async function getRevenueAccountId(): Promise<string | null> {
  // First check for configured default
  const defaultId = await getDefaultAccount('DefaultRevenue');
  if (defaultId) return defaultId;

  // Fallback: find any income account
  const incomeAccounts = await getAccountsByType('Income');
  return incomeAccounts[0]?.Id || null;
}

/**
 * Generates the next journal entry number
 */
async function generateNextEntryNumber(): Promise<string> {
  try {
    const response = await api.get<{ value: JournalEntry[] }>('/journalentries?$orderby=CreatedAt desc&$top=1');
    const lastEntry = response.data.value[0];

    if (lastEntry?.EntryNumber) {
      const match = lastEntry.EntryNumber.match(/^JE-(\d+)$/);
      if (match) {
        const nextNum = parseInt(match[1], 10) + 1;
        return `JE-${nextNum.toString().padStart(5, '0')}`;
      }
    }

    return 'JE-00001';
  } catch {
    return `JE-${Date.now()}`;
  }
}

/**
 * Creates a journal entry for an invoice (AR posting)
 *
 * Debit: Accounts Receivable (for total amount)
 * Credit: Revenue (for each line item or total)
 * Credit: Sales Tax Payable (if applicable)
 */
export async function createInvoiceJournalEntry(
  invoiceId: string,
  totalAmount: number,
  taxAmount: number,
  invoiceNumber: string,
  customerName: string,
  issueDate: string,
  userName?: string,
  projectId?: string | null,
  classId?: string | null
): Promise<{ journalEntryId: string } | null> {
  try {
    const arAccountId = await getARAccountId();
    const revenueAccountId = await getRevenueAccountId();

    if (!arAccountId || !revenueAccountId) {
      console.warn('Cannot auto-post invoice: Missing AR or Revenue account');
      return null;
    }

    const entryNumber = await generateNextEntryNumber();
    const description = `Invoice ${invoiceNumber} - ${customerName}`;
    const subtotal = totalAmount - taxAmount;

    // Create journal entry lines (propagate header-level project/class)
    const lines: JournalEntryLine[] = [
      {
        AccountId: arAccountId,
        Description: `AR - ${invoiceNumber}`,
        DebitAmount: totalAmount,
        CreditAmount: 0,
        ProjectId: projectId || null,
        ClassId: classId || null
      },
      {
        AccountId: revenueAccountId,
        Description: `Revenue - ${invoiceNumber}`,
        DebitAmount: 0,
        CreditAmount: subtotal,
        ProjectId: projectId || null,
        ClassId: classId || null
      }
    ];

    // Add tax line if applicable
    if (taxAmount > 0) {
      const taxAccountId = await getDefaultAccount('SalesTaxPayable');
      if (taxAccountId) {
        lines.push({
          AccountId: taxAccountId,
          Description: `Sales Tax - ${invoiceNumber}`,
          DebitAmount: 0,
          CreditAmount: taxAmount
        });
      } else {
        // If no tax account, add to revenue
        lines[1].CreditAmount = totalAmount;
      }
    }

    // Create the journal entry
    const journalEntryResponse = await api.post<JournalEntry>('/journalentries', {
      EntryNumber: entryNumber,
      EntryDate: issueDate,
      Description: description,
      Status: 'Posted'
    });

    const journalEntry = journalEntryResponse.data;

    // Create journal entry lines
    await Promise.all(
      lines.map(line =>
        api.post('/journalentrylines', {
          JournalEntryId: journalEntry.Id,
          AccountId: line.AccountId,
          Description: line.Description,
          DebitAmount: line.DebitAmount,
          CreditAmount: line.CreditAmount,
          ProjectId: line.ProjectId || null,
          ClassId: line.ClassId || null
        })
      )
    );

    // Update the invoice with the journal entry reference
    await api.patch(`/invoices_write/Id/${invoiceId}`, {
      JournalEntryId: journalEntry.Id,
      PostedAt: new Date().toISOString(),
      PostedBy: userName || 'System'
    });

    return { journalEntryId: journalEntry.Id };
  } catch (error) {
    console.error('Failed to create invoice journal entry:', error);
    return null;
  }
}

/**
 * Creates a journal entry for a payment (Cash receipt posting)
 *
 * Debit: Bank/Deposit account (cash in)
 * Credit: Accounts Receivable (reduce customer balance)
 */
export async function createPaymentJournalEntry(
  paymentId: string,
  totalAmount: number,
  paymentNumber: string,
  customerName: string,
  paymentDate: string,
  depositAccountId: string
): Promise<{ journalEntryId: string } | null> {
  try {
    const arAccountId = await getARAccountId();

    if (!arAccountId) {
      console.warn('Cannot auto-post payment: Missing AR account');
      return null;
    }

    const entryNumber = await generateNextEntryNumber();
    const description = `Payment ${paymentNumber} - ${customerName}`;

    // Create journal entry lines
    const lines: JournalEntryLine[] = [
      {
        AccountId: depositAccountId,
        Description: `Deposit - ${paymentNumber}`,
        DebitAmount: totalAmount,
        CreditAmount: 0
      },
      {
        AccountId: arAccountId,
        Description: `AR - ${paymentNumber}`,
        DebitAmount: 0,
        CreditAmount: totalAmount
      }
    ];

    // Create the journal entry
    const journalEntryResponse = await api.post<JournalEntry>('/journalentries', {
      EntryNumber: entryNumber,
      EntryDate: paymentDate,
      Description: description,
      Status: 'Posted'
    });

    const journalEntry = journalEntryResponse.data;

    // Create journal entry lines
    await Promise.all(
      lines.map(line =>
        api.post('/journalentrylines', {
          JournalEntryId: journalEntry.Id,
          AccountId: line.AccountId,
          Description: line.Description,
          DebitAmount: line.DebitAmount,
          CreditAmount: line.CreditAmount,
          ProjectId: line.ProjectId || null,
          ClassId: line.ClassId || null
        })
      )
    );

    // Update the payment with the journal entry reference
    await api.patch(`/payments_write/Id/${paymentId}`, {
      JournalEntryId: journalEntry.Id
    });

    return { journalEntryId: journalEntry.Id };
  } catch (error) {
    console.error('Failed to create payment journal entry:', error);
    return null;
  }
}

/**
 * Creates a journal entry for a bill (AP posting)
 *
 * Debit: Expense accounts (from bill lines)
 * Credit: Accounts Payable (for total amount)
 */
export async function createBillJournalEntry(
  billId: string,
  totalAmount: number,
  billNumber: string,
  vendorName: string,
  billDate: string,
  lineItems: Array<{ AccountId: string; Amount: number; Description?: string; ProjectId?: string | null; ClassId?: string | null }>,
  userName?: string,
  projectId?: string | null,
  classId?: string | null
): Promise<{ journalEntryId: string } | null> {
  try {
    const apAccountId = await getAPAccountId();

    if (!apAccountId) {
      console.warn('Cannot auto-post bill: Missing AP account');
      return null;
    }

    const entryNumber = await generateNextEntryNumber();
    const description = `Bill ${billNumber || 'N/A'} - ${vendorName}`;

    // Create journal entry lines
    const lines: JournalEntryLine[] = [];

    // Debit expense accounts for each line item
    // Line-level project/class overrides header; falls back to header; falls back to null
    for (const item of lineItems) {
      lines.push({
        AccountId: item.AccountId,
        Description: item.Description || `Expense - ${billNumber || 'Bill'}`,
        DebitAmount: item.Amount,
        CreditAmount: 0,
        ProjectId: item.ProjectId || projectId || null,
        ClassId: item.ClassId || classId || null
      });
    }

    // Credit AP for total (use header-level project/class)
    lines.push({
      AccountId: apAccountId,
      Description: `AP - ${billNumber || 'Bill'}`,
      DebitAmount: 0,
      CreditAmount: totalAmount,
      ProjectId: projectId || null,
      ClassId: classId || null
    });

    // Create the journal entry
    const journalEntryResponse = await api.post<JournalEntry>('/journalentries', {
      EntryNumber: entryNumber,
      EntryDate: billDate,
      Description: description,
      Status: 'Posted'
    });

    const journalEntry = journalEntryResponse.data;

    // Create journal entry lines
    await Promise.all(
      lines.map(line =>
        api.post('/journalentrylines', {
          JournalEntryId: journalEntry.Id,
          AccountId: line.AccountId,
          Description: line.Description,
          DebitAmount: line.DebitAmount,
          CreditAmount: line.CreditAmount,
          ProjectId: line.ProjectId || null,
          ClassId: line.ClassId || null
        })
      )
    );

    // Update the bill with the journal entry reference
    await api.patch(`/bills_write/Id/${billId}`, {
      JournalEntryId: journalEntry.Id,
      PostedAt: new Date().toISOString(),
      PostedBy: userName || 'System'
    });

    return { journalEntryId: journalEntry.Id };
  } catch (error) {
    console.error('Failed to create bill journal entry:', error);
    return null;
  }
}

/**
 * Clears the account defaults cache (useful after settings change)
 */
export function clearAccountDefaultsCache(): void {
  accountDefaultsCache = null;
  accountsCacheByType = null;
}
