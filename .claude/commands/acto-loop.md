# ACTO Loop - Autonomous Issue Resolution

You are the **orchestrator** of an autonomous development loop. You do NOT investigate or edit code yourself — you delegate the entire iteration loop to a **subagent running in an isolated git worktree**, then drive Phase 4 (PR review polish) from the orchestrator context.

## Why a subagent + worktree?

- **Isolation:** each issue fix happens in its own git worktree so parallel fixes don't interfere and uncommitted changes in the main checkout are never touched.
- **Context hygiene:** the orchestrator never sees raw exploration output (file reads, greps, long build logs) — only the subagent's summary. This keeps the loop controller focused and cheap.
- **Clean reset on failure:** a worktree with no changes is auto-cleaned; a worktree with changes preserves the branch and path so you can resume or hand off.

## Input Arguments
$ARGUMENTS will contain:
- `--issue <number>` - GitHub issue number to resolve
- `--prompt "<text>"` - Or a direct prompt if no issue
- `--stuck-timeout <minutes>` - Max time on same error (default: 5)
- `--max-attempts <n>` - Max attempts at same error (default: 3)
- `--max-iterations <n>` - Hard cap on iterations (default: 20)
- `--no-worktree` - Skip `isolation: "worktree"` on the subagent. Use ONLY when the caller has already placed this Claude session inside an isolated worktree (e.g. `/acto-batch` launches `/acto-loop` from a pre-created worktree). Still delegates to a subagent for context hygiene.

## Your Mission

Resolve the issue by delegating implementation to a subagent, then polish the resulting PR.

---

### Phase 1: Orchestrator setup (you)

1. Parse arguments from: $ARGUMENTS
2. If `--issue` provided, fetch a short summary so your delegation prompt is accurate:
   ```bash
   gh issue view <number> --json title,body,labels
   ```
3. Decide the branch name. Pick `fix/` for bugs or `feat/` for features, plus a short kebab-case slug derived from the issue title. Example: issue #155 titled "Estimate form breaks on null address" → `fix/155-estimate-null-address`. **You must interpolate the concrete branch name into the subagent prompt below** — do not leave `<prefix>/<N>-<short-slug>` as a placeholder for the subagent to re-derive, or orchestrator and subagent can diverge.
4. **Do NOT** run `git status`, create branches, or edit files in the main checkout. The subagent handles all git/filesystem work inside its worktree.

---

### Phase 2: Delegate the iteration loop to a subagent (you → Agent tool)

Launch **one** `Agent` call with `subagent_type: "general-purpose"`, passing the concrete branch name you chose in Phase 1. Use `isolation: "worktree"` **unless `--no-worktree` was passed** (which means the caller has already put you in an isolated worktree — e.g. `/acto-batch`). The subagent owns Phase 1 setup (branch creation + worktree env bootstrap), Phase 2 iteration, and Phase 3 PR creation. The orchestrator waits for its summary and does nothing else during this phase.

**Template for the Agent call** (substitute `<N>`, `<branch-name>`, `<title>`, `<body>`, `<max-iterations>`, `<max-attempts>`, `<stuck-timeout>` with the values you computed in Phase 1; remove the `isolation` field if `--no-worktree`):

```
Agent({
  description: "Resolve issue #<N>",
  subagent_type: "general-purpose",
  isolation: "worktree",   // OMIT this line if --no-worktree was passed
  prompt: `
You are implementing a fix for GitHub issue #<N> in the ACTO modern-accounting repo.
You're running in an isolated git worktree — treat it as your own checkout.

## Issue
Title: <title>
Body:
<body>

