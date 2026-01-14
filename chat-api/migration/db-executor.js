/**
 * Database-Driven Migration Executor
 *
 * Orchestrates migrations using DB-driven field/type mappings.
 * Self-healing: fix mapping issues via SQL without code changes.
 */

import { MigrationMapper, generateAccountCode } from './db-mapper.js';

/**
 * Migration result structure
 */
function createMigrationResult() {
    return {
        success: true,
        migrated: 0,
        skipped: 0,
        errors: [],
        details: []
    };
}

/**
 * Escape special characters for OData filter strings
 */
function escapeOData(str) {
    if (!str) return '';
    return str.replace(/'/g, "''");
}

/**
 * Generic migration function for any entity type
 */
async function migrateEntities(
    sourceEntities,
    entityType,
    tableName,
    mapper,
    mcp,
    options = {}
) {
    const result = createMigrationResult();
    const {
        duplicateField = 'Name',
        skipCheck = null,  // Function to check if record should be skipped
        preSave = null,    // Function to modify mapped data before save
        onProgress = null
    } = options;

    const total = sourceEntities.length;

    for (let i = 0; i < sourceEntities.length; i++) {
        const sourceEntity = sourceEntities[i];
        const sourceId = String(sourceEntity.Id);

        try {
            // Check if should skip (e.g., system accounts)
            if (skipCheck && skipCheck(sourceEntity)) {
                result.skipped++;
                result.details.push({
                    type: entityType.toLowerCase(),
                    sourceId,
                    status: 'skipped',
                    reason: 'Excluded by filter'
                });
                continue;
            }

            // Check if already migrated (using SourceSystem/SourceId on entity)
            const existingId = await mapper.wasAlreadyMigrated(entityType, sourceId);
            if (existingId) {
                result.skipped++;
                result.details.push({
                    type: entityType.toLowerCase(),
                    sourceId,
                    targetId: existingId,
                    status: 'skipped',
                    reason: 'Already migrated'
                });
                continue;
            }

            // Map entity using DB-driven mapper
            const mappedEntity = await mapper.mapEntity(entityType, sourceEntity);

            // Check if mapping failed (e.g., required field missing)
            if (mappedEntity._skipped) {
                result.skipped++;
                result.details.push({
                    type: entityType.toLowerCase(),
                    sourceId,
                    status: 'skipped',
                    reason: mappedEntity._reason
                });
                continue;
            }

            // Check for duplicate by name/number
            if (duplicateField && mappedEntity[duplicateField]) {
                const duplicateCheck = await mcp.readRecords(tableName, {
                    filter: `${duplicateField} eq '${escapeOData(mappedEntity[duplicateField])}'`,
                    first: 1
                });

                const existing = duplicateCheck.result?.value || [];
                if (existing.length > 0) {
                    // Record the mapping even for duplicates
                    await mapper.recordMigration(entityType, sourceId, existing[0].Id);
                    result.skipped++;
                    result.details.push({
                        type: entityType.toLowerCase(),
                        sourceId,
                        targetId: existing[0].Id,
                        name: mappedEntity[duplicateField],
                        status: 'skipped',
                        reason: 'Duplicate exists'
                    });
                    continue;
                }
            }

            // Apply pre-save modifications if needed
            if (preSave) {
                await preSave(mappedEntity, sourceEntity);
            }

            // Create the record
            const createResult = await mcp.createRecord(tableName, mappedEntity);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

            // Record the migration
            await mapper.recordMigration(entityType, sourceId, newId, sourceEntity);

            result.migrated++;
            result.details.push({
                type: entityType.toLowerCase(),
                sourceId,
                targetId: newId,
                name: mappedEntity.Name || mappedEntity.InvoiceNumber || mappedEntity.BillNumber,
                status: 'created'
            });

        } catch (error) {
            result.errors.push({
                type: entityType.toLowerCase(),
                sourceId,
                name: sourceEntity.DisplayName || sourceEntity.Name || sourceEntity.DocNumber,
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
 * Migrate customers from source system to ACTO
 */
export async function migrateCustomers(sourceCustomers, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);

    return migrateEntities(
        sourceCustomers,
        'Customer',
        'customers',
        mapper,
        mcp,
        {
            duplicateField: 'Name',
            onProgress
        }
    );
}

/**
 * Migrate vendors from source system to ACTO
 */
export async function migrateVendors(sourceVendors, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);

    return migrateEntities(
        sourceVendors,
        'Vendor',
        'vendors',
        mapper,
        mcp,
        {
            duplicateField: 'Name',
            onProgress
        }
    );
}

/**
 * Migrate accounts from source system to ACTO
 */
export async function migrateAccounts(sourceAccounts, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);

    // Get existing account codes for auto-generation
    const existingAccountsResult = await mcp.readRecords('accounts', {
        select: 'Code',
        first: 1000
    });
    const existingCodes = (existingAccountsResult.result?.value || []).map(a => a.Code);

    // Check config for skipping system accounts
    const skipSystemAccounts = (await mapper.getConfig('SkipSystemAccounts')) === 'true';

    return migrateEntities(
        sourceAccounts,
        'Account',
        'accounts',
        mapper,
        mcp,
        {
            duplicateField: 'Name',
            skipCheck: (account) => {
                // Skip system accounts if configured
                if (skipSystemAccounts &&
                    (account.AccountType === 'Accounts Receivable' ||
                     account.AccountType === 'Accounts Payable')) {
                    return true;
                }
                return false;
            },
            preSave: async (mappedAccount, sourceAccount) => {
                // Generate account code if not present
                if (!mappedAccount.Code) {
                    mappedAccount.Code = generateAccountCode(
                        mappedAccount.Type || 'Expense',
                        existingCodes
                    );
                    existingCodes.push(mappedAccount.Code);
                }
            },
            onProgress
        }
    );
}

/**
 * Migrate invoices from source system to ACTO
 */
export async function migrateInvoices(sourceInvoices, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceInvoices.length;

    for (let i = 0; i < sourceInvoices.length; i++) {
        const sourceInvoice = sourceInvoices[i];
        const sourceId = String(sourceInvoice.Id);

        try {
            // Check if already migrated
            const existingId = await mapper.wasAlreadyMigrated('Invoice', sourceId);
            if (existingId) {
                result.skipped++;
                result.details.push({
                    type: 'invoice',
                    sourceId,
                    targetId: existingId,
                    status: 'skipped',
                    reason: 'Already migrated'
                });
                continue;
            }

            // Map invoice
            const mappedInvoice = await mapper.mapEntity('Invoice', sourceInvoice);

            if (mappedInvoice._skipped) {
                result.skipped++;
                result.details.push({
                    type: 'invoice',
                    sourceId,
                    number: sourceInvoice.DocNumber,
                    status: 'skipped',
                    reason: mappedInvoice._reason
                });
                continue;
            }

            // Check for duplicate by invoice number
            if (mappedInvoice.InvoiceNumber) {
                const duplicateCheck = await mcp.readRecords('invoices', {
                    filter: `InvoiceNumber eq '${escapeOData(mappedInvoice.InvoiceNumber)}'`,
                    first: 1
                });

                if (duplicateCheck.result?.value?.length > 0) {
                    await mapper.recordMigration('Invoice', sourceId, duplicateCheck.result.value[0].Id);
                    result.skipped++;
                    result.details.push({
                        type: 'invoice',
                        sourceId,
                        targetId: duplicateCheck.result.value[0].Id,
                        number: mappedInvoice.InvoiceNumber,
                        status: 'skipped',
                        reason: 'Duplicate exists'
                    });
                    continue;
                }
            }

            // Generate invoice number if missing
            if (!mappedInvoice.InvoiceNumber) {
                mappedInvoice.InvoiceNumber = `${sourceSystem}-${sourceId}`;
            }

            // Create invoice (without lines first)
            const invoiceData = {
                InvoiceNumber: mappedInvoice.InvoiceNumber,
                CustomerId: mappedInvoice.CustomerId,
                IssueDate: mappedInvoice.IssueDate,
                DueDate: mappedInvoice.DueDate || mappedInvoice.IssueDate,
                TotalAmount: mappedInvoice.TotalAmount || 0,
                Status: mappedInvoice.Status || 'Sent',
                SourceSystem: sourceSystem,
                SourceId: sourceId
            };

            const createResult = await mcp.createRecord('invoices', invoiceData);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

            // Create invoice lines
            let linesCreated = 0;
            const lines = (sourceInvoice.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail');

            for (const line of lines) {
                try {
                    const detail = line.SalesItemLineDetail || {};
                    await mcp.createRecord('invoicelines', {
                        InvoiceId: newId,
                        Description: line.Description || detail.ItemRef?.name || 'Line Item',
                        Quantity: parseFloat(detail.Qty) || 1,
                        UnitPrice: parseFloat(detail.UnitPrice) || parseFloat(line.Amount) || 0,
                        Amount: parseFloat(line.Amount) || 0
                    });
                    linesCreated++;
                } catch (lineError) {
                    console.error('Failed to create invoice line:', lineError.message);
                }
            }

            // Record migration
            await mapper.recordMigration('Invoice', sourceId, newId, sourceInvoice);

            result.migrated++;
            result.details.push({
                type: 'invoice',
                sourceId,
                targetId: newId,
                number: mappedInvoice.InvoiceNumber,
                amount: mappedInvoice.TotalAmount,
                linesCreated,
                status: 'created'
            });

        } catch (error) {
            result.errors.push({
                type: 'invoice',
                sourceId,
                number: sourceInvoice.DocNumber,
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
 * Migrate bills from source system to ACTO
 */
export async function migrateBills(sourceBills, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceBills.length;

    for (let i = 0; i < sourceBills.length; i++) {
        const sourceBill = sourceBills[i];
        const sourceId = String(sourceBill.Id);

        try {
            // Check if already migrated
            const existingId = await mapper.wasAlreadyMigrated('Bill', sourceId);
            if (existingId) {
                result.skipped++;
                result.details.push({
                    type: 'bill',
                    sourceId,
                    targetId: existingId,
                    status: 'skipped',
                    reason: 'Already migrated'
                });
                continue;
            }

            // Map bill
            const mappedBill = await mapper.mapEntity('Bill', sourceBill);

            if (mappedBill._skipped) {
                result.skipped++;
                result.details.push({
                    type: 'bill',
                    sourceId,
                    number: sourceBill.DocNumber,
                    status: 'skipped',
                    reason: mappedBill._reason
                });
                continue;
            }

            // Check for duplicate by bill number
            if (mappedBill.BillNumber) {
                const duplicateCheck = await mcp.readRecords('bills', {
                    filter: `BillNumber eq '${escapeOData(mappedBill.BillNumber)}'`,
                    first: 1
                });

                if (duplicateCheck.result?.value?.length > 0) {
                    await mapper.recordMigration('Bill', sourceId, duplicateCheck.result.value[0].Id);
                    result.skipped++;
                    result.details.push({
                        type: 'bill',
                        sourceId,
                        targetId: duplicateCheck.result.value[0].Id,
                        number: mappedBill.BillNumber,
                        status: 'skipped',
                        reason: 'Duplicate exists'
                    });
                    continue;
                }
            }

            // Generate bill number if missing
            if (!mappedBill.BillNumber) {
                mappedBill.BillNumber = `${sourceSystem}-BILL-${sourceId}`;
            }

            // Calculate AmountPaid from Balance
            const total = parseFloat(sourceBill.TotalAmt) || 0;
            const balance = parseFloat(sourceBill.Balance) || 0;
            const amountPaid = total - balance;

            // Create bill
            const billData = {
                VendorId: mappedBill.VendorId,
                BillNumber: mappedBill.BillNumber,
                BillDate: mappedBill.BillDate,
                DueDate: mappedBill.DueDate || mappedBill.BillDate,
                TotalAmount: mappedBill.TotalAmount || 0,
                AmountPaid: amountPaid,
                Status: mappedBill.Status || 'Open',
                Memo: mappedBill.Memo,
                SourceSystem: sourceSystem,
                SourceId: sourceId
            };

            const createResult = await mcp.createRecord('bills', billData);
            if (createResult.error) {
                throw new Error(createResult.error);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

            // Create bill lines
            let linesCreated = 0;
            const lines = (sourceBill.Line || []).filter(l => l.DetailType === 'AccountBasedExpenseLineDetail');

            for (const line of lines) {
                try {
                    const detail = line.AccountBasedExpenseLineDetail || {};
                    const accountId = detail.AccountRef?.value
                        ? await mapper.lookupEntity('Account', String(detail.AccountRef.value))
                        : null;

                    if (accountId) {
                        await mcp.createRecord('billlines', {
                            BillId: newId,
                            AccountId: accountId,
                            Description: line.Description || detail.AccountRef?.name || 'Expense',
                            Amount: parseFloat(line.Amount) || 0
                        });
                        linesCreated++;
                    }
                } catch (lineError) {
                    console.error('Failed to create bill line:', lineError.message);
                }
            }

            // Record migration
            await mapper.recordMigration('Bill', sourceId, newId, sourceBill);

            result.migrated++;
            result.details.push({
                type: 'bill',
                sourceId,
                targetId: newId,
                number: mappedBill.BillNumber,
                amount: mappedBill.TotalAmount,
                linesCreated,
                status: 'created'
            });

        } catch (error) {
            result.errors.push({
                type: 'bill',
                sourceId,
                number: sourceBill.DocNumber,
                error: error.message
            });
        }

        if (onProgress) {
            onProgress(i + 1, total);
        }
    }

    return result;
}

export default {
    migrateCustomers,
    migrateVendors,
    migrateAccounts,
    migrateInvoices,
    migrateBills
};
