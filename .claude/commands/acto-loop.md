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
   - Check if worktree exists, if not suggest creating one
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
- Add comment to PR: `@Copilot please review this pull request`
- Wait briefly, then check for Copilot's response
- Parse any suggestions from Copilot's review

#### Step 2: Implement Suggestions
For each Copilot suggestion:
- Evaluate if it's valid and improves the code
- Implement the change
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
- Requesting Copilot review...
- Copilot suggests: Add error handling for edge case
- Implementing suggestion...
- Independent review: Code follows CLAUDE.md patterns ✅
- Final tests: Build ✅, Tests ✅

<acto-complete>PR #155 ready for merge: https://github.com/ACTO-LLC/modern-accounting/pull/155</acto-complete>
```

## Start Now

Begin Phase 1 with arguments: $ARGUMENTS
