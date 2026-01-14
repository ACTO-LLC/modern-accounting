/**
 * QBO to ACTO Migration Executor
 *
 * Orchestrates the migration of data from QuickBooks Online to ACTO.
 * Handles entity creation, ID mapping, and progress tracking.
 */

import {
    mapCustomer,
    mapVendor,
    mapAccount,
    mapInvoice,
    mapBill
} from './mapper.js';

/**
 * Migration result structure
 */
function createMigrationResult() {
    return {
        success: true,
        migrated: 0,
        skipped: 0,
        errors: [],
        idMap: {},
        details: []
    };
}

/**
 * Migrate customers from QBO to ACTO
 *
 * @param {Array} qboCustomers - Array of QBO customer objects
 * @param {DabMcpClient} mcp - DAB MCP client instance
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Object} Migration result with idMap of QBO ID -> ACTO ID
 */
export async function migrateCustomers(qboCustomers, mcp, onProgress = null) {
    const result = createMigrationResult();
    const total = qboCustomers.length;

    for (let i = 0; i < qboCustomers.length; i++) {
        const qboCustomer = qboCustomers[i];

        try {
            // Check for existing customer with same name
            const existingCheck = await mcp.readRecords('customers', {
                filter: `Name eq '${escapeOData(qboCustomer.DisplayName || qboCustomer.CompanyName || '')}'`,
                first: 1
            });

            const existing = existingCheck.result?.value || [];
            if (existing.length > 0) {
                // Customer exists, map to existing ID
                result.idMap[qboCustomer.Id] = existing[0].Id;
                result.skipped++;
                result.details.push({
                    type: 'customer',
                    qboId: qboCustomer.Id,
                    name: qboCustomer.DisplayName,
                    status: 'skipped',
                    reason: 'Already exists'
                });
                continue;
            }

            // Map and create customer
            const actoCustomer = mapCustomer(qboCustomer);
            delete actoCustomer._qboId;
            delete actoCustomer._qboSyncToken;

            const createResult = await mcp.createRecord('customers', actoCustomer);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;
            result.idMap[qboCustomer.Id] = newId;
            result.migrated++;
            result.details.push({
                type: 'customer',
                qboId: qboCustomer.Id,
                actoId: newId,
                name: actoCustomer.Name,
                status: 'created'
            });
        } catch (error) {
            result.errors.push({
                type: 'customer',
                qboId: qboCustomer.Id,
                name: qboCustomer.DisplayName,
                error: error.message
            });
        }

        if (onProgress) {
            onProgress(i + 1, total);
        }
    }

    return result;
}

/**
 * Migrate vendors from QBO to ACTO
 */
export async function migrateVendors(qboVendors, mcp, onProgress = null) {
    const result = createMigrationResult();
    const total = qboVendors.length;

    for (let i = 0; i < qboVendors.length; i++) {
        const qboVendor = qboVendors[i];

        try {
            // Check for existing vendor with same name
            const existingCheck = await mcp.readRecords('vendors', {
                filter: `Name eq '${escapeOData(qboVendor.DisplayName || qboVendor.CompanyName || '')}'`,
                first: 1
            });

            const existing = existingCheck.result?.value || [];
            if (existing.length > 0) {
                result.idMap[qboVendor.Id] = existing[0].Id;
                result.skipped++;
                result.details.push({
                    type: 'vendor',
                    qboId: qboVendor.Id,
                    name: qboVendor.DisplayName,
                    status: 'skipped',
                    reason: 'Already exists'
                });
                continue;
            }

            // Map and create vendor
            const actoVendor = mapVendor(qboVendor);
            delete actoVendor._qboId;
            delete actoVendor._qboSyncToken;

            const createResult = await mcp.createRecord('vendors', actoVendor);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;
            result.idMap[qboVendor.Id] = newId;
            result.migrated++;
            result.details.push({
                type: 'vendor',
                qboId: qboVendor.Id,
                actoId: newId,
                name: actoVendor.Name,
                status: 'created'
            });
        } catch (error) {
            result.errors.push({
                type: 'vendor',
                qboId: qboVendor.Id,
                name: qboVendor.DisplayName,
                error: error.message
            });
        }

        if (onProgress) {
            onProgress(i + 1, total);
        }
    }

    return result;
}

