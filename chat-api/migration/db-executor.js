/**
 * Database-Driven Migration Executor
 *
 * Orchestrates migrations using DB-driven field/type mappings.
 * Self-healing: fix mapping issues via SQL without code changes.
 *
 * Performance Optimizations (Issue #111):
 * - Batch duplicate checking (single query for all records)
 * - Shared MigrationMapper instance across entity types
 * - Parallel line item creation with controlled concurrency
 * - Preloaded entity lookups for cross-entity references
 */

import { MigrationMapper, generateAccountCode } from './db-mapper.js';
import { randomUUID } from 'crypto';

/**
 * Shared mapper cache - reuse mapper across migration phases
 * to preserve entity lookup caches
 */
const mapperCache = new Map();

/**
 * Get or create a shared MigrationMapper instance.
 * Reusing mappers preserves caches across entity types in a migration.
 */
function getSharedMapper(mcp, sourceSystem = 'QBO') {
    const cacheKey = `${sourceSystem}`;
    if (!mapperCache.has(cacheKey)) {
        mapperCache.set(cacheKey, new MigrationMapper(mcp, sourceSystem));
    }
    return mapperCache.get(cacheKey);
}

/**
 * Clear mapper cache (call between full migrations)
 */
export function clearMapperCache() {
    for (const mapper of mapperCache.values()) {
        mapper.clearCache();
    }
    mapperCache.clear();
}

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
 * Generic migration function for any entity type.
 * Performance optimized with batch duplicate checking.
 */
async function migrateEntities(
    sourceEntities,
    entityType,
    tableName,
    mapper,
    mcp,
    options = {},
    authToken = null
) {
    const result = createMigrationResult();
    const {
        duplicateField = 'Name',
        getFieldValue = null, // Function to extract field value for duplicate check
        skipCheck = null,     // Function to check if record should be skipped
        preSave = null,       // Function to modify mapped data before save
        onProgress = null
    } = options;

    const total = sourceEntities.length;

    // PERFORMANCE: Batch preload migration status for all entities
    const sourceIds = sourceEntities.map(e => String(e.Id));
    await mapper.preloadEntityLookups(entityType, sourceIds);

    // PERFORMANCE: Batch check for duplicates upfront if field is specified
    let existingDuplicates = new Map();
    if (duplicateField) {
        // Extract all potential duplicate field values
        const fieldValues = [];
        for (const entity of sourceEntities) {
            // Get value from source entity (before mapping)
            let value = getFieldValue
                ? getFieldValue(entity)
                : entity.DisplayName || entity.CompanyName || entity.Name || entity.DocNumber;
            if (value) {
                fieldValues.push(String(value));
            }
        }

        // Batch check for existing records (single query)
        if (fieldValues.length > 0 && mcp.batchCheckExisting) {
            existingDuplicates = await mcp.batchCheckExisting(tableName, duplicateField, fieldValues);
            console.log(`Batch duplicate check: found ${[...existingDuplicates.values()].filter(Boolean).length} existing ${entityType}s`);
        }
    }

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

            // Check if already migrated (uses preloaded cache)
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

            // Check for duplicate using preloaded batch results
            if (duplicateField && mappedEntity[duplicateField]) {
                const duplicateValue = String(mappedEntity[duplicateField]);
                const existingRecordId = existingDuplicates.get(duplicateValue);

                if (existingRecordId) {
                    // Record the mapping even for duplicates
                    await mapper.recordMigration(entityType, sourceId, existingRecordId);
                    result.skipped++;
                    result.details.push({
                        type: entityType.toLowerCase(),
                        sourceId,
                        targetId: existingRecordId,
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

            // Create the record (pass authToken for production auth)
            const createResult = await mcp.createRecord(tableName, mappedEntity, authToken);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            const newId = createResult.result?.Id || createResult.result?.value?.[0]?.Id;

            // Record the migration (pass authToken for production auth)
            await mapper.recordMigration(entityType, sourceId, newId, sourceEntity, authToken);

            // Add to duplicates map to prevent same-batch duplicates
            if (duplicateField && mappedEntity[duplicateField]) {
                existingDuplicates.set(String(mappedEntity[duplicateField]), newId);
            }

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
export async function migrateCustomers(sourceCustomers, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);

    return migrateEntities(
        sourceCustomers,
        'Customer',
        'customers',
        mapper,
        mcp,
        {
            duplicateField: 'Name',
            getFieldValue: (entity) => entity.DisplayName || entity.CompanyName || entity.Name
        },
        authToken
    );
}

/**
 * Migrate vendors from source system to ACTO
 */
export async function migrateVendors(sourceVendors, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);

    return migrateEntities(
        sourceVendors,
        'Vendor',
        'vendors',
        mapper,
        mcp,
        {
            duplicateField: 'Name',
            getFieldValue: (entity) => entity.DisplayName || entity.CompanyName || entity.Name
        },
        authToken
    );
}

/**
 * Migrate products/services from source system to ACTO
 */
export async function migrateProducts(sourceItems, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);

    return migrateEntities(
        sourceItems,
        'Item',
        'productsservices',
        mapper,
        mcp,
        {
            duplicateField: 'Name',
            getFieldValue: (entity) => entity.Name
        },
        authToken
    );
}

/**
 * Migrate accounts from source system to ACTO
 */
export async function migrateAccounts(sourceAccounts, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);

    // Get existing account codes for auto-generation
    const existingAccountsResult = await mcp.readRecords('accounts', {
        select: 'Code',
        first: 1000
    }, authToken);
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
            getFieldValue: (entity) => entity.Name,
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
            }
        },
        authToken
    );
}

