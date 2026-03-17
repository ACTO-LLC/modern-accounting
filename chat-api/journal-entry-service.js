/**
 * Journal Entry Service Module
 * Handles automatic journal entry creation for invoices, bills, and payments
 * Issue #131
 */

import dotenv from 'dotenv';
dotenv.config();

import axiosLib from 'axios';
import { randomUUID } from 'crypto';

const DAB_API_URL = process.env.DAB_API_URL || 'http://localhost:5000/api';

// DAB Simulator provider requires X-MS-API-ROLE to resolve permissions.
// Create a dedicated instance so the header is sent on every request.
const axios = axiosLib.create({
    headers: { 'X-MS-API-ROLE': 'Admin' }
});

/**
 * Account type constants for AccountDefaults
 */
const ACCOUNT_TYPES = {
    ACCOUNTS_RECEIVABLE: 'AccountsReceivable',
    ACCOUNTS_PAYABLE: 'AccountsPayable',
    DEFAULT_REVENUE: 'DefaultRevenue',
    DEFAULT_CASH: 'DefaultCash',
    SALES_TAX_PAYABLE: 'SalesTaxPayable'
};

class JournalEntryService {
    constructor() {
        this.accountDefaultsCache = null;
        this.cacheExpiry = null;
        this.CACHE_TTL_MS = 60000; // 1 minute cache
    }

    /**
     * Get all account defaults from the database
     * Uses caching to reduce DB calls
     */
    async getAccountDefaults() {
        const now = Date.now();
        if (this.accountDefaultsCache && this.cacheExpiry && now < this.cacheExpiry) {
            return this.accountDefaultsCache;
        }

        try {
            const response = await axios.get(`${DAB_API_URL}/accountdefaults`);
            const defaults = {};

            if (response.data.value) {
                for (const item of response.data.value) {
                    if (item.IsActive) {
                        defaults[item.AccountType] = {
                            id: item.Id,
                            accountId: item.AccountId,
                            description: item.Description
                        };
                    }
                }
            }

            this.accountDefaultsCache = defaults;
            this.cacheExpiry = now + this.CACHE_TTL_MS;
            return defaults;
        } catch (error) {
            console.error('Error fetching account defaults:', error.message);
            throw new Error('Failed to fetch account defaults');
        }
    }

    /**
     * Get a specific account default by type
     * @param {string} accountType - One of ACCOUNT_TYPES values
     */
    async getAccountDefault(accountType) {
        const defaults = await this.getAccountDefaults();
        return defaults[accountType] || null;
    }

    /**
     * Set or update an account default
     * @param {string} accountType - Account type (e.g., 'AccountsReceivable')
     * @param {string} accountId - UUID of the account
     * @param {string} description - Optional description
     */
    async setAccountDefault(accountType, accountId, description = null) {
        // Invalidate cache
        this.accountDefaultsCache = null;

        // Check if default already exists
        const existing = await this._findExistingDefault(accountType);

        if (existing) {
            // Update existing
            await axios.patch(`${DAB_API_URL}/accountdefaults/Id/${existing.Id}`, {
                AccountId: accountId,
                Description: description,
                UpdatedAt: new Date().toISOString()
            });
            return { id: existing.Id, updated: true };
        } else {
            // Create new
            const response = await axios.post(`${DAB_API_URL}/accountdefaults`, {
                AccountType: accountType,
                AccountId: accountId,
                Description: description,
                IsActive: true
            });
            return { id: response.data.Id, updated: false };
        }
    }

