/**
 * Database operations tests for Monitor Agent
 *
 * Tests the database module functions for enhancement tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockRequest,
  mockPool,
  mockEnhancement,
  createMockQueryResult,
  simulateDatabaseError,
} from './setup.js';

// Import the module under test (mocks are already set up)
import * as db from '../src/db.js';

describe('Database Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.connected = true;
  });

  describe('getPendingEnhancements', () => {
    it('should return pending enhancements ordered by priority', async () => {
      const mockEnhancements = [
        { ...mockEnhancement, id: 1, priority: 10 },
        { ...mockEnhancement, id: 2, priority: 5 },
      ];

      mockRequest.query.mockResolvedValueOnce(createMockQueryResult(mockEnhancements));

      const result = await db.getPendingEnhancements();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[0].priority).toBe(10);
      expect(mockRequest.query).toHaveBeenCalled();
    });

    it('should return empty array when no pending enhancements', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await db.getPendingEnhancements();

      expect(result).toHaveLength(0);
    });

    it('should handle database connection error', async () => {
      simulateDatabaseError(new Error('Connection timeout'));

      await expect(db.getPendingEnhancements()).rejects.toThrow('Connection timeout');
    });
  });

  describe('getEnhancement', () => {
    it('should return enhancement by ID', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([mockEnhancement]));

      const result = await db.getEnhancement(1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.title).toBe('Add new feature');
      expect(mockRequest.input).toHaveBeenCalledWith('id', 'Int', 1);
    });

    it('should return null for non-existent enhancement', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await db.getEnhancement(999);

      expect(result).toBeNull();
    });

    it('should handle database error gracefully', async () => {
      simulateDatabaseError(new Error('Query failed'));

      await expect(db.getEnhancement(1)).rejects.toThrow('Query failed');
    });
  });

  describe('updateEnhancement', () => {
    it('should update enhancement status', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(1, { status: 'processing' });

      expect(mockRequest.input).toHaveBeenCalledWith('id', 'Int', 1);
      expect(mockRequest.input).toHaveBeenCalledWith('status', expect.any(String), 'processing');
    });

    it('should update multiple fields', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(1, {
        status: 'pr_created',
        branch_name: 'feature/1-test',
        pr_number: 42,
        pr_url: 'https://github.com/test/test/pull/42',
      });

      expect(mockRequest.input).toHaveBeenCalledWith('id', 'Int', 1);
      expect(mockRequest.input).toHaveBeenCalledWith('status', expect.any(String), 'pr_created');
      expect(mockRequest.input).toHaveBeenCalledWith('branch_name', expect.any(String), 'feature/1-test');
      expect(mockRequest.input).toHaveBeenCalledWith('pr_number', 'Int', 42);
    });

    it('should update error_message on failure', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(1, {
        status: 'failed',
        error_message: 'Build failed: missing dependency',
      });

      expect(mockRequest.input).toHaveBeenCalledWith('error_message', expect.any(String), 'Build failed: missing dependency');
    });

    it('should update plan_json', async () => {
      const plan = JSON.stringify({
        summary: 'Test plan',
        tasks: [{ id: 1, title: 'Task 1' }],
      });

      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(1, { plan_json: plan });

      expect(mockRequest.input).toHaveBeenCalledWith('plan_json', expect.any(String), plan);
    });

    it('should handle update error', async () => {
      simulateDatabaseError(new Error('Update failed'));

      await expect(
        db.updateEnhancement(1, { status: 'processing' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('claimEnhancement', () => {
    it('should return true when enhancement is successfully claimed', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      const result = await db.claimEnhancement(1);

      expect(result).toBe(true);
      expect(mockRequest.input).toHaveBeenCalledWith('id', 'Int', 1);
    });

    it('should return false when enhancement is already claimed', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [0]));

      const result = await db.claimEnhancement(1);

      expect(result).toBe(false);
    });

    it('should handle concurrent claim attempts (race condition)', async () => {
      // First claim succeeds
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      const firstClaim = await db.claimEnhancement(1);
      expect(firstClaim).toBe(true);

      // Second claim fails (already claimed)
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [0]));

      const secondClaim = await db.claimEnhancement(1);
      expect(secondClaim).toBe(false);
    });

    it('should handle database error during claim', async () => {
      simulateDatabaseError(new Error('Deadlock detected'));

      await expect(db.claimEnhancement(1)).rejects.toThrow('Deadlock detected');
    });
  });

  describe('createEnhancement', () => {
    it('should create enhancement and return ID', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([{ id: 5 }]));

      const result = await db.createEnhancement(
        'New Feature',
        'Description of the new feature',
        5,
        'user@example.com'
      );

      expect(result).toBe(5);
      expect(mockRequest.input).toHaveBeenCalledWith('title', expect.any(String), 'New Feature');
      expect(mockRequest.input).toHaveBeenCalledWith('description', expect.any(String), 'Description of the new feature');
      expect(mockRequest.input).toHaveBeenCalledWith('priority', 'Int', 5);
      expect(mockRequest.input).toHaveBeenCalledWith('requested_by', expect.any(String), 'user@example.com');
    });

    it('should create enhancement with default priority', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([{ id: 6 }]));

      const result = await db.createEnhancement(
        'Simple Feature',
        'Simple description'
      );

      expect(result).toBe(6);
      expect(mockRequest.input).toHaveBeenCalledWith('priority', 'Int', 5);
    });

    it('should handle creation error', async () => {
      simulateDatabaseError(new Error('Constraint violation'));

      await expect(
        db.createEnhancement('Test', 'Test description')
      ).rejects.toThrow('Constraint violation');
    });
  });

  describe('getEnhancementsByStatus', () => {
    it('should return enhancements filtered by status', async () => {
      const processingEnhancements = [
        { ...mockEnhancement, id: 1, status: 'processing' },
        { ...mockEnhancement, id: 2, status: 'processing' },
      ];

      mockRequest.query.mockResolvedValueOnce(createMockQueryResult(processingEnhancements));

      const result = await db.getEnhancementsByStatus('processing');

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('processing');
      expect(mockRequest.input).toHaveBeenCalledWith('status', expect.any(String), 'processing');
    });

    it('should return empty array for status with no enhancements', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await db.getEnhancementsByStatus('completed');

      expect(result).toHaveLength(0);
    });
  });

  describe('getProcessingCount', () => {
    it('should return count of active enhancements', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([{ count: 3 }]));

      const result = await db.getProcessingCount();

      expect(result).toBe(3);
    });

    it('should return 0 when no active enhancements', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([{ count: 0 }]));

      const result = await db.getProcessingCount();

      expect(result).toBe(0);
    });

    it('should handle missing count result', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await db.getProcessingCount();

      expect(result).toBe(0);
    });
  });

  describe('closeConnection', () => {
    it('should close the database connection', async () => {
      // Need to establish connection first by making a query
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));
      await db.getPendingEnhancements();

      await db.closeConnection();

      // Pool should have been closed
      expect(mockPool.close).toHaveBeenCalled();
    });

    it('should handle close when no connection exists', async () => {
      // Just calling close without establishing connection should not throw
      await expect(db.closeConnection()).resolves.not.toThrow();
    });
  });
});