/**
 * Migrate invoices from source system to ACTO
 * Performance optimized with batch duplicate checking and parallel line creation.
 */
export async function migrateInvoices(sourceInvoices, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceInvoices.length;

    console.log(`Starting invoice migration: ${total} invoices`);
    const startTime = Date.now();

    // PERFORMANCE: Batch preload - check which invoices are already migrated
    const invoiceSourceIds = sourceInvoices.map(inv => String(inv.Id));
    await mapper.preloadEntityLookups('Invoice', invoiceSourceIds);

    // PERFORMANCE: Batch preload - preload customer lookups for all invoices
    const customerSourceIds = [...new Set(
        sourceInvoices
            .map(inv => inv.CustomerRef?.value)
            .filter(Boolean)
            .map(String)
    )];
    if (customerSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Customer', customerSourceIds);
    }

    // PERFORMANCE: Batch check for duplicate invoice numbers
    const invoiceNumbers = sourceInvoices
        .map(inv => inv.DocNumber)
        .filter(Boolean);
    let existingInvoices = new Map();
    if (invoiceNumbers.length > 0 && mcp.batchCheckExisting) {
        existingInvoices = await mcp.batchCheckExisting('invoices', 'InvoiceNumber', invoiceNumbers);
        console.log(`Batch duplicate check: found ${[...existingInvoices.values()].filter(Boolean).length} existing invoices`);
    }

    for (let i = 0; i < sourceInvoices.length; i++) {
        const sourceInvoice = sourceInvoices[i];
        const sourceId = String(sourceInvoice.Id);

        try {
            // Check if already migrated (uses preloaded cache)
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

            // PERFORMANCE: Check for duplicate using preloaded batch results
            if (mappedInvoice.InvoiceNumber) {
                const existingInvoiceId = existingInvoices.get(String(mappedInvoice.InvoiceNumber));
                if (existingInvoiceId) {
                    await mapper.recordMigration('Invoice', sourceId, existingInvoiceId, null, authToken);
                    result.skipped++;
                    result.details.push({
                        type: 'invoice',
                        sourceId,
                        targetId: existingInvoiceId,
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
            const newInvoiceId = randomUUID().toUpperCase();
            const invoiceData = {
                Id: newInvoiceId,
                InvoiceNumber: mappedInvoice.InvoiceNumber,
                CustomerId: mappedInvoice.CustomerId,
                IssueDate: mappedInvoice.IssueDate,
                DueDate: mappedInvoice.DueDate || mappedInvoice.IssueDate,
                TotalAmount: mappedInvoice.TotalAmount || 0,
                Status: mappedInvoice.Status || 'Sent',
                SourceSystem: sourceSystem,
                SourceId: sourceId
            };

            const createResult = await mcp.createRecord('invoices_write', invoiceData, authToken);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            const newId = newInvoiceId; // Use the ID we generated

            // Add to duplicates map to prevent same-batch duplicates
            existingInvoices.set(String(mappedInvoice.InvoiceNumber), newId);

            // Create invoice lines (in parallel for speed)
            const lines = (sourceInvoice.Line || []).filter(l => l.DetailType === 'SalesItemLineDetail');

            const linePromises = lines.map(async (line) => {
                try {
                    const detail = line.SalesItemLineDetail || {};
                    await mcp.createRecord('invoicelines', {
                        InvoiceId: newId,
                        Description: line.Description || detail.ItemRef?.name || 'Line Item',
                        Quantity: parseFloat(detail.Qty) || 1,
                        UnitPrice: parseFloat(detail.UnitPrice) || parseFloat(line.Amount) || 0
                        // Amount is a computed column (Quantity * UnitPrice)
                    }, authToken);
                    return true;
                } catch (lineError) {
                    console.error('Failed to create invoice line:', lineError.message);
                    return false;
                }
            });

            const lineResults = await Promise.all(linePromises);
            const linesCreated = lineResults.filter(Boolean).length;

            // Record migration
            await mapper.recordMigration('Invoice', sourceId, newId, sourceInvoice, authToken);

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

    const elapsedMs = Date.now() - startTime;
    const perInvoiceMs = total > 0 ? elapsedMs / total : 0;
    console.log(`Invoice migration complete: ${result.migrated} created, ${result.skipped} skipped, ${result.errors.length} errors`);
    console.log(`Total time: ${(elapsedMs / 1000).toFixed(1)}s, Per invoice: ${perInvoiceMs.toFixed(0)}ms`);

    return result;
}

/**
 * Migrate bills from source system to ACTO
 * Performance optimized with batch duplicate checking and parallel line creation.
 */
export async function migrateBills(sourceBills, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceBills.length;

    console.log(`Starting bill migration: ${total} bills`);
    const startTime = Date.now();

    // PERFORMANCE: Batch preload - check which bills are already migrated
    const billSourceIds = sourceBills.map(bill => String(bill.Id));
    await mapper.preloadEntityLookups('Bill', billSourceIds);

    // PERFORMANCE: Batch preload - preload vendor lookups for all bills
    const vendorSourceIds = [...new Set(
        sourceBills
            .map(bill => bill.VendorRef?.value)
            .filter(Boolean)
            .map(String)
    )];
    if (vendorSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Vendor', vendorSourceIds);
    }

    // PERFORMANCE: Batch preload - preload account lookups for all bill lines
    const accountSourceIds = [...new Set(
        sourceBills
            .flatMap(bill => (bill.Line || []))
            .map(line => line.AccountBasedExpenseLineDetail?.AccountRef?.value)
            .filter(Boolean)
            .map(String)
    )];
    if (accountSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Account', accountSourceIds);
    }

    // PERFORMANCE: Batch check for duplicate bill numbers
    const billNumbers = sourceBills
        .map(bill => bill.DocNumber)
        .filter(Boolean);
    let existingBills = new Map();
    if (billNumbers.length > 0 && mcp.batchCheckExisting) {
        existingBills = await mcp.batchCheckExisting('bills', 'BillNumber', billNumbers);
        console.log(`Batch duplicate check: found ${[...existingBills.values()].filter(Boolean).length} existing bills`);
    }

    for (let i = 0; i < sourceBills.length; i++) {
        const sourceBill = sourceBills[i];
        const sourceId = String(sourceBill.Id);

        try {
            // Check if already migrated (uses preloaded cache)
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

            // PERFORMANCE: Check for duplicate using preloaded batch results
            if (mappedBill.BillNumber) {
                const existingBillId = existingBills.get(String(mappedBill.BillNumber));
                if (existingBillId) {
                    await mapper.recordMigration('Bill', sourceId, existingBillId, null, authToken);
                    result.skipped++;
                    result.details.push({
                        type: 'bill',
                        sourceId,
                        targetId: existingBillId,
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
            const totalAmt = parseFloat(sourceBill.TotalAmt) || 0;
            const balance = parseFloat(sourceBill.Balance) || 0;
            const amountPaid = totalAmt - balance;

            // Create bill
            const newBillId = randomUUID().toUpperCase();
            const billData = {
                Id: newBillId,
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

            const createResult = await mcp.createRecord('bills_write', billData, authToken);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            const newId = newBillId; // Use the ID we generated

            // Add to duplicates map to prevent same-batch duplicates
            existingBills.set(String(mappedBill.BillNumber), newId);

            // Create bill lines (in parallel for speed)
            const lines = (sourceBill.Line || []).filter(l => l.DetailType === 'AccountBasedExpenseLineDetail');

            const linePromises = lines.map(async (line) => {
                try {
                    const detail = line.AccountBasedExpenseLineDetail || {};
                    // Account lookups use preloaded cache
                    const accountId = detail.AccountRef?.value
                        ? await mapper.lookupEntity('Account', String(detail.AccountRef.value))
                        : null;

                    if (accountId) {
                        await mcp.createRecord('billlines', {
                            BillId: newId,
                            AccountId: accountId,
                            Description: line.Description || detail.AccountRef?.name || 'Expense',
                            Amount: parseFloat(line.Amount) || 0
                        }, authToken);
                        return true;
                    }
                    return false;
                } catch (lineError) {
                    console.error('Failed to create bill line:', lineError.message);
                    return false;
                }
            });

            const lineResults = await Promise.all(linePromises);
            const linesCreated = lineResults.filter(Boolean).length;

            // Record migration
            await mapper.recordMigration('Bill', sourceId, newId, sourceBill, authToken);

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

    const elapsedMs = Date.now() - startTime;
    const perBillMs = total > 0 ? elapsedMs / total : 0;
    console.log(`Bill migration complete: ${result.migrated} created, ${result.skipped} skipped, ${result.errors.length} errors`);
    console.log(`Total time: ${(elapsedMs / 1000).toFixed(1)}s, Per bill: ${perBillMs.toFixed(0)}ms`);

    return result;
}

/**
 * Migrate customer payments from source system to ACTO
 */
export async function migratePayments(sourcePayments, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourcePayments.length;

    // Batch preload: check which payments are already migrated
    const paymentSourceIds = sourcePayments.map(pmt => String(pmt.Id));
    await mapper.preloadEntityLookups('Payment', paymentSourceIds);

    // Batch preload: preload customer lookups for all payments
    const customerSourceIds = [...new Set(
        sourcePayments
            .map(pmt => pmt.CustomerRef?.value)
            .filter(Boolean)
            .map(String)
    )];
    if (customerSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Customer', customerSourceIds);
    }

    // Batch preload: preload invoice lookups for all payment applications
    const invoiceSourceIds = [...new Set(
        sourcePayments
            .flatMap(pmt => (pmt.Line || []))
            .flatMap(line => (line.LinkedTxn || []))
            .filter(lt => lt.TxnType === 'Invoice')
            .map(lt => lt.TxnId)
            .filter(Boolean)
            .map(String)
    )];
    if (invoiceSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Invoice', invoiceSourceIds);
    }

    for (let i = 0; i < sourcePayments.length; i++) {
        const sourcePayment = sourcePayments[i];
        const sourceId = String(sourcePayment.Id);

        try {
            // Check if already migrated
            const existingId = await mapper.wasAlreadyMigrated('Payment', sourceId);
            if (existingId) {
                result.skipped++;
                result.details.push({
                    type: 'payment',
                    sourceId,
                    targetId: existingId,
                    status: 'skipped',
                    reason: 'Already migrated'
                });
                continue;
            }

            // Map payment
            const mappedPayment = await mapper.mapEntity('Payment', sourcePayment);

            if (mappedPayment._skipped) {
                result.skipped++;
                result.details.push({
                    type: 'payment',
                    sourceId,
                    refNumber: sourcePayment.PaymentRefNum,
                    status: 'skipped',
                    reason: mappedPayment._reason
                });
                continue;
            }

            // Generate payment number if missing
            if (!mappedPayment.PaymentNumber) {
                mappedPayment.PaymentNumber = `${sourceSystem}-PMT-${sourceId}`;
            }

            // Create payment
            const newPaymentId = randomUUID().toUpperCase();
            const paymentData = {
                Id: newPaymentId,
                PaymentNumber: mappedPayment.PaymentNumber,
                CustomerId: mappedPayment.CustomerId,
                PaymentDate: mappedPayment.PaymentDate,
                TotalAmount: mappedPayment.TotalAmount || 0,
                PaymentMethod: mappedPayment.PaymentMethod,
                DepositAccountId: mappedPayment.DepositAccountId,
                Memo: mappedPayment.Memo,
                Status: 'Completed',
                SourceSystem: sourceSystem,
                SourceId: sourceId
            };

            const createResult = await mcp.createRecord('payments', paymentData, authToken);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            // Create payment applications (link to invoices) - in parallel for speed
            const lines = sourcePayment.Line || [];

            const appPromises = lines.map(async (line) => {
                try {
                    // Find linked invoice from the line
                    const linkedTxn = line.LinkedTxn?.find(lt => lt.TxnType === 'Invoice');
                    if (linkedTxn && linkedTxn.TxnId) {
                        const invoiceId = await mapper.lookupEntity('Invoice', String(linkedTxn.TxnId));
                        if (invoiceId) {
                            await mcp.createRecord('paymentapplications', {
                                PaymentId: newPaymentId,
                                InvoiceId: invoiceId,
                                AmountApplied: parseFloat(line.Amount) || 0
                            }, authToken);
                            return true;
                        }
                    }
                    return false;
                } catch (appError) {
                    console.error('Failed to create payment application:', appError.message);
                    return false;
                }
            });

            const appResults = await Promise.all(appPromises);
            const applicationsCreated = appResults.filter(Boolean).length;

            // Record migration
            await mapper.recordMigration('Payment', sourceId, newPaymentId, sourcePayment, authToken);

            result.migrated++;
            result.details.push({
                type: 'payment',
                sourceId,
                targetId: newPaymentId,
                refNumber: mappedPayment.PaymentNumber,
                amount: mappedPayment.TotalAmount,
                applicationsCreated,
                status: 'created'
            });

        } catch (error) {
            result.errors.push({
                type: 'payment',
                sourceId,
                refNumber: sourcePayment.PaymentRefNum,
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
 * Migrate vendor bill payments from source system to ACTO
 */
export async function migrateBillPayments(sourceBillPayments, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceBillPayments.length;

    // Batch preload: check which bill payments are already migrated
    const billPaymentSourceIds = sourceBillPayments.map(bp => String(bp.Id));
    await mapper.preloadEntityLookups('BillPayment', billPaymentSourceIds);

    // Batch preload: preload vendor lookups for all bill payments
    const vendorSourceIds = [...new Set(
        sourceBillPayments
            .map(bp => bp.VendorRef?.value)
            .filter(Boolean)
            .map(String)
    )];
    if (vendorSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Vendor', vendorSourceIds);
    }

    // Batch preload: preload bill lookups for all bill payment applications
    const billSourceIds = [...new Set(
        sourceBillPayments
            .flatMap(bp => (bp.Line || []))
            .flatMap(line => (line.LinkedTxn || []))
            .filter(lt => lt.TxnType === 'Bill')
            .map(lt => lt.TxnId)
            .filter(Boolean)
            .map(String)
    )];
    if (billSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Bill', billSourceIds);
    }

    // Batch preload: preload account lookups for payment accounts
    const accountSourceIds = [...new Set(
        sourceBillPayments
            .map(bp => {
                if (bp.PayType === 'Check') return bp.CheckPayment?.BankAccountRef?.value;
                if (bp.PayType === 'CreditCard') return bp.CreditCardPayment?.CCAccountRef?.value;
                return null;
            })
            .filter(Boolean)
            .map(String)
    )];
    if (accountSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Account', accountSourceIds);
    }

    for (let i = 0; i < sourceBillPayments.length; i++) {
        const sourceBillPayment = sourceBillPayments[i];
        const sourceId = String(sourceBillPayment.Id);

        try {
            // Check if already migrated
            const existingId = await mapper.wasAlreadyMigrated('BillPayment', sourceId);
            if (existingId) {
                result.skipped++;
                result.details.push({
                    type: 'billpayment',
                    sourceId,
                    targetId: existingId,
                    status: 'skipped',
                    reason: 'Already migrated'
                });
                continue;
            }

            // Map bill payment
            const mappedBillPayment = await mapper.mapEntity('BillPayment', sourceBillPayment);

            if (mappedBillPayment._skipped) {
                result.skipped++;
                result.details.push({
                    type: 'billpayment',
                    sourceId,
                    docNumber: sourceBillPayment.DocNumber,
                    status: 'skipped',
                    reason: mappedBillPayment._reason
                });
                continue;
            }

            // Generate payment number if missing
            if (!mappedBillPayment.PaymentNumber) {
                mappedBillPayment.PaymentNumber = `${sourceSystem}-BP-${sourceId}`;
            }

            // Determine payment account based on PayType
            let paymentAccountId = mappedBillPayment.PaymentAccountId;
            if (!paymentAccountId) {
                // Try to get from CheckPayment or CreditCardPayment
                if (sourceBillPayment.PayType === 'Check' && sourceBillPayment.CheckPayment?.BankAccountRef?.value) {
                    paymentAccountId = await mapper.lookupEntity('Account', String(sourceBillPayment.CheckPayment.BankAccountRef.value));
                } else if (sourceBillPayment.PayType === 'CreditCard' && sourceBillPayment.CreditCardPayment?.CCAccountRef?.value) {
                    paymentAccountId = await mapper.lookupEntity('Account', String(sourceBillPayment.CreditCardPayment.CCAccountRef.value));
                }
            }

            // Create bill payment
            const newBillPaymentId = randomUUID().toUpperCase();
            const billPaymentData = {
                Id: newBillPaymentId,
                PaymentNumber: mappedBillPayment.PaymentNumber,
                VendorId: mappedBillPayment.VendorId,
                PaymentDate: mappedBillPayment.PaymentDate,
                TotalAmount: mappedBillPayment.TotalAmount || 0,
                PaymentMethod: mappedBillPayment.PaymentMethod || sourceBillPayment.PayType,
                PaymentAccountId: paymentAccountId,
                Memo: mappedBillPayment.Memo,
                Status: 'Completed',
                SourceSystem: sourceSystem,
                SourceId: sourceId
            };

            const createResult = await mcp.createRecord('billpayments', billPaymentData, authToken);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            // Create bill payment applications (link to bills) - in parallel for speed
            const lines = sourceBillPayment.Line || [];

            const appPromises = lines.map(async (line) => {
                try {
                    // Find linked bill from the line
                    const linkedTxn = line.LinkedTxn?.find(lt => lt.TxnType === 'Bill');
                    if (linkedTxn && linkedTxn.TxnId) {
                        const billId = await mapper.lookupEntity('Bill', String(linkedTxn.TxnId));
                        if (billId) {
                            await mcp.createRecord('billpaymentapplications', {
                                BillPaymentId: newBillPaymentId,
                                BillId: billId,
                                AmountApplied: parseFloat(line.Amount) || 0
                            }, authToken);
                            return true;
                        }
                    }
                    return false;
                } catch (appError) {
                    console.error('Failed to create bill payment application:', appError.message);
                    return false;
                }
            });

            const appResults = await Promise.all(appPromises);
            const applicationsCreated = appResults.filter(Boolean).length;

            // Record migration
            await mapper.recordMigration('BillPayment', sourceId, newBillPaymentId, sourceBillPayment, authToken);

            result.migrated++;
            result.details.push({
                type: 'billpayment',
                sourceId,
                targetId: newBillPaymentId,
                docNumber: mappedBillPayment.PaymentNumber,
                amount: mappedBillPayment.TotalAmount,
                applicationsCreated,
                status: 'created'
            });

        } catch (error) {
            result.errors.push({
                type: 'billpayment',
                sourceId,
                docNumber: sourceBillPayment.DocNumber,
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
 * Migrate journal entries from source system to ACTO
 */
export async function migrateJournalEntries(sourceJournalEntries, mcp, sourceSystem = 'QBO', authToken = null) {
    const mapper = getSharedMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceJournalEntries.length;

    // Batch preload: check which journal entries are already migrated
    const jeSourceIds = sourceJournalEntries.map(je => String(je.Id));
    await mapper.preloadEntityLookups('JournalEntry', jeSourceIds);

    // Batch preload: preload account lookups for all journal entry lines
    const accountSourceIds = [...new Set(
        sourceJournalEntries
            .flatMap(je => (je.Line || []))
            .map(line => line.JournalEntryLineDetail?.AccountRef?.value)
            .filter(Boolean)
            .map(String)
    )];
    if (accountSourceIds.length > 0) {
        await mapper.preloadEntityLookups('Account', accountSourceIds);
    }

    // Get config for auto-posting
    const autoPost = (await mapper.getConfig('AutoPostJournalEntries')) === 'true';

    for (let i = 0; i < sourceJournalEntries.length; i++) {
        const sourceJE = sourceJournalEntries[i];
        const sourceId = String(sourceJE.Id);

        try {
            // Check if already migrated
            const existingId = await mapper.wasAlreadyMigrated('JournalEntry', sourceId);
            if (existingId) {
                result.skipped++;
                result.details.push({
                    type: 'journalentry',
                    sourceId,
                    targetId: existingId,
                    status: 'skipped',
                    reason: 'Already migrated'
                });
                continue;
            }

            // Map journal entry
            const mappedJE = await mapper.mapEntity('JournalEntry', sourceJE);

            if (mappedJE._skipped) {
                result.skipped++;
                result.details.push({
                    type: 'journalentry',
                    sourceId,
                    docNumber: sourceJE.DocNumber,
                    status: 'skipped',
                    reason: mappedJE._reason
                });
                continue;
            }

            // Generate description from lines if not present
            let description = mappedJE.Description;
            if (!description || description === 'Imported from QuickBooks') {
                // Try to build description from line descriptions
                const lineDescs = (sourceJE.Line || [])
                    .map(l => l.Description)
                    .filter(d => d)
                    .slice(0, 2);
                if (lineDescs.length > 0) {
                    description = lineDescs.join('; ');
                } else {
                    description = `Journal Entry from ${sourceSystem}`;
                }
            }

            // Create journal entry
            const newJEId = randomUUID().toUpperCase();
            const jeData = {
                Id: newJEId,
                TransactionDate: mappedJE.TransactionDate,
                Description: description,
                Reference: mappedJE.Reference || sourceJE.DocNumber || `${sourceSystem}-JE-${sourceId}`,
                Status: autoPost ? 'Posted' : 'Draft',
                CreatedBy: 'QBO Migration',
                SourceSystem: sourceSystem,
                SourceId: sourceId
            };

            const createResult = await mcp.createRecord('journalentries', jeData, authToken);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            // Create journal entry lines (in parallel for speed)
            const lines = sourceJE.Line || [];

            const linePromises = lines.map(async (line) => {
                try {
                    const detail = line.JournalEntryLineDetail || {};
                    const accountRef = detail.AccountRef?.value;
                    if (!accountRef) return null;

                    const accountId = await mapper.lookupEntity('Account', String(accountRef));
                    if (!accountId) {
                        console.warn(`Account not found for JE line: ${accountRef}`);
                        return null;
                    }

                    const postingType = detail.PostingType; // 'Debit' or 'Credit'
                    const amount = parseFloat(line.Amount) || 0;

                    const lineData = {
                        JournalEntryId: newJEId,
                        AccountId: accountId,
                        Description: line.Description || detail.AccountRef?.name,
                        Debit: postingType === 'Debit' ? amount : 0,
                        Credit: postingType === 'Credit' ? amount : 0
                    };

                    await mcp.createRecord('journalentrylines', lineData, authToken);
                    return { success: true, postingType, amount };

                } catch (lineError) {
                    console.error('Failed to create journal entry line:', lineError.message);
                    return null;
                }
            });

            const lineResults = await Promise.all(linePromises);
            const successfulLines = lineResults.filter(r => r !== null && r.success);
            const linesCreated = successfulLines.length;
            const totalDebit = successfulLines
                .filter(r => r.postingType === 'Debit')
                .reduce((sum, r) => sum + r.amount, 0);
            const totalCredit = successfulLines
                .filter(r => r.postingType === 'Credit')
                .reduce((sum, r) => sum + r.amount, 0);

            // Record migration
            await mapper.recordMigration('JournalEntry', sourceId, newJEId, sourceJE, authToken);

            result.migrated++;
            result.details.push({
                type: 'journalentry',
                sourceId,
                targetId: newJEId,
                reference: jeData.Reference,
                totalDebit,
                totalCredit,
                linesCreated,
                status: 'created'
            });

        } catch (error) {
            result.errors.push({
                type: 'journalentry',
                sourceId,
                docNumber: sourceJE.DocNumber,
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
    migrateProducts,
    migrateAccounts,
    migrateInvoices,
    migrateBills,
    migratePayments,
    migrateBillPayments,
    migrateJournalEntries,
    clearMapperCache
};
