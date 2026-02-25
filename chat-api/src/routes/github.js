// GitHub/PR workflow API routes
import express from 'express';
import * as github from '../services/github.js';
import { logAuditEvent } from '../services/audit-log.js';

const router = express.Router();

// ============================================================================
// Branch Operations
// ============================================================================

/**
 * Create a new branch
 * POST /api/github/branches
 * Body: { branchName: string, baseBranch?: string }
 */
router.post('/branches', async (req, res) => {
    try {
        const { branchName, baseBranch } = req.body;
        if (!branchName) {
            return res.status(400).json({ error: 'branchName is required' });
        }
        const result = await github.createBranch(branchName, baseBranch);
        logAuditEvent({
            action: 'Create',
            entityType: 'GitBranch',
            entityDescription: `Create branch ${branchName} from ${baseBranch || 'main'}`,
            newValues: { branchName, baseBranch },
            req,
            source: 'System',
        });
        res.json(result);
    } catch (err) {
        console.error('Create branch error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// Commit Operations
// ============================================================================

/**
 * Commit file to branch
 * POST /api/github/commits
 * Body: { branch: string, path: string, content: string, message: string }
 */
router.post('/commits', async (req, res) => {
    try {
        const { branch, path, content, message } = req.body;
        if (!branch || !path || !content || !message) {
            return res.status(400).json({
                error: 'branch, path, content, and message are required'
            });
        }
        await github.commitFile(branch, path, content, message);
        logAuditEvent({
            action: 'Create',
            entityType: 'GitCommit',
            entityDescription: `Commit to ${branch}: ${message.substring(0, 80)}`,
            newValues: { branch, path, message },
            req,
            source: 'System',
        });
        res.json({ success: true });
    } catch (err) {
        console.error('Commit file error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// Pull Request Operations
// ============================================================================

/**
 * Create a pull request
 * POST /api/github/pulls
 * Body: { head: string, base?: string, title: string, body: string }
 */
router.post('/pulls', async (req, res) => {
    try {
        const { head, base, title, body } = req.body;
        if (!head || !title || !body) {
            return res.status(400).json({
                error: 'head, title, and body are required'
            });
        }
        const result = await github.createPR(head, base || 'main', title, body);
        logAuditEvent({
            action: 'Create',
            entityType: 'PullRequest',
            entityId: result?.number?.toString(),
            entityDescription: `Create PR: ${title.substring(0, 80)}`,
            newValues: { head, base: base || 'main', title },
            req,
            source: 'System',
        });
        res.json(result);
    } catch (err) {
        console.error('Create PR error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Post a comment on a PR
 * POST /api/github/pulls/:number/comments
 * Body: { body: string }
 */
router.post('/pulls/:number/comments', async (req, res) => {
    try {
        const { body } = req.body;
        const prNumber = parseInt(req.params.number, 10);
        if (isNaN(prNumber)) {
            return res.status(400).json({ error: 'Invalid PR number' });
        }
        if (!body) {
            return res.status(400).json({ error: 'body is required' });
        }
        const result = await github.postPRComment(prNumber, body);
        res.json(result);
    } catch (err) {
        console.error('Post PR comment error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Get PR comments
 * GET /api/github/pulls/:number/comments
 * Query: { since?: string }
 */
router.get('/pulls/:number/comments', async (req, res) => {
    try {
        const prNumber = parseInt(req.params.number, 10);
        if (isNaN(prNumber)) {
            return res.status(400).json({ error: 'Invalid PR number' });
        }
        const comments = await github.getPRComments(prNumber, req.query.since);
        res.json(comments);
    } catch (err) {
        console.error('Get PR comments error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Get PR status (checks, reviews, mergeable)
 * GET /api/github/pulls/:number/status
 */
router.get('/pulls/:number/status', async (req, res) => {
    try {
        const prNumber = parseInt(req.params.number, 10);
        if (isNaN(prNumber)) {
            return res.status(400).json({ error: 'Invalid PR number' });
        }
        const status = await github.getPRStatus(prNumber);
        res.json(status);
    } catch (err) {
        console.error('Get PR status error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Merge a PR
 * POST /api/github/pulls/:number/merge
 * Body: { mergeMethod?: 'merge' | 'squash' | 'rebase' }
 */
router.post('/pulls/:number/merge', async (req, res) => {
    try {
        const prNumber = parseInt(req.params.number, 10);
        if (isNaN(prNumber)) {
            return res.status(400).json({ error: 'Invalid PR number' });
        }
        const { mergeMethod } = req.body;
        const result = await github.mergePR(prNumber, mergeMethod);
        logAuditEvent({
            action: 'Update',
            entityType: 'PullRequest',
            entityId: prNumber.toString(),
            entityDescription: `Merge PR #${prNumber} (${mergeMethod || 'merge'})`,
            newValues: { prNumber, mergeMethod: mergeMethod || 'merge' },
            req,
            source: 'System',
        });
        res.json(result);
    } catch (err) {
        console.error('Merge PR error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
