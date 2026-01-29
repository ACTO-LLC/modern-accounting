# ACTO Loop - Autonomous Issue Resolution

You are executing an autonomous development loop. Work iteratively until the task is complete or you hit an escape condition.

## Input Arguments
$ARGUMENTS will contain:
- `--issue <number>` - GitHub issue number to resolve
- `--prompt "<text>"` - Or a direct prompt if no issue
- `--stuck-timeout <minutes>` - Max time on same error (default: 5)
- `--max-attempts <n>` - Max attempts at same error (default: 3)
- `--max-iterations <n>` - Hard cap on iterations (default: 20)

## Your Mission

Execute an iterative development loop to resolve the issue or complete the task.

### Phase 1: Setup
1. Parse arguments from: $ARGUMENTS
2. If `--issue` provided:
   - Fetch issue details: `gh issue view <number> --json title,body,labels`
   - Determine if it's a bug (`fix/`) or feature (`feat/`)
   - **CRITICAL: Check for uncommitted changes with `git status --porcelain`**
     - If uncommitted changes exist, you MUST either:
       a) Create a git worktree for the issue work: `git worktree add ../modern-accounting-issue-<number> -b feat/<number>-<short-name>`
       b) Or ask the user to commit/stash their changes first
     - This prevents losing work when switching branches
   - If clean, create the branch normally in the current worktree
3. Initialize tracking state mentally:
   - Current iteration: 1
   - Start time: now
   - Error history: empty
   - Approaches tried: empty

### Phase 2: Iteration Loop

For each iteration:

#### Step 1: Assess
- What is the current state?
- What errors exist (build, tests)?
- Have we seen this error before?

#### Step 2: Check Escape Conditions
**EXIT if ANY are true:**
- Total iterations >= max-iterations
- Same error signature seen >= max-attempts times
- Time spent on same error >= stuck-timeout

**On escape:**
- Output summary of what was tried
- Output: `<acto-escape reason="...">Approaches tried: ...</acto-escape>`
- Do NOT continue

#### Step 3: Act
- If new error or first attempt: investigate and fix
- If repeat error: try a DIFFERENT approach than before
- Document what approach you're trying

#### Step 4: Verify
- Run `npm run build` in client folder
- Run relevant tests: `VITE_BYPASS_AUTH=true npx playwright test <pattern>`
  - Note: Auth bypass is required for Playwright tests (see CLAUDE.md)
- Check results

#### Step 5: Evaluate
- **All pass?** → Go to Phase 3 (Complete)
- **New error?** → Reset error timer, continue to next iteration
- **Same error?** → Increment attempt counter, continue to next iteration

### Phase 3: Create PR

When all acceptance criteria pass:
1. Commit changes with descriptive message referencing issue
2. Push branch
3. Create PR with summary
4. Output: `<acto-pr-created>PR #N created: <url></acto-pr-created>`
5. Continue to Phase 4

### Phase 4: PR Review & Polish

After PR is created:

#### Step 1: Request Copilot Review
- Run: `gh pr comment <PR_NUMBER> --body "@copilot review"`
- Wait 30-60 seconds for Copilot to respond
- Check for response: `gh pr view <PR_NUMBER> --comments --json comments`

#### Step 2: Handle Copilot's Response
Copilot responds in one of two ways:

**Option A: Copilot creates a follow-up PR**
- Copilot comments: "I've opened a new pull request, #NNN, to work on those changes"
- Check the follow-up PR: `gh pr view <COPILOT_PR> --json title,body,additions,deletions,files`
- **CRITICAL: If `[WIP]` in title, Copilot is still working!**
  - NEVER close, merge, or take action on WIP PRs
  - Poll every 30-60 seconds: `gh pr view <COPILOT_PR> --json title`
  - Wait until `[WIP]` is removed from title before proceeding
- Once ready (no WIP in title):
  - Review the changes Copilot proposes
  - If changes are valid improvements (additions > 0):
    - Merge Copilot's PR first: `gh pr merge <COPILOT_PR> --squash --delete-branch`
    - Rebase your PR on main: `git fetch origin && git rebase origin/main`
    - Push updated branch: `git push --force-with-lease`
  - If changes are empty (0 additions/0 deletions): Copilot found no issues, close with thanks
  - If changes are problematic: Close Copilot's PR with explanation

**Option B: Copilot leaves inline comments**
- Review each comment and implement valid suggestions
- Track what was implemented

#### Step 3: Independent Review Check
- Verify code follows patterns in CLAUDE.md
- Check for common issues (null handling, type safety, etc.)
- Implement any additional improvements found

