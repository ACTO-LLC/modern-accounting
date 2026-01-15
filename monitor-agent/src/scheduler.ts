/**
 * Deployment Scheduler module for Monitor Agent
 *
 * Checks for pending deployments and executes them on schedule.
 */

import sql from 'mssql';
import { config } from './config.js';
import { sendDeploymentNotification } from './notifications.js';
import { mergePullRequest, getPRStatus } from './github.js';

/**
 * Scheduled deployment record from database
 */
export interface ScheduledDeployment {
  Id: number;
  EnhancementId: number;
  ScheduledDate: Date;
  Status: string;
  Notes: string | null;
  // Joined from Enhancements
  BranchName: string;
  PrNumber: number;
  Description: string;
  RequestorName: string;
}

// Connection pool
let pool: sql.ConnectionPool | null = null;

/**
 * Get database connection pool
 */
async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const sqlConfig: sql.config = {
    server: config.db.server,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    options: {
      trustServerCertificate: config.db.trustServerCertificate,
      encrypt: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };

  pool = await sql.connect(sqlConfig);
  console.log('Scheduler database connection established');
  return pool;
}

/**
 * Get deployments that are due (scheduled date <= now and status = pending)
 */
export async function getDueDeployments(): Promise<ScheduledDeployment[]> {
  const db = await getPool();

  const result = await db.request().query(`
    SELECT
      d.Id, d.EnhancementId, d.ScheduledDate, d.Status, d.Notes,
      e.BranchName, e.PrNumber, e.Description, e.RequestorName
    FROM Deployments d
    INNER JOIN Enhancements e ON d.EnhancementId = e.Id
    WHERE d.Status = 'pending'
      AND d.ScheduledDate <= GETDATE()
    ORDER BY d.ScheduledDate ASC
  `);

  return result.recordset;
}

/**
 * Update deployment status
 */
export async function updateDeploymentStatus(
  id: number,
  status: string,
  notes?: string
): Promise<void> {
  const db = await getPool();

  await db
    .request()
    .input('id', sql.Int, id)
    .input('status', sql.VarChar(50), status)
    .input('notes', sql.NVarChar(sql.MAX), notes || null)
    .input('deployedAt', sql.DateTime2, status === 'deployed' ? new Date() : null)
    .query(`
      UPDATE Deployments
      SET Status = @status,
          Notes = COALESCE(@notes, Notes),
          DeployedAt = COALESCE(@deployedAt, DeployedAt)
      WHERE Id = @id
    `);
}

/**
 * Process a single scheduled deployment
 */
export async function processDeployment(
  deployment: ScheduledDeployment
): Promise<boolean> {
  console.log(
    `Processing deployment #${deployment.Id} for enhancement #${deployment.EnhancementId}`
  );

  try {
    // Mark as in-progress
    await updateDeploymentStatus(deployment.Id, 'in-progress');

    // Check PR is still mergeable
    if (!deployment.PrNumber) {
      throw new Error('No PR number associated with this enhancement');
    }

    const prStatus = await getPRStatus(deployment.PrNumber);

    if (prStatus.state === 'closed') {
      // PR already merged or closed
      console.log(`PR #${deployment.PrNumber} is already closed`);
      await updateDeploymentStatus(deployment.Id, 'deployed', 'PR was already merged');
      return true;
    }

    if (!prStatus.mergeable) {
      throw new Error(`PR #${deployment.PrNumber} has merge conflicts`);
    }

    // Check all CI checks passed
    const failedChecks = prStatus.checks.filter((c) => c.conclusion === 'failure');
    if (failedChecks.length > 0) {
      throw new Error(
        `PR has failed checks: ${failedChecks.map((c) => c.name).join(', ')}`
      );
    }

    // Merge the PR
    console.log(`Merging PR #${deployment.PrNumber}...`);
    const merged = await mergePullRequest(deployment.PrNumber);

    if (!merged) {
      throw new Error(`Failed to merge PR #${deployment.PrNumber}`);
    }

    // Mark as deployed
    await updateDeploymentStatus(
      deployment.Id,
      'deployed',
      `Merged PR #${deployment.PrNumber}`
    );

    // Send notification
    await sendDeploymentNotification({
      enhancementId: deployment.EnhancementId,
      description: deployment.Description,
      requestorName: deployment.RequestorName,
      status: 'deployed',
      prNumber: deployment.PrNumber,
    });

    console.log(`Deployment #${deployment.Id} completed successfully`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Deployment #${deployment.Id} failed:`, errorMessage);

    await updateDeploymentStatus(deployment.Id, 'failed', errorMessage);

    // Send failure notification
    await sendDeploymentNotification({
      enhancementId: deployment.EnhancementId,
      description: deployment.Description,
      requestorName: deployment.RequestorName,
      status: 'failed',
      error: errorMessage,
    });

    return false;
  }
}

/**
 * Run the scheduler - check for and process due deployments
 */
export async function runScheduler(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const dueDeployments = await getDueDeployments();

  console.log(`Found ${dueDeployments.length} deployments due for processing`);

  let succeeded = 0;
  let failed = 0;

  for (const deployment of dueDeployments) {
    const success = await processDeployment(deployment);
    if (success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    processed: dueDeployments.length,
    succeeded,
    failed,
  };
}

/**
 * Close the database connection
 */
export async function closeSchedulerConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Scheduler database connection closed');
  }
}

export default {
  getDueDeployments,
  updateDeploymentStatus,
  processDeployment,
  runScheduler,
  closeSchedulerConnection,
};
