# ACTO Batch - Concurrent Issue Resolution

You are an orchestrator that selects and processes multiple GitHub issues concurrently using `/acto-loop`.

## Input Arguments
$ARGUMENTS may contain:
- `--count <n>` - Number of issues to work on (default: 3, max: 5)
- `--labels <label1,label2>` - Filter by labels (e.g., "bug,good-first-issue")
- `--exclude-labels <label>` - Exclude issues with these labels (default: "blocked,wontfix")
- `--dry-run` - Show selected issues without executing

## Your Mission

Select low-conflict issues and process them concurrently.

### Phase 1: Fetch Open Issues

```bash
gh issue list --state open --json number,title,labels,body --limit 20
```

Filter out:
- Issues with "blocked" or "wontfix" labels
- Issues already assigned to someone
- Issues with open PRs (check with `gh pr list --search "issue:N"`)

### Phase 2: Analyze for Conflicts

For each candidate issue, determine which areas of the codebase it likely touches:

| Area | Patterns to Look For |
|------|---------------------|
| **Frontend Components** | mentions specific pages, components, UI |
| **API/Backend** | mentions endpoints, DAB, database |
| **Database** | mentions migrations, schema, tables |
| **Tests** | mentions Playwright, testing, e2e |
| **Config/Build** | mentions webpack, vite, config |
| **Docs** | mentions documentation, README |

**Conflict Rules:**
- Two issues touching the SAME component = HIGH conflict
- Two issues in same area (e.g., both frontend) = MEDIUM conflict
- Two issues in different areas = LOW conflict
- Issues touching shared files (App.tsx, routes, etc.) = HIGH conflict

### Phase 3: Select Issues

Score and select issues:

1. **Prioritize by conflict potential:**
   - Prefer issues in DIFFERENT areas
   - Avoid selecting two issues that modify the same files

2. **Prioritize by complexity:**
   - Prefer issues labeled "good-first-issue" or similar
   - Avoid issues with extensive discussion (may be complex)

3. **Select N issues** (from --count) that minimize conflict probability

Output selection:
```
Selected Issues for Batch Processing:
=====================================
#142 - [Frontend/Estimates] Fix convert button
#117 - [Tests] Add payroll E2E tests
#139 - [Frontend/Dashboard] Fix layout issue

Conflict Analysis:
- #142 vs #117: LOW (different areas)
- #142 vs #139: LOW (different components)
- #117 vs #139: LOW (different areas)

Proceed? [Y/n]
```

### Phase 4: Setup Worktrees

For each selected issue, create a worktree if it doesn't exist:

```bash
# Check existing worktrees
git worktree list

# Create new worktrees as needed
git worktree add ../modern-accounting-{issue} -b {fix|feat}/{issue}-{slug} main
```

### Phase 5: Launch Concurrent Loops

For each issue, output instructions for parallel execution:

```
Launching ACTO Loops...
=======================

Terminal 1:
  cd C:/source/modern-accounting-142
  claude "/acto-loop --issue 142"

Terminal 2:
  cd C:/source/modern-accounting-117
  claude "/acto-loop --issue 117"

Terminal 3:
  cd C:/source/modern-accounting-139
  claude "/acto-loop --issue 139"

Monitor progress with: /acto-status
```

**Important:** Claude Code runs in a single process, so true parallelism requires multiple terminal sessions. Output the commands for the user to run.

### Phase 6: Summary

After outputting launch instructions:

```
<acto-batch-started>
Issues: #142, #117, #139
Worktrees: modern-accounting-142, modern-accounting-117, modern-accounting-139
Status: Ready for parallel execution
</acto-batch-started>
```

## Conflict Detection Heuristics

### High-Risk Shared Files
These files are modified by many features - avoid concurrent edits:
- `App.tsx`, `main.tsx` - App entry points
- `routes.tsx` or router config
- `package.json`, `tsconfig.json`
- `CLAUDE.md`
- Database migration files
- Shared components (`Layout.tsx`, `Sidebar.tsx`, etc.)

### Area Detection Keywords

| Area | Keywords in Issue |
|------|-------------------|
| Frontend | page, component, button, form, modal, UI, display, render |
| API | endpoint, API, route, handler, request, response |
| Database | table, column, migration, schema, SQL, DAB |
| Auth | login, authentication, permission, role, Azure AD |
| Tests | test, playwright, e2e, spec, coverage |
| Payroll | employee, payrun, payroll, salary, tax |
| Invoices | invoice, estimate, billing, customer |
| Reports | report, dashboard, chart, analytics |

## Example Execution

```
> /acto-batch --count 3

Fetching open issues...
Found 12 open issues

Analyzing conflict potential...

Selected Issues for Batch Processing:
=====================================
#142 - [Estimates] Fix convert button not working
       Area: Frontend/Estimates

#117 - [Tests] Add E2E tests for payroll module
       Area: Tests/Payroll

#145 - [Reports] Add profit/loss report
       Area: Frontend/Reports

Conflict Analysis:
- #142 vs #117: LOW ✅ (Estimates vs Tests)
- #142 vs #145: LOW ✅ (Estimates vs Reports)
- #117 vs #145: LOW ✅ (Tests vs Reports)

Creating worktrees...
✓ modern-accounting-142 (exists)
✓ modern-accounting-117 (exists)
✓ modern-accounting-145 (created)

Launch Commands:
================
# Run these in separate terminals:

Terminal 1:
  cd C:/source/modern-accounting-142 && claude
  /acto-loop --issue 142

Terminal 2:
  cd C:/source/modern-accounting-117 && claude
  /acto-loop --issue 117

Terminal 3:
  cd C:/source/modern-accounting-145 && claude
  /acto-loop --issue 145

<acto-batch-started>
Issues: #142, #117, #145
Worktrees: modern-accounting-142, modern-accounting-117, modern-accounting-145
</acto-batch-started>
```

## Dry Run Mode

With `--dry-run`, show analysis but don't create worktrees:

```
> /acto-batch --count 3 --dry-run

[DRY RUN - No changes will be made]

Would select:
- #142 - Fix convert button (Frontend/Estimates)
- #117 - Add payroll tests (Tests)
- #145 - Add P&L report (Frontend/Reports)

Would create worktrees:
- modern-accounting-145 (new)
```

## Start Now

Begin Phase 1 with arguments: $ARGUMENTS
