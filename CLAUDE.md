# Claude Code Guidelines for Modern Accounting

## CRITICAL SECURITY RULES

**NEVER lower security posture without explicit user approval.** This includes:

1. **NEVER grant anonymous/public access (read OR write)** to database entities, APIs, or resources containing business data
2. **NEVER weaken authentication requirements** (e.g., removing auth, adding anonymous access)
3. **NEVER disable security features** (CORS, HTTPS, encryption, etc.)
4. **NEVER expose secrets or credentials** in logs, code, or error messages
5. **NEVER bypass permission checks** as a "quick fix" for auth issues
6. **NEVER expose business data to the public internet** - all API endpoints with business data must require authentication

**If facing authentication/authorization issues:**
- FIX the root cause (token validation, role mapping, issuer format, etc.)
- ASK the user before considering any security-related workarounds
- Document the security implications of any proposed changes
- NEVER use anonymous access as a workaround, even temporarily

**Examples of what NOT to do:**
- **Jan 2026 incident #1:** Granting `"actions": ["*"]` to anonymous role when migration failed with 403
- **Feb 2026 incident #2:** Granting `"actions": ["read"]` to anonymous role as a "temporary" workaround, exposing all customer/vendor/financial data to the public internet
- **Feb 2026 incident #3:** When removing anonymous access, setting `"permissions": []` (empty) instead of adding `"authenticated"` role - this breaks ALL access

**The correct approach:** Fix Azure AD token validation, check audience/issuer config, or ask the user for guidance.

**When removing anonymous access from DAB:**
```json
// WRONG - empty permissions means NO ONE can access
"permissions": []

// CORRECT - replace anonymous with authenticated
"permissions": [
    { "role": "authenticated", "actions": ["read"] },
    { "role": "Admin", "actions": ["*"] },
    { "role": "Accountant", "actions": ["create", "read", "update"] }
]
```

---

## CRITICAL: NEVER MERGE FEATURE BRANCHES TO MAIN

**NEVER merge feature branches directly into main.** All feature/fix branches MUST go through the PR review and testing process.

1. **NEVER run `git merge <feature-branch>` on main** — feature branches are merged only via reviewed PRs
2. **NEVER push untested code to main** — even if the user says "merge to main", clarify what they mean
3. **Commits directly on main are OK only for:** documentation-only changes (CLAUDE.md, README), config tweaks, and other non-code changes that don't need testing

**If the user says "merge to main":**
- **ASK** what specifically should be merged — don't assume it includes unreviewed feature branches
- If there are pending feature PRs AND unrelated small changes, commit only the small changes directly to main
- Feature branches get merged through their PRs after review and testing

