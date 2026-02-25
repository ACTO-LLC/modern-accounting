/**
 * Audit Log Service
 * Provides centralized audit logging for all CRUD operations.
 * Writes entries to the AuditLog table via the stored procedure sp_LogAuditEvent.
 *
 * @module services/audit-log
 */

import { query } from '../db/connection.js';

/**
 * Log an audit event to the AuditLog table.
 * Failures are caught and logged to console — audit logging must never
 * break the original request flow.
 *
 * @param {Object} params
 * @param {string} params.action - Create | Update | Delete | Import | System
 * @param {string} params.entityType - Entity name (e.g. 'Invoice', 'Customer')
 * @param {string} [params.entityId] - ID of the affected record
 * @param {string} [params.entityDescription] - Human-readable description
 * @param {Object} [params.oldValues] - Previous state (for updates)
 * @param {Object} [params.newValues] - New state (for creates/updates)
 * @param {Object} [params.changes] - Summary of changed fields
 * @param {Object} [params.req] - Express request object (extracts user/IP/UA)
 * @param {string} [params.userId] - Override user ID
 * @param {string} [params.userName] - Override user name
 * @param {string} [params.userEmail] - Override user email
 * @param {string} [params.source] - Source label (default: 'API')
 * @param {string} [params.tenantId] - Tenant ID
 */
export async function logAuditEvent({
    action,
    entityType,
    entityId = null,
    entityDescription = null,
    oldValues = null,
    newValues = null,
    changes = null,
    req = null,
    userId = null,
    userName = null,
    userEmail = null,
    source = 'API',
    tenantId = null,
}) {
    try {
        // Extract user info from request if available
        const effectiveUserId = userId || req?.dbUser?.Id || req?.dbUser?.EntraObjectId || null;
        const effectiveUserName = userName || req?.dbUser?.DisplayName || null;
        const effectiveUserEmail = userEmail || req?.dbUser?.Email || null;
        const effectiveTenantId = tenantId || req?.tenant?.Id || null;
        const ipAddress = req?.ip || req?.headers?.['x-forwarded-for'] || null;
        const userAgent = req?.headers?.['user-agent']?.substring(0, 500) || null;
        const requestId = req?.headers?.['x-request-id'] || null;

        await query(
            `INSERT INTO [dbo].[AuditLog]
                ([UserId], [UserName], [UserEmail], [Action], [EntityType], [EntityId],
                 [EntityDescription], [OldValues], [NewValues], [Changes],
                 [IpAddress], [UserAgent], [TenantId], [RequestId], [Source])
             VALUES
                (@userId, @userName, @userEmail, @action, @entityType, @entityId,
                 @entityDescription, @oldValues, @newValues, @changes,
                 @ipAddress, @userAgent, @tenantId, @requestId, @source)`,
            {
                userId: effectiveUserId,
                userName: effectiveUserName,
                userEmail: effectiveUserEmail,
                action,
                entityType,
                entityId: entityId != null ? String(entityId) : null,
                entityDescription,
                oldValues: oldValues ? JSON.stringify(oldValues) : null,
                newValues: newValues ? JSON.stringify(newValues) : null,
                changes: changes ? JSON.stringify(changes) : null,
                ipAddress,
                userAgent,
                tenantId: effectiveTenantId,
                requestId,
                source,
            }
        );
    } catch (error) {
        // Never let audit logging failures break the request
        console.error('[AuditLog] Failed to write audit entry:', error.message, {
            action,
            entityType,
            entityId,
        });
    }
}

/**
 * Compute a diff between old and new values for audit change tracking.
 *
 * @param {Object} oldValues - Previous field values
 * @param {Object} newValues - New field values
 * @returns {Object|null} Object with changed fields { field: { from, to } } or null if no changes
 */
export function computeChanges(oldValues, newValues) {
    if (!oldValues || !newValues) return null;

    const changes = {};
    for (const key of Object.keys(newValues)) {
        const oldVal = oldValues[key];
        const newVal = newValues[key];
        if (oldVal !== newVal) {
            changes[key] = { from: oldVal ?? null, to: newVal ?? null };
        }
    }

    return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Map a DAB REST entity name to a human-readable entity type for audit logs.
 * DAB entity names are lowercase, audit logs use PascalCase.
 *
 * @param {string} dabEntity - DAB entity name (e.g. 'invoices', 'journalentries')
 * @returns {string} PascalCase entity type
 */
export function mapEntityType(dabEntity) {
    const mapping = {
        accounts: 'Account',
        invoices: 'Invoice',
        invoicelines: 'InvoiceLine',
        estimates: 'Estimate',
        estimatelines: 'EstimateLine',
        salesreceipts: 'SalesReceipt',
        salesreceiptlines: 'SalesReceiptLine',
        purchaseorders: 'PurchaseOrder',
        purchaseorderlines: 'PurchaseOrderLine',
        bills: 'Bill',
        billlines: 'BillLine',
        vendorcredits: 'VendorCredit',
        vendorcreditlines: 'VendorCreditLine',
        expenses: 'Expense',
        expenselines: 'ExpenseLine',
        customerdeposits: 'CustomerDeposit',
        creditmemos: 'CreditMemo',
        creditmemolines: 'CreditMemoLine',
        customers: 'Customer',
        vendors: 'Vendor',
        employees: 'Employee',
        products: 'Product',
        journalentries: 'JournalEntry',
        journalentrylines: 'JournalEntryLine',
        payments: 'Payment',
        paymentapplications: 'PaymentApplication',
        billpayments: 'BillPayment',
        billpaymentapplications: 'BillPaymentApplication',
        companies: 'Company',
        banktransactions: 'BankTransaction',
        bankaccounts: 'BankAccount',
        plaidconnections: 'PlaidConnection',
        categorizationrules: 'CategorizationRule',
        projects: 'Project',
        timeentries: 'TimeEntry',
        taxrates: 'TaxRate',
        classes: 'Class',
        locations: 'Location',
        recurringtransactions: 'RecurringTransaction',
        mileageentries: 'MileageEntry',
        bankreconciliations: 'BankReconciliation',
        reconciliationitems: 'ReconciliationItem',
        closingentries: 'ClosingEntry',
        featureflags: 'FeatureFlag',
        budgets: 'Budget',
        budgetlines: 'BudgetLine',
        attachments: 'Attachment',
    };

    return mapping[dabEntity?.toLowerCase()] || dabEntity || 'Unknown';
}

export default { logAuditEvent, computeChanges, mapEntityType };
