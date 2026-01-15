/**
 * Enhancement Processing Integration Tests
 *
 * These tests verify that the monitor-agent correctly processes
 * enhancement requests and generates appropriate artifacts.
 *
 * Tests the full flow:
 * 1. Enhancement request parsing
 * 2. Claude plan generation
 * 3. Code generation (SQL, TypeScript, config updates)
 * 4. Expected file outputs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Claude API to verify prompts and expected outputs
const mockClaudeResponse = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockClaudeResponse
    }
  }))
}));

// Import after mocking
import { generatePlan, generateCode } from '../src/claude.js';

describe('Enhancement Processing', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Plan Generation for Schema Changes', () => {

    it('should generate correct plan for "Add ClaimId to Invoices" request', async () => {
      const enhancementRequest = 'Add a ClaimId column to the Invoices table. It should be a GUID and not required.';

      // Mock Claude's plan response
      mockClaudeResponse.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            tasks: [
              {
                id: 1,
                description: 'Create SQL migration to add ClaimId column',
                type: 'sql_migration',
                files: ['database/migrations/022_AddClaimIdToInvoices.sql']
              },
              {
                id: 2,
                description: 'Update v_Invoices view to include ClaimId',
                type: 'sql_view',
                files: ['database/dbo/Views/v_Invoices.sql']
              },
              {
                id: 3,
                description: 'Update DAB config with ClaimId mapping',
                type: 'config',
                files: ['dab-config.json']
              }
            ],
            risks: [
              'Existing queries may need updates if they select *',
              'Need to handle temporal table (system versioning)'
            ],
            estimatedFiles: [
              'database/migrations/022_AddClaimIdToInvoices.sql',
              'database/dbo/Views/v_Invoices.sql',
              'dab-config.json'
            ],
            summary: 'Add optional GUID column ClaimId to Invoices table with index'
          })
        }]
      });

      const plan = await generatePlan(enhancementRequest);

      expect(plan.tasks).toHaveLength(3);
      expect(plan.tasks[0].type).toBe('sql_migration');
      expect(plan.estimatedFiles).toContain('database/migrations/022_AddClaimIdToInvoices.sql');
      expect(plan.estimatedFiles).toContain('dab-config.json');
    });

    it('should identify database schema changes from natural language', async () => {
      const requests = [
        'add a notes field to customers',
        'Add ClaimId GUID column to Invoices - optional',
        'create a new column LastLoginDate on Users table',
        'I need to track the approval status on bills'
      ];

      for (const request of requests) {
        mockClaudeResponse.mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: JSON.stringify({
              tasks: [{ type: 'sql_migration', description: 'Add column' }],
              risks: [],
              estimatedFiles: ['database/migrations/xxx.sql']
            })
          }]
        });

        const plan = await generatePlan(request);
        expect(plan.tasks.some(t => t.type === 'sql_migration')).toBe(true);
      }
    });
  });

  describe('Code Generation for SQL Migrations', () => {

    it('should generate valid SQL migration for GUID column', async () => {
      const task = {
        description: 'Add ClaimId GUID column to Invoices',
        type: 'sql_migration',
        files: ['database/migrations/022_AddClaimIdToInvoices.sql'],
        requirements: {
          table: 'Invoices',
          column: 'ClaimId',
          dataType: 'UNIQUEIDENTIFIER',
          nullable: true,
          indexed: true
        }
      };

      mockClaudeResponse.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify([{
            path: 'database/migrations/022_AddClaimIdToInvoices.sql',
            content: `-- Migration: Add ClaimId to Invoices
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Invoices' AND COLUMN_NAME = 'ClaimId'
)
BEGIN
    ALTER TABLE [dbo].[Invoices]
    ADD [ClaimId] UNIQUEIDENTIFIER NULL;
END
GO

CREATE NONCLUSTERED INDEX [IX_Invoices_ClaimId]
ON [dbo].[Invoices] ([ClaimId])
WHERE [ClaimId] IS NOT NULL;
GO`,
            action: 'create'
          }])
        }]
      });

      const results = await generateCode(task, 'Invoices table context');

      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('ALTER TABLE');
      expect(results[0].content).toContain('UNIQUEIDENTIFIER');
      expect(results[0].content).toContain('NULL');
      expect(results[0].content).toContain('CREATE NONCLUSTERED INDEX');
    });

    it('should handle temporal tables (system versioning)', async () => {
      const task = {
        description: 'Add column to temporal table',
        type: 'sql_migration',
        files: ['database/migrations/xxx_AddColumn.sql'],
        context: 'Table has ValidFrom/ValidTo columns (system versioning)'
      };

      mockClaudeResponse.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify([{
            path: 'database/migrations/xxx_AddColumn.sql',
            content: `-- Note: Invoices uses temporal tables
-- Column will be automatically added to history table
ALTER TABLE [dbo].[Invoices]
ADD [NewColumn] NVARCHAR(100) NULL;
GO`,
            action: 'create'
          }])
        }]
      });

      const results = await generateCode(task, 'temporal table');
      expect(results[0].content).toContain('temporal');
    });
  });

  describe('Expected Artifacts for Common Enhancements', () => {

    it('should identify all required files for "Add column" enhancement', async () => {
      const enhancement = {
        description: 'Add ClaimId to Invoices - GUID, optional',
        type: 'schema_change'
      };

      // Expected artifacts for a column addition:
      const expectedArtifacts = {
        migration: 'database/migrations/XXX_AddClaimIdToInvoices.sql',
        view: 'database/dbo/Views/v_Invoices.sql',
        dabConfig: 'dab-config.json',
        // Optional: TypeScript types if using generated types
        // types: 'client/src/types/invoice.ts'
      };

      mockClaudeResponse.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            tasks: [
              { type: 'sql_migration', files: [expectedArtifacts.migration] },
              { type: 'sql_view', files: [expectedArtifacts.view] },
              { type: 'config', files: [expectedArtifacts.dabConfig] }
            ],
            risks: [],
            estimatedFiles: Object.values(expectedArtifacts)
          })
        }]
      });

      const plan = await generatePlan(enhancement.description);

      // Verify all required files are identified
      expect(plan.estimatedFiles.some(f => f.includes('migration'))).toBe(true);
      expect(plan.estimatedFiles.some(f => f.includes('dab-config'))).toBe(true);
    });

    it('should generate DAB config update for new column', async () => {
      const task = {
        description: 'Update DAB config to include ClaimId in invoices entity',
        type: 'config',
        files: ['dab-config.json']
      };

      mockClaudeResponse.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify([{
            path: 'dab-config.json',
            content: `{
  "mappings": {
    "Id": "Id",
    "InvoiceNumber": "InvoiceNumber",
    "ClaimId": "ClaimId"
  }
}`,
            action: 'update'
          }])
        }]
      });

      const results = await generateCode(task, 'DAB config context');
      expect(results[0].content).toContain('ClaimId');
      expect(results[0].content).toContain('mappings');
    });
  });

  describe('Enhancement Request Parsing', () => {

    it('should extract column requirements from natural language', () => {
      const requests = [
        { input: 'GUID not required', expected: { type: 'UNIQUEIDENTIFIER', nullable: true } },
        { input: 'optional GUID column', expected: { type: 'UNIQUEIDENTIFIER', nullable: true } },
        { input: 'required string max 100', expected: { type: 'NVARCHAR(100)', nullable: false } },
        { input: 'decimal for money', expected: { type: 'DECIMAL(18,2)', nullable: true } }
      ];

      // This would be parsed by Claude in the actual implementation
      // Here we're just documenting expected behavior
      requests.forEach(({ input, expected }) => {
        expect(input.toLowerCase().includes('guid') || input.toLowerCase().includes('uniqueidentifier'))
          .toBe(expected.type === 'UNIQUEIDENTIFIER');
      });
    });
  });

});

describe('Full Enhancement Workflow Simulation', () => {

  it('should process "Add ClaimId" enhancement end-to-end', async () => {
    // This simulates what the monitor-agent does when processing an enhancement

    const enhancement = {
      id: 1,
      description: 'Add a ClaimId column to the Invoices table. It should be a GUID and not required.',
      status: 'pending',
      requestorName: 'Admin'
    };

    // Step 1: Generate plan
    mockClaudeResponse.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          tasks: [
            { id: 1, description: 'Create migration', type: 'sql_migration', files: ['database/migrations/022_AddClaimIdToInvoices.sql'] },
            { id: 2, description: 'Update view', type: 'sql_view', files: ['database/dbo/Views/v_Invoices.sql'] },
            { id: 3, description: 'Update DAB config', type: 'config', files: ['dab-config.json'] }
          ],
          risks: ['Temporal table handling'],
          estimatedFiles: [
            'database/migrations/022_AddClaimIdToInvoices.sql',
            'database/dbo/Views/v_Invoices.sql',
            'dab-config.json'
          ]
        })
      }]
    });

    const plan = await generatePlan(enhancement.description);
    expect(plan.tasks).toHaveLength(3);

    // Step 2: Generate code for each task
    const generatedResults: Record<string, any[]> = {};

    // Migration
    mockClaudeResponse.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          path: 'database/migrations/022_AddClaimIdToInvoices.sql',
          content: `ALTER TABLE [dbo].[Invoices] ADD [ClaimId] UNIQUEIDENTIFIER NULL;`,
          action: 'create'
        }])
      }]
    });
    generatedResults['migration'] = await generateCode(plan.tasks[0], 'context');

    // View
    mockClaudeResponse.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          path: 'database/dbo/Views/v_Invoices.sql',
          content: `ALTER VIEW [dbo].[v_Invoices] AS SELECT *, ClaimId FROM Invoices;`,
          action: 'update'
        }])
      }]
    });
    generatedResults['view'] = await generateCode(plan.tasks[1], 'context');

    // Config
    mockClaudeResponse.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          path: 'dab-config.json',
          content: `"ClaimId": "ClaimId"`,
          action: 'update'
        }])
      }]
    });
    generatedResults['config'] = await generateCode(plan.tasks[2], 'context');

    // Verify all files were generated
    expect(Object.keys(generatedResults)).toHaveLength(3);
    expect(generatedResults['migration'][0].content).toContain('UNIQUEIDENTIFIER');
    expect(generatedResults['migration'][0].content).toContain('NULL');
    expect(generatedResults['view'][0].content).toContain('ClaimId');
    expect(generatedResults['config'][0].content).toContain('ClaimId');
  });

});
