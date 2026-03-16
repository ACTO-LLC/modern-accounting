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
  Reference: string;
  TransactionDate: string;
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
    const response = await api.get<{ value: JournalEntry[] }>('/journalentries?$orderby=CreatedAt desc&$first=1');
    const lastEntry = response.data.value[0];

    if (lastEntry?.Reference) {
      const match = lastEntry.Reference.match(/^JE-(\d+)$/);
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
      throw new Error('GL posting failed: Account Defaults not configured. Go to Company Settings to set up AR and Revenue accounts.');
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

    const journalEntryId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create JE as Draft first so lines can be added without balance issues
    await api.post('/journalentries', {
      Id: journalEntryId,
      Reference: entryNumber,
      TransactionDate: issueDate,
      Description: description,
      Status: 'Draft',
      CreatedBy: userName || 'System',
    });

    // Create journal entry lines sequentially
    for (const line of lines) {
      await api.post('/journalentrylines', {
        JournalEntryId: journalEntryId,
        AccountId: line.AccountId,
        Description: line.Description,
        Debit: line.DebitAmount,
        Credit: line.CreditAmount,
        ProjectId: line.ProjectId || null,
        ClassId: line.ClassId || null
      });
    }

    // Post the journal entry now that lines are balanced
    await api.patch(`/journalentries/Id/${journalEntryId}`, {
      Status: 'Posted',
      PostedAt: now,
      PostedBy: userName || 'System'
    });

    // Update the invoice with the journal entry reference
    await api.patch(`/invoices_write/Id/${invoiceId}`, {
      JournalEntryId: journalEntryId,
      PostedAt: now,
      PostedBy: userName || 'System'
    });

    return { journalEntryId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error creating journal entry';
    throw new Error(`GL posting failed for invoice: ${msg}`);
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
      throw new Error('GL posting failed: Accounts Receivable default not configured. Go to Company Settings to set up account defaults.');
    }

    const entryNumber = await generateNextEntryNumber();
    const description = `Payment ${paymentNumber} - ${customerName}`;
    const journalEntryId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create JE as Draft first so lines can be added without balance issues
    await api.post('/journalentries', {
      Id: journalEntryId,
      Reference: entryNumber,
      TransactionDate: paymentDate,
      Description: description,
      Status: 'Draft',
      CreatedBy: 'System',
    });

    // Create lines sequentially to avoid race conditions
    // DR: Cash/Bank
    await api.post('/journalentrylines', {
      JournalEntryId: journalEntryId,
      AccountId: depositAccountId,
      Description: `Deposit - ${paymentNumber}`,
      Debit: totalAmount,
      Credit: 0
    });

    // CR: Accounts Receivable
    await api.post('/journalentrylines', {
      JournalEntryId: journalEntryId,
      AccountId: arAccountId,
      Description: `AR - ${paymentNumber}`,
      Debit: 0,
      Credit: totalAmount
    });

    // Post the journal entry now that lines are balanced
    await api.patch(`/journalentries/Id/${journalEntryId}`, {
      Status: 'Posted',
      PostedAt: now,
      PostedBy: 'System'
    });

    // Update the payment with the journal entry reference
    await api.patch(`/payments_write/Id/${paymentId}`, {
      JournalEntryId: journalEntryId
    });

    return { journalEntryId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error creating journal entry';
    throw new Error(`GL posting failed for payment: ${msg}`);
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
      throw new Error('GL posting failed: Accounts Payable default not configured. Go to Company Settings to set up account defaults.');
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

    const journalEntryId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create JE as Draft first so lines can be added without balance issues
    await api.post('/journalentries', {
      Id: journalEntryId,
      Reference: entryNumber,
      TransactionDate: billDate,
      Description: description,
      Status: 'Draft',
      CreatedBy: userName || 'System',
    });

    // Create journal entry lines sequentially
    for (const line of lines) {
      await api.post('/journalentrylines', {
        JournalEntryId: journalEntryId,
        AccountId: line.AccountId,
        Description: line.Description,
        Debit: line.DebitAmount,
        Credit: line.CreditAmount,
        ProjectId: line.ProjectId || null,
        ClassId: line.ClassId || null
      });
    }

    // Post the journal entry now that lines are balanced
    await api.patch(`/journalentries/Id/${journalEntryId}`, {
      Status: 'Posted',
      PostedAt: now,
      PostedBy: userName || 'System'
    });

    // Update the bill with the journal entry reference
    await api.patch(`/bills_write/Id/${billId}`, {
      JournalEntryId: journalEntryId,
      PostedAt: now,
      PostedBy: userName || 'System'
    });

    return { journalEntryId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error creating journal entry';
    throw new Error(`GL posting failed for bill: ${msg}`);
  }
}

/**
 * Creates a reversing journal entry for a deleted invoice.
 * Swaps debits and credits from the original journal entry.
 */
export async function reverseInvoiceJournalEntry(
  journalEntryId: string,
  invoiceNumber: string,
  userName?: string
): Promise<{ journalEntryId: string } | null> {
  try {
    // Fetch original journal entry lines
    const linesResponse = await api.get<{ value: Array<{
      AccountId: string; Description: string; Debit: number; Credit: number;
      ProjectId?: string | null; ClassId?: string | null;
    }> }>(`/journalentrylines?$filter=JournalEntryId eq '${journalEntryId}'`);
    const originalLines = linesResponse.data.value;

    if (!originalLines || originalLines.length === 0) {
      console.warn('No journal entry lines found to reverse');
      return null;
    }

    const entryNumber = await generateNextEntryNumber();
    const description = `Reversal - Invoice ${invoiceNumber} deleted by ${userName || 'System'}`;

    const reversalEntryId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create reversing JE as Draft first
    await api.post('/journalentries', {
      Id: reversalEntryId,
      Reference: entryNumber,
      TransactionDate: new Date().toISOString().split('T')[0],
      Description: description,
      Status: 'Draft',
      CreatedBy: userName || 'System',
    });

    // Create reversed lines sequentially (swap debits and credits)
    for (const line of originalLines) {
      await api.post('/journalentrylines', {
        JournalEntryId: reversalEntryId,
        AccountId: line.AccountId,
        Description: `Reversal - ${line.Description}`,
        Debit: line.Credit,
        Credit: line.Debit,
        ProjectId: line.ProjectId || null,
        ClassId: line.ClassId || null
      });
    }

    // Post the reversal entry
    await api.patch(`/journalentries/Id/${reversalEntryId}`, {
      Status: 'Posted',
      PostedAt: now,
      PostedBy: userName || 'System'
    });

    // Void the original journal entry
    await api.patch(`/journalentries/Id/${journalEntryId}`, {
      Status: 'Void'
    });

    return { journalEntryId: reversalEntryId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error reversing journal entry';
    throw new Error(`GL reversal failed: ${msg}`);
  }
}

/**
 * Clears the account defaults cache (useful after settings change)
 */
export function clearAccountDefaultsCache(): void {
  accountDefaultsCache = null;
  accountsCacheByType = null;
}
