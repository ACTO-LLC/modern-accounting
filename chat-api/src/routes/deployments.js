/**
 * Deployments API Routes
 *
 * Provides endpoints for scheduling, viewing, and managing deployments.
 */

import express from 'express';
import sql from 'mssql';
import { logAuditEvent } from '../services/audit-log.js';

const router = express.Router();

/**
 * Get database connection pool
 */
async function getPool() {
  return sql.connect(process.env.DATABASE_URL || `Server=${process.env.DB_SERVER || 'localhost,14330'};Database=${process.env.DB_NAME || 'AccountingDB'};User Id=${process.env.DB_USER || 'sa'};Password=${process.env.DB_PASSWORD || 'StrongPassword123!'};TrustServerCertificate=true`);
}

/**
 * POST /api/deployments
 * Schedule a new deployment
 */
router.post('/', async (req, res) => {
  try {
    const { enhancementId, scheduledDate } = req.body;

    if (!enhancementId || !scheduledDate) {
      return res.status(400).json({
        error: 'Missing required fields: enhancementId and scheduledDate',
      });
    }

    const pool = await getPool();
    const result = await pool
      .request()
      .input('enhancementId', sql.Int, enhancementId)
      .input('scheduledDate', sql.DateTime2, new Date(scheduledDate))
      .query(`
        INSERT INTO Deployments (EnhancementId, ScheduledDate, Status)
        OUTPUT INSERTED.*
        VALUES (@enhancementId, @scheduledDate, 'pending')
      `);

    logAuditEvent({
      action: 'Create',
      entityType: 'Deployment',
      entityId: result.recordset[0]?.Id?.toString(),
      entityDescription: `Schedule deployment for enhancement #${enhancementId}`,
      newValues: { enhancementId, scheduledDate, status: 'pending' },
      req,
      source: 'API',
    });

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error('Error scheduling deployment:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deployments/pending
 * Get all pending deployments
 */
router.get('/pending', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT
        d.*,
        e.Description,
        e.RequestorName,
        e.BranchName,
        e.PrNumber
      FROM Deployments d
      INNER JOIN Enhancements e ON d.EnhancementId = e.Id
      WHERE d.Status = 'pending'
      ORDER BY d.ScheduledDate ASC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching pending deployments:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deployments
 * Get all deployments with optional status filter
 */
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    const pool = await getPool();
    const request = pool.request();

    let query = `
      SELECT
        d.*,
        e.Description,
        e.RequestorName,
        e.BranchName,
        e.PrNumber
      FROM Deployments d
      INNER JOIN Enhancements e ON d.EnhancementId = e.Id
    `;

    if (status) {
      query += ` WHERE d.Status = @status`;
      request.input('status', sql.VarChar(50), status);
    }

    query += ` ORDER BY d.ScheduledDate DESC`;

    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching deployments:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/deployments/:id
 * Get a specific deployment by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT
          d.*,
          e.Description,
          e.RequestorName,
          e.BranchName,
          e.PrNumber
        FROM Deployments d
        INNER JOIN Enhancements e ON d.EnhancementId = e.Id
        WHERE d.Id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Deployment not found' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error fetching deployment:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/deployments/:id
 * Update a deployment (e.g., reschedule)
 */
router.patch('/:id', async (req, res) => {
  try {
    const { scheduledDate, status, notes } = req.body;

    const pool = await getPool();
    const request = pool.request().input('id', sql.Int, req.params.id);

    const setClauses = [];

    if (scheduledDate) {
      setClauses.push('ScheduledDate = @scheduledDate');
      request.input('scheduledDate', sql.DateTime2, new Date(scheduledDate));
    }

    if (status) {
      setClauses.push('Status = @status');
      request.input('status', sql.VarChar(50), status);
    }

    if (notes !== undefined) {
      setClauses.push('Notes = @notes');
      request.input('notes', sql.NVarChar(sql.MAX), notes);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await request.query(`
      UPDATE Deployments
      SET ${setClauses.join(', ')}
      OUTPUT INSERTED.*
      WHERE Id = @id AND Status = 'pending'
    `);

    if (result.recordset.length === 0) {
      return res
        .status(404)
        .json({ error: 'Deployment not found or not in pending status' });
    }

    logAuditEvent({
      action: 'Update',
      entityType: 'Deployment',
      entityId: req.params.id,
      entityDescription: `Update deployment #${req.params.id}${status ? ' (status -> ' + status + ')' : ''}`,
      newValues: { scheduledDate, status, notes },
      req,
      source: 'API',
    });

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error updating deployment:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/deployments/:id
 * Cancel a pending deployment
 */
router.delete('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .query(`
        DELETE FROM Deployments
        OUTPUT DELETED.Id
        WHERE Id = @id AND Status = 'pending'
      `);

    if (result.recordset.length === 0) {
      return res
        .status(404)
        .json({ error: 'Deployment not found or not in pending status' });
    }

    logAuditEvent({
      action: 'Delete',
      entityType: 'Deployment',
      entityId: req.params.id,
      entityDescription: `Cancel deployment #${req.params.id}`,
      req,
      source: 'API',
    });

    res.json({ success: true, deletedId: result.recordset[0].Id });
  } catch (err) {
    console.error('Error canceling deployment:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
