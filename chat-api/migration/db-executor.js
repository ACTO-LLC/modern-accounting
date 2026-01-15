/**
 * Database-Driven Migration Executor
 *
 * Orchestrates migrations using DB-driven field/type mappings.
 * Self-healing: fix mapping issues via SQL without code changes.
 */

import { MigrationMapper, generateAccountCode } from './db-mapper.js';
import { randomUUID } from 'crypto';

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
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
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
 * Migrate products/services from source system to ACTO
 */
export async function migrateProducts(sourceItems, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);

    return migrateEntities(
        sourceItems,
        'Item',
        'productsservices',
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

            const createResult = await mcp.createRecord('invoices_write', invoiceData);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            const newId = newInvoiceId; // Use the ID we generated

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

            const createResult = await mcp.createRecord('bills_write', billData);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            const newId = newBillId; // Use the ID we generated

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

/**
 * Migrate customer payments from source system to ACTO
 */
export async function migratePayments(sourcePayments, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourcePayments.length;

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

            const createResult = await mcp.createRecord('payments', paymentData);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            // Create payment applications (link to invoices)
            let applicationsCreated = 0;
            const lines = sourcePayment.Line || [];

            for (const line of lines) {
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
                            });
                            applicationsCreated++;
                        }
                    }
                } catch (appError) {
                    console.error('Failed to create payment application:', appError.message);
                }
            }

            // Record migration
            await mapper.recordMigration('Payment', sourceId, newPaymentId, sourcePayment);

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
export async function migrateBillPayments(sourceBillPayments, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceBillPayments.length;

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

            const createResult = await mcp.createRecord('billpayments', billPaymentData);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            // Create bill payment applications (link to bills)
            let applicationsCreated = 0;
            const lines = sourceBillPayment.Line || [];

            for (const line of lines) {
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
                            });
                            applicationsCreated++;
                        }
                    }
                } catch (appError) {
                    console.error('Failed to create bill payment application:', appError.message);
                }
            }

            // Record migration
            await mapper.recordMigration('BillPayment', sourceId, newBillPaymentId, sourceBillPayment);

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
export async function migrateJournalEntries(sourceJournalEntries, mcp, sourceSystem = 'QBO', onProgress = null) {
    const mapper = new MigrationMapper(mcp, sourceSystem);
    const result = createMigrationResult();
    const total = sourceJournalEntries.length;

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

            const createResult = await mcp.createRecord('journalentries', jeData);
            if (createResult.error) {
                const errMsg = typeof createResult.error === 'object' ? JSON.stringify(createResult.error) : createResult.error;
                throw new Error(errMsg);
            }

            // Create journal entry lines
            let linesCreated = 0;
            let totalDebit = 0;
            let totalCredit = 0;
            const lines = sourceJE.Line || [];

            for (const line of lines) {
                try {
                    const detail = line.JournalEntryLineDetail || {};
                    const accountRef = detail.AccountRef?.value;
                    if (!accountRef) continue;

                    const accountId = await mapper.lookupEntity('Account', String(accountRef));
                    if (!accountId) {
                        console.warn(`Account not found for JE line: ${accountRef}`);
                        continue;
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

                    await mcp.createRecord('journalentrylines', lineData);
                    linesCreated++;

                    if (postingType === 'Debit') totalDebit += amount;
                    if (postingType === 'Credit') totalCredit += amount;

                } catch (lineError) {
                    console.error('Failed to create journal entry line:', lineError.message);
                }
            }

            // Record migration
            await mapper.recordMigration('JournalEntry', sourceId, newJEId, sourceJE);

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
    migrateJournalEntries
};
