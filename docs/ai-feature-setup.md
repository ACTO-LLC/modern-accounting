# AI Feature System - Setup Guide

This guide walks you through setting up the AI-Driven Feature Addition System from scratch.

## Prerequisites

Before starting, ensure you have:

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Git** - Configured with credentials for pushing to GitHub
- **SQL Server** - Local instance or Docker container
- **GitHub Account** - With access to the target repository
- **Anthropic Account** - For Claude API access

## Step 1: Database Setup

### Option A: Docker (Recommended)

Start SQL Server using Docker:

```bash
docker run -d \
  --name sqlserver \
  -e "ACCEPT_EULA=Y" \
  -e "MSSQL_SA_PASSWORD=StrongPassword123" \
  -p 14330:1433 \
  mcr.microsoft.com/mssql/server:2022-latest
```

### Option B: Local SQL Server

Ensure your local SQL Server instance is running and accessible on the configured port.

### Create Database Tables

Run the migration script to create required tables:

```bash
cd csv-import-api
node run-sql.js ../database/migrations/020_Enhancements.sql
```

Or manually execute the SQL:

```sql
-- Create Enhancements table
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

CREATE INDEX IX_Enhancements_Status ON Enhancements(Status);
CREATE INDEX IX_Enhancements_CreatedAt ON Enhancements(CreatedAt);

-- Create Deployments table
CREATE TABLE Deployments (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    EnhancementId INT NOT NULL FOREIGN KEY REFERENCES Enhancements(Id),
    ScheduledDate DATETIME2 NOT NULL,
    Status VARCHAR(50) NOT NULL DEFAULT 'pending',
    DeployedAt DATETIME2 NULL,
    Notes NVARCHAR(MAX) NULL
);

CREATE INDEX IX_Deployments_Status ON Deployments(Status);
CREATE INDEX IX_Deployments_ScheduledDate ON Deployments(ScheduledDate);
```

## Step 2: GitHub Setup

### Create Personal Access Token

1. Go to GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "AI Feature System")
4. Select scopes:
   - `repo` - Full control of private repositories
   - `workflow` - Update GitHub Action workflows (if using CI)
