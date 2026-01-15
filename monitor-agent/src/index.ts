/**
 * Monitor Agent - Entry Point
 *
 * A decoupled service that polls the database for pending enhancements
 * and processes them using Claude AI to generate code changes and pull requests.
 */

import { config, validateConfig } from './config.js';
import db, {
  type Enhancement,
  type EnhancementStatus,
  getPendingEnhancements,
  getEnhancement,
  updateEnhancement,
  claimEnhancement,
  getProcessingCount,
  closeConnection,
} from './db.js';
import claude, {
  type EnhancementPlan,
  type CodeGenResult,
  generatePlan,
  generateCode,
  reviewCode,
  generateCommitMessage,
  generatePRDescription,
} from './claude.js';
import git, {
  ensureCleanWorkingDirectory,
  createBranch,
  commitChanges,
  pushBranch,
  generateBranchName,
  getChangedFiles,
  resetHard,
  checkoutBaseBranch,
} from './git.js';
import github, {
  createPullRequest,
  postComment,
  addLabels,
} from './github.js';
import notifications, {
  notifyEnhancementStarted,
  notifyPRCreated,
  notifyEnhancementFailed,
} from './notifications.js';
import fs from 'fs/promises';
import path from 'path';

// Graceful shutdown flag
let shuttingDown = false;

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format timestamp for logging
 */
function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Log with timestamp
 */
function log(message: string, ...args: unknown[]): void {
  console.log(`[${timestamp()}] ${message}`, ...args);
}

/**
 * Log error with timestamp
 */
function logError(message: string, error?: unknown): void {
  console.error(`[${timestamp()}] ERROR: ${message}`, error);
}

/**
 * Process a single enhancement through the pipeline
 */
