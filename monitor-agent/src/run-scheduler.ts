/**
 * Scheduler Entry Point
 *
 * Runs the deployment scheduler once and exits.
 * Can be scheduled via Windows Task Scheduler or cron.
 */

import 'dotenv/config';
import { runScheduler, closeSchedulerConnection } from './scheduler.js';

async function main(): Promise<void> {
  console.log('Running deployment scheduler...');
  console.log('Timestamp:', new Date().toISOString());

  try {
    const results = await runScheduler();

    console.log('\n--- Scheduler Results ---');
    console.log(`Processed: ${results.processed}`);
    console.log(`Succeeded: ${results.succeeded}`);
    console.log(`Failed: ${results.failed}`);

    await closeSchedulerConnection();
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('Scheduler error:', error);
    await closeSchedulerConnection();
    process.exit(1);
  }
}

main();
