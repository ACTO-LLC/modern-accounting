/**
 * QBO to ACTO Data Mapper
 *
 * Transforms QuickBooks Online entities to ACTO format.
 */

/**
 * Map QBO Account Type to ACTO Account Type
 */
const QBO_TO_ACTO_ACCOUNT_TYPE = {
    // Asset types
    'Bank': 'Asset',
    'Other Current Asset': 'Asset',
    'Fixed Asset': 'Asset',
    'Other Asset': 'Asset',
    'Accounts Receivable': 'Asset',

    // Liability types
    'Accounts Payable': 'Liability',
    'Credit Card': 'Liability',
    'Other Current Liability': 'Liability',
    'Long Term Liability': 'Liability',

    // Equity types
    'Equity': 'Equity',

    // Revenue types
    'Income': 'Revenue',
    'Other Income': 'Revenue',

    // Expense types
    'Expense': 'Expense',
    'Other Expense': 'Expense',
    'Cost of Goods Sold': 'Expense'
};

/**
 * Map QBO Account Subtype to ACTO Subtype
 */
const QBO_TO_ACTO_SUBTYPE = {
    // Bank subtypes
    'Checking': 'Cash',
    'Savings': 'Cash',
    'MoneyMarket': 'Cash',
    'CashOnHand': 'Cash',

    // AR/AP
    'AccountsReceivable': 'Accounts Receivable',
    'AccountsPayable': 'Accounts Payable',

    // Credit Card
    'CreditCard': 'Credit Card',

    // Expense subtypes
    'AdvertisingPromotional': 'Advertising',
    'Auto': 'Auto',
    'Insurance': 'Insurance',
    'LegalProfessionalFees': 'Professional Fees',
    'OfficeGeneralAdministrativeExpenses': 'Office Expense',
    'RentOrLeaseOfBuildings': 'Rent',
    'Utilities': 'Utilities',
    'Travel': 'Travel',
    'TravelMeals': 'Meals & Entertainment'
};

/**
 * Generate next available account code based on type
 */
function generateAccountCode(type, existingCodes = []) {
    const typeRanges = {
        'Asset': { start: 1000, end: 1999 },
        'Liability': { start: 2000, end: 2999 },
        'Equity': { start: 3000, end: 3999 },
        'Revenue': { start: 4000, end: 4999 },
        'Expense': { start: 5000, end: 9999 }
    };

    const range = typeRanges[type] || { start: 9000, end: 9999 };

    // Find next available code
    const usedCodes = new Set(existingCodes.map(c => parseInt(c, 10)));
    for (let code = range.start; code <= range.end; code++) {
        if (!usedCodes.has(code)) {
            return code.toString();
        }
    }

    return `${range.end + 1}`;
}

/**
 * Map QBO Customer to ACTO Customer
 */
export function mapCustomer(qboCustomer) {
    return {
        Name: qboCustomer.DisplayName || qboCustomer.CompanyName || 'Unnamed Customer',
        Email: qboCustomer.PrimaryEmailAddr?.Address || qboCustomer.PrimaryEmailAddr || null,
        Phone: qboCustomer.PrimaryPhone?.FreeFormNumber || qboCustomer.PrimaryPhone || null,
        Address: formatAddress(qboCustomer.BillAddr),
        // Preserve QBO ID for mapping
        _qboId: qboCustomer.Id,
        _qboSyncToken: qboCustomer.SyncToken
    };
}

/**
 * Map QBO Vendor to ACTO Vendor
 */
export function mapVendor(qboVendor) {
    return {
        Name: qboVendor.DisplayName || qboVendor.CompanyName || 'Unnamed Vendor',
        Email: qboVendor.PrimaryEmailAddr?.Address || qboVendor.PrimaryEmailAddr || null,
        Phone: qboVendor.PrimaryPhone?.FreeFormNumber || qboVendor.PrimaryPhone || null,
        Address: formatAddress(qboVendor.BillAddr),
        Is1099Vendor: qboVendor.Vendor1099 || false,
        TaxId: qboVendor.TaxIdentifier || null,
        Status: qboVendor.Active ? 'Active' : 'Inactive',
        // Preserve QBO ID for mapping
        _qboId: qboVendor.Id,
        _qboSyncToken: qboVendor.SyncToken
    };
}

/**
 * Map QBO Account to ACTO Account
 */
export function mapAccount(qboAccount, existingCodes = []) {
    const actoType = QBO_TO_ACTO_ACCOUNT_TYPE[qboAccount.AccountType] || 'Expense';
    const actoSubtype = QBO_TO_ACTO_SUBTYPE[qboAccount.AccountSubType] || qboAccount.AccountSubType || null;

    // Use QBO AcctNum if available, otherwise generate
    let code = qboAccount.AcctNum;
    if (!code) {
        code = generateAccountCode(actoType, existingCodes);
    }

    return {
        Code: code,
        Name: qboAccount.Name || 'Unnamed Account',
        Type: actoType,
        Subtype: actoSubtype,
        Description: qboAccount.Description || null,
        IsActive: qboAccount.Active !== false,
        // Preserve QBO ID for mapping
        _qboId: qboAccount.Id,
        _qboType: qboAccount.AccountType,
        _qboSubType: qboAccount.AccountSubType
    };
}

/**
 * Map QBO Invoice to ACTO Invoice
 */