async function processEnhancement(enhancement: Enhancement): Promise<void> {
  const enhancementId = enhancement.id;
  log(`Processing enhancement #${enhancementId}: ${enhancement.title}`);

  const recipients = enhancement.requested_by ? [enhancement.requested_by] : [];

  try {
    // Notify start
    await notifyEnhancementStarted(
      {
        id: enhancementId,
        title: enhancement.title,
        status: 'processing',
      },
      recipients
    );

    // Step 1: Planning phase
    log(`[#${enhancementId}] Starting planning phase...`);
    await updateEnhancement(enhancementId, { status: 'planning' });

    const plan = await generatePlan(enhancement.title, enhancement.description);
    log(`[#${enhancementId}] Generated plan with ${plan.tasks.length} tasks`);

    await updateEnhancement(enhancementId, {
      plan_json: JSON.stringify(plan, null, 2),
    });

    // Check for dry run mode
    if (config.features.dryRun) {
      log(`[#${enhancementId}] DRY RUN - Skipping implementation`);
      await updateEnhancement(enhancementId, {
        status: 'completed',
        completed_at: new Date(),
        notes: 'Dry run completed - plan generated but not implemented',
      });
      return;
    }

    // Step 2: Implementation phase
    log(`[#${enhancementId}] Starting implementation phase...`);
    await updateEnhancement(enhancementId, { status: 'implementing' });

    // Ensure clean working directory
    const isClean = await ensureCleanWorkingDirectory();
    if (!isClean) {
      log(`[#${enhancementId}] Working directory not clean, resetting...`);
      await resetHard();
    }

    // Create feature branch
    const branchName = generateBranchName(enhancementId, enhancement.title);
    log(`[#${enhancementId}] Creating branch: ${branchName}`);
    await createBranch(branchName);

    await updateEnhancement(enhancementId, { branch_name: branchName });

    // Process each task
    const allCodeResults: CodeGenResult[] = [];
    for (const task of plan.tasks) {
      log(`[#${enhancementId}] Processing task ${task.id}: ${task.title}`);

      // Read existing file content if modifying
      let existingCode: string | undefined;
      if (task.type === 'modify' && task.files.length > 0) {
        const filePath = path.join(config.git.repoPath, task.files[0]);
        try {
          existingCode = await fs.readFile(filePath, 'utf-8');
        } catch {
          // File doesn't exist yet
        }
      }

      // Generate code for task
      const codeResults = await generateCode(task, existingCode);
      allCodeResults.push(...codeResults);

      // Apply code changes
      for (const result of codeResults) {
        const filePath = path.join(config.git.repoPath, result.filePath);
        const dirPath = path.dirname(filePath);

        if (result.operation === 'delete') {
          try {
            await fs.unlink(filePath);
            log(`[#${enhancementId}] Deleted: ${result.filePath}`);
          } catch {
            log(`[#${enhancementId}] File already deleted: ${result.filePath}`);
          }
        } else {
          // Create directory if needed
          await fs.mkdir(dirPath, { recursive: true });
          await fs.writeFile(filePath, result.content, 'utf-8');
          log(`[#${enhancementId}] Written: ${result.filePath}`);
        }
      }
    }

    // Step 3: Review phase
    log(`[#${enhancementId}] Starting review phase...`);
    await updateEnhancement(enhancementId, { status: 'reviewing' });

    // Internal code review using Claude
    const filesToReview = allCodeResults
      .filter((r) => r.operation !== 'delete')
      .map((r) => ({
        path: r.filePath,
        content: r.content,
      }));

    if (filesToReview.length > 0) {
      const review = await reviewCode(filesToReview, {
        title: enhancement.title,
        description: enhancement.description,
      });

      if (!review.approved && review.issues.some((i) => i.severity === 'error')) {
        log(`[#${enhancementId}] Code review found blocking issues`);
        // Could implement auto-fix here in future
      }
    }

    // Commit changes
    const changedFiles = await getChangedFiles();
    if (changedFiles.length === 0) {
      log(`[#${enhancementId}] No files changed, skipping commit`);
      await updateEnhancement(enhancementId, {
        status: 'completed',
        completed_at: new Date(),
        notes: 'No changes generated',
      });
      await checkoutBaseBranch();
      return;
    }

    const commitMessage = await generateCommitMessage(changedFiles, {
      title: enhancement.title,
      description: enhancement.description,
    });

    log(`[#${enhancementId}] Committing ${changedFiles.length} files...`);
    await commitChanges(commitMessage, changedFiles);

    // Push branch
    log(`[#${enhancementId}] Pushing branch to remote...`);
    await pushBranch(branchName);

    // Step 4: Create PR
    log(`[#${enhancementId}] Creating pull request...`);

    const prContent = await generatePRDescription(
      { title: enhancement.title, description: enhancement.description },
      plan,
      changedFiles
    );

    const pr = await createPullRequest(branchName, prContent.title, prContent.body);

    log(`[#${enhancementId}] Created PR #${pr.number}: ${pr.htmlUrl}`);

    // Add labels
    await addLabels(pr.number, ['ai-generated', 'enhancement']);

    // Post plan summary as comment
    const planComment = `## Implementation Plan

${plan.summary}

### Tasks Completed
${plan.tasks.map((t) => `- [x] ${t.title}`).join('\n')}

### Estimated Effort
${plan.estimatedEffort}

### Risks Identified
${plan.risks.map((r) => `- **${r.severity}**: ${r.description}`).join('\n') || 'None identified'}

---
*This PR was automatically generated by Monitor Agent using Claude AI.*`;

    await postComment(pr.number, planComment);

    // Update enhancement with PR info
    await updateEnhancement(enhancementId, {
      status: 'pr_created',
      pr_number: pr.number,
      pr_url: pr.htmlUrl,
    });

    // Notify PR created
    await notifyPRCreated(
      {
        id: enhancementId,
        title: enhancement.title,
        status: 'pr_created',
        prUrl: pr.htmlUrl,
      },
      recipients
    );

    // Return to base branch
    await checkoutBaseBranch();

    log(`[#${enhancementId}] Enhancement processing complete!`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`[#${enhancementId}] Processing failed`, error);

    // Update status to failed
    await updateEnhancement(enhancementId, {
      status: 'failed',
      error_message: errorMessage,
    });

    // Notify failure
    await notifyEnhancementFailed(
      {
        id: enhancementId,
        title: enhancement.title,
        status: 'failed',
        error: errorMessage,
      },
      recipients
    );

    // Try to clean up
    try {
      await resetHard();
      await checkoutBaseBranch();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Main polling loop
 */
async function main(): Promise<void> {
  log('Monitor Agent starting...');

  // Validate configuration
  const configErrors = validateConfig();
  if (configErrors.length > 0) {
    logError('Configuration errors:');
    configErrors.forEach((e) => logError(`  - ${e}`));
    process.exit(1);
  }

  log('Configuration validated successfully');
  log(`Poll interval: ${config.pollInterval / 1000}s`);
  log(`Max concurrent jobs: ${config.maxConcurrentJobs}`);
  log(`Dry run mode: ${config.features.dryRun}`);

  // Main polling loop
  while (!shuttingDown) {
    try {
      // Check processing capacity
      const processingCount = await getProcessingCount();
      if (processingCount >= config.maxConcurrentJobs) {
        log(`At capacity (${processingCount}/${config.maxConcurrentJobs}), waiting...`);
        await sleep(config.pollInterval);
        continue;
      }

      // Get pending enhancements
      const pending = await getPendingEnhancements();

      if (pending.length === 0) {
        log('No pending enhancements found');
      } else {
        log(`Found ${pending.length} pending enhancement(s)`);

        // Process first available enhancement
        for (const enhancement of pending) {
          // Try to claim it (atomic operation to prevent race conditions)
          const claimed = await claimEnhancement(enhancement.id);

          if (claimed) {
            log(`Claimed enhancement #${enhancement.id}`);
            await processEnhancement(enhancement);
            break; // Process one at a time
          } else {
            log(`Enhancement #${enhancement.id} was claimed by another process`);
          }
        }
      }
    } catch (error) {
      logError('Error in polling loop', error);
    }

    // Wait for next poll
    if (!shuttingDown) {
      log(`Sleeping for ${config.pollInterval / 1000}s...`);
      await sleep(config.pollInterval);
    }
  }

  log('Monitor Agent shutting down...');
  await closeConnection();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT, initiating graceful shutdown...');
  shuttingDown = true;
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, initiating graceful shutdown...');
  shuttingDown = true;
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError('Uncaught exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled rejection', reason);
  process.exit(1);
});

// Start the agent
main().catch((error) => {
  logError('Fatal error', error);
  process.exit(1);
});