## Your job
1. Create and switch to branch: <branch-name>
2. **Bootstrap the worktree before any build/test** (per CLAUDE.md "Local Development with Git Worktrees"):
   - Copy env files FROM the main checkout INTO this worktree:
     * \`client/.env.local\`  (sets VITE_API_URL so the client proxies to chat-api)
     * \`chat-api/.env\`      (sets PORT=8080 plus Azure OpenAI, QBO, Plaid config)
     Find the main checkout path with \`git worktree list\` and copy from there.
   - Run \`npm install\` in THREE places: repo root, \`client/\`, and \`chat-api/\`.
   - Skip this step cleanly if the env files don't exist in the main checkout
     (report it in your summary; the user may have a non-standard setup).
3. Run an iterative implementation loop. For each iteration:
   - Assess current state (build errors, failing tests)
   - Act: investigate, read relevant code, make the minimal change needed
   - Verify:
     * \`cd client && npm run build\` (must pass with zero TS errors)
     * Relevant Playwright tests: \`VITE_BYPASS_AUTH=true npx playwright test <pattern>\`
   - If same error repeats, try a different approach
4. When green, commit with a descriptive message referencing #<N>, push the branch, and create a PR with \`gh pr create\`.

## Escape conditions (exit early, do NOT keep trying)
- iterations >= <max-iterations>
- same error signature seen >= <max-attempts>
- time on same error >= <stuck-timeout> minutes

If you escape, output a summary of approaches tried and stop — do NOT create a PR.

## Rules (from CLAUDE.md)
- NEVER create a PR without a passing \`npm run build\` in client/.
- NEVER lower security posture (anonymous access, disabled auth).
- NEVER merge feature branches directly to main.
- For NEW tables/views: add \`.sql\` files to the sqlproj. Migrations are for data only.
- DAB \`permissions: []\` is wrong — always include at least the \`authenticated\` role.

## Return
Report back (under 300 words):
- Status: \`created-pr\` or \`escaped\`
- PR URL (if created-pr) or escape reason (if escaped)
- Branch name
- One-line summary of the change
- Build ✅/❌, tests ✅/❌/skipped
- Any surprises worth flagging to the orchestrator
Do NOT paste build logs or file contents — just the summary.
`
})
```

**When the subagent returns:**
- If status is `created-pr` → you (the orchestrator) emit the `<acto-pr-created>` marker using the PR URL from the summary, then continue to Phase 4.
- If status is `escaped` → surface its summary to the user and stop. Do not retry blindly.

---

### Phase 3: PR creation (subagent does the work, orchestrator emits the marker)

The subagent creates the PR during Phase 2 and returns the URL in its summary. The orchestrator does not duplicate this work.

When the subagent's summary reports status = `created-pr`, **you (the orchestrator)** emit:
```
<acto-pr-created>PR #N created: <url></acto-pr-created>
```
using the PR URL from the subagent's summary.

---

### Phase 4: PR Review & Polish (you)

This phase runs in the orchestrator because it's mostly waiting (Copilot latency) and lightweight gh calls — not worth another worktree.

#### Step 1: Request Copilot Review
```bash
gh pr comment <PR_NUMBER> --body "@copilot review"
```
Copilot takes 1–3 minutes to respond. Poll with `gh pr view <PR_NUMBER> --json comments,reviews` until a comment from `copilot-swe-agent` / `copilot-pull-request-reviewer` / `Copilot` appears, or a review lands. If your environment has a background/streaming tool available (e.g. `Monitor`), use it so you can work on other things while waiting; otherwise, use a short poll loop with `run_in_background: true` — don't block the orchestrator with long sleeps.

#### Step 2: Handle Copilot's Response

**Option A: Copilot opens a follow-up PR**
- If `[WIP]` in the title, **DO NOT** close, merge, or act on it. Keep polling with `Monitor` until `[WIP]` is removed.
- Once ready:
  - additions > 0 and changes are valid → merge Copilot's PR, rebase yours on main, force-with-lease push.
  - additions == 0 → close Copilot's PR with thanks.
  - changes are wrong → close with explanation.

**Option B: Copilot leaves inline comments**
- Read the comments. For each valid suggestion, either apply it inline (small tweaks) or delegate back to a fresh subagent in the same worktree (non-trivial changes).

#### Step 3: Independent Review Check
- Re-check the diff for CLAUDE.md pattern compliance, null handling, type safety.
- Apply any obvious additional improvements.

#### Step 4: Final Verification
If Phase 4 introduced code changes, have the subagent (or yourself, for trivial edits) re-run:
- `npm run build` in `client/`
- Relevant Playwright tests

#### Step 5: Complete
```
<acto-complete>PR #N ready for merge: <url></acto-complete>
```

---

## Error Signature Detection (subagent)

Consider errors "the same" if they share: same error code (TS2322 etc.), same file + near-same line, same message pattern.

## Approach Tracking (subagent)

Keep notes like "tried .optional() → .nullish()", "updated import path". When stuck on the same error, try something explicitly different.

## Output Format (orchestrator)

Short progress markers between tool calls:
```
[Phase 1] Fetching issue #<N>…
[Phase 2] Delegating to subagent in worktree…
[Phase 2] Subagent returned: PR #<N> created
[Phase 4] Requesting Copilot review…
[Phase 4] Copilot responded: <A/B>, handling…
```

## Completion Criteria

ALL must be true before `<acto-complete>`:
- [ ] Subagent reported `npm run build` passed
- [ ] Relevant tests passed (or explicitly documented as N/A)
- [ ] PR created and pushed
- [ ] Copilot review requested AND addressed
- [ ] Any Phase 4 code changes re-verified (build + tests)

## Important Rules

1. **Always delegate implementation to a subagent with `isolation: "worktree"`.** The orchestrator never runs `git checkout`, `npm run build`, or edits code in the main checkout during Phase 2. Even for "simple" fixes — consistency beats exceptions.
2. **Don't fake completion** — only output `<acto-complete>` when all criteria are met.
3. **Respect escape conditions** — if the subagent escaped, surface the reason to the user and stop.
4. **Don't duplicate the subagent's work** — if it reports the build passed, trust it. Re-run builds only after orchestrator-side Phase 4 changes.
5. **Check CLAUDE.md** — the subagent's prompt already references project rules; add issue-specific guidance when relevant.
6. **Phase 4 is not optional** — Copilot review catches real issues.
7. **NEVER close or merge WIP PRs from Copilot** — poll until `[WIP]` is removed.
8. **Never touch the main checkout's uncommitted state** — the subagent's worktree is the only place edits happen during Phase 2.

## Database Schema Changes (passed through to subagent)

Use the hybrid approach documented in CLAUDE.md.

### For NEW Tables/Views (use sqlproj):
1. Create `database/dbo/Tables/NewTable.sql` or `database/dbo/Views/v_NewView.sql`
2. Add to `database/AccountingDB.sqlproj`:
   ```xml
   <Build Include="dbo\Tables\NewTable.sql" />
   ```
3. Update `dab-config.json` with new entity endpoints

### DO NOT create migration files for:
- CREATE TABLE / CREATE VIEW / ALTER TABLE ADD COLUMN / CREATE INDEX
- Stored procedures, triggers, functions

### Only use migrations (`database/migrations/`) for:
- Seed data (INSERT)
- Data transforms (UPDATE existing data)
- One-time fixes DACPAC can't handle

## References

- `docs/pr-review-template.md` — PR review process template
- `CLAUDE.md` — project patterns and known issues

## Example Execution

```
[Phase 1] gh issue view 155 → "Estimate form breaks on null address"
[Phase 2] Delegating to subagent in isolated worktree…

  Subagent returns:
  - PR: https://github.com/ACTO-LLC/modern-accounting/pull/162
  - Branch: fix/155-estimate-null-address
  - Change: schema .optional() → .nullish() in EstimateForm.tsx
  - Build ✅, Tests ✅ (3 playwright specs)
  - No surprises

<acto-pr-created>PR #162 created: https://github.com/ACTO-LLC/modern-accounting/pull/162</acto-pr-created>

[Phase 4] gh pr comment 162 --body "@copilot review"
[Phase 4] Monitor poll → Copilot left 2 inline suggestions
[Phase 4] Applied suggestion 1 (trivial rename); suggestion 2 was a false positive.
[Phase 4] No new code ⇒ no rebuild needed.

<acto-complete>PR #162 ready for merge: https://github.com/ACTO-LLC/modern-accounting/pull/162</acto-complete>
```

## Start Now

Begin Phase 1 with arguments: $ARGUMENTS