/**
 * Migrate chart of accounts from QBO to ACTO
 */
export async function migrateAccounts(qboAccounts, mcp, onProgress = null) {
    const result = createMigrationResult();
    const total = qboAccounts.length;

    // Get existing account codes
    const existingAccountsResult = await mcp.readRecords('accounts', { first: 1000 });
    const existingAccounts = existingAccountsResult.result?.value || [];
    const existingCodes = existingAccounts.map(a => a.Code);
    const existingNames = new Set(existingAccounts.map(a => a.Name.toLowerCase()));

    // Also build a map of existing accounts by name for ID mapping
    const existingByName = {};
    existingAccounts.forEach(a => {
        existingByName[a.Name.toLowerCase()] = a.Id;
    });

    for (let i = 0; i < qboAccounts.length; i++) {
        const qboAccount = qboAccounts[i];

        try {
            // Skip system accounts that shouldn't be migrated
            if (qboAccount.AccountType === 'Accounts Receivable' ||
                qboAccount.AccountType === 'Accounts Payable') {
                // Check if exists, map ID if so
                const existingId = existingByName[qboAccount.Name.toLowerCase()];
                if (existingId) {
                    result.idMap[qboAccount.Id] = existingId;
                }
                result.skipped++;
                result.details.push({
                    type: 'account',
                    qboId: qboAccount.Id,
                    name: qboAccount.Name,
                    status: 'skipped',
                    reason: 'System account'
                });
                continue;
            }

            // Check if account with same name exists
            if (existingNames.has(qboAccount.Name.toLowerCase())) {
                result.idMap[qboAccount.Id] = existingByName[qboAccount.Name.toLowerCase()];
                result.skipped++;
                result.details.push({
                    type: 'account',
                    qboId: qboAccount.Id,
                    name: qboAccount.Name,
                    status: 'skipped',
                    reason: 'Already exists'
                });
                continue;
            }

            // Map and create account
            const actoAccount = mapAccount(qboAccount, existingCodes);
            delete actoAccount._qboId;
            delete actoAccount._qboType;
            delete actoAccount._qboSubType;

            // Add new code to existing codes to prevent duplicates
            existingCodes.push(actoAccount.Code);

            const createResult = await mcp.createRecord('accounts', actoAccount);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;
            result.idMap[qboAccount.Id] = newId;
            existingByName[actoAccount.Name.toLowerCase()] = newId;
            result.migrated++;
            result.details.push({
                type: 'account',
                qboId: qboAccount.Id,
                actoId: newId,
                name: actoAccount.Name,
                code: actoAccount.Code,
                accountType: actoAccount.Type,
                status: 'created'
            });
        } catch (error) {
            result.errors.push({
                type: 'account',
                qboId: qboAccount.Id,
                name: qboAccount.Name,
                error: error.message
            });
        }

        if (onProgress) {
            onProgress(i + 1, total);
        }
    }

    return result;
}

/**
 * Migrate invoices from QBO to ACTO
 * Requires customer ID map from prior customer migration
 */
