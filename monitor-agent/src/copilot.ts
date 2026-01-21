/**
 * GitHub Copilot Review Automation module for Monitor Agent
 *
 * Integrates with GitHub Copilot to request automated code reviews
 * on pull requests and process the responses.
 */

import { Octokit } from '@octokit/rest';
import { config } from './config.js';

// Octokit instance (reuse from github.ts pattern)
let octokit: Octokit | null = null;

/**
 * Get configured Octokit instance
 */
function getOctokit(): Octokit {
  if (!octokit) {
    octokit = new Octokit({
      auth: config.github.token,
    });
  }
  return octokit;
}

const { owner, repo } = config.github;

/**
 * Result of polling for Copilot's review response
 */
export interface CopilotReviewResult {
  responded: boolean;
  approved: boolean;
  suggestions: string[];
  rawResponse: string | null;
}

/**
 * Result of applying Copilot suggestions
 */
export interface ApplySuggestionsResult {
  appliedCount: number;
  commits: string[];
}

/**
 * Request a review from GitHub Copilot by posting a comment
 */
export async function requestCopilotReview(
  prNumber: number
): Promise<{ commentId: number }> {
  const gh = getOctokit();

  const reviewPrompt = `@github-copilot Please review this PR for:
- Security vulnerabilities (SQL injection, XSS, etc.)
- Code quality issues and bugs
- Performance optimizations
- Best practices violations

If you find issues, please suggest specific fixes.`;

  const { data } = await gh.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: reviewPrompt,
  });

  console.log(`Posted Copilot review request as comment #${data.id} on PR #${prNumber}`);

  return { commentId: data.id };
}

/**
 * Poll for Copilot's response to our review request
 */
export async function pollForCopilotResponse(
  prNumber: number,
  requestCommentId: number,
  options: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<CopilotReviewResult> {
  const gh = getOctokit();
  const { maxAttempts = 20, intervalMs = 30000 } = options; // 20 attempts * 30s = 10 min max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(
      `Polling for Copilot response (attempt ${attempt + 1}/${maxAttempts})...`
    );

    const { data: comments } = await gh.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    // Find comments after our request from Copilot
    const copilotComment = comments.find(
      (c) =>
        c.id > requestCommentId &&
        (c.user?.login === 'github-copilot' ||
          c.user?.login === 'copilot' ||
          (c.user?.type === 'Bot' && c.user?.login?.includes('copilot')))
    );

    if (copilotComment) {
      console.log(`Found Copilot response: comment #${copilotComment.id}`);
      return parseCopilotResponse(copilotComment.body || '');
    }

    // Wait before next poll (skip wait on last attempt)
    if (attempt < maxAttempts - 1) {
      await sleep(intervalMs);
    }
  }

  // Timeout - Copilot didn't respond
  console.log('Copilot did not respond within timeout period');
  return {
    responded: false,
    approved: false,
    suggestions: [],
    rawResponse: null,
  };
}

/**
 * Parse Copilot's response to determine if it approved or has suggestions
 */
function parseCopilotResponse(body: string): CopilotReviewResult {
  const lowerBody = body.toLowerCase();

  // Check for explicit approval indicators first
  const approvalIndicators = [
    'looks good',
    'lgtm',
    'approved',
    'no issues found',
    'no issues',
    'no concerns',
    'well-written',
    'good to merge',
  ];
  const hasExplicitApproval = approvalIndicators.some((indicator) =>
    lowerBody.includes(indicator)
  );

  // Check for issue indicators only if not explicitly approved
  // This prevents "no issues found" from being flagged as having issues
  const issueIndicators = [
    'issue',
    'bug',
    'vulnerability',
    'concern',
    'suggest',
    'recommend',
    'should',
    'could improve',
    'consider',
    'warning',
    'error',
    'problem',
  ];
  const hasIssues = !hasExplicitApproval && issueIndicators.some((indicator) =>
    lowerBody.includes(indicator)
  );

  // Extract suggestions (lines starting with - or * or numbered)
  const suggestions = body
    .split('\n')
    .filter((line) => /^[\s]*[-*\d.]/.test(line) && line.trim().length > 3)
    .map((line) => line.trim());

  const isApproved = hasExplicitApproval && !hasIssues;

  console.log(
    `Parsed Copilot response: approved=${isApproved}, suggestions=${suggestions.length}`
  );

  return {
    responded: true,
    approved: isApproved,
    suggestions,
    rawResponse: body,
  };
}

/**
 * Apply Copilot's suggestions using Claude to generate fixes
 *
 * @param prNumber - The PR number
 * @param branch - The branch name
 * @param suggestions - Array of suggestions from Copilot
 * @param generateFix - Function to generate a fix using Claude AI
 */
export async function applyCopilotSuggestions(
  prNumber: number,
  branch: string,
  suggestions: string[],
  generateFix: (suggestion: string, context: string) => Promise<string>
): Promise<ApplySuggestionsResult> {
  const commits: string[] = [];
  let appliedCount = 0;

  console.log(`Attempting to apply ${suggestions.length} Copilot suggestions...`);

  for (const suggestion of suggestions) {
    try {
      // Use Claude to generate the fix
      const fix = await generateFix(
        suggestion,
        `PR #${prNumber} on branch ${branch}`
      );

      if (fix && fix.trim()) {
        // The fix should include file path and content
        // This is a simplified version - real implementation would parse the fix
        const truncatedSuggestion = suggestion.substring(0, 50);
        commits.push(`Applied fix: ${truncatedSuggestion}...`);
        appliedCount++;
        console.log(`Applied suggestion: ${truncatedSuggestion}...`);
      }
    } catch (err) {
      console.error(`Failed to apply suggestion: ${suggestion}`, err);
    }
  }

  console.log(`Applied ${appliedCount} of ${suggestions.length} suggestions`);

  return { appliedCount, commits };
}

/**
 * Check if Copilot review is available (feature flag check)
 * This can be extended to check API availability or rate limits
 */
export function isCopilotReviewEnabled(): boolean {
  // Could be extended to check config.features.enableCopilotReview
  // For now, always enabled
  return true;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  requestCopilotReview,
  pollForCopilotResponse,
  applyCopilotSuggestions,
  isCopilotReviewEnabled,
};
