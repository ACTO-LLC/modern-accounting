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

        // Batched daily job at 9 AM PST — runs during business hours when the
        // serverless DB is already awake, avoiding a costly off-hours resume.
        // Runs: transaction sync → balance update → connection validation sequentially.
        this.scheduleJob('daily-batch', '0 9 * * *', async () => {
            console.log('[Plaid Scheduler] Starting daily batch...');

            // 1. Transaction sync
            try {
                console.log('[Plaid Scheduler] Running daily sync...');
                const results = await plaidSync.syncAllConnections();
                const successCount = results.filter(r => r.success).length;
                const errorCount = results.filter(r => !r.success).length;
                console.log(`[Plaid Scheduler] Daily sync complete: ${successCount} succeeded, ${errorCount} failed`);
            } catch (error) {
                console.error('[Plaid Scheduler] Daily sync error:', error.message);
            }

            // 2. Balance update
            try {
                console.log('[Plaid Scheduler] Updating account balances...');
                const connections = await plaidService.getActiveConnections();
                for (const conn of connections) {
                    try {
                        await plaidSync.updateBalances(conn.ItemId);
                    } catch (error) {
                        console.warn(`[Plaid Scheduler] Balance update failed for ${conn.InstitutionName}:`, error.message);
                    }
                }
                console.log('[Plaid Scheduler] Balance update complete');
            } catch (error) {
                console.error('[Plaid Scheduler] Balance update error:', error.message);
            }

            // 3. Connection validation
            try {
                console.log('[Plaid Scheduler] Validating connections...');
                const connections = await plaidService.getActiveConnections();
                let validCount = 0;
                let invalidCount = 0;

                for (const conn of connections) {
                    const result = await plaidService.validateConnection(conn.ItemId);
                    if (result.valid) {
                        validCount++;
                    } else {
                        invalidCount++;
                        console.warn(`[Plaid Scheduler] Connection invalid: ${conn.InstitutionName} - ${result.error}`);
                    }
                }

                console.log(`[Plaid Scheduler] Validation complete: ${validCount} valid, ${invalidCount} invalid`);
            } catch (error) {
                console.error('[Plaid Scheduler] Validation error:', error.message);
            }

            console.log('[Plaid Scheduler] Daily batch complete');
        });

        this.isRunning = true;
        console.log('[Plaid Scheduler] Started with scheduled jobs:');
        console.log('  - Daily batch (sync + balances + validation) at 9:00 AM PST');
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
     * Run a specific job immediately
     * @param {string} name - Job name
     */
    async runNow(name) {
        const job = this.jobs.get(name);
        if (!job) {
            throw new Error(`Job not found: ${name}`);
        }

        console.log(`[Plaid Scheduler] Running job now: ${name}`);
        // Trigger the task associated with the job
        // Note: node-cron doesn't expose the task directly, so we'll need to track tasks separately
        // For now, we'll handle common jobs directly
        switch (name) {
            case 'daily-batch': {
                const syncResults = await plaidSync.syncAllConnections();
                const connections = await plaidService.getActiveConnections();
                const balanceResults = [];
                for (const conn of connections) {
                    try {
                        const result = await plaidSync.updateBalances(conn.ItemId);
                        balanceResults.push({ itemId: conn.ItemId, ...result });
                    } catch (error) {
                        balanceResults.push({ itemId: conn.ItemId, success: false, error: error.message });
                    }
                }
                const validationResults = [];
                for (const conn of connections) {
                    const result = await plaidService.validateConnection(conn.ItemId);
                    validationResults.push({ itemId: conn.ItemId, ...result });
                }
                return { sync: syncResults, balances: balanceResults, validation: validationResults };
            }
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
