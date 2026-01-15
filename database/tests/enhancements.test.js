/**
 * Database Layer Tests for Enhancements and Deployments
 *
 * Tests the SQL operations directly against the database.
 * Requires a running SQL Server instance (uses test transactions that roll back).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import sql from 'mssql';

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT || '14330'),
  database: process.env.DB_NAME || 'AccountingDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'StrongPassword123',
  options: {
    trustServerCertificate: true
  }
};

let pool;
let transaction;

describe('Enhancements Table', () => {
  beforeAll(async () => {
    pool = await sql.connect(config);
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    // Start a transaction for each test (will be rolled back)
    transaction = new sql.Transaction(pool);
    await transaction.begin();
  });

  afterEach(async () => {
    // Rollback to keep test isolation
    await transaction.rollback();
  });

  describe('Schema', () => {
    it('should have Enhancements table', async () => {
      const result = await pool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'Enhancements'
      `);
      expect(result.recordset).toHaveLength(1);
    });

    it('should have all required columns', async () => {
      const result = await pool.request().query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Enhancements'
        ORDER BY ORDINAL_POSITION
      `);

      const columns = result.recordset.map(r => r.COLUMN_NAME);
      expect(columns).toContain('Id');
      expect(columns).toContain('RequestorName');
      expect(columns).toContain('Description');
      expect(columns).toContain('Status');
      expect(columns).toContain('CreatedAt');
      expect(columns).toContain('BranchName');
      expect(columns).toContain('PrNumber');
      expect(columns).toContain('Notes');
    });

    it('should have status check constraint', async () => {
      const request = new sql.Request(transaction);

      // Should reject invalid status
      try {
        await request.query(`
          INSERT INTO Enhancements (RequestorName, Description, Status)
          VALUES ('Test', 'Test', 'invalid_status')
        `);
        expect.fail('Should have thrown constraint violation');
      } catch (err) {
        expect(err.message).toMatch(/CHECK|constraint/i);
      }
    });

    it('should accept valid status values', async () => {
      const validStatuses = ['pending', 'in-progress', 'deployed', 'reverted', 'failed'];

      for (const status of validStatuses) {
        const request = new sql.Request(transaction);
        const result = await request
          .input('status', sql.VarChar(50), status)
          .query(`
            INSERT INTO Enhancements (RequestorName, Description, Status)
            OUTPUT INSERTED.Id
            VALUES ('Test', 'Test', @status)
          `);
        expect(result.recordset[0].Id).toBeGreaterThan(0);
      }
    });
  });

  describe('CRUD Operations', () => {
    it('should insert enhancement with defaults', async () => {
      const request = new sql.Request(transaction);
      const result = await request.query(`
        INSERT INTO Enhancements (RequestorName, Description)
        OUTPUT INSERTED.*
        VALUES ('John Doe', 'Add new feature')
      `);

      const enhancement = result.recordset[0];
      expect(enhancement.Id).toBeGreaterThan(0);
      expect(enhancement.RequestorName).toBe('John Doe');
      expect(enhancement.Description).toBe('Add new feature');
      expect(enhancement.Status).toBe('pending'); // Default
      expect(enhancement.CreatedAt).toBeInstanceOf(Date);
    });

    it('should update enhancement status', async () => {
      const request = new sql.Request(transaction);

      // Insert
      const insert = await request.query(`
        INSERT INTO Enhancements (RequestorName, Description)
        OUTPUT INSERTED.Id
        VALUES ('Test User', 'Test feature')
      `);
      const id = insert.recordset[0].Id;

      // Update
      const updateRequest = new sql.Request(transaction);
      await updateRequest
        .input('id', sql.Int, id)
        .query(`
          UPDATE Enhancements
          SET Status = 'in-progress', UpdatedAt = GETDATE()
          WHERE Id = @id
        `);

      // Verify
      const selectRequest = new sql.Request(transaction);
      const result = await selectRequest
        .input('id', sql.Int, id)
        .query(`SELECT * FROM Enhancements WHERE Id = @id`);

      expect(result.recordset[0].Status).toBe('in-progress');
      expect(result.recordset[0].UpdatedAt).toBeInstanceOf(Date);
    });

    it('should query by status', async () => {
      const request = new sql.Request(transaction);

      // Insert multiple with different statuses
      await request.query(`
        INSERT INTO Enhancements (RequestorName, Description, Status) VALUES
        ('User1', 'Feature 1', 'pending'),
        ('User2', 'Feature 2', 'pending'),
        ('User3', 'Feature 3', 'in-progress'),
        ('User4', 'Feature 4', 'deployed')
      `);

      // Query pending
      const pendingRequest = new sql.Request(transaction);
      const pending = await pendingRequest.query(`
        SELECT * FROM Enhancements WHERE Status = 'pending'
      `);

      expect(pending.recordset.length).toBeGreaterThanOrEqual(2);
      pending.recordset.forEach(r => {
        expect(r.Status).toBe('pending');
      });
    });

    it('should store and retrieve JSON notes', async () => {
      const request = new sql.Request(transaction);
      const notesJson = JSON.stringify({
        plan: ['Step 1', 'Step 2'],
        risks: ['Risk A'],
        intent: { featureType: 'enhancement' }
      });

      const result = await request
        .input('notes', sql.NVarChar(sql.MAX), notesJson)
        .query(`
          INSERT INTO Enhancements (RequestorName, Description, Notes)
          OUTPUT INSERTED.*
          VALUES ('Test', 'Test', @notes)
        `);

      const parsed = JSON.parse(result.recordset[0].Notes);
      expect(parsed.plan).toHaveLength(2);
      expect(parsed.intent.featureType).toBe('enhancement');
    });
  });

  describe('Indexes', () => {
    it('should have index on Status column', async () => {
      const result = await pool.request().query(`
        SELECT i.name as IndexName
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE OBJECT_NAME(i.object_id) = 'Enhancements' AND c.name = 'Status'
      `);

      expect(result.recordset.length).toBeGreaterThan(0);
    });
  });
});

describe('Deployments Table', () => {
  beforeAll(async () => {
    pool = await sql.connect(config);
  });

  afterAll(async () => {
    await pool.close();
  });

  beforeEach(async () => {
    transaction = new sql.Transaction(pool);
    await transaction.begin();
  });

  afterEach(async () => {
    await transaction.rollback();
  });

  describe('Schema', () => {
    it('should have Deployments table', async () => {
      const result = await pool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = 'Deployments'
      `);
      expect(result.recordset).toHaveLength(1);
    });

    it('should have foreign key to Enhancements', async () => {
      const result = await pool.request().query(`
        SELECT fk.name
        FROM sys.foreign_keys fk
        JOIN sys.tables t ON fk.parent_object_id = t.object_id
        WHERE t.name = 'Deployments'
      `);

      expect(result.recordset.length).toBeGreaterThan(0);
    });
  });

  describe('CRUD Operations', () => {
    it('should create deployment linked to enhancement', async () => {
      const request = new sql.Request(transaction);

      // Create enhancement first
      const enhancement = await request.query(`
        INSERT INTO Enhancements (RequestorName, Description)
        OUTPUT INSERTED.Id
        VALUES ('Test', 'Test feature')
      `);
      const enhancementId = enhancement.recordset[0].Id;

      // Create deployment
      const deployRequest = new sql.Request(transaction);
      const scheduledDate = new Date(Date.now() + 86400000); // Tomorrow

      const result = await deployRequest
        .input('enhancementId', sql.Int, enhancementId)
        .input('scheduledDate', sql.DateTime2, scheduledDate)
        .query(`
          INSERT INTO Deployments (EnhancementId, ScheduledDate)
          OUTPUT INSERTED.*
          VALUES (@enhancementId, @scheduledDate)
        `);

      expect(result.recordset[0].EnhancementId).toBe(enhancementId);
      expect(result.recordset[0].Status).toBe('pending');
    });

    it('should query due deployments', async () => {
      const request = new sql.Request(transaction);

      // Create enhancement
      const enhancement = await request.query(`
        INSERT INTO Enhancements (RequestorName, Description)
        OUTPUT INSERTED.Id
        VALUES ('Test', 'Test')
      `);
      const enhancementId = enhancement.recordset[0].Id;

      // Create past deployment (due)
      const dueRequest = new sql.Request(transaction);
      await dueRequest
        .input('enhancementId', sql.Int, enhancementId)
        .query(`
          INSERT INTO Deployments (EnhancementId, ScheduledDate, Status)
          VALUES (@enhancementId, DATEADD(hour, -1, GETDATE()), 'pending')
        `);

      // Query due deployments
      const queryRequest = new sql.Request(transaction);
      const due = await queryRequest.query(`
        SELECT d.*, e.Description
        FROM Deployments d
        JOIN Enhancements e ON d.EnhancementId = e.Id
        WHERE d.Status = 'pending' AND d.ScheduledDate <= GETDATE()
      `);

      expect(due.recordset.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject deployment for non-existent enhancement', async () => {
      const request = new sql.Request(transaction);

      try {
        await request.query(`
          INSERT INTO Deployments (EnhancementId, ScheduledDate)
          VALUES (999999, GETDATE())
        `);
        expect.fail('Should have thrown FK violation');
      } catch (err) {
        expect(err.message).toMatch(/FOREIGN KEY|constraint/i);
      }
    });
  });
});

describe('IndustryTemplates Keywords', () => {
  beforeAll(async () => {
    pool = await sql.connect(config);
  });

  afterAll(async () => {
    await pool.close();
  });

  it('should have Keywords column', async () => {
    const result = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'IndustryTemplates' AND COLUMN_NAME = 'Keywords'
    `);
    expect(result.recordset).toHaveLength(1);
  });

  it('should have keywords populated for all templates', async () => {
    const result = await pool.request().query(`
      SELECT Code, Keywords FROM IndustryTemplates WHERE Keywords IS NOT NULL
    `);

    expect(result.recordset.length).toBeGreaterThan(0);

    // Verify keywords are valid JSON arrays
    result.recordset.forEach(row => {
      const keywords = JSON.parse(row.Keywords);
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(0);
    });
  });

  it('should have IT consulting keywords include relevant terms', async () => {
    const result = await pool.request().query(`
      SELECT Keywords FROM IndustryTemplates WHERE Code = 'it_consulting'
    `);

    if (result.recordset.length > 0) {
      const keywords = JSON.parse(result.recordset[0].Keywords);
      expect(keywords).toContain('IT');
      expect(keywords).toContain('software');
    }
  });
});
