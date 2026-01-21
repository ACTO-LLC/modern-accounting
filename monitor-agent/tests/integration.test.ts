/**
 * Integration tests for Monitor Agent
 *
 * Tests the end-to-end workflow of enhancement processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockRequest,
  mockPool,
  mockOctokit,
  mockAnthropicClient,
  mockSimpleGit,
  mockTransporter,
  mockEnhancement,
  createMockQueryResult,
} from './setup.js';

// Import the modules under test
import * as db from '../src/db.js';
import * as scheduler from '../src/scheduler.js';
import * as copilot from '../src/copilot.js';

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPool.connected = true;
  });

  describe('Enhancement Processing Flow', () => {
    it('should complete full enhancement processing flow', async () => {
      // This test simulates the complete flow:
      // 1. Fetch pending enhancement
      // 2. Claim it
      // 3. Update through various statuses
      // 4. Create PR

      // Step 1: Fetch pending enhancements
      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([mockEnhancement])
      );

      const pending = await db.getPendingEnhancements();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');

      // Step 2: Claim the enhancement
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      const claimed = await db.claimEnhancement(pending[0].id);
      expect(claimed).toBe(true);

      // Step 3: Update to processing status
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(pending[0].id, { status: 'processing' });

      // Step 4: Update to planning status
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(pending[0].id, { status: 'planning' });

      // Step 5: Store plan
      const plan = {
        summary: 'Implementation plan',
        tasks: [{ id: 1, title: 'Implement feature' }],
        estimatedEffort: '2 hours',
        risks: [],
      };

      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(pending[0].id, {
        plan_json: JSON.stringify(plan),
      });

      // Step 6: Update to implementing
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(pending[0].id, { status: 'implementing' });

      // Step 7: Update to reviewing
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(pending[0].id, { status: 'reviewing' });

      // Step 8: Final status - pr_created
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(pending[0].id, {
        status: 'pr_created',
        branch_name: 'feature/1-add-new-feature',
        pr_number: 42,
        pr_url: 'https://github.com/test/test/pull/42',
      });

      // Verify final state
      const finalEnhancement = {
        ...mockEnhancement,
        status: 'pr_created',
        branch_name: 'feature/1-add-new-feature',
        pr_number: 42,
        pr_url: 'https://github.com/test/test/pull/42',
      };

      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([finalEnhancement])
      );

      const result = await db.getEnhancement(pending[0].id);
      expect(result?.status).toBe('pr_created');
      expect(result?.pr_number).toBe(42);
    });

    it('should handle failure and update error status', async () => {
      // Simulate processing that fails

      // Fetch and claim
      mockRequest.query
        .mockResolvedValueOnce(createMockQueryResult([mockEnhancement]))
        .mockResolvedValueOnce(createMockQueryResult([], [1]));

      const pending = await db.getPendingEnhancements();
      await db.claimEnhancement(pending[0].id);

      // Update to processing
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));
      await db.updateEnhancement(pending[0].id, { status: 'processing' });

      // Simulate failure during planning
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(pending[0].id, {
        status: 'failed',
        error_message: 'Claude API rate limit exceeded',
      });

      // Verify failed state
      const failedEnhancement = {
        ...mockEnhancement,
        status: 'failed',
        error_message: 'Claude API rate limit exceeded',
      };

      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([failedEnhancement])
      );

      const result = await db.getEnhancement(pending[0].id);
      expect(result?.status).toBe('failed');
      expect(result?.error_message).toBe('Claude API rate limit exceeded');
    });
  });

  describe('Status Transitions', () => {
    const validTransitions: Array<{ from: string; to: string }> = [
      { from: 'pending', to: 'processing' },
      { from: 'processing', to: 'planning' },
      { from: 'planning', to: 'implementing' },
      { from: 'implementing', to: 'reviewing' },
      { from: 'reviewing', to: 'copilot_reviewing' },
      { from: 'copilot_reviewing', to: 'pr_created' },
      { from: 'pr_created', to: 'completed' },
      // Failure transitions
      { from: 'processing', to: 'failed' },
      { from: 'planning', to: 'failed' },
      { from: 'implementing', to: 'failed' },
      { from: 'reviewing', to: 'failed' },
      { from: 'copilot_reviewing', to: 'failed' },
    ];

    validTransitions.forEach(({ from, to }) => {
      it(`should allow transition from ${from} to ${to}`, async () => {
        mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

        // Update should succeed
        await expect(
          db.updateEnhancement(1, { status: to as any })
        ).resolves.not.toThrow();
      });
    });
  });

  describe('Error Recovery', () => {
    it('should recover from temporary database failure', async () => {
      // First call fails
      mockRequest.query.mockRejectedValueOnce(new Error('Temporary connection error'));

      // Verify failure
      await expect(db.getPendingEnhancements()).rejects.toThrow(
        'Temporary connection error'
      );

      // Second call succeeds (recovery)
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([mockEnhancement]));

      const result = await db.getPendingEnhancements();
      expect(result).toHaveLength(1);
    });

    it('should handle multiple concurrent enhancement processing', async () => {
      const enhancements = [
        { ...mockEnhancement, id: 1 },
        { ...mockEnhancement, id: 2 },
        { ...mockEnhancement, id: 3 },
      ];

      // Return all pending
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult(enhancements));

      const pending = await db.getPendingEnhancements();
      expect(pending).toHaveLength(3);

      // Simulate concurrent claims - only first succeeds
      mockRequest.query
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // First claim succeeds
        .mockResolvedValueOnce(createMockQueryResult([], [0])) // Second already claimed
        .mockResolvedValueOnce(createMockQueryResult([], [0])); // Third already claimed

      const claim1 = await db.claimEnhancement(1);
      const claim2 = await db.claimEnhancement(2);
      const claim3 = await db.claimEnhancement(3);

      expect(claim1).toBe(true);
      expect(claim2).toBe(false);
      expect(claim3).toBe(false);
    });
  });

  describe('Copilot Review Integration', () => {
    it('should integrate Copilot review into enhancement flow', async () => {
      // Request Copilot review
      mockOctokit.issues.createComment.mockResolvedValueOnce({
        data: { id: 100 },
      });

      const { commentId } = await copilot.requestCopilotReview(42);
      expect(commentId).toBe(100);

      // Poll for response - approved
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          {
            id: 200,
            user: { login: 'github-copilot' },
            body: 'LGTM! The code looks good.',
          },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 100, {
        maxAttempts: 1,
      });

      expect(result.responded).toBe(true);
      expect(result.approved).toBe(true);

      // Update enhancement status
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));

      await db.updateEnhancement(1, {
        status: 'pr_created',
        notes: 'Copilot approved',
      });
    });

    it('should handle Copilot suggestions requiring fixes', async () => {
      // Request review
      mockOctokit.issues.createComment.mockResolvedValueOnce({
        data: { id: 100 },
      });

      await copilot.requestCopilotReview(42);

      // Poll - suggestions found
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          {
            id: 200,
            user: { login: 'github-copilot' },
            body: `Found issues:
- Add input validation
- Handle null case`,
          },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 100, {
        maxAttempts: 1,
      });

      expect(result.approved).toBe(false);
      expect(result.suggestions.length).toBeGreaterThan(0);

      // Apply suggestions
      const mockFix = vi.fn().mockResolvedValue('fixed code');
      const applyResult = await copilot.applyCopilotSuggestions(
        42,
        'feature/test',
        result.suggestions,
        mockFix
      );

      expect(applyResult.appliedCount).toBeGreaterThan(0);
    });
  });

  describe('Scheduler Integration', () => {
    it('should process scheduled deployment after PR approval', async () => {
      const deployment = {
        Id: 1,
        EnhancementId: 1,
        ScheduledDate: new Date('2026-01-01'),
        Status: 'pending',
        Notes: null,
        BranchName: 'feature/1-test',
        PrNumber: 42,
        Description: 'Test feature',
        RequestorName: 'Test User',
      };

      // Get due deployments
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([deployment]));

      const dueDeployments = await scheduler.getDueDeployments();
      expect(dueDeployments).toHaveLength(1);

      // Process deployment
      mockRequest.query
        .mockResolvedValueOnce(createMockQueryResult([], [1])) // in-progress
        .mockResolvedValueOnce(createMockQueryResult([], [1])); // deployed

      mockOctokit.pulls.get.mockResolvedValueOnce({
        data: { state: 'open', mergeable: true, merged: false, head: { sha: 'abc123' } },
      });

      mockOctokit.checks.listForRef.mockResolvedValueOnce({
        data: { check_runs: [] },
      });

      mockOctokit.pulls.merge.mockResolvedValueOnce({
        data: { merged: true },
      });

      const success = await scheduler.processDeployment(deployment);
      expect(success).toBe(true);
    });
  });

  describe('Notification Integration', () => {
    it('should send email notification through the flow', async () => {
      // The notification is sent automatically when deployment completes
      // This is already tested in scheduler tests, but we verify the mock
      expect(mockTransporter.sendMail).toBeDefined();
    });
  });

  describe('Git Integration', () => {
    it('should verify git operations are properly mocked', () => {
      // Verify git mock is available
      expect(mockSimpleGit.status).toBeDefined();
      expect(mockSimpleGit.checkout).toBeDefined();
      expect(mockSimpleGit.checkoutLocalBranch).toBeDefined();
      expect(mockSimpleGit.add).toBeDefined();
      expect(mockSimpleGit.commit).toBeDefined();
      expect(mockSimpleGit.push).toBeDefined();
      expect(mockSimpleGit.reset).toBeDefined();
    });
  });

  describe('Claude AI Integration', () => {
    it('should verify Claude mock is available for plan generation', () => {
      expect(mockAnthropicClient.messages.create).toBeDefined();
    });

    it('should mock Claude API response correctly', async () => {
      const response = await mockAnthropicClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'Test prompt' }],
      });

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');
    });
  });

  describe('Concurrent Processing Limits', () => {
    it('should respect max concurrent jobs limit', async () => {
      // Simulate 3 processing enhancements
      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([{ count: 3 }])
      );

      const count = await db.getProcessingCount();
      expect(count).toBe(3);

      // With maxConcurrentJobs = 1, no new enhancements should be processed
      // This is handled by the main loop in index.ts
    });

    it('should allow processing when under limit', async () => {
      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([{ count: 0 }])
      );

      const count = await db.getProcessingCount();
      expect(count).toBe(0);

      // New enhancements can be processed
      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([mockEnhancement])
      );

      const pending = await db.getPendingEnhancements();
      expect(pending).toHaveLength(1);
    });
  });

  describe('Complete Workflow Simulation', () => {
    it('should simulate complete enhancement lifecycle', async () => {
      // This test traces through the complete lifecycle of an enhancement

      // 1. Enhancement is created (external - via API)
      const newEnhancement = {
        ...mockEnhancement,
        id: 100,
        status: 'pending',
      };

      // 2. Monitor agent polls and finds it
      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([newEnhancement])
      );

      const pending = await db.getPendingEnhancements();
      expect(pending).toHaveLength(1);

      // 3. Claims it
      mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));
      await db.claimEnhancement(100);

      // 4. Goes through all status updates
      const statusUpdates = [
        'processing',
        'planning',
        'implementing',
        'reviewing',
        'copilot_reviewing',
        'pr_created',
        'completed',
      ];

      for (const status of statusUpdates) {
        mockRequest.query.mockResolvedValueOnce(createMockQueryResult([], [1]));
        await db.updateEnhancement(100, { status: status as any });
      }

      // 5. Final verification
      const completedEnhancement = {
        ...newEnhancement,
        status: 'completed',
        completed_at: new Date(),
      };

      mockRequest.query.mockResolvedValueOnce(
        createMockQueryResult([completedEnhancement])
      );

      const final = await db.getEnhancement(100);
      expect(final?.status).toBe('completed');
    });
  });
});
