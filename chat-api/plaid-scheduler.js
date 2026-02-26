/**
 * Plaid Scheduler
 * Handles scheduled background sync of Plaid transactions
 * Uses node-cron for scheduling
 */

import dotenv from 'dotenv';
dotenv.config();

import cron from 'node-cron';
import { plaidSync } from './plaid-sync.js';
import { plaidService } from './plaid-service.js';

class PlaidScheduler {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    /**
     * Start the scheduler with default jobs
     */
    start() {
        if (this.isRunning) {
            console.log('Plaid scheduler is already running');
            return;
        }

        // Batched daily job at 9 AM PT — runs during business hours when the
        // serverless DB is already awake, avoiding a costly off-hours resume.
        // Runs: transaction sync → balance update → connection validation sequentially.
        this.scheduleJob('daily-batch', '0 9 * * *', () => this._runDailyBatch());

        this.isRunning = true;
        console.log('[Plaid Scheduler] Started with scheduled jobs:');
        console.log('  - Daily batch (sync + balances + validation) at 9:00 AM PT');
    }

    /**
     * Schedule a cron job
     * @param {string} name - Job name
     * @param {string} schedule - Cron expression
     * @param {Function} task - Async function to run
     */
    scheduleJob(name, schedule, task) {
        if (this.jobs.has(name)) {
            this.jobs.get(name).stop();
        }

        const job = cron.schedule(schedule, task, {
            timezone: 'America/Los_Angeles',
        });

        this.jobs.set(name, job);
        console.log(`[Plaid Scheduler] Scheduled job: ${name} (${schedule})`);
    }

    /**
     * Stop the scheduler
     */
    stop() {
        for (const [name, job] of this.jobs) {
            job.stop();
            console.log(`[Plaid Scheduler] Stopped job: ${name}`);
        }
        this.jobs.clear();
        this.isRunning = false;
        console.log('[Plaid Scheduler] Stopped');
    }

    /**
     * Run the daily batch: sync → balances → validation.
     * Shared by the cron schedule and the runNow API.
     */
    async _runDailyBatch() {
        console.log('[Plaid Scheduler] Starting daily batch...');

        // 1. Transaction sync
        let syncResults = [];
        try {
            console.log('[Plaid Scheduler] Running daily sync...');
            syncResults = await plaidSync.syncAllConnections();
            const successCount = syncResults.filter(r => r.success).length;
            const errorCount = syncResults.filter(r => !r.success).length;
            console.log(`[Plaid Scheduler] Daily sync complete: ${successCount} succeeded, ${errorCount} failed`);
        } catch (error) {
            console.error('[Plaid Scheduler] Daily sync error:', error.message);
        }

        // Fetch connections once for both balances and validation
        let connections = [];
        try {
            connections = await plaidService.getActiveConnections();
        } catch (error) {
            console.error('[Plaid Scheduler] Failed to fetch connections:', error.message);
            console.log('[Plaid Scheduler] Daily batch complete (skipped balances + validation)');
            return { sync: syncResults, balances: [], validation: [] };
        }

        // 2. Balance update
        const balanceResults = [];
        try {
            console.log('[Plaid Scheduler] Updating account balances...');
            for (const conn of connections) {
                try {
                    const result = await plaidSync.updateBalances(conn.ItemId);
                    balanceResults.push({ itemId: conn.ItemId, ...result });
                } catch (error) {
                    balanceResults.push({ itemId: conn.ItemId, success: false, error: error.message });
                    console.warn(`[Plaid Scheduler] Balance update failed for ${conn.InstitutionName}:`, error.message);
                }
            }
            console.log('[Plaid Scheduler] Balance update complete');
        } catch (error) {
            console.error('[Plaid Scheduler] Balance update error:', error.message);
        }

        // 3. Connection validation
        const validationResults = [];
        try {
            console.log('[Plaid Scheduler] Validating connections...');
            let validCount = 0;
            let invalidCount = 0;

            for (const conn of connections) {
                try {
                    const result = await plaidService.validateConnection(conn.ItemId);
                    validationResults.push({ itemId: conn.ItemId, ...result });
                    if (result.valid) {
                        validCount++;
                    } else {
                        invalidCount++;
                        console.warn(`[Plaid Scheduler] Connection invalid: ${conn.InstitutionName} - ${result.error}`);
                    }
                } catch (error) {
                    validationResults.push({ itemId: conn.ItemId, valid: false, error: error.message });
                    invalidCount++;
                    console.warn(`[Plaid Scheduler] Validation failed for ${conn.InstitutionName}:`, error.message);
                }
            }

            console.log(`[Plaid Scheduler] Validation complete: ${validCount} valid, ${invalidCount} invalid`);
        } catch (error) {
            console.error('[Plaid Scheduler] Validation error:', error.message);
        }

        console.log('[Plaid Scheduler] Daily batch complete');
        return { sync: syncResults, balances: balanceResults, validation: validationResults };
    }

    /**
     * Run a specific job immediately
     * @param {string} name - Job name
     */
    async runNow(name) {
        const job = this.jobs.get(name);
        if (!job) {
            throw new Error(`Job not found: ${name}`);
        }

        console.log(`[Plaid Scheduler] Running job now: ${name}`);
        switch (name) {
            case 'daily-batch':
                return await this._runDailyBatch();
            default:
                throw new Error(`Unknown job: ${name}`);
        }
    }

    /**
     * Get status of all scheduled jobs
     */
    getStatus() {
        const status = [];
        for (const name of this.jobs.keys()) {
            status.push({
                name,
                running: this.isRunning,
            });
        }
        return {
            isRunning: this.isRunning,
            jobs: status,
        };
    }
}

// Export singleton instance
export const plaidScheduler = new PlaidScheduler();

// Auto-start scheduler if this file is run directly
if (process.argv[1].endsWith('plaid-scheduler.js')) {
    console.log('Starting Plaid Scheduler standalone...');
    plaidScheduler.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nReceived SIGINT, stopping scheduler...');
        plaidScheduler.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\nReceived SIGTERM, stopping scheduler...');
        plaidScheduler.stop();
        process.exit(0);
    });
}

export default plaidScheduler;
