/**
 * Copilot integration tests for Monitor Agent
 *
 * Tests the GitHub Copilot review automation module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockOctokit,
  mockCopilotApproval,
  mockCopilotWithSuggestions,
} from './setup.js';

// Import the module under test
import * as copilot from '../src/copilot.js';

describe('Copilot Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestCopilotReview', () => {
    it('should post review request comment to PR', async () => {
      mockOctokit.issues.createComment.mockResolvedValueOnce({
        data: { id: 456 },
      });

      const result = await copilot.requestCopilotReview(42);

      expect(result.commentId).toBe(456);
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: expect.any(String),
        repo: expect.any(String),
        issue_number: 42,
        body: expect.stringContaining('@github-copilot'),
      });
    });

    it('should include security vulnerability check in review prompt', async () => {
      mockOctokit.issues.createComment.mockResolvedValueOnce({
        data: { id: 123 },
      });

      await copilot.requestCopilotReview(1);

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Security vulnerabilities'),
        })
      );
    });

    it('should include code quality check in review prompt', async () => {
      mockOctokit.issues.createComment.mockResolvedValueOnce({
        data: { id: 123 },
      });

      await copilot.requestCopilotReview(1);

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Code quality'),
        })
      );
    });

    it('should handle GitHub API error', async () => {
      mockOctokit.issues.createComment.mockRejectedValueOnce(
        new Error('API rate limit exceeded')
      );

      await expect(copilot.requestCopilotReview(42)).rejects.toThrow(
        'API rate limit exceeded'
      );
    });
  });

  describe('pollForCopilotResponse', () => {
    it('should find Copilot response from github-copilot user', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 100, user: { login: 'user1' }, body: 'Some comment' },
          { id: 200, user: { login: 'github-copilot', type: 'Bot' }, body: 'Looks good! LGTM.' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
        intervalMs: 0,
      });

      expect(result.responded).toBe(true);
      expect(result.approved).toBe(true);
    });

    it('should find Copilot response from copilot user', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 200, user: { login: 'copilot', type: 'Bot' }, body: 'No issues found.' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
        intervalMs: 0,
      });

      expect(result.responded).toBe(true);
      expect(result.approved).toBe(true);
    });

    it('should find Copilot response from bot user containing copilot', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 200, user: { login: 'github-copilot[bot]', type: 'Bot' }, body: 'LGTM' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
        intervalMs: 0,
      });

      expect(result.responded).toBe(true);
    });

    it('should only consider comments after request comment', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          // Old Copilot comment before request - should be ignored
          { id: 30, user: { login: 'github-copilot' }, body: 'Old review' },
          // User request comment
          { id: 50, user: { login: 'user' }, body: 'Review request' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
        intervalMs: 0,
      });

      expect(result.responded).toBe(false);
    });

    it('should timeout when Copilot does not respond', async () => {
      // Always return comments without Copilot response
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          { id: 100, user: { login: 'user1' }, body: 'Regular comment' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 2,
        intervalMs: 10, // Short interval for testing
      });

      expect(result.responded).toBe(false);
      expect(result.approved).toBe(false);
      expect(result.suggestions).toHaveLength(0);
      expect(result.rawResponse).toBeNull();
    });

    it('should extract suggestions from response', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          {
            id: 200,
            user: { login: 'github-copilot' },
            body: `I found a few issues:
- Consider adding input validation
- The variable name 'x' could be more descriptive
* Add error handling for edge cases`,
          },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
        intervalMs: 0,
      });

      expect(result.responded).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle GitHub API error during polling', async () => {
      mockOctokit.issues.listComments.mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(
        copilot.pollForCopilotResponse(42, 50, { maxAttempts: 1 })
      ).rejects.toThrow('Network error');
    });
  });

  describe('parseCopilotResponse (via pollForCopilotResponse)', () => {
    it('should detect approval with "looks good"', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 200, user: { login: 'github-copilot' }, body: 'The code looks good to me!' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.approved).toBe(true);
    });

    it('should detect approval with "LGTM"', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 200, user: { login: 'github-copilot' }, body: 'LGTM!' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.approved).toBe(true);
    });

    it('should detect approval with "approved"', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 200, user: { login: 'github-copilot' }, body: 'Changes approved.' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.approved).toBe(true);
    });

    it('should detect approval with "no issues found"', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 200, user: { login: 'github-copilot' }, body: 'No issues found in this PR.' },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.approved).toBe(true);
    });

    it('should not approve when issues are mentioned', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          {
            id: 200,
            user: { login: 'github-copilot' },
            body: 'I found an issue with the code. There is a potential bug.',
          },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.approved).toBe(false);
    });

    it('should not approve when suggestions are recommended', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          {
            id: 200,
            user: { login: 'github-copilot' },
            body: 'I suggest adding error handling here.',
          },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.approved).toBe(false);
    });

    it('should extract bullet point suggestions', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          {
            id: 200,
            user: { login: 'github-copilot' },
            body: `Review complete:
- Add input validation for user data
- Consider using async/await pattern
- Variable naming could be improved`,
          },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.suggestions.length).toBe(3);
    });

    it('should extract numbered suggestions', async () => {
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          {
            id: 200,
            user: { login: 'github-copilot' },
            body: `Found issues:
1. Missing error handling
2. SQL injection vulnerability
3. Unused imports should be removed`,
          },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should include raw response in result', async () => {
      const rawBody = 'This is the complete review response.';
      mockOctokit.issues.listComments.mockResolvedValueOnce({
        data: [
          { id: 200, user: { login: 'github-copilot' }, body: rawBody },
        ],
      });

      const result = await copilot.pollForCopilotResponse(42, 50, {
        maxAttempts: 1,
      });

      expect(result.rawResponse).toBe(rawBody);
    });
  });

  describe('applyCopilotSuggestions', () => {
    it('should apply suggestions using provided generate function', async () => {
      const mockGenerateFix = vi.fn().mockResolvedValue('fixed code');

      const result = await copilot.applyCopilotSuggestions(
        42,
        'feature/test',
        ['Fix the bug', 'Add validation'],
        mockGenerateFix
      );

      expect(mockGenerateFix).toHaveBeenCalledTimes(2);
      expect(result.appliedCount).toBe(2);
      expect(result.commits.length).toBe(2);
    });

    it('should return zero when no suggestions provided', async () => {
      const mockGenerateFix = vi.fn();

      const result = await copilot.applyCopilotSuggestions(
        42,
        'feature/test',
        [],
        mockGenerateFix
      );

      expect(mockGenerateFix).not.toHaveBeenCalled();
      expect(result.appliedCount).toBe(0);
      expect(result.commits).toHaveLength(0);
    });

    it('should skip suggestions when generate function returns empty', async () => {
      const mockGenerateFix = vi.fn()
        .mockResolvedValueOnce('fixed code')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('  ');

      const result = await copilot.applyCopilotSuggestions(
        42,
        'feature/test',
        ['Suggestion 1', 'Suggestion 2', 'Suggestion 3'],
        mockGenerateFix
      );

      expect(result.appliedCount).toBe(1);
    });

    it('should handle errors in generate function', async () => {
      const mockGenerateFix = vi.fn()
        .mockResolvedValueOnce('fixed code')
        .mockRejectedValueOnce(new Error('Generation failed'))
        .mockResolvedValueOnce('more fixes');

      const result = await copilot.applyCopilotSuggestions(
        42,
        'feature/test',
        ['Suggestion 1', 'Suggestion 2', 'Suggestion 3'],
        mockGenerateFix
      );

      // Should continue despite error
      expect(result.appliedCount).toBe(2);
    });

    it('should truncate long suggestions in commit messages', async () => {
      const longSuggestion = 'This is a very long suggestion that exceeds the character limit and should be truncated in the commit message';
      const mockGenerateFix = vi.fn().mockResolvedValue('fix');

      const result = await copilot.applyCopilotSuggestions(
        42,
        'feature/test',
        [longSuggestion],
        mockGenerateFix
      );

      expect(result.commits[0].length).toBeLessThan(longSuggestion.length + 20);
    });
  });

  describe('isCopilotReviewEnabled', () => {
    it('should return true when feature is enabled', () => {
      const result = copilot.isCopilotReviewEnabled();

      expect(result).toBe(true);
    });
  });
});
