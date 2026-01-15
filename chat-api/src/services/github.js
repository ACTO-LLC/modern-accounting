// GitHub service for PR operations
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const OWNER = process.env.GITHUB_OWNER || 'ehalsey';
const REPO = process.env.GITHUB_REPO || 'modern-accounting';

/**
 * Create a new branch from base
 * @param {string} branchName - Name of the new branch
 * @param {string} baseBranch - Base branch to create from (default: 'main')
 * @returns {Promise<{branchName: string, sha: string}>}
 */
export async function createBranch(branchName, baseBranch = 'main') {
    const { data: ref } = await octokit.git.getRef({
        owner: OWNER,
        repo: REPO,
        ref: `heads/${baseBranch}`
    });
    await octokit.git.createRef({
        owner: OWNER,
        repo: REPO,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha
    });
    return { branchName, sha: ref.object.sha };
}

/**
 * Create or update a file in a branch
 * @param {string} branch - Branch to commit to
 * @param {string} path - File path in the repository
 * @param {string} content - File content
 * @param {string} message - Commit message
 */
export async function commitFile(branch, path, content, message) {
    // Get current file SHA if exists
    let sha;
    try {
        const { data } = await octokit.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path,
            ref: branch
        });
        sha = data.sha;
    } catch (e) {
        // File doesn't exist, that's fine
    }

    await octokit.repos.createOrUpdateFileContents({
        owner: OWNER,
        repo: REPO,
        path,
        branch,
        message,
        content: Buffer.from(content).toString('base64'),
        sha
    });
}

/**
 * Create a pull request
 * @param {string} head - Head branch
 * @param {string} base - Base branch
 * @param {string} title - PR title
 * @param {string} body - PR body
 * @returns {Promise<{number: number, url: string}>}
 */
export async function createPR(head, base, title, body) {
    const { data } = await octokit.pulls.create({
        owner: OWNER,
        repo: REPO,
        head,
        base,
        title,
        body
    });
    return { number: data.number, url: data.html_url };
}

/**
 * Post a comment on a PR (for @github-copilot mentions)
 * @param {number} prNumber - PR number
 * @param {string} body - Comment body
 * @returns {Promise<{id: number}>}
 */
export async function postPRComment(prNumber, body) {
    const { data } = await octokit.issues.createComment({
        owner: OWNER,
        repo: REPO,
        issue_number: prNumber,
        body
    });
    return { id: data.id };
}

/**
 * Get PR comments (for polling Copilot responses)
 * @param {number} prNumber - PR number
 * @param {string|null} since - ISO 8601 timestamp to filter comments
 * @returns {Promise<Array>}
 */
export async function getPRComments(prNumber, since = null) {
    const params = {
        owner: OWNER,
        repo: REPO,
        issue_number: prNumber
    };
    if (since) params.since = since;
    const { data } = await octokit.issues.listComments(params);
    return data;
}

/**
 * Merge a PR
 * @param {number} prNumber - PR number
 * @param {string} mergeMethod - Merge method ('merge', 'squash', 'rebase')
 * @returns {Promise<{merged: boolean}>}
 */
export async function mergePR(prNumber, mergeMethod = 'merge') {
    await octokit.pulls.merge({
        owner: OWNER,
        repo: REPO,
        pull_number: prNumber,
        merge_method: mergeMethod
    });
    return { merged: true };
}

/**
 * Get PR status (checks, reviews)
 * @param {number} prNumber - PR number
 * @returns {Promise<{state: string, mergeable: boolean|null, reviews: Array, checks: Array}>}
 */
export async function getPRStatus(prNumber) {
    const [pr, reviews, checks] = await Promise.all([
        octokit.pulls.get({
            owner: OWNER,
            repo: REPO,
            pull_number: prNumber
        }),
        octokit.pulls.listReviews({
            owner: OWNER,
            repo: REPO,
            pull_number: prNumber
        }),
        octokit.checks.listForRef({
            owner: OWNER,
            repo: REPO,
            ref: `pull/${prNumber}/head`
        })
    ]);
    return {
        state: pr.data.state,
        mergeable: pr.data.mergeable,
        reviews: reviews.data.map(r => ({
            user: r.user.login,
            state: r.state
        })),
        checks: checks.data.check_runs.map(c => ({
            name: c.name,
            status: c.status,
            conclusion: c.conclusion
        }))
    };
}

export default {
    createBranch,
    commitFile,
    createPR,
    postPRComment,
    getPRComments,
    mergePR,
    getPRStatus
};
