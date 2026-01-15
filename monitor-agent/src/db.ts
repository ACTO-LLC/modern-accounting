/**
 * Database module for Monitor Agent
 *
 * Handles database operations for enhancement tracking using mssql.
 */

import sql from 'mssql';
import { config } from './config.js';

/**
 * Enhancement status enum
 */
export type EnhancementStatus =
  | 'pending'
  | 'processing'
  | 'planning'
  | 'implementing'
  | 'reviewing'
  | 'copilot_reviewing'
  | 'pr_created'
  | 'completed'
  | 'failed';

/**
 * Enhancement record from database
 */
export interface Enhancement {
  id: number;
  title: string;
  description: string;
  status: EnhancementStatus;
  priority: number;
  requested_by: string | null;
  assigned_to: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  plan_json: string | null;
  error_message: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

/**
 * Enhancement update fields
 */
export interface EnhancementUpdate {
  status?: EnhancementStatus;
  branch_name?: string;
  pr_number?: number;
  pr_url?: string;
  plan_json?: string;
  error_message?: string;
  notes?: string;
  started_at?: Date;
  completed_at?: Date;
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
  console.log('Database connection established');
  return pool;
}

/**
 * Close database connection
 */
export async function closeConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Database connection closed');
  }
}

/**
 * Get all pending or approved enhancements ordered by priority
 * Polls for both 'pending' and 'approved' status enhancements
 */
export async function getPendingEnhancements(): Promise<Enhancement[]> {
  const db = await getPool();

  const result = await db.request().query<Enhancement>(`
    SELECT
      id, title, description, status, priority,
      requested_by, assigned_to, branch_name,
      pr_number, pr_url, plan_json, error_message, notes,
      created_at, updated_at, started_at, completed_at
    FROM Enhancements
    WHERE status IN ('pending', 'approved')
    ORDER BY priority DESC, created_at ASC
  `);

  return result.recordset;
}

/**
 * Get a single enhancement by ID
 */
export async function getEnhancement(id: number): Promise<Enhancement | null> {
  const db = await getPool();

  const result = await db
    .request()
    .input('id', sql.Int, id)
    .query<Enhancement>(`
      SELECT
        id, title, description, status, priority,
        requested_by, assigned_to, branch_name,
        pr_number, pr_url, plan_json, error_message, notes,
        created_at, updated_at, started_at, completed_at
      FROM Enhancements
      WHERE id = @id
    `);

  return result.recordset[0] || null;
}

/**
 * Update an enhancement record
 */
export async function updateEnhancement(
  id: number,
  updates: EnhancementUpdate
): Promise<void> {
  const db = await getPool();

  // Build dynamic SET clause
  const setClauses: string[] = ['updated_at = GETUTCDATE()'];
  const request = db.request().input('id', sql.Int, id);

  if (updates.status !== undefined) {
    setClauses.push('status = @status');
    request.input('status', sql.NVarChar(50), updates.status);
  }

  if (updates.branch_name !== undefined) {
    setClauses.push('branch_name = @branch_name');
    request.input('branch_name', sql.NVarChar(255), updates.branch_name);
  }

  if (updates.pr_number !== undefined) {
    setClauses.push('pr_number = @pr_number');
    request.input('pr_number', sql.Int, updates.pr_number);
  }

  if (updates.pr_url !== undefined) {
    setClauses.push('pr_url = @pr_url');
    request.input('pr_url', sql.NVarChar(500), updates.pr_url);
  }

  if (updates.plan_json !== undefined) {
    setClauses.push('plan_json = @plan_json');
    request.input('plan_json', sql.NVarChar(sql.MAX), updates.plan_json);
  }

  if (updates.error_message !== undefined) {
    setClauses.push('error_message = @error_message');
    request.input('error_message', sql.NVarChar(sql.MAX), updates.error_message);
  }

  if (updates.notes !== undefined) {
    setClauses.push('notes = @notes');
    request.input('notes', sql.NVarChar(sql.MAX), updates.notes);
  }

  if (updates.started_at !== undefined) {
    setClauses.push('started_at = @started_at');
    request.input('started_at', sql.DateTime2, updates.started_at);
  }

  if (updates.completed_at !== undefined) {
    setClauses.push('completed_at = @completed_at');
    request.input('completed_at', sql.DateTime2, updates.completed_at);
  }

  const query = `
    UPDATE Enhancements
    SET ${setClauses.join(', ')}
    WHERE id = @id
  `;

  await request.query(query);
}

/**
 * Mark enhancement as processing (claim it)
 * Returns true if successfully claimed, false if already claimed by another process
 */
export async function claimEnhancement(id: number): Promise<boolean> {
  const db = await getPool();

  const result = await db
    .request()
    .input('id', sql.Int, id)
    .query(`
      UPDATE Enhancements
      SET
        status = 'processing',
        started_at = GETUTCDATE(),
        updated_at = GETUTCDATE()
      WHERE id = @id AND status = 'pending'
    `);

  return (result.rowsAffected[0] ?? 0) > 0;
}

/**
 * Create a new enhancement record
 */
export async function createEnhancement(
  title: string,
  description: string,
  priority: number = 5,
  requestedBy: string | null = null
): Promise<number> {
  const db = await getPool();

  const result = await db
    .request()
    .input('title', sql.NVarChar(255), title)
    .input('description', sql.NVarChar(sql.MAX), description)
    .input('priority', sql.Int, priority)
    .input('requested_by', sql.NVarChar(255), requestedBy)
    .query<{ id: number }>(`
      INSERT INTO Enhancements (title, description, priority, requested_by, status, created_at, updated_at)
      OUTPUT INSERTED.id
      VALUES (@title, @description, @priority, @requested_by, 'pending', GETUTCDATE(), GETUTCDATE())
    `);

  return result.recordset[0].id;
}

/**
 * Get enhancements by status
 */
export async function getEnhancementsByStatus(
  status: EnhancementStatus
): Promise<Enhancement[]> {
  const db = await getPool();

  const result = await db
    .request()
    .input('status', sql.NVarChar(50), status)
    .query<Enhancement>(`
      SELECT
        id, title, description, status, priority,
        requested_by, assigned_to, branch_name,
        pr_number, pr_url, plan_json, error_message, notes,
        created_at, updated_at, started_at, completed_at
      FROM Enhancements
      WHERE status = @status
      ORDER BY priority DESC, created_at ASC
    `);

  return result.recordset;
}

/**
 * Get processing count (for concurrency limiting)
 */
export async function getProcessingCount(): Promise<number> {
  const db = await getPool();

  const result = await db.request().query<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM Enhancements
    WHERE status IN ('processing', 'planning', 'implementing', 'reviewing', 'copilot_reviewing')
  `);

  return result.recordset[0]?.count ?? 0;
}

export default {
  getPendingEnhancements,
  getEnhancement,
  updateEnhancement,
  claimEnhancement,
  createEnhancement,
  getEnhancementsByStatus,
  getProcessingCount,
  closeConnection,
};