export async function migrateInvoices(qboInvoices, mcp, customerIdMap, onProgress = null) {
    const result = createMigrationResult();
    const total = qboInvoices.length;

    for (let i = 0; i < qboInvoices.length; i++) {
        const qboInvoice = qboInvoices[i];

        try {
            // Map invoice
            const actoInvoice = mapInvoice(qboInvoice, customerIdMap);

            // Check if skipped due to missing customer
            if (actoInvoice._skipped) {
                result.skipped++;
                result.details.push({
                    type: 'invoice',
                    qboId: qboInvoice.Id,
                    number: qboInvoice.DocNumber,
                    status: 'skipped',
                    reason: actoInvoice._reason
                });
                continue;
            }

            // Check for existing invoice with same number
            const existingCheck = await mcp.readRecords('invoices', {
                filter: `InvoiceNumber eq '${escapeOData(actoInvoice.InvoiceNumber)}'`,
                first: 1
            });

            const existing = existingCheck.result?.value || [];
            if (existing.length > 0) {
                result.idMap[qboInvoice.Id] = existing[0].Id;
                result.skipped++;
                result.details.push({
                    type: 'invoice',
                    qboId: qboInvoice.Id,
                    number: actoInvoice.InvoiceNumber,
                    status: 'skipped',
                    reason: 'Already exists'
                });
                continue;
            }

            // Create invoice (without lines first)
            const invoiceData = {
                InvoiceNumber: actoInvoice.InvoiceNumber,
                CustomerId: actoInvoice.CustomerId,
                IssueDate: actoInvoice.IssueDate,
                DueDate: actoInvoice.DueDate,
                TotalAmount: actoInvoice.TotalAmount,
                Status: actoInvoice.Status
            };

            const createResult = await mcp.createRecord('invoices', invoiceData);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;
            result.idMap[qboInvoice.Id] = newId;

            // Create invoice lines
            let linesCreated = 0;
            for (const line of actoInvoice.Lines || []) {
                try {
                    await mcp.createRecord('invoicelines', {
                        InvoiceId: newId,
                        Description: line.Description,
                        Quantity: line.Quantity,
                        UnitPrice: line.UnitPrice,
                        Amount: line.Amount
                    });
                    linesCreated++;
                } catch (lineError) {
                    console.error('Failed to create invoice line:', lineError.message);
                }
            }

            result.migrated++;
            result.details.push({
                type: 'invoice',
                qboId: qboInvoice.Id,
                actoId: newId,
                number: actoInvoice.InvoiceNumber,
                amount: actoInvoice.TotalAmount,
                linesCreated,
                status: 'created'
            });
        } catch (error) {
            result.errors.push({
                type: 'invoice',
                qboId: qboInvoice.Id,
                number: qboInvoice.DocNumber,
                error: error.message
            });
        }

        if (onProgress) {
            onProgress(i + 1, total);
        }
    }

    return result;
}

/**
 * Migrate bills from QBO to ACTO
 * Requires vendor and account ID maps from prior migrations
 */
export async function migrateBills(qboBills, mcp, vendorIdMap, accountIdMap, onProgress = null) {
    const result = createMigrationResult();
    const total = qboBills.length;

    for (let i = 0; i < qboBills.length; i++) {
        const qboBill = qboBills[i];

        try {
            // Map bill
            const actoBill = mapBill(qboBill, vendorIdMap, accountIdMap);

            // Check if skipped due to missing vendor
            if (actoBill._skipped) {
                result.skipped++;
                result.details.push({
                    type: 'bill',
                    qboId: qboBill.Id,
                    number: qboBill.DocNumber,
                    status: 'skipped',
                    reason: actoBill._reason
                });
                continue;
            }

            // Check for existing bill with same number
            const existingCheck = await mcp.readRecords('bills', {
                filter: `BillNumber eq '${escapeOData(actoBill.BillNumber)}'`,
                first: 1
            });

            const existing = existingCheck.result?.value || [];
            if (existing.length > 0) {
                result.idMap[qboBill.Id] = existing[0].Id;
                result.skipped++;
                result.details.push({
                    type: 'bill',
                    qboId: qboBill.Id,
                    number: actoBill.BillNumber,
                    status: 'skipped',
                    reason: 'Already exists'
                });
                continue;
            }

            // Create bill (without lines first)
            const billData = {
                VendorId: actoBill.VendorId,
                BillNumber: actoBill.BillNumber,
                BillDate: actoBill.BillDate,
                DueDate: actoBill.DueDate,
                TotalAmount: actoBill.TotalAmount,
                AmountPaid: actoBill.AmountPaid,
                Status: actoBill.Status,
                Terms: actoBill.Terms,
                Memo: actoBill.Memo
            };

            const createResult = await mcp.createRecord('bills', billData);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;
            result.idMap[qboBill.Id] = newId;

            // Create bill lines
            let linesCreated = 0;
            for (const line of actoBill.Lines || []) {
                if (!line.AccountId) continue; // Skip lines without mapped account

                try {
                    await mcp.createRecord('billlines', {
                        BillId: newId,
                        AccountId: line.AccountId,
                        Description: line.Description,
                        Amount: line.Amount
                    });
                    linesCreated++;
                } catch (lineError) {
                    console.error('Failed to create bill line:', lineError.message);
                }
            }

            result.migrated++;
            result.details.push({
                type: 'bill',
                qboId: qboBill.Id,
                actoId: newId,
                number: actoBill.BillNumber,
                amount: actoBill.TotalAmount,
                linesCreated,
                status: 'created'
            });
        } catch (error) {
            result.errors.push({
                type: 'bill',
                qboId: qboBill.Id,
                number: qboBill.DocNumber,
                error: error.message
            });
        }

        if (onProgress) {
            onProgress(i + 1, total);
        }
    }

    return result;
}