export function mapInvoice(qboInvoice, customerIdMap = {}) {
    // Look up ACTO customer ID from QBO customer ID
    // Use String() to ensure consistent key type (QBO IDs can be numbers or strings)
    const qboCustomerId = qboInvoice.CustomerRef?.value || qboInvoice.CustomerRef;
    const actoCustomerId = customerIdMap[String(qboCustomerId)];

    if (!actoCustomerId) {
        return {
            _skipped: true,
            _reason: `Customer not migrated: QBO ID ${qboCustomerId}`,
            _qboId: qboInvoice.Id
        };
    }

    return {
        InvoiceNumber: qboInvoice.DocNumber || `QBO-${qboInvoice.Id}`,
        CustomerId: actoCustomerId,
        IssueDate: qboInvoice.TxnDate || new Date().toISOString().split('T')[0],
        DueDate: qboInvoice.DueDate || qboInvoice.TxnDate || new Date().toISOString().split('T')[0],
        TotalAmount: parseFloat(qboInvoice.TotalAmt) || 0,
        Status: mapInvoiceStatus(qboInvoice),
        // Line items
        Lines: (qboInvoice.Line || [])
            .filter(line => line.DetailType === 'SalesItemLineDetail')
            .map(line => mapInvoiceLine(line)),
        // Preserve QBO ID for mapping
        _qboId: qboInvoice.Id,
        _qboCustomerRef: qboCustomerId
    };
}

/**
 * Map QBO Invoice Line to ACTO Invoice Line
 */
function mapInvoiceLine(qboLine) {
    const detail = qboLine.SalesItemLineDetail || {};
    return {
        Description: qboLine.Description || detail.ItemRef?.name || 'Line Item',
        Quantity: parseFloat(detail.Qty) || 1,
        UnitPrice: parseFloat(detail.UnitPrice) || parseFloat(qboLine.Amount) || 0,
        Amount: parseFloat(qboLine.Amount) || 0
    };
}

/**
 * Map QBO Invoice Status to ACTO Status
 */
function mapInvoiceStatus(qboInvoice) {
    const balance = parseFloat(qboInvoice.Balance) || 0;
    const total = parseFloat(qboInvoice.TotalAmt) || 0;

    if (balance === 0 && total > 0) {
        return 'Paid';
    }
    if (balance < total && balance > 0) {
        return 'Partial';
    }

    // Check if overdue
    if (qboInvoice.DueDate) {
        const dueDate = new Date(qboInvoice.DueDate);
        if (dueDate < new Date()) {
            return 'Overdue';
        }
    }

    return 'Sent';
}

/**
 * Map QBO Bill to ACTO Bill
 */
export function mapBill(qboBill, vendorIdMap = {}, accountIdMap = {}) {
    // Use String() to ensure consistent key type (QBO IDs can be numbers or strings)
    const qboVendorId = qboBill.VendorRef?.value || qboBill.VendorRef;
    const actoVendorId = vendorIdMap[String(qboVendorId)];

    if (!actoVendorId) {
        return {
            _skipped: true,
            _reason: `Vendor not migrated: QBO ID ${qboVendorId}`,
            _qboId: qboBill.Id
        };
    }

    const balance = parseFloat(qboBill.Balance) || 0;
    const total = parseFloat(qboBill.TotalAmt) || 0;

    let status = 'Open';
    if (balance === 0 && total > 0) {
        status = 'Paid';
    } else if (balance < total && balance > 0) {
        status = 'Partial';
    }

    return {
        VendorId: actoVendorId,
        BillNumber: qboBill.DocNumber || `QBO-BILL-${qboBill.Id}`,
        BillDate: qboBill.TxnDate || new Date().toISOString().split('T')[0],
        DueDate: qboBill.DueDate || qboBill.TxnDate,
        TotalAmount: total,
        AmountPaid: total - balance,
        Status: status,
        Terms: qboBill.SalesTermRef?.name || null,
        Memo: qboBill.PrivateNote || null,
        Lines: (qboBill.Line || [])
            .filter(line => line.DetailType === 'AccountBasedExpenseLineDetail')
            .map(line => mapBillLine(line, accountIdMap)),
        _qboId: qboBill.Id,
        _qboVendorRef: qboVendorId
    };
}

/**
 * Map QBO Bill Line to ACTO Bill Line
 */
function mapBillLine(qboLine, accountIdMap = {}) {
    const detail = qboLine.AccountBasedExpenseLineDetail || {};
    const qboAccountId = detail.AccountRef?.value;

    return {
        AccountId: qboAccountId ? accountIdMap[String(qboAccountId)] || null : null,
        Description: qboLine.Description || detail.AccountRef?.name || 'Expense',
        Amount: parseFloat(qboLine.Amount) || 0,
        _qboAccountRef: qboAccountId
    };
}

/**
 * Format QBO address to string
 */
function formatAddress(addr) {
    if (!addr) return null;

    const parts = [
        addr.Line1,
        addr.Line2,
        addr.Line3,
        addr.Line4,
        [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(', '),
        addr.Country
    ].filter(Boolean);

    return parts.length > 0 ? parts.join('\n') : null;
}

export default {
    mapCustomer,
    mapVendor,
    mapAccount,
    mapInvoice,
    mapBill,
    generateAccountCode,
    QBO_TO_ACTO_ACCOUNT_TYPE,
    QBO_TO_ACTO_SUBTYPE
};
