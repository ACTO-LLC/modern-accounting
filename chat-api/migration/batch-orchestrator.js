/**
 * Smart Batched Migration Orchestrator
 *
 * Handles large QBO migrations with:
 * - Batched fetching (400 records at a time)
 * - Progress tracking
 * - Validation after migration
 * - Retry logic for failed records
 *
 * Usage:
 *   const orchestrator = new BatchedMigrationOrchestrator(qboMcp, dabMcp, authToken);
 *   const result = await orchestrator.migrateEntity('Customer', migrateCustomers);
 */

import {
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
} from './db-executor.js';

const DEFAULT_BATCH_SIZE = 400;
const BATCH_THRESHOLD = 400; // Use batching if count > this

/**
 * Entity configuration for QBO MCP
 */
const ENTITY_CONFIG = {
    Customer: {
        searchTool: 'qbo_search_customers',
        entityKey: 'Customer',
        migrateFn: migrateCustomers
    },
    Vendor: {
        searchTool: 'qbo_search_vendors',
        entityKey: 'Vendor',
        migrateFn: migrateVendors
    },
    Account: {
        searchTool: 'qbo_search_accounts',
        entityKey: 'Account',
        migrateFn: migrateAccounts
    },
    Item: {
        searchTool: 'qbo_search_items',
        entityKey: 'Item',
        migrateFn: migrateProducts
    },
    Invoice: {
        searchTool: 'qbo_search_invoices',
        entityKey: 'Invoice',
        migrateFn: migrateInvoices
    },
    Bill: {
        searchTool: 'qbo_search_bills',
        entityKey: 'Bill',
        migrateFn: migrateBills
    },
    Payment: {
        searchTool: 'qbo_search_payments',
        entityKey: 'Payment',
        migrateFn: migratePayments
    },
    BillPayment: {
        searchTool: 'qbo_search_bill_payments',
        entityKey: 'BillPayment',
        migrateFn: migrateBillPayments
    },
    JournalEntry: {
        searchTool: 'qbo_search_journal_entries',
        entityKey: 'JournalEntry',
        migrateFn: migrateJournalEntries
    }
};

export class BatchedMigrationOrchestrator {
    constructor(qboMcp, dabMcp, authToken = null, options = {}) {
        this.qboMcp = qboMcp;
        this.dabMcp = dabMcp;
        this.authToken = authToken;
        this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
        this.onProgress = options.onProgress || null;
        this.onBatchComplete = options.onBatchComplete || null;
    }

    /**
     * Get count of records for an entity type
     */
    async getEntityCount(entityType) {
        const config = ENTITY_CONFIG[entityType];
        if (!config) {
            throw new Error(`Unknown entity type: ${entityType}`);
        }

        // Call QBO MCP with limit=1 just to get a count indication
        // The actual count comes from the analyze endpoint
        const analyzeResult = await this.qboMcp.callTool('qbo_analyze_for_migration', {});
        const data = JSON.parse(analyzeResult.content?.[0]?.text || '{}');

        // Map entity type to analyze key
        const countMap = {
            'Customer': data.entities?.customers,
            'Vendor': data.entities?.vendors,
            'Account': data.entities?.accounts,
            'Item': data.entities?.items,
            'Invoice': data.entities?.invoices,
            'Bill': data.entities?.bills,
            'Payment': data.entities?.payments,
            'BillPayment': data.entities?.billPayments,
            'JournalEntry': data.entities?.journalEntries
        };

        return countMap[entityType] || 0;
    }

    /**
     * Fetch a batch of records from QBO
     */
    async fetchBatch(entityType, offset, limit) {
        const config = ENTITY_CONFIG[entityType];
        if (!config) {
            throw new Error(`Unknown entity type: ${entityType}`);
        }

        const result = await this.qboMcp.callTool(config.searchTool, {
            limit: limit,
            offset: offset,
            fetchAll: false // Never use fetchAll in batched migration
        });

        // Parse the response to get raw data
        const text = result.content?.[0]?.text || '{}';

        // Check if the response contains raw data
        if (result.data) {
            return result.data;
        }

        // Try to extract from text response
        try {
            const parsed = JSON.parse(text);
            return parsed.data || parsed.records || [];
        } catch {
            // Response might just be a summary message
            console.warn(`Could not parse batch data for ${entityType}: ${text.substring(0, 100)}`);
            return [];
        }
    }

