/**
 * Git operations module for Monitor Agent
 *
 * Uses simple-git for local git operations.
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { config } from './config.js';

// Git instance
let git: SimpleGit | null = null;

/**
 * Get configured git instance
 */
function getGit(): SimpleGit {
  if (!git) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: config.git.repoPath,
      binary: 'git',
      maxConcurrentProcesses: 1,
      trimmed: true,
    };

    git = simpleGit(options);
  }
  return git;
}

/**
 * Ensure we're on a clean working directory
 */
export async function ensureCleanWorkingDirectory(): Promise<boolean> {
  const gitInstance = getGit();
  const status = await gitInstance.status();
  return status.isClean();
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  const gitInstance = getGit();
  const branch = await gitInstance.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}

/**
 * Fetch latest from remote
 */
export async function fetchLatest(): Promise<void> {
  const gitInstance = getGit();
  await gitInstance.fetch('origin');
}

/**
 * Checkout to base branch and pull latest
 */
export async function checkoutBaseBranch(): Promise<void> {
  const gitInstance = getGit();
  await gitInstance.checkout(config.github.baseBranch);
  await gitInstance.pull('origin', config.github.baseBranch);
}

/**
 * Create a new branch from base
 */
export async function createBranch(branchName: string): Promise<void> {
  const gitInstance = getGit();

  // Ensure we're on the base branch
  await checkoutBaseBranch();

  // Create and checkout new branch
  await gitInstance.checkoutLocalBranch(branchName);

  console.log(`Created and checked out branch: ${branchName}`);
}

/**
 * Stage and commit changes
 */
export async function commitChanges(
  message: string,
  files: string[]
): Promise<string> {
  const gitInstance = getGit();

  // Configure git user if not already set
  await gitInstance.addConfig('user.name', config.git.authorName);
  await gitInstance.addConfig('user.email', config.git.authorEmail);

  // Stage specified files
  if (files.length > 0) {
    await gitInstance.add(files);
  } else {
    // Stage all changes
    await gitInstance.add('.');
  }

  // Commit
  const commitResult = await gitInstance.commit(message);

  console.log(`Committed: ${commitResult.commit}`);
  return commitResult.commit;
}

/**
 * Push branch to remote
 */
export async function pushBranch(branchName: string): Promise<void> {
  const gitInstance = getGit();

  await gitInstance.push('origin', branchName, ['--set-upstream']);

  console.log(`Pushed branch to remote: ${branchName}`);
}

/**
 * Check if branch exists locally
 */
export async function branchExists(branchName: string): Promise<boolean> {
  const gitInstance = getGit();
  const branches = await gitInstance.branchLocal();
  return branches.all.includes(branchName);
}

/**
 * Check if branch exists on remote
 */
export async function remoteBranchExists(branchName: string): Promise<boolean> {
  const gitInstance = getGit();
  const branches = await gitInstance.branch(['-r']);
  return branches.all.includes(`origin/${branchName}`);
}

/**
 * Delete local branch
 */
export async function deleteLocalBranch(branchName: string): Promise<void> {
  const gitInstance = getGit();

  // Make sure we're not on the branch we're deleting
  const currentBranch = await getCurrentBranch();
  if (currentBranch === branchName) {
    await checkoutBaseBranch();
  }

  await gitInstance.deleteLocalBranch(branchName, true);
  console.log(`Deleted local branch: ${branchName}`);
}

/**
 * Get list of changed files
 */
export async function getChangedFiles(): Promise<string[]> {
  const gitInstance = getGit();
  const status = await gitInstance.status();

  const files: string[] = [
    ...status.modified,
    ...status.created,
    ...status.renamed.map((r) => r.to),
  ];

  return files;
}

/**
 * Get diff for specific files
 */
export async function getDiff(files?: string[]): Promise<string> {
  const gitInstance = getGit();

  if (files && files.length > 0) {
    return await gitInstance.diff(['--', ...files]);
  }

  return await gitInstance.diff();
}

/**
 * Stash current changes
 */
export async function stashChanges(message?: string): Promise<void> {
  const gitInstance = getGit();
  await gitInstance.stash(['push', '-m', message || 'Monitor agent stash']);
}

/**
 * Pop stashed changes
 */
export async function popStash(): Promise<void> {
  const gitInstance = getGit();
  await gitInstance.stash(['pop']);
}

/**
 * Reset to clean state (discard all changes)
 */
export async function resetHard(): Promise<void> {
  const gitInstance = getGit();
  await gitInstance.reset(['--hard', 'HEAD']);
  await gitInstance.clean('f', ['-d']);
}

/**
 * Generate a branch name from enhancement title
 */
export function generateBranchName(
  enhancementId: number,
  title: string
): string {
  // Convert title to kebab-case
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  return `feature/enhancement-${enhancementId}-${slug}`;
}

/**
 * Get the merge base between current branch and base
 */
export async function getMergeBase(): Promise<string> {
  const gitInstance = getGit();
  const result = await gitInstance.raw([
    'merge-base',
    config.github.baseBranch,
    'HEAD',
  ]);
  return result.trim();
}

/**
 * Get commits since merge base
 */
export async function getCommitsSinceBranch(): Promise<string[]> {
  const gitInstance = getGit();
  const mergeBase = await getMergeBase();
  const log = await gitInstance.log({ from: mergeBase, to: 'HEAD' });
  return log.all.map((c) => c.hash);
}

export default {
  ensureCleanWorkingDirectory,
  getCurrentBranch,
  fetchLatest,
  checkoutBaseBranch,
  createBranch,
  commitChanges,
  pushBranch,
  branchExists,
  remoteBranchExists,
  deleteLocalBranch,
  getChangedFiles,
  getDiff,
  stashChanges,
  popStash,
  resetHard,
  generateBranchName,
  getMergeBase,
  getCommitsSinceBranch,
};
