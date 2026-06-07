# AI-Driven Feature Addition System

## Overview

The AI Feature Addition System enables administrators to request feature changes through a chat interface. Requests are processed autonomously using Claude AI for planning and code generation, with GitHub Copilot for code review, and scheduled deployments for controlled releases.

This system was implemented as part of Issue #87 to automate the software development lifecycle for feature requests.

## Architecture

```
+----------------+     +------------------+     +----------------+
|   Chat UI      |     |   Chat API       |     |   Database     |
|   (React)      |---->|   (Express)      |---->|   (SQL Server) |
+----------------+     +------------------+     +----------------+
                              |                       ^
                              v                       |
                       +------------------+           |
                       |  Monitor Agent   |-----------+
                       |  (Node.js)       |
                       +------------------+
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
       +----------+    +----------+    +----------+
       | Claude   |    | GitHub   |    | Copilot  |
       | API      |    | API      |    | Review   |
       +----------+    +----------+    +----------+
                              |
                              v
                       +------------------+
                       |  Pull Request    |
                       +------------------+
                              |
                              v
                       +------------------+
                       |  Scheduler       |
                       |  (Auto-merge)    |
                       +------------------+
```

## Components

### 1. Enhancement Queue (Database)

The enhancement queue stores all feature requests and their current status.

**Tables:**

- **`Enhancements`** - Main queue table
  - `Id` - Unique identifier
  - `RequestorName` - Who requested the feature
  - `Description` - Feature description
  - `Status` - Current status (pending, in-progress, deployed, reverted, failed)
  - `BranchName` - Git branch created for the feature
  - `PrNumber` - GitHub PR number
  - `Notes` - Additional notes

- **`Deployments`** - Scheduled deployment records
  - `Id` - Unique identifier
  - `EnhancementId` - Link to enhancement
  - `ScheduledDate` - When to deploy
  - `Status` - Deployment status (pending, in-progress, deployed, failed)
  - `DeployedAt` - Actual deployment timestamp
  - `Notes` - Deployment notes

**Status Flow:**

```
pending -> processing -> planning -> implementing -> reviewing ->
copilot_reviewing -> pr_created -> completed/failed
```

For deployments:
```
pending -> in-progress -> deployed/failed
```

### 2. Chat API Endpoints

The Chat API provides REST endpoints for managing enhancements and deployments.

**Enhancement Endpoints:**
- `POST /api/enhancements` - Submit new enhancement request
- `GET /api/enhancements/:id` - Get enhancement status
- `PATCH /api/enhancements/:id` - Update enhancement
- `GET /api/enhancements` - List all enhancements

**Deployment Endpoints:**
- `POST /api/deployments` - Schedule a deployment
- `GET /api/deployments/pending` - List pending deployments
- `GET /api/deployments/:id` - Get deployment details
- `PATCH /api/deployments/:id` - Update/reschedule deployment
- `DELETE /api/deployments/:id` - Cancel pending deployment

**GitHub Integration Endpoints:**
- `POST /api/github/branches` - Create a new branch
- `POST /api/github/commits` - Commit files to branch
- `POST /api/github/pulls` - Create pull request
- `POST /api/github/pulls/:number/comments` - Post PR comment
- `GET /api/github/pulls/:number/comments` - Get PR comments
- `GET /api/github/pulls/:number/status` - Get PR status
- `POST /api/github/pulls/:number/merge` - Merge PR

### 3. Monitor Agent Service

The Monitor Agent is a standalone Node.js service that polls the database for pending enhancements and processes them automatically.

**Key Modules:**

| Module | Purpose |
|--------|---------|
| `index.ts` | Main entry point and polling loop |
| `config.ts` | Configuration management |
| `db.ts` | Database operations |
| `claude.ts` | Claude AI integration |
| `github.ts` | GitHub API operations |
| `copilot.ts` | Copilot review automation |
| `git.ts` | Local git operations |
| `scheduler.ts` | Deployment scheduling |
| `notifications.ts` | Email/Slack notifications |

**Processing Pipeline:**

1. Poll for pending enhancements
2. Claim enhancement (atomic operation)
3. Generate implementation plan using Claude
4. Create feature branch
5. Generate code using Claude
6. Apply code changes to files
7. Internal code review using Claude
8. Commit and push changes
9. Create pull request
10. Request Copilot review
11. Update enhancement status

### 4. GitHub Integration

Uses Octokit for all GitHub operations:

- **Branch Management:** Create feature branches from base
- **Commits:** Push generated code changes
- **Pull Requests:** Create PRs with AI-generated descriptions
- **Labels:** Auto-apply `ai-generated` and `enhancement` labels
- **Comments:** Post plan summaries and review results
- **Reviews:** Track review status and approvals
- **Merging:** Squash merge approved PRs

### 5. Copilot Review Integration

The system automatically requests GitHub Copilot to review generated code:

1. Posts `@github-copilot` mention on the PR
2. Polls for Copilot's response (up to 10 minutes)
3. Parses response for approval/suggestions
4. If suggestions found, attempts to auto-apply using Claude
5. Falls back to Claude review if Copilot doesn't respond

### 6. Deployment Scheduler

The scheduler handles automated deployments of approved PRs:

1. Queries for deployments where `ScheduledDate <= NOW`
2. Validates PR is still mergeable
3. Checks all CI checks have passed
4. Performs squash merge
5. Sends notification to requestor
6. Updates deployment status

## Workflow

The complete workflow from request to deployment:

```
1. User submits enhancement request via chat
   └─> Stored in Enhancements table (status: pending)

2. Monitor Agent polls database
   └─> Finds pending enhancement

3. Agent claims enhancement (atomic update)
   └─> Status: processing

4. Claude generates implementation plan
   └─> Status: planning
   └─> Plan stored in plan_json field

5. Agent creates feature branch
   └─> Branch name stored in BranchName field

6. Claude generates code for each task
   └─> Status: implementing
   └─> Files created/modified locally

7. Agent performs internal review
   └─> Status: reviewing

8. Agent commits and pushes changes
   └─> Commit hash recorded

9. Agent creates pull request
   └─> PR number stored in PrNumber field

10. Copilot review requested
    └─> Status: copilot_reviewing
    └─> Fallback to Claude if timeout

11. Enhancement complete
    └─> Status: pr_created
    └─> Notification sent to requestor

12. Admin schedules deployment
    └─> Deployment record created

13. Scheduler runs at scheduled time
    └─> Merges PR if all checks pass
    └─> Status: deployed
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API key for AI operations | Yes | - |
| `GITHUB_TOKEN` | GitHub personal access token with repo scope | Yes | - |
| `GITHUB_OWNER` | Repository owner (user or org) | Yes | - |
| `GITHUB_REPO` | Repository name | Yes | - |
| `GITHUB_BASE_BRANCH` | Base branch for PRs | No | `main` |
| `DB_SERVER` | SQL Server hostname | No | `localhost` |
| `DB_PORT` | SQL Server port | No | `14330` |
| `DB_NAME` | Database name | No | `AccountingDB` |
| `DB_USER` | Database user | No | `sa` |
| `DB_PASSWORD` | Database password | Yes | - |
| `DB_TRUST_CERT` | Trust server certificate | No | `true` |
| `GIT_REPO_PATH` | Local repository path | No | Current directory |
| `GIT_AUTHOR_NAME` | Git commit author name | No | `Monitor Agent` |
| `GIT_AUTHOR_EMAIL` | Git commit author email | No | `agent@modern-accounting.local` |
| `SMTP_HOST` | Email server hostname | No | `localhost` |
| `SMTP_PORT` | Email server port | No | `587` |
| `SMTP_SECURE` | Use TLS for email | No | `false` |
| `SMTP_USER` | Email server username | No | - |
| `SMTP_PASSWORD` | Email server password | No | - |
| `SMTP_FROM` | Email sender address | No | `noreply@modern-accounting.local` |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook URL | No | - |
| `POLL_INTERVAL_MS` | Polling interval in ms | No | `300000` (5 min) |
| `MAX_CONCURRENT_JOBS` | Max parallel enhancements | No | `1` |
| `ENABLE_EMAIL_NOTIFICATIONS` | Enable email notifications | No | `false` |
| `ENABLE_SLACK_NOTIFICATIONS` | Enable Slack notifications | No | `false` |
| `DRY_RUN` | Skip actual code changes | No | `false` |
| `CLAUDE_MODEL` | Claude model to use | No | `claude-sonnet-4-20250514` |
| `CLAUDE_MAX_TOKENS` | Max tokens for Claude responses | No | `4096` |

### Example .env File

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
GITHUB_OWNER=your-org
GITHUB_REPO=modern-accounting
DB_PASSWORD=StrongPassword123!

# Optional - Notifications
ENABLE_EMAIL_NOTIFICATIONS=true
SMTP_HOST=smtp.example.com
SMTP_USER=notifications@example.com
SMTP_PASSWORD=email-password

ENABLE_SLACK_NOTIFICATIONS=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Optional - Tuning
POLL_INTERVAL_MS=60000
DRY_RUN=false
```