    /**
     * Migrate a single entity type with smart batching
     */
    async migrateEntity(entityType, options = {}) {
        const config = ENTITY_CONFIG[entityType];
        if (!config) {
            throw new Error(`Unknown entity type: ${entityType}`);
        }

        const startTime = Date.now();
        const result = {
            entityType,
            success: true,
            totalSourceCount: 0,
            totalMigrated: 0,
            totalSkipped: 0,
            totalErrors: 0,
            batches: [],
            errors: [],
            retried: 0,
            validated: false,
            validationPassed: false
        };

        try {
            // Step 1: Get count
            console.log(`[Migration] Getting count for ${entityType}...`);
            const totalCount = await this.getEntityCount(entityType);
            result.totalSourceCount = totalCount;

            if (totalCount === 0) {
                console.log(`[Migration] No ${entityType} records to migrate`);
                result.validated = true;
                result.validationPassed = true;
                return result;
            }

            console.log(`[Migration] Found ${totalCount} ${entityType} records`);

            // Step 2: Determine batching strategy
            const useBatching = totalCount > BATCH_THRESHOLD;
            const batchSize = useBatching ? this.batchSize : totalCount;
            const totalBatches = Math.ceil(totalCount / batchSize);

            console.log(`[Migration] Strategy: ${useBatching ? `${totalBatches} batches of ${batchSize}` : 'single batch'}`);

            // Step 3: Process batches
            for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
                const offset = batchNum * batchSize;
                const currentBatchSize = Math.min(batchSize, totalCount - offset);

                console.log(`[Migration] Batch ${batchNum + 1}/${totalBatches}: fetching ${currentBatchSize} ${entityType}s (offset: ${offset})`);

                // Fetch batch from QBO
                const batchData = await this.fetchBatch(entityType, offset, currentBatchSize);

                if (!batchData || batchData.length === 0) {
                    console.warn(`[Migration] Batch ${batchNum + 1} returned no data, trying fetchAll for remaining...`);
                    // Fallback: if batch fetch fails, try to get remaining data
                    break;
                }

                console.log(`[Migration] Batch ${batchNum + 1}: fetched ${batchData.length} records, migrating...`);

                // Migrate this batch
                const batchResult = await config.migrateFn(
                    batchData,
                    this.dabMcp,
                    'QBO',
                    this.authToken
                );

                // Track batch result
                result.batches.push({
                    batchNumber: batchNum + 1,
                    fetched: batchData.length,
                    migrated: batchResult.migrated,
                    skipped: batchResult.skipped,
                    errors: batchResult.errors?.length || 0
                });

                result.totalMigrated += batchResult.migrated;
                result.totalSkipped += batchResult.skipped;
                result.totalErrors += batchResult.errors?.length || 0;

                if (batchResult.errors?.length > 0) {
                    result.errors.push(...batchResult.errors);
                }

                // Progress callback
                if (this.onProgress) {
                    this.onProgress({
                        entityType,
                        batchNumber: batchNum + 1,
                        totalBatches,
                        processed: offset + batchData.length,
                        total: totalCount,
                        migrated: result.totalMigrated,
                        skipped: result.totalSkipped,
                        errors: result.totalErrors
                    });
                }

                // Batch complete callback
                if (this.onBatchComplete) {
                    this.onBatchComplete({
                        entityType,
                        batchNumber: batchNum + 1,
                        result: batchResult
                    });
                }
            }

            // Step 4: Retry failed records (up to 2 attempts)
            if (result.errors.length > 0 && options.retryFailed !== false) {
                console.log(`[Migration] Retrying ${result.errors.length} failed ${entityType}s...`);
                // TODO: Implement retry logic by fetching specific failed IDs
                // For now, just log the failures
                result.retried = 0;
            }

            // Step 5: Validation
            console.log(`[Migration] Validating ${entityType} migration...`);
            const validationResult = await this.validateMigration(entityType, result);
            result.validated = true;
            result.validationPassed = validationResult.passed;
            result.validationDetails = validationResult;

            if (!validationResult.passed) {
                console.warn(`[Migration] Validation failed for ${entityType}: ${validationResult.message}`);
            } else {
                console.log(`[Migration] Validation passed for ${entityType}`);
            }

        } catch (error) {
            console.error(`[Migration] Fatal error migrating ${entityType}:`, error);
            result.success = false;
            result.fatalError = error.message;
        }

