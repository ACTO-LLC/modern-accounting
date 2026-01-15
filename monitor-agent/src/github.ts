/**
 * GitHub API operations module for Monitor Agent
 *
 * Uses Octokit for GitHub API interactions.
 */

import { Octokit } from '@octokit/rest';
import { config } from './config.js';

// Octokit instance
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

/**
 * Pull request creation result
 */
export interface PRCreateResult {
  number: number;
  url: string;
  htmlUrl: string;
}

/**
 * Pull request details
 */
export interface PRDetails {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
  htmlUrl: string;
  headBranch: string;
  baseBranch: string;
}

/**
 * PR comment
 */
export interface PRComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * PR check run status
 */
export interface PRCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

/**
 * PR status with checks
 */
export interface PRStatusWithChecks {
  state: 'open' | 'closed';
  merged: boolean;
  mergeable: boolean | null;
  checks: PRCheckRun[];
}

/**
 * Create a pull request
 */
export async function createPullRequest(
  branch: string,
  title: string,
  body: string
): Promise<PRCreateResult> {
  const gh = getOctokit();

  const response = await gh.pulls.create({
    owner: config.github.owner,
    repo: config.github.repo,
    title,
    body,
    head: branch,
    base: config.github.baseBranch,
  });

  console.log(`Created PR #${response.data.number}: ${response.data.html_url}`);

  return {
    number: response.data.number,
    url: response.data.url,
    htmlUrl: response.data.html_url,
  };
}

/**
 * Get pull request details
 */
export async function getPullRequest(prNumber: number): Promise<PRDetails> {
  const gh = getOctokit();

  const response = await gh.pulls.get({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
  });

  return {
    number: response.data.number,
    title: response.data.title,
    body: response.data.body,
    state: response.data.state as 'open' | 'closed',
    merged: response.data.merged,
    mergeable: response.data.mergeable,
    htmlUrl: response.data.html_url,
    headBranch: response.data.head.ref,
    baseBranch: response.data.base.ref,
  };
}

/**
 * Get PR status including all check runs
 * Used by the scheduler to determine if a PR is ready to deploy
 */
export async function getPRStatus(prNumber: number): Promise<PRStatusWithChecks> {
  const gh = getOctokit();

  // Get PR details
  const prResponse = await gh.pulls.get({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
  });

  const pr = prResponse.data;

  // Get check runs for the head SHA
  const checksResponse = await gh.checks.listForRef({
    owner: config.github.owner,
    repo: config.github.repo,
    ref: pr.head.sha,
  });

  const checks: PRCheckRun[] = checksResponse.data.check_runs.map((check) => ({
    name: check.name,
    status: check.status,
    conclusion: check.conclusion,
  }));

  return {
    state: pr.state as 'open' | 'closed',
    merged: pr.merged,
    mergeable: pr.mergeable,
    checks,
  };
}

/**
 * Post a comment on a pull request
 */
export async function postComment(
  prNumber: number,
  comment: string
): Promise<number> {
  const gh = getOctokit();

  const response = await gh.issues.createComment({
    owner: config.github.owner,
    repo: config.github.repo,
    issue_number: prNumber,
    body: comment,
  });

  console.log(`Posted comment #${response.data.id} on PR #${prNumber}`);
  return response.data.id;
}

/**
 * Get comments on a pull request
 */
export async function getPRComments(prNumber: number): Promise<PRComment[]> {
  const gh = getOctokit();

  const response = await gh.issues.listComments({
    owner: config.github.owner,
    repo: config.github.repo,
    issue_number: prNumber,
  });

  return response.data.map((comment) => ({
    id: comment.id,
    body: comment.body || '',
    user: comment.user?.login || 'unknown',
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  }));
}

/**
 * Get review comments on a pull request (inline code comments)
 */
export async function getPRReviewComments(prNumber: number): Promise<PRComment[]> {
  const gh = getOctokit();

  const response = await gh.pulls.listReviewComments({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
  });

  return response.data.map((comment) => ({
    id: comment.id,
    body: comment.body,
    user: comment.user?.login || 'unknown',
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  }));
}

/**
 * Merge a pull request
 */