    /**
     * Find an existing account default by type
     */
    async _findExistingDefault(accountType) {
        try {
            // Escape single quotes to prevent OData injection
            const safeAccountType = String(accountType).replace(/'/g, "''");
            const response = await axios.get(
                `${DAB_API_URL}/accountdefaults?$filter=AccountType eq '${safeAccountType}'`
            );
            if (response.data.value && response.data.value.length > 0) {
                return response.data.value[0];
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Post an invoice and create the corresponding journal entry
     * DR: Accounts Receivable
     * CR: Revenue account(s) per line
     *
     * NOTE: This operation performs multiple API calls without transaction support.
     * If an operation fails midway, data may be left in an inconsistent state.
     * Consider implementing application-level rollback logic if this becomes an issue.
     *
     * @param {string} invoiceId - Invoice UUID
     * @param {string} userId - User performing the action
     */
    async postInvoice(invoiceId, userId = 'system') {
        // Get the invoice
        let invoice;
        try {
            const invoiceResp = await axios.get(`${DAB_API_URL}/invoices/Id/${invoiceId}`);
            invoice = invoiceResp.data?.value?.[0] || invoiceResp.data;
        } catch (err) {
            if (err.response?.status === 404) {
                throw new Error(`Invoice ${invoiceId} not found`);
            }
            throw err;
        }

        if (!invoice) {
            throw new Error(`Invoice ${invoiceId} not found`);
        }

        if (invoice.JournalEntryId) {
            throw new Error(`Invoice ${invoiceId} is already posted`);
        }

        // Get invoice lines - GUID filters must not be quoted in OData
        const linesResp = await axios.get(
            `${DAB_API_URL}/invoicelines?$filter=InvoiceId eq ${invoiceId}`
        );
        const lines = linesResp.data.value || [];

        if (lines.length === 0) {
            throw new Error(`Invoice ${invoiceId} has no lines`);
        }

        // Get default accounts
        const arDefault = await this.getAccountDefault(ACCOUNT_TYPES.ACCOUNTS_RECEIVABLE);
        const revenueDefault = await this.getAccountDefault(ACCOUNT_TYPES.DEFAULT_REVENUE);

        if (!arDefault) {
            throw new Error('Accounts Receivable default account not configured');
        }
        if (!revenueDefault) {
            throw new Error('Default Revenue account not configured');
        }

        // Create journal entry
        const journalEntryId = randomUUID();
        const now = new Date().toISOString();

        // Create JE as Draft first so lines can be added incrementally
        // (balance trigger only enforces on Posted entries)
        await axios.post(`${DAB_API_URL}/journalentries`, {
            Id: journalEntryId,
            TransactionDate: invoice.IssueDate,
            Description: `Invoice ${invoice.InvoiceNumber} - ${invoice.CustomerName || 'Customer'}`,
            Reference: invoice.InvoiceNumber,
            Status: 'Draft',
            CreatedBy: userId,
        });

        // Create journal entry lines
        // DR: Accounts Receivable for total amount (use header-level project/class)
        await axios.post(`${DAB_API_URL}/journalentrylines`, {
            JournalEntryId: journalEntryId,
            AccountId: arDefault.accountId,
            Description: `AR - Invoice ${invoice.InvoiceNumber}`,
            Debit: invoice.TotalAmount,
            Credit: 0,
            ProjectId: invoice.ProjectId || null,
            ClassId: invoice.ClassId || null
        });

        // CR: Revenue accounts per line (sequential to avoid race conditions)
        // Line-level project/class overrides header; falls back to header; falls back to null
        // Use Amount if populated, otherwise compute from Quantity * UnitPrice
        for (const line of lines) {
            const revenueAccountId = line.RevenueAccountId || revenueDefault.accountId;
            const lineAmount = line.Amount || (line.Quantity * line.UnitPrice) || 0;
            await axios.post(`${DAB_API_URL}/journalentrylines`, {
                JournalEntryId: journalEntryId,
                AccountId: revenueAccountId,
                Description: line.Description || `Invoice line`,
                Debit: 0,
                Credit: lineAmount,
                ProjectId: line.ProjectId || invoice.ProjectId || null,
                ClassId: line.ClassId || invoice.ClassId || null
            });
        }

        // CR: Sales Tax Payable when invoice has tax
        const taxAmount = parseFloat(invoice.TaxAmount) || 0;
        if (taxAmount > 0) {
            // Try configured default first, then fall back to name lookup
            const taxDefault = await this.getAccountDefault(ACCOUNT_TYPES.SALES_TAX_PAYABLE);
            let taxAccountId = taxDefault?.accountId;
            if (!taxAccountId) {
                const taxPayableResp = await axios.get(
                    `${DAB_API_URL}/accounts?$filter=Name eq 'Sales Tax Payable'`
                );
                taxAccountId = taxPayableResp.data.value?.[0]?.Id;
            }
            if (taxAccountId) {
                await axios.post(`${DAB_API_URL}/journalentrylines`, {
                    JournalEntryId: journalEntryId,
                    AccountId: taxAccountId,
                    Description: `Sales Tax - Invoice ${invoice.InvoiceNumber}`,
                    Debit: 0,
                    Credit: taxAmount,
                    ProjectId: invoice.ProjectId || null,
                    ClassId: invoice.ClassId || null
                });
            } else {
                console.warn(`[postInvoice] No Sales Tax Payable account found. Tax amount $${taxAmount} will be missing from JE.`);
            }
        }

        // Now that all lines are balanced, set JE status to Posted
        await axios.patch(`${DAB_API_URL}/journalentries/Id/${journalEntryId}`, {
            Status: 'Posted',
            PostedAt: now,
            PostedBy: userId
        });

        // Update invoice with journal entry link (don't change Status — invoices use Sent/Paid/Overdue, not Posted)
        await axios.patch(`${DAB_API_URL}/invoices_write/Id/${invoiceId}`, {
            JournalEntryId: journalEntryId,
            PostedAt: now,
            PostedBy: userId
        });

        return {
            invoiceId,
            journalEntryId,
            totalAmount: invoice.TotalAmount,
            linesCount: lines.length
        };
    }

    /**
     * Void an invoice and create a reversing journal entry
     *
     * @param {string} invoiceId - Invoice UUID
     * @param {string} userId - User performing the action
     */
    async voidInvoice(invoiceId, userId = 'system') {
        // Get the invoice
        let invoice;
        try {
            const invoiceResp = await axios.get(`${DAB_API_URL}/invoices/Id/${invoiceId}`);
            invoice = invoiceResp.data?.value?.[0] || invoiceResp.data;
        } catch (err) {
            if (err.response?.status === 404) {
                throw new Error(`Invoice ${invoiceId} not found`);
            }
            throw err;
        }

        if (!invoice) {
            throw new Error(`Invoice ${invoiceId} not found`);
        }

        if (!invoice.JournalEntryId) {
            throw new Error(`Invoice ${invoiceId} is not posted`);
        }

        if (invoice.Status === 'Voided') {
            throw new Error(`Invoice ${invoiceId} is already voided`);
        }

        // Get original journal entry lines - GUID filters must not be quoted
        const originalLinesResp = await axios.get(
            `${DAB_API_URL}/journalentrylines?$filter=JournalEntryId eq ${invoice.JournalEntryId}`
        );
        const originalLines = originalLinesResp.data.value || [];

        // Create reversing journal entry
        const reversingJeId = randomUUID();
        const now = new Date().toISOString();

        await axios.post(`${DAB_API_URL}/journalentries`, {
            Id: reversingJeId,
            TransactionDate: now.split('T')[0],
            Description: `VOID: Invoice ${invoice.InvoiceNumber}`,
            Reference: `VOID-${invoice.InvoiceNumber}`,
            Status: 'Posted',
            CreatedBy: userId,
            PostedAt: now,
            PostedBy: userId
        });

        // Create reversing lines (swap debits and credits, preserve project/class) - batch create for performance
        const reversingLinePromises = originalLines.map((line) =>
            axios.post(`${DAB_API_URL}/journalentrylines`, {
                JournalEntryId: reversingJeId,
                AccountId: line.AccountId,
                Description: `VOID: ${line.Description || ''}`,
                Debit: line.Credit,  // Swap
                Credit: line.Debit,  // Swap
                ProjectId: line.ProjectId || null,
                ClassId: line.ClassId || null
            })
        );
        await Promise.all(reversingLinePromises);

        // Update original journal entry status
        await axios.patch(`${DAB_API_URL}/journalentries/Id/${invoice.JournalEntryId}`, {
            Status: 'Void'
        });

        // Update invoice status
        await axios.patch(`${DAB_API_URL}/invoices_write/Id/${invoiceId}`, {
            Status: 'Voided'
        });

        return {
            invoiceId,
            originalJournalEntryId: invoice.JournalEntryId,
            reversingJournalEntryId: reversingJeId
        };
    }

    /**
     * Post a bill and create the corresponding journal entry
     * DR: Expense account(s) per line
     * CR: Accounts Payable
     *
     * @param {string} billId - Bill UUID
     * @param {string} userId - User performing the action
     */
    async postBill(billId, userId = 'system') {
        // Get the bill
        let bill;
        try {
            const billResp = await axios.get(`${DAB_API_URL}/bills/Id/${billId}`);
            bill = billResp.data?.value?.[0] || billResp.data;
        } catch (err) {
            if (err.response?.status === 404) {
                throw new Error(`Bill ${billId} not found`);
            }
            throw err;
        }

        if (!bill) {
            throw new Error(`Bill ${billId} not found`);
        }

        if (bill.JournalEntryId) {
            throw new Error(`Bill ${billId} is already posted`);
        }

        // Get bill lines - GUID filters must not be quoted
        const linesResp = await axios.get(
            `${DAB_API_URL}/billlines?$filter=BillId eq ${billId}`
        );
        const lines = linesResp.data.value || [];

        if (lines.length === 0) {
            throw new Error(`Bill ${billId} has no lines`);
        }

        // Get default AP account
        const apDefault = await this.getAccountDefault(ACCOUNT_TYPES.ACCOUNTS_PAYABLE);

        if (!apDefault) {
            throw new Error('Accounts Payable default account not configured');
        }

        // Create journal entry
        const journalEntryId = randomUUID();
        const now = new Date().toISOString();

        await axios.post(`${DAB_API_URL}/journalentries`, {
            Id: journalEntryId,
            TransactionDate: bill.BillDate,
            Description: `Bill ${bill.BillNumber || billId} - ${bill.VendorName || 'Vendor'}`,
            Reference: bill.BillNumber,
            Status: 'Posted',
            CreatedBy: userId,
            PostedAt: now,
            PostedBy: userId
        });

        // Create journal entry lines
        // Validate all lines have AccountId before creating
        for (const line of lines) {
            if (!line.AccountId) {
                throw new Error(`Bill line ${line.Id} is missing an expense account`);
            }
        }

        // DR: Expense accounts per line (bill lines already have AccountId) - batch create for performance
        // Line-level project/class overrides header; falls back to header; falls back to null
        const expenseLinePromises = lines.map((line) =>
            axios.post(`${DAB_API_URL}/journalentrylines`, {
                JournalEntryId: journalEntryId,
                AccountId: line.AccountId,
                Description: line.Description || `Bill expense`,
                Debit: line.Amount,
                Credit: 0,
                ProjectId: line.ProjectId || bill.ProjectId || null,
                ClassId: line.ClassId || bill.ClassId || null
            })
        );
        await Promise.all(expenseLinePromises);

        // CR: Accounts Payable for total amount (use header-level project/class)
        await axios.post(`${DAB_API_URL}/journalentrylines`, {
            JournalEntryId: journalEntryId,
            AccountId: apDefault.accountId,
            Description: `AP - Bill ${bill.BillNumber || billId}`,
            Debit: 0,
            Credit: bill.TotalAmount,
            ProjectId: bill.ProjectId || null,
            ClassId: bill.ClassId || null
        });

        // Update bill with journal entry link
        await axios.patch(`${DAB_API_URL}/bills_write/Id/${billId}`, {
            JournalEntryId: journalEntryId,
            PostedAt: now,
            PostedBy: userId,
            Status: 'Posted'
        });

        return {
            billId,
            journalEntryId,
            totalAmount: bill.TotalAmount,
            linesCount: lines.length
        };
    }

    /**
     * Void a bill and create a reversing journal entry
     *
     * @param {string} billId - Bill UUID
     * @param {string} userId - User performing the action
     */
    async voidBill(billId, userId = 'system') {
        // Get the bill
        let bill;
        try {
            const billResp = await axios.get(`${DAB_API_URL}/bills/Id/${billId}`);
            bill = billResp.data?.value?.[0] || billResp.data;
        } catch (err) {
            if (err.response?.status === 404) {
                throw new Error(`Bill ${billId} not found`);
            }
            throw err;
        }

        if (!bill) {
            throw new Error(`Bill ${billId} not found`);
        }

        if (!bill.JournalEntryId) {
            throw new Error(`Bill ${billId} is not posted`);
        }

        if (bill.Status === 'Voided') {
            throw new Error(`Bill ${billId} is already voided`);
        }

        // Get original journal entry lines - GUID filters must not be quoted
        const originalLinesResp = await axios.get(
            `${DAB_API_URL}/journalentrylines?$filter=JournalEntryId eq ${bill.JournalEntryId}`
        );
        const originalLines = originalLinesResp.data.value || [];

        // Create reversing journal entry
        const reversingJeId = randomUUID();
        const now = new Date().toISOString();

        await axios.post(`${DAB_API_URL}/journalentries`, {
            Id: reversingJeId,
            TransactionDate: now.split('T')[0],
            Description: `VOID: Bill ${bill.BillNumber || billId}`,
            Reference: `VOID-${bill.BillNumber || billId}`,
            Status: 'Posted',
            CreatedBy: userId,
            PostedAt: now,
            PostedBy: userId
        });

        // Create reversing lines (swap debits and credits, preserve project/class) - batch create for performance
        const reversingLinePromises = originalLines.map((line) =>
            axios.post(`${DAB_API_URL}/journalentrylines`, {
                JournalEntryId: reversingJeId,
                AccountId: line.AccountId,
                Description: `VOID: ${line.Description || ''}`,
                Debit: line.Credit,
                Credit: line.Debit,
                ProjectId: line.ProjectId || null,
                ClassId: line.ClassId || null
            })
        );
        await Promise.all(reversingLinePromises);

        // Update original journal entry status
        await axios.patch(`${DAB_API_URL}/journalentries/Id/${bill.JournalEntryId}`, {
            Status: 'Void'
        });

        // Update bill status
        await axios.patch(`${DAB_API_URL}/bills_write/Id/${billId}`, {
            Status: 'Voided'
        });

        return {
            billId,
            originalJournalEntryId: bill.JournalEntryId,
            reversingJournalEntryId: reversingJeId
        };
    }

    /**
     * Record a customer payment and create journal entry
     * DR: Cash/Bank
     * CR: Accounts Receivable
     *
     * @param {Object} paymentData - Payment details
     * @param {string} paymentData.customerId - Customer UUID
     * @param {string} paymentData.paymentDate - Payment date (YYYY-MM-DD)
     * @param {number} paymentData.totalAmount - Payment amount
     * @param {string} paymentData.paymentMethod - Payment method
     * @param {string} paymentData.depositAccountId - Bank account UUID (optional, uses default)
     * @param {string} paymentData.memo - Optional memo
     * @param {Array} paymentData.applications - Invoice applications [{invoiceId, amountApplied}]
     * @param {string} userId - User performing the action
     */
    async recordInvoicePayment(paymentData, userId = 'system') {
        const {
            customerId,
            paymentDate,
            totalAmount,
            paymentMethod,
            depositAccountId,
            memo,
            applications = []
        } = paymentData;

        if (!customerId || !paymentDate || !totalAmount) {
            throw new Error('Missing required payment fields: customerId, paymentDate, totalAmount');
        }

        // Get default accounts
        const arDefault = await this.getAccountDefault(ACCOUNT_TYPES.ACCOUNTS_RECEIVABLE);
        const cashDefault = await this.getAccountDefault(ACCOUNT_TYPES.DEFAULT_CASH);

        if (!arDefault) {
            throw new Error('Accounts Receivable default account not configured');
        }

        const cashAccountId = depositAccountId || cashDefault?.accountId;
        if (!cashAccountId) {
            throw new Error('No deposit account specified and Default Cash account not configured');
        }

        // Generate payment number
        const paymentNumber = `PMT-${Date.now()}`;

        // Get customer name for description
        let customerName = 'Customer';
        try {
            const custResp = await axios.get(`${DAB_API_URL}/customers/Id/${customerId}`);
            const cust = custResp.data.value?.[0] || custResp.data;
            customerName = cust?.Name || 'Customer';
        } catch (e) { /* ignore */ }

        // Create journal entry as Draft first (balance trigger only enforces on Posted)
        const journalEntryId = randomUUID();
        const now = new Date().toISOString();

        await axios.post(`${DAB_API_URL}/journalentries`, {
            Id: journalEntryId,
            TransactionDate: paymentDate,
            Description: `Payment received - ${customerName}`,
            Reference: paymentNumber,
            Status: 'Draft',
            CreatedBy: userId,
        });

        // DR: Cash/Bank
        await axios.post(`${DAB_API_URL}/journalentrylines`, {
            JournalEntryId: journalEntryId,
            AccountId: cashAccountId,
            Description: `Payment ${paymentNumber}`,
            Debit: totalAmount,
            Credit: 0
        });

        // CR: Accounts Receivable
        await axios.post(`${DAB_API_URL}/journalentrylines`, {
            JournalEntryId: journalEntryId,
            AccountId: arDefault.accountId,
            Description: `Payment ${paymentNumber} - AR`,
            Debit: 0,
            Credit: totalAmount
        });

        // Post the journal entry now that lines are balanced
        await axios.patch(`${DAB_API_URL}/journalentries/Id/${journalEntryId}`, {
            Status: 'Posted',
            PostedAt: now,
            PostedBy: userId
        });

        // Create payment record (with JE link)
        const paymentId = randomUUID();
        await axios.post(`${DAB_API_URL}/payments_write`, {
            Id: paymentId,
            PaymentNumber: paymentNumber,
            CustomerId: customerId,
            PaymentDate: paymentDate,
            TotalAmount: totalAmount,
            PaymentMethod: paymentMethod || 'Check',
            DepositAccountId: cashAccountId,
            Memo: memo,
            Status: 'Completed',
            JournalEntryId: journalEntryId
        });

        // Create payment applications
        const applicationPromises = applications.map((app) =>
            axios.post(`${DAB_API_URL}/paymentapplications`, {
                PaymentId: paymentId,
                InvoiceId: app.invoiceId,
                AmountApplied: app.amountApplied
            })
        );
        await Promise.all(applicationPromises);

        return {
            paymentId,
            paymentNumber,
            journalEntryId,
            totalAmount,
            applicationsCount: applications.length
        };
    }

    /**
     * Record a bill payment (vendor payment) and create journal entry
     * DR: Accounts Payable
     * CR: Cash/Bank
     *
     * @param {Object} paymentData - Payment details
     * @param {string} paymentData.vendorId - Vendor UUID
     * @param {string} paymentData.paymentDate - Payment date (YYYY-MM-DD)
     * @param {number} paymentData.totalAmount - Payment amount
     * @param {string} paymentData.paymentMethod - Payment method
     * @param {string} paymentData.paymentAccountId - Bank account UUID (optional, uses default)
     * @param {string} paymentData.memo - Optional memo
     * @param {Array} paymentData.applications - Bill applications [{billId, amountApplied}]
     * @param {string} userId - User performing the action
     */
    async recordBillPayment(paymentData, userId = 'system') {
        const {
            vendorId,
            paymentDate,
            totalAmount,
            paymentMethod,
            paymentAccountId,
            memo,
            applications = []
        } = paymentData;

        if (!vendorId || !paymentDate || !totalAmount) {
            throw new Error('Missing required payment fields: vendorId, paymentDate, totalAmount');
        }

        // Get default accounts
        const apDefault = await this.getAccountDefault(ACCOUNT_TYPES.ACCOUNTS_PAYABLE);
        const cashDefault = await this.getAccountDefault(ACCOUNT_TYPES.DEFAULT_CASH);

        if (!apDefault) {
            throw new Error('Accounts Payable default account not configured');
        }

        const cashAccountId = paymentAccountId || cashDefault?.accountId;
        if (!cashAccountId) {
            throw new Error('No payment account specified and Default Cash account not configured');
        }

        // Generate payment number
        const paymentNumber = `BP-${Date.now()}`;

        // Get vendor name for description
        let vendorName = 'Vendor';
        try {
            const vendorResp = await axios.get(`${DAB_API_URL}/vendors/Id/${vendorId}`);
            const vendor = vendorResp.data.value?.[0] || vendorResp.data;
            vendorName = vendor?.Name || 'Vendor';
        } catch (e) { /* ignore */ }

        // Create journal entry as Draft first (balance trigger only enforces on Posted)
        const journalEntryId = randomUUID();
        const now = new Date().toISOString();

        await axios.post(`${DAB_API_URL}/journalentries`, {
            Id: journalEntryId,
            TransactionDate: paymentDate,
            Description: `Payment to ${vendorName}`,
            Reference: paymentNumber,
            Status: 'Draft',
            CreatedBy: userId,
        });

        // DR: Accounts Payable
        await axios.post(`${DAB_API_URL}/journalentrylines`, {
            JournalEntryId: journalEntryId,
            AccountId: apDefault.accountId,
            Description: `Bill Payment ${paymentNumber} - AP`,
            Debit: totalAmount,
            Credit: 0
        });

        // CR: Cash/Bank
        await axios.post(`${DAB_API_URL}/journalentrylines`, {
            JournalEntryId: journalEntryId,
            AccountId: cashAccountId,
            Description: `Bill Payment ${paymentNumber}`,
            Debit: 0,
            Credit: totalAmount
        });

        // Post the journal entry now that lines are balanced
        await axios.patch(`${DAB_API_URL}/journalentries/Id/${journalEntryId}`, {
            Status: 'Posted',
            PostedAt: now,
            PostedBy: userId
        });

        // Create bill payment record (with JE link, use _write endpoint for table)
        const billPaymentId = randomUUID();
        await axios.post(`${DAB_API_URL}/billpayments_write`, {
            Id: billPaymentId,
            PaymentNumber: paymentNumber,
            VendorId: vendorId,
            PaymentDate: paymentDate,
            TotalAmount: totalAmount,
            PaymentMethod: paymentMethod || 'Check',
            PaymentAccountId: cashAccountId,
            Memo: memo,
            Status: 'Completed',
            JournalEntryId: journalEntryId
        });

        // Create bill payment applications
        const applicationPromises = applications.map((app) =>
            axios.post(`${DAB_API_URL}/billpaymentapplications`, {
                BillPaymentId: billPaymentId,
                BillId: app.billId,
                AmountApplied: app.amountApplied
            })
        );
        await Promise.all(applicationPromises);

        return {
            billPaymentId,
            paymentNumber,
            journalEntryId,
            totalAmount,
            applicationsCount: applications.length
        };
    }
}

// Export singleton instance
export const journalEntryService = new JournalEntryService();

// Export class for testing
export { JournalEntryService, ACCOUNT_TYPES };