#### Step 4: Final Verification
- Re-run build: `npm run build`
- Re-run tests: `VITE_BYPASS_AUTH=true npx playwright test <pattern>`
- If failures: loop back to fix (but don't count against escape hatch)

#### Step 5: Complete
- Push final changes to PR
- Output: `<acto-complete>PR #N ready for merge: <url></acto-complete>`

## Error Signature Detection

Consider errors "the same" if they have:
- Same error code (TS2322, etc.)
- Same file and approximate line number
- Same general message pattern

## Approach Tracking

Keep mental note of approaches tried to avoid repetition:
- "Tried changing .optional() to .nullish()"
- "Tried updating import path"
- "Tried regenerating types"

When stuck on same error, explicitly try something DIFFERENT.

## Output Format

During execution, output progress markers:
```
[Iteration N]
- Assessing: <brief state>
- Action: <what you're doing>
- Result: <build/test outcome>
```

## Completion Criteria

ALL must pass before `<acto-complete>`:
- [ ] `npm run build` succeeds (no TypeScript errors)
- [ ] Relevant tests pass
- [ ] PR created and pushed
- [ ] Copilot review requested and suggestions implemented
- [ ] Final test pass after review changes

## Important Rules

1. **Don't fake completion** - Only output `<acto-complete>` when genuinely done
2. **Don't infinite loop** - Respect escape conditions strictly
3. **Try different approaches** - Don't repeat the same fix twice
4. **Check CLAUDE.md** - Look for known patterns before giving up
5. **Document learning** - If you discover something novel, suggest adding to CLAUDE.md
6. **Always do Phase 4** - PR review is not optional; it catches issues
7. **NEVER create a PR without passing build** - Run `npm run build` in client/ and verify it succeeds with zero errors before committing. TypeScript errors that reach main break CI for everyone.
8. **Database changes use sqlproj** - See "Database Schema Changes" section below
9. **NEVER close or merge WIP PRs** - If a Copilot PR has `[WIP]` in the title, it means Copilot is still working. Wait for the WIP to be removed before taking any action. Closing a WIP PR interrupts Copilot's work.
10. **Protect uncommitted changes** - Always check `git status --porcelain` before starting. If there are uncommitted changes, use a git worktree to isolate the issue work. Never do `git reset --hard` or `git checkout` that would discard user's work.

## Database Schema Changes

**CRITICAL:** Use the hybrid approach documented in CLAUDE.md.

### For NEW Tables/Views (use sqlproj):
1. Create SQL file: `database/dbo/Tables/NewTable.sql` or `database/dbo/Views/v_NewView.sql`
2. Add to `database/AccountingDB.sqlproj`:
   ```xml
   <Build Include="dbo\Tables\NewTable.sql" />
   ```
3. Update `dab-config.json` with new entity endpoints

### DO NOT create migration files for:
- CREATE TABLE
- CREATE VIEW
- ALTER TABLE ADD COLUMN
- CREATE INDEX
- Stored procedures, triggers, functions

### Only use migrations (`database/migrations/`) for:
- Seed data (INSERT statements)
- Data transforms (UPDATE existing data)
- One-time fixes
- Complex operations DACPAC can't handle

### Example - Adding a new entity:

```
# Files to create:
database/dbo/Tables/Vehicles.sql      # CREATE TABLE
database/dbo/Views/v_Vehicles.sql     # CREATE VIEW (if needed)

# Files to update:
database/AccountingDB.sqlproj         # Add <Build Include="..."/>
dab-config.json                       # Add entity endpoints

# DO NOT create:
database/migrations/034_AddVehicles.sql  # WRONG!
```

## References

- `docs/pr-review-template.md` - PR review process template
- `CLAUDE.md` - Project patterns and known issues

## Example Execution

```
[Iteration 1]
- Assessing: Build failing with TS2322 in EstimateForm.tsx
- Action: Investigating type mismatch, checking Zod schema
- Result: Build ❌ - same error

[Iteration 2]
- Assessing: Same TS2322, attempt 2/3
- Action: Trying different approach - checking if API returns null vs undefined
- Found: API returns null, schema uses .optional() which only allows undefined
- Action: Changing to .nullish()
- Result: Build ✅, Tests ❌ - 1 failing

[Iteration 3]
- Assessing: Test failing - modal not appearing
- Action: Checking onClick handler and modal state
- Result: Build ✅, Tests ✅

<acto-pr-created>PR #155 created: https://github.com/ACTO-LLC/modern-accounting/pull/155</acto-pr-created>

[Phase 4: PR Review]
- Requesting Copilot review: `gh pr comment 155 --body "@copilot review"`
- Waiting for response...
- Copilot responded: "I've opened a new pull request, #156, to work on those changes"
- Checking Copilot's PR: `gh pr view 156 --json title,body,additions,deletions`
- PR #156 has 3 additions, 1 deletion - standardizes error handling
- Changes look valid, merging Copilot's PR...
- Rebasing our branch on main...
- Independent review: Code follows CLAUDE.md patterns ✅
- Final tests: Build ✅, Tests ✅

<acto-complete>PR #155 ready for merge: https://github.com/ACTO-LLC/modern-accounting/pull/155</acto-complete>
```

## Start Now

Begin Phase 1 with arguments: $ARGUMENTS