export async function mergePullRequest(
  prNumber: number,
  commitMessage?: string
): Promise<boolean> {
  const gh = getOctokit();

  try {
    await gh.pulls.merge({
      owner: config.github.owner,
      repo: config.github.repo,
      pull_number: prNumber,
      commit_message: commitMessage,
      merge_method: 'squash',
    });

    console.log(`Merged PR #${prNumber}`);
    return true;
  } catch (error) {
    console.error(`Failed to merge PR #${prNumber}:`, error);
    return false;
  }
}

/**
 * Update pull request
 */
export async function updatePullRequest(
  prNumber: number,
  updates: { title?: string; body?: string; state?: 'open' | 'closed' }
): Promise<void> {
  const gh = getOctokit();

  await gh.pulls.update({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
    ...updates,
  });

  console.log(`Updated PR #${prNumber}`);
}

/**
 * Request reviewers for a pull request
 */
export async function requestReviewers(
  prNumber: number,
  reviewers: string[]
): Promise<void> {
  const gh = getOctokit();

  await gh.pulls.requestReviewers({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
    reviewers,
  });

  console.log(`Requested reviewers for PR #${prNumber}: ${reviewers.join(', ')}`);
}

/**
 * Get pull request reviews
 */
export async function getPRReviews(
  prNumber: number
): Promise<Array<{ state: string; user: string; body: string }>> {
  const gh = getOctokit();

  const response = await gh.pulls.listReviews({
    owner: config.github.owner,
    repo: config.github.repo,
    pull_number: prNumber,
  });

  return response.data.map((review) => ({
    state: review.state,
    user: review.user?.login || 'unknown',
    body: review.body || '',
  }));
}

/**
 * Check if PR is approved
 */
export async function isPRApproved(prNumber: number): Promise<boolean> {
  const reviews = await getPRReviews(prNumber);
  return reviews.some((r) => r.state === 'APPROVED');
}

/**
 * Get PR check runs status
 */
export async function getPRCheckStatus(
  prNumber: number
): Promise<{ status: string; conclusion: string | null }> {
  const gh = getOctokit();

  // Get the PR to find the head SHA
  const pr = await getPullRequest(prNumber);

  const response = await gh.checks.listForRef({
    owner: config.github.owner,
    repo: config.github.repo,
    ref: pr.headBranch,
  });

  const checkRuns = response.data.check_runs;

  if (checkRuns.length === 0) {
    return { status: 'pending', conclusion: null };
  }

  // Aggregate status
  const allCompleted = checkRuns.every((c) => c.status === 'completed');
  const allSuccess = checkRuns.every((c) => c.conclusion === 'success');
  const anyFailed = checkRuns.some(
    (c) => c.conclusion === 'failure' || c.conclusion === 'cancelled'
  );

  if (!allCompleted) {
    return { status: 'in_progress', conclusion: null };
  }

  if (anyFailed) {
    return { status: 'completed', conclusion: 'failure' };
  }

  if (allSuccess) {
    return { status: 'completed', conclusion: 'success' };
  }

  return { status: 'completed', conclusion: 'neutral' };
}

/**
 * Add labels to PR
 */
export async function addLabels(
  prNumber: number,
  labels: string[]
): Promise<void> {
  const gh = getOctokit();

  await gh.issues.addLabels({
    owner: config.github.owner,
    repo: config.github.repo,
    issue_number: prNumber,
    labels,
  });

  console.log(`Added labels to PR #${prNumber}: ${labels.join(', ')}`);
}

/**
 * Create an issue
 */
export async function createIssue(
  title: string,
  body: string,
  labels?: string[]
): Promise<{ number: number; url: string }> {
  const gh = getOctokit();

  const response = await gh.issues.create({
    owner: config.github.owner,
    repo: config.github.repo,
    title,
    body,
    labels,
  });

  return {
    number: response.data.number,
    url: response.data.html_url,
  };
}

/**
 * Close an issue
 */
export async function closeIssue(issueNumber: number): Promise<void> {
  const gh = getOctokit();

  await gh.issues.update({
    owner: config.github.owner,
    repo: config.github.repo,
    issue_number: issueNumber,
    state: 'closed',
  });

  console.log(`Closed issue #${issueNumber}`);
}

export default {
  createPullRequest,
  getPullRequest,
  getPRStatus,
  postComment,
  getPRComments,
  getPRReviewComments,
  mergePullRequest,
  updatePullRequest,
  requestReviewers,
  getPRReviews,
  isPRApproved,
  getPRCheckStatus,
  addLabels,
  createIssue,
  closeIssue,
};