5. Click "Generate token"
6. Copy the token (you won't see it again!)

### Configure Repository

1. Ensure the target repository exists
2. Set up branch protection rules (optional but recommended):
   - Go to Settings > Branches > Add rule
   - Branch name pattern: `main`
   - Enable "Require pull request reviews before merging"

## Step 3: Anthropic API Setup

### Get API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (starts with `sk-ant-`)

## Step 4: Configure Environment

### Create Environment File

Create a `.env` file in the `monitor-agent` directory:

```bash
cd monitor-agent
cp .env.example .env  # If example exists, or create new
```

Edit `.env` with your values:

```env
# ===================
# Required Settings
# ===================

# Anthropic Claude API
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# GitHub
GITHUB_TOKEN=ghp_your-token-here
GITHUB_OWNER=your-org-or-username
GITHUB_REPO=modern-accounting
GITHUB_BASE_BRANCH=main

# Database
DB_SERVER=localhost
DB_PORT=14330
DB_NAME=AccountingDB
DB_USER=sa
DB_PASSWORD=StrongPassword123

# ===================
# Optional Settings
# ===================

# Git Configuration
GIT_REPO_PATH=C:/source/modern-accounting
GIT_AUTHOR_NAME=Monitor Agent
GIT_AUTHOR_EMAIL=agent@modern-accounting.local

# Email Notifications
ENABLE_EMAIL_NOTIFICATIONS=false
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@modern-accounting.local

# Slack Notifications
ENABLE_SLACK_NOTIFICATIONS=false
SLACK_WEBHOOK_URL=

# Agent Settings
POLL_INTERVAL_MS=300000
MAX_CONCURRENT_JOBS=1
DRY_RUN=false

# Claude Settings
CLAUDE_MODEL=claude-sonnet-4-20250514
CLAUDE_MAX_TOKENS=4096
```

## Step 5: Install Dependencies

### Monitor Agent

```bash
cd monitor-agent
npm install
```

### Chat API (if not already installed)

```bash
cd chat-api
npm install
```

## Step 6: Verify Configuration

### Test Database Connection

```bash
cd monitor-agent
npx tsx -e "
import sql from 'mssql';
const config = {
  server: 'localhost',
  port: 14330,
  database: 'AccountingDB',
  user: 'sa',
  password: 'StrongPassword123',
  options: { trustServerCertificate: true }
};
sql.connect(config).then(() => {
  console.log('Database connection successful!');
  process.exit(0);
}).catch(err => {
  console.error('Database connection failed:', err.message);
  process.exit(1);
});
"
```

### Test GitHub Connection

```bash
curl -H "Authorization: token YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/YOUR_OWNER/YOUR_REPO
```

You should see repository information in the response.

### Test Claude API

```bash
cd monitor-agent
npx tsx -e "
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 100,
  messages: [{ role: 'user', content: 'Say hello' }]
}).then(r => {
  console.log('Claude API working:', r.content[0].text);
  process.exit(0);
}).catch(err => {
  console.error('Claude API failed:', err.message);
  process.exit(1);
});
"
```

## Step 7: First Run

### Start in Dry Run Mode

For your first run, enable dry run mode to verify the system works without making actual changes:

```bash
# Set in .env
DRY_RUN=true
```

### Start the Monitor Agent

```bash
cd monitor-agent
npm run dev
```

You should see output like:

```
[2026-01-15T10:00:00.000Z] Monitor Agent starting...
[2026-01-15T10:00:00.001Z] Configuration validated successfully
[2026-01-15T10:00:00.002Z] Poll interval: 300s
[2026-01-15T10:00:00.003Z] Max concurrent jobs: 1
[2026-01-15T10:00:00.004Z] Dry run mode: true
[2026-01-15T10:00:00.100Z] Database connection established
[2026-01-15T10:00:00.150Z] No pending enhancements found
[2026-01-15T10:00:00.151Z] Sleeping for 300s...
```

### Create a Test Enhancement

Insert a test enhancement directly into the database:

```sql
INSERT INTO Enhancements (RequestorName, Description, Status)
VALUES ('test@example.com', 'Test enhancement: Add a comment to README', 'pending');
```

Or use the API:

```bash
curl -X POST http://localhost:3001/api/enhancements \
  -H "Content-Type: application/json" \
  -d '{
    "requestorName": "test@example.com",
    "description": "Test enhancement: Add a comment to README"
  }'
```

### Verify Processing

Watch the monitor agent logs. In dry run mode, you should see:

```
[...] Found 1 pending enhancement(s)
[...] Claimed enhancement #1
[...] Processing enhancement #1: Test enhancement...
[...] [#1] Starting planning phase...
[...] [#1] Generated plan with X tasks
[...] [#1] DRY RUN - Skipping implementation
```

## Step 8: Production Configuration

Once testing is complete, configure for production:

### Disable Dry Run

```env
DRY_RUN=false
```

### Configure Notifications

For email notifications:

```env
ENABLE_EMAIL_NOTIFICATIONS=true
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-email-password
SMTP_FROM=ai-features@your-domain.com
```

For Slack notifications:

```env
ENABLE_SLACK_NOTIFICATIONS=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Adjust Polling Interval

For more responsive processing:

```env
POLL_INTERVAL_MS=60000  # 1 minute
```

### Build for Production

```bash
cd monitor-agent
npm run build
```

### Start Production Service

```bash
npm start
```

## Step 9: Set Up Scheduler

The scheduler handles automatic deployments of approved PRs.

### Manual Run

```bash
npm run scheduler
```

### Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Name: "AI Feature Scheduler"
4. Trigger: Daily, repeat every 15 minutes
5. Action: Start a program
   - Program: `node`
   - Arguments: `dist/run-scheduler.js`
   - Start in: `C:\path\to\monitor-agent`

### Linux Cron

Add to crontab:

```bash
*/15 * * * * cd /path/to/monitor-agent && /usr/bin/node dist/run-scheduler.js >> /var/log/ai-scheduler.log 2>&1
```

## Step 10: Monitoring

### Log Files

Monitor agent logs to stdout. Redirect to a file in production:

```bash
npm start >> /var/log/monitor-agent.log 2>&1
```

### Health Checks

Query the database for system health:

```sql
-- Check for stuck enhancements
SELECT * FROM Enhancements
WHERE Status IN ('processing', 'planning', 'implementing', 'reviewing')
AND UpdatedAt < DATEADD(HOUR, -1, GETUTCDATE());

-- Check deployment queue
SELECT * FROM Deployments
WHERE Status = 'pending'
ORDER BY ScheduledDate;

-- Recent failures
SELECT * FROM Enhancements
WHERE Status = 'failed'
ORDER BY UpdatedAt DESC;
```

## Troubleshooting

### Agent Not Starting

**Error:** `ANTHROPIC_API_KEY is required`

**Solution:** Ensure `.env` file exists and contains valid API key.

---

**Error:** `Database connection failed`

**Solution:**
1. Verify SQL Server is running
2. Check port and credentials
3. Ensure database exists

---

### Enhancement Stuck in Processing

**Cause:** Agent crashed during processing

**Solution:**
1. Check logs for errors
2. Reset enhancement status:
   ```sql
   UPDATE Enhancements
   SET Status = 'pending', Notes = 'Reset after failure'
   WHERE Id = X;
   ```

---

### GitHub Push Fails

**Error:** `Authentication failed`

**Solution:**
1. Verify token hasn't expired
2. Check token has `repo` scope
3. Ensure token owner has push access

---

### Copilot Review Times Out

**Note:** This is expected behavior. The system automatically falls back to Claude review.

**Solution:** No action needed - feature continues processing.

## Next Steps

- Review [AI Feature System Overview](./ai-feature-system.md)
- Check [API Reference](./api-reference.md) for endpoint details
- Set up branch protection rules on GitHub
- Configure CI/CD pipeline for the repository