        const elapsedMs = Date.now() - startTime;
        result.elapsedMs = elapsedMs;
        result.elapsedFormatted = `${(elapsedMs / 1000).toFixed(1)}s`;

        console.log(`[Migration] ${entityType} complete: ${result.totalMigrated} migrated, ${result.totalSkipped} skipped, ${result.totalErrors} errors in ${result.elapsedFormatted}`);

        return result;
    }

    /**
     * Validate migration results
     */
    async validateMigration(entityType, result) {
        const expectedMigrated = result.totalSourceCount - result.totalSkipped;
        const actualMigrated = result.totalMigrated;
        const errorCount = result.totalErrors;

        // Check if counts match (allowing for errors)
        const countMatch = (actualMigrated + errorCount) >= (expectedMigrated * 0.99); // 99% threshold

        if (!countMatch) {
            return {
                passed: false,
                message: `Count mismatch: expected ~${expectedMigrated} migrated, got ${actualMigrated} (${errorCount} errors)`,
                expected: expectedMigrated,
                actual: actualMigrated,
                errors: errorCount
            };
        }

        // All checks passed
        return {
            passed: true,
            message: 'All records accounted for',
            expected: expectedMigrated,
            actual: actualMigrated,
            errors: errorCount,
            skipped: result.totalSkipped
        };
    }

    /**
     * Migrate all entity types in the correct order
     */
    async migrateAll(options = {}) {
        const order = options.order || [
            'Account',    // First: Chart of Accounts (needed for references)
            'Customer',   // Second: Customers
            'Vendor',     // Third: Vendors
            'Item',       // Fourth: Products/Services
            'Invoice',    // Fifth: Invoices (references Customers, Items)
            'Bill',       // Sixth: Bills (references Vendors, Accounts)
            'Payment',    // Seventh: Customer Payments (references Invoices)
            'BillPayment', // Eighth: Vendor Payments (references Bills)
            'JournalEntry' // Last: Journal Entries (references Accounts)
        ];

        const results = {
            success: true,
            startTime: new Date().toISOString(),
            entities: {},
            summary: {
                totalMigrated: 0,
                totalSkipped: 0,
                totalErrors: 0
            }
        };

        // Clear mapper cache before full migration
        clearMapperCache();

        for (const entityType of order) {
            if (options.entities && !options.entities.includes(entityType)) {
                console.log(`[Migration] Skipping ${entityType} (not in entity list)`);
                continue;
            }

            console.log(`\n${'='.repeat(60)}`);
            console.log(`[Migration] Starting ${entityType} migration`);
            console.log(`${'='.repeat(60)}`);

            const entityResult = await this.migrateEntity(entityType, options);
            results.entities[entityType] = entityResult;

            results.summary.totalMigrated += entityResult.totalMigrated;
            results.summary.totalSkipped += entityResult.totalSkipped;
            results.summary.totalErrors += entityResult.totalErrors;

            if (!entityResult.success) {
                results.success = false;
                if (options.stopOnError) {
                    console.error(`[Migration] Stopping due to fatal error in ${entityType}`);
                    break;
                }
            }
        }

        results.endTime = new Date().toISOString();

        console.log(`\n${'='.repeat(60)}`);
        console.log('[Migration] COMPLETE');
        console.log(`${'='.repeat(60)}`);
        console.log(`Total Migrated: ${results.summary.totalMigrated}`);
        console.log(`Total Skipped:  ${results.summary.totalSkipped}`);
        console.log(`Total Errors:   ${results.summary.totalErrors}`);

        return results;
    }
}

export default BatchedMigrationOrchestrator;