/**
 * Run full migration in recommended order
 */
export async function runFullMigration(qboData, mcp, onProgress = null) {
    const results = {
        accounts: null,
        customers: null,
        vendors: null,
        invoices: null,
        bills: null,
        summary: {
            totalMigrated: 0,
            totalSkipped: 0,
            totalErrors: 0
        }
    };

    const phases = [
        { name: 'accounts', data: qboData.accounts },
        { name: 'customers', data: qboData.customers },
        { name: 'vendors', data: qboData.vendors },
        { name: 'invoices', data: qboData.invoices },
        { name: 'bills', data: qboData.bills }
    ];

    let totalItems = phases.reduce((sum, p) => sum + (p.data?.length || 0), 0);
    let processedItems = 0;

    // 1. Migrate accounts first
    if (qboData.accounts?.length > 0) {
        if (onProgress) onProgress('accounts', 0, qboData.accounts.length);
        results.accounts = await migrateAccounts(qboData.accounts, mcp, (current, total) => {
            if (onProgress) onProgress('accounts', current, total);
        });
        processedItems += qboData.accounts.length;
    }

    // 2. Migrate customers
    if (qboData.customers?.length > 0) {
        if (onProgress) onProgress('customers', 0, qboData.customers.length);
        results.customers = await migrateCustomers(qboData.customers, mcp, (current, total) => {
            if (onProgress) onProgress('customers', current, total);
        });
        processedItems += qboData.customers.length;
    }

    // 3. Migrate vendors
    if (qboData.vendors?.length > 0) {
        if (onProgress) onProgress('vendors', 0, qboData.vendors.length);
        results.vendors = await migrateVendors(qboData.vendors, mcp, (current, total) => {
            if (onProgress) onProgress('vendors', current, total);
        });
        processedItems += qboData.vendors.length;
    }

    // 4. Migrate invoices (depends on customers)
    if (qboData.invoices?.length > 0 && results.customers?.idMap) {
        if (onProgress) onProgress('invoices', 0, qboData.invoices.length);
        results.invoices = await migrateInvoices(
            qboData.invoices,
            mcp,
            results.customers.idMap,
            (current, total) => {
                if (onProgress) onProgress('invoices', current, total);
            }
        );
        processedItems += qboData.invoices.length;
    }

    // 5. Migrate bills (depends on vendors and accounts)
    if (qboData.bills?.length > 0 && results.vendors?.idMap) {
        if (onProgress) onProgress('bills', 0, qboData.bills.length);
        results.bills = await migrateBills(
            qboData.bills,
            mcp,
            results.vendors.idMap,
            results.accounts?.idMap || {},
            (current, total) => {
                if (onProgress) onProgress('bills', current, total);
            }
        );
        processedItems += qboData.bills.length;
    }

    // Calculate summary
    for (const key of ['accounts', 'customers', 'vendors', 'invoices', 'bills']) {
        const r = results[key];
        if (r) {
            results.summary.totalMigrated += r.migrated;
            results.summary.totalSkipped += r.skipped;
            results.summary.totalErrors += r.errors.length;
        }
    }

    return results;
}

/**
 * Escape special characters for OData filter strings
 */
function escapeOData(str) {
    if (!str) return '';
    return str.replace(/'/g, "''");
}

export default {
    migrateCustomers,
    migrateVendors,
    migrateAccounts,
    migrateInvoices,
    migrateBills,
    runFullMigration
};