**March 2026 incident:** When asked to "merge to main" (meaning only a CLAUDE.md documentation change), the entire `feat/565-unified-transaction-rules` branch was also merged directly into main, bypassing PR review and testing. The PR (#568) became effectively dead.

---

## CRITICAL: NO WORKAROUNDS WITHOUT APPROVAL

**NEVER implement workarounds without explicit developer approval.** This includes:

1. **NEVER insert fake/test data** as a substitute for fixing the actual functionality
2. **NEVER bypass or mock APIs** when the real integration isn't working
3. **NEVER implement "temporary" solutions** that circumvent the intended architecture
4. **NEVER assume a workaround is acceptable** - always ask first

**If something isn't working:**
- **DIAGNOSE** the root cause
- **EXPLAIN** the issue to the developer
- **ASK** before proposing any workaround
- **WAIT** for approval before implementing alternatives

**Feb 2026 incident:** When Plaid sandbox wasn't returning transactions, attempted to insert fake transactions directly into the database instead of:
1. Explaining that sandbox mode requires time to generate test data
2. Asking if the developer wanted to test on production instead
3. Waiting for guidance on the preferred approach

**The correct approach:** Explain the limitation, present options, and let the developer decide.

---

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Terminology

When users say:
- "Modern", "Modern Accounting", "MA" → This system/database
- "QB", "QBO", "QuickBooks" → QuickBooks Online

---

## Project Structure

- **Client:** React + Vite + TypeScript + Tailwind CSS
- **API:** Node.js Express (`chat-api/`)
- **Database:** SQL Server via DAB (Data API Builder)
- **Database Deployment:** Use `npm run db:deploy` - supports SqlPackage mode (incremental) or Node.js mode (fallback)
- **Database Clone:** Use `npm run db:clone` to copy Azure prod DB to local Docker (requires `az login` + SqlPackage)
- **MCP Servers:** DAB MCP (port 5000), QBO MCP (port 8001)
- **Docker Dev:** `docker compose up -d` starts DB + DAB + MCPs + email (schema auto-deploys). Add `--profile app` for chat-api + client containers too (`npm run dev:full`).
- **Dark Mode:** Tailwind `.dark` class on `<html>` - does NOT automatically sync with MUI

---

## AI-Driven Feature Addition System (Issue #87)

The system enables administrators to request feature changes through a chat interface. Requests are processed autonomously using Claude AI for planning and code generation.

**Key Components:**
- **Monitor Agent** (`monitor-agent/`) - Polls for enhancements and processes them
- **Enhancements API** (`chat-api/src/routes/`) - REST endpoints for managing requests
- **Database Tables** - `Enhancements` and `Deployments` tables

**Documentation:**
- [System Overview](docs/ai-feature-system.md)
- [API Reference](docs/api-reference.md)
- [Setup Guide](docs/ai-feature-setup.md)

**Quick Start:**
```bash
cd monitor-agent
npm install
npm run dev  # Start the monitor agent
```

**Environment Variables Required:**
- `ANTHROPIC_API_KEY` - Claude API key
- `GITHUB_TOKEN` - GitHub personal access token
- `DB_PASSWORD` - Database password

---

## Detailed Guidelines

For detailed technical guidance on specific topics, see these documents:

| Topic | Document |
|-------|----------|
| Azure deployment, App Service, Container Apps, Key Vault | [docs/claude-azure.md](docs/claude-azure.md) |
| DAB configuration, endpoints, OData, role authorization | [docs/claude-dab.md](docs/claude-dab.md) |
| MSAL, Azure AD auth, Plaid/QBO auth flows | [docs/claude-auth.md](docs/claude-auth.md) |
| Playwright testing patterns, auth bypass | [docs/claude-testing.md](docs/claude-testing.md) |
| Schema management, migrations, production SQL | [docs/claude-database.md](docs/claude-database.md) |
| QBO migration architecture, field mapping, cutoff dates | [docs/claude-qbo-migration.md](docs/claude-qbo-migration.md) |
| MUI DataGrid, Zod nullish, Express proxy, pagination | [docs/claude-frontend.md](docs/claude-frontend.md) |
| Feature flags system, admin toggles, nav visibility | [docs/claude-feature-flags.md](docs/claude-feature-flags.md) |
| Entra ID user management, roles, group sync | [docs/entra-id-user-management.md](docs/entra-id-user-management.md) |
| MCP servers, local/prod switching, QBO token injection | [docs/claude-mcp.md](docs/claude-mcp.md) |

---

## Local Development with Git Worktrees

When creating a worktree for a feature branch, you must install dependencies and copy gitignored env files or services will fail:

```bash
# 1. Create worktree
git worktree add ../modern-accounting-XXX -b fix/XXX-description main

# 2. Copy gitignored env files (BOTH are required)
cp client/.env.local ../modern-accounting-XXX/client/.env.local
cp chat-api/.env ../modern-accounting-XXX/chat-api/.env

# 3. Install dependencies (ALL THREE are required)
cd ../modern-accounting-XXX && npm install          # root (concurrently, etc.)
cd ../modern-accounting-XXX/client && npm install   # client (React, MUI, etc.)
cd ../modern-accounting-XXX/chat-api && npm install  # chat-api (Express, etc.)

# 4. Start dev server
cd ../modern-accounting-XXX && VITE_BYPASS_AUTH=true npm run dev
```

**Both env files are required:**
- `client/.env.local` — Sets `VITE_API_URL=http://localhost:8080` so the client proxies to chat-api. Without it, API calls go to the wrong URL.
- `chat-api/.env` — Sets `PORT=8080` plus Azure OpenAI, QBO, and Plaid config. Without it, chat-api defaults to port 7071, but the client expects 8080, so all API calls fail with 500.

**All three `npm install` steps are required.** Missing root deps → `concurrently` not found. Missing chat-api deps → API returns 500 on all proxied requests. Missing client deps → build fails.

**Also note:** DAB runs in Docker and reads `dab-config.json` from the main repo via volume mount — not from the worktree. If your fix changes `dab-config.json`, update it in the main repo too and restart DAB (`docker restart accounting-dab`).

---

## Quick Reference: Common Pitfalls

1. **MUI + Tailwind Dark Mode:** Root-level `ThemeProvider` in `App.tsx` syncs MUI with Tailwind's `.dark` class via `colorSchemeSelector: '.dark'`. All MUI components must be inside this provider. **All form controls MUST use MUI components** (`TextField`, `Select`, `Autocomplete`, `TextField multiline`, etc.) — never raw HTML `<input>`, `<select>`, or `<textarea>`. Raw HTML elements do not inherit the MUI theme and break dark mode. Only fall back to Tailwind `dark:` variants for non-MUI elements where no MUI equivalent exists (e.g., custom upload areas, static text).

2. **QBO Migration Data:** Use `fetchAll: true` to get raw data in the `data` field for migration purposes.

3. **Windows Paths:** Use forward slashes or PowerShell. Backslashes cause issues in bash commands.

4. **Zod `.nullish()` vs `.optional()`:** Use `.nullish()` for API fields (accepts null), `.optional()` only accepts undefined.

5. **DAB `_write` endpoints:** Views are read-only. Use `_write` suffix endpoints for POST/PATCH/DELETE.

6. **X-MS-API-ROLE header:** Required for DAB write operations. Without it, DAB defaults to read-only "authenticated" role.

7. **API Pagination:** Never just increase limits. Implement client-side pagination following OData nextLink.

8. **DAB empty permissions:** Never leave `permissions: []`. Always include at least the `authenticated` role.

9. **Navigate-to-edit pattern (no inline forms):** All list pages must use the navigate-to-edit pattern — clicking a row navigates to `/<entity>/:id/edit`, and a "New" button navigates to `/<entity>/new`. Never use inline forms that appear above the list. Reference: Invoices, Classes, Locations, Tax Rates.

10. **sqlproj is the single source of truth for ALL database objects.** Every table, view, trigger, stored procedure, and index MUST have a corresponding `.sql` file in `database/dbo/`. Migrations (`database/migrations/`) are ONLY for data operations (INSERT, UPDATE, DELETE). **NEVER use migrations to CREATE or ALTER schema objects** — not even dynamically via cursors or `sp_executesql`. If a migration needs to create triggers/indexes for multiple tables, create individual `.sql` files in the sqlproj instead. The sqlproj uses globs (`dbo\Tables\*.sql`, `dbo\Triggers\*.sql`) so just creating the file is enough. **March 2026 incident:** Migration 047 dynamically created 50+ triggers via cursor without sqlproj files, causing SqlPackage to fail on production deployment.
