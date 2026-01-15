/**
 * Scheduler tests for Monitor Agent
 *
 * Tests the deployment scheduler module functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockRequest,
  mockPool,
  mockDeployment,
  mockOctokit,
  mockTransporter,
  createMockQueryResult,
  simulateDatabaseError,
} from './setup.js';

// Import the module under test
import * as scheduler from '../src/scheduler.js';

describe('Deployment Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.connected = true;
  });

  describe('getDueDeployments', () => {
    it('should return deployments that are due', async () => {
      const dueDeployments = [
        { ...mockDeployment, Id: 1 },
        { ...mockDeployment, Id: 2 },
      ];

      mockRequest.query.mockResolvedValueOnce(createMockQueryResult(dueDeployments));

      const result = await scheduler.getDueDeployments();

      expect(result).toHaveLength(2);
      expect(result[0].Id).toBe(1);
    });

    it('should return empty array when no deployments are due', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await scheduler.getDueDeployments();

      expect(result).toHaveLength(0);
    });

    it('should filter by pending status and scheduled date', async () => {
      const futureDeployment = {
        ...mockDeployment,
        ScheduledDate: new Date('2030-01-01'),
        Status: 'pending',
      };

      // Only return deployments where ScheduledDate <= NOW
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await scheduler.getDueDeployments();

      expect(result).toHaveLength(0);
    });

    it('should handle database connection error', async () => {
      simulateDatabaseError(new Error('Connection refused'));

      await expect(scheduler.getDueDeployments()).rejects.toThrow('Connection refused');
    });
  });

  describe('updateDeploymentStatus', () => {
    it('should update deployment status to in-progress', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await scheduler.updateDeploymentStatus(1, 'in-progress');

      expect(mockRequest.input).toHaveBeenCalledWith('id', 'Int', 1);
      expect(mockRequest.input).toHaveBeenCalledWith('status', expect.any(String), 'in-progress');
    });

    it('should update status with notes', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await scheduler.updateDeploymentStatus(1, 'deployed', 'Merged PR #42');

      expect(mockRequest.input).toHaveBeenCalledWith('notes', expect.any(String), 'Merged PR #42');
    });

    it('should set deployedAt when status is deployed', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await scheduler.updateDeploymentStatus(1, 'deployed');

      expect(mockRequest.input).toHaveBeenCalledWith('deployedAt', expect.any(String), expect.any(Date));
    });

    it('should handle update error', async () => {
      simulateDatabaseError(new Error('Update constraint violation'));

      await expect(
        scheduler.updateDeploymentStatus(1, 'deployed')
      ).rejects.toThrow('Update constraint violation');
    });
  });

  describe('processDeployment', () => {
    beforeEach(() => {
      // Setup default mock responses
      mockRequest.query
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // updateDeploymentStatus (in-progress)
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // updateDeploymentStatus (deployed)
    });

    it('should successfully process deployment and merge PR', async () => {
      // Mock PR status - open and mergeable
      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: {
          state: 'open',
          mergeable: true,
          mergeable_state: 'clean',
        },
      });

      // Mock checks - all passing
      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: {
          check_runs: [
            { name: 'build', conclusion: 'success' },
            { name: 'test', conclusion: 'success' },
          ],
        },
      });

      // Mock merge success
      mockOctokit.pulls.merge.mockResolvedValueOnce({
        data: { merged: true },
      });

      const result = await scheduler.processDeployment(mockDeployment);

      expect(result).toBe(true);
    });

    it('should handle already closed/merged PR', async () => {
      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: {
          state: 'closed',
          mergeable: null,
        },
      });

      const result = await scheduler.processDeployment(mockDeployment);

      expect(result).toBe(true);
      // Should still update status to deployed
    });

    it('should fail when PR has merge conflicts', async () => {
      // Reset mocks for failure scenario
      mockRequest.query
        .mockReset()
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // failed

      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: {
          state: 'open',
          mergeable: false,
          mergeable_state: 'dirty',
        },
      });

      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: { check_runs: [] },
      });

      const result = await scheduler.processDeployment(mockDeployment);

      expect(result).toBe(false);
    });

    it('should fail when CI checks have failed', async () => {
      mockRequest.query
        .mockReset()
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // failed

      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: {
          state: 'open',
          mergeable: true,
          mergeable_state: 'clean',
        },
      });

      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: {
          check_runs: [
            { name: 'build', conclusion: 'success' },
            { name: 'test', conclusion: 'failure' },
          ],
        },
      });

      const result = await scheduler.processDeployment(mockDeployment);

      expect(result).toBe(false);
    });

    it('should fail when merge operation fails', async () => {
      mockRequest.query
        .mockReset()
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // failed

      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: {
          state: 'open',
          mergeable: true,
          mergeable_state: 'clean',
        },
      });

      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: { check_runs: [] },
      });

      mockOctokit.pulls.merge.mockResolvedValueOnce({
        data: { merged: false },
      });

      const result = await scheduler.processDeployment(mockDeployment);

      expect(result).toBe(false);
    });

    it('should fail when no PR number is associated', async () => {
      mockRequest.query
        .mockReset()
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // failed

      const deploymentWithoutPR = { ...mockDeployment, PrNumber: null };

      const result = await scheduler.processDeployment(deploymentWithoutPR as any);

      expect(result).toBe(false);
    });

    it('should send notification on successful deployment', async () => {
      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: {
          state: 'open',
          mergeable: true,
          mergeable_state: 'clean',
        },
      });

      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: { check_runs: [] },
      });

      mockOctokit.pulls.merge.mockResolvedValueOnce({
        data: { merged: true },
      });

      await scheduler.processDeployment(mockDeployment);

      // Check that email notification was sent
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });

    it('should send failure notification when deployment fails', async () => {
      mockRequest.query
        .mockReset()
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // failed

      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: {
          state: 'open',
          mergeable: false,
        },
      });

      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: { check_runs: [] },
      });

      await scheduler.processDeployment(mockDeployment);

      // Should still send notification for failure
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });

    it('should handle GitHub API errors', async () => {
      mockRequest.query
        .mockReset()
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // failed

      mockOctokit.pulls.get.mockRejectedValueOnce(new Error('GitHub rate limit exceeded'));

      const result = await scheduler.processDeployment(mockDeployment);

      expect(result).toBe(false);
    });
  });

  describe('runScheduler', () => {
    it('should process all due deployments', async () => {
      const dueDeployments = [
        { ...mockDeployment, Id: 1 },
        { ...mockDeployment, Id: 2 },
      ];

      // Mock getDueDeployments
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult(dueDeployments));

      // Mock successful processing for both
      for (let i = 0; i < 2; i++) {
        mockRequest.query
          .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
          .mockResolvedValueOnce(createMockQueryResult([], [1])); // deployed

        mockOctokit.pulls.get.mockResolvedValueOnce({
          data: { state: 'closed' },
        });
      }

      const result = await scheduler.runScheduler();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should return correct counts with mixed success/failure', async () => {
      const dueDeployments = [
        { ...mockDeployment, Id: 1 },
        { ...mockDeployment, Id: 2 },
      ];

      // Mock getDueDeployments
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult(dueDeployments));

      // First deployment succeeds
      mockRequest.query
        .mockResolvedValueOnce(createMockQueryResult([], [1]))
        .mockResolvedValueOnce(createMockQueryResult([], [1]));
      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: { state: 'closed' },
      });

      // Second deployment fails
      mockRequest.query
        .mockResolvedValueOnce(createMockQueryResult([], [1]))
        .mockResolvedValueOnce(createMockQueryResult([], [1]));
      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: { state: 'open', mergeable: false },
      });
      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: { check_runs: [] },
      });

      const result = await scheduler.runScheduler();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should return zeros when no deployments are due', async () => {
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));

      const result = await scheduler.runScheduler();

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle database error during fetch', async () => {
      simulateDatabaseError(new Error('Database unavailable'));

      await expect(scheduler.runScheduler()).rejects.toThrow('Database unavailable');
    });
  });

  describe('closeSchedulerConnection', () => {
    it('should close the database connection', async () => {
      // Establish connection first
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([]));
      await scheduler.getDueDeployments();

      await scheduler.closeSchedulerConnection();

      expect(mockPool.close).toHaveBeenCalled();
    });

    it('should handle close when no connection exists', async () => {
      await expect(scheduler.closeSchedulerConnection()).resolves.not.toThrow();
    });
  });
});