## Running the System

### Prerequisites

- Node.js 18+
- SQL Server (local or Docker)
- Git configured with credentials
- GitHub token with repo access
- Anthropic API key

### Start Monitor Agent

```bash
cd monitor-agent
npm install
npm run dev
```

For production:

```bash
npm run build
npm start
```

### Run Scheduler (One-time)

```bash
npm run scheduler
```

### Schedule via Windows Task Scheduler

Create a scheduled task to run the scheduler periodically:

```powershell
# Create a task that runs every 15 minutes
$action = New-ScheduledTaskAction -Execute "npm" -Argument "run scheduler" -WorkingDirectory "C:\path\to\monitor-agent"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)
Register-ScheduledTask -TaskName "AI Feature Scheduler" -Action $action -Trigger $trigger
```

### Docker Deployment

```bash
cd monitor-agent
docker build -t monitor-agent .
docker run -d --env-file .env monitor-agent
```

## Troubleshooting

### Common Issues

#### 1. Copilot Not Responding

**Symptoms:** Enhancement stuck in `copilot_reviewing` status, times out after 10 minutes.

**Causes:**
- Copilot not enabled for repository
- Rate limiting
- Network issues

**Solutions:**
- The system automatically falls back to Claude review
- Check GitHub Copilot settings for the repository
- Review the logs for specific error messages

#### 2. PR Merge Conflicts

**Symptoms:** Deployment fails with "merge conflicts" error.

**Causes:**
- Base branch has changed since PR was created
- Multiple enhancements touching same files

**Solutions:**
- Manually resolve conflicts in the PR
- Reschedule the deployment after resolution
- Consider reducing concurrent enhancements

#### 3. Deployment Failures

**Symptoms:** Deployment status shows `failed`.

**Causes:**
- CI checks failing
- PR not approved
- Branch protection rules

**Solutions:**
- Check the `Notes` field for specific error
- Review CI check results on GitHub
- Ensure required approvals are in place

#### 4. Claude API Errors

**Symptoms:** Enhancement fails during planning or implementation.

**Causes:**
- Invalid API key
- Rate limiting
- Model unavailable

**Solutions:**
- Verify `ANTHROPIC_API_KEY` is correct
- Check Anthropic API status
- Review error message in `error_message` field

#### 5. Git Authentication Issues

**Symptoms:** Push to remote fails.

**Causes:**
- Invalid GitHub token
- Token lacks required permissions
- Repository access issues

**Solutions:**
- Verify `GITHUB_TOKEN` has `repo` scope
- Check token hasn't expired
- Ensure token owner has push access

## Security Considerations

### API Key Management

- Store all API keys in environment variables, never in code
- Use `.env` files that are git-ignored
- Rotate keys periodically
- Use least-privilege tokens where possible

### Code Review

- All generated code goes through Copilot/Claude review
- PRs require human approval before deployment (configurable)
- Branch protection rules should require reviews

### PII and Sensitive Data

- The system logs minimal information
- Enhancement descriptions may contain user information
- Consider scrubbing logs in production

### Network Security

- Use HTTPS for all API communications
- Database connections should be encrypted
- Consider network isolation for production deployments

## Database Schema

### Enhancements Table

```sql
CREATE TABLE Enhancements (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    RequestorName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    Status VARCHAR(50) NOT NULL DEFAULT 'pending',
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NULL,
    BranchName VARCHAR(100) NULL,
    PrNumber INT NULL,
    Notes NVARCHAR(MAX) NULL
);
```

### Deployments Table

```sql
CREATE TABLE Deployments (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    EnhancementId INT NOT NULL FOREIGN KEY REFERENCES Enhancements(Id),
    ScheduledDate DATETIME2 NOT NULL,
    Status VARCHAR(50) NOT NULL DEFAULT 'pending',
    DeployedAt DATETIME2 NULL,
    Notes NVARCHAR(MAX) NULL
);
```

## Related Documentation

- [API Reference](./api-reference.md) - Detailed endpoint documentation
- [Setup Guide](./ai-feature-setup.md) - Step-by-step installation
- [Chat Enhancements](./chat-enhancements.md) - Chat interface documentation
