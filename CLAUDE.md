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

## Terminology

When users say:
- "Modern", "Modern Accounting", "MA" → This system/database
- "QB", "QBO", "QuickBooks" → QuickBooks Online

---

## Project Structure

- **Client:** React + Vite + TypeScript + Tailwind CSS
- **API:** Node.js Express (`chat-api/`)
- **Database:** SQL Server via DAB (Data API Builder)
- **Database Deployment:** Use `node scripts/deploy-db.js` - supports SqlPackage mode (incremental) or Node.js mode (fallback)
- **MCP Servers:** DAB MCP (port 5000), QBO MCP (port 8001)
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

---

## Quick Reference: Common Pitfalls

1. **MUI + Tailwind Dark Mode:** They don't sync automatically. MUI uses system preference; Tailwind uses `.dark` class.

2. **QBO Migration Data:** Use `fetchAll: true` to get raw data in the `data` field for migration purposes.

3. **Windows Paths:** Use forward slashes or PowerShell. Backslashes cause issues in bash commands.

4. **Zod `.nullish()` vs `.optional()`:** Use `.nullish()` for API fields (accepts null), `.optional()` only accepts undefined.

5. **DAB `_write` endpoints:** Views are read-only. Use `_write` suffix endpoints for POST/PATCH/DELETE.

6. **X-MS-API-ROLE header:** Required for DAB write operations. Without it, DAB defaults to read-only "authenticated" role.

7. **API Pagination:** Never just increase limits. Implement client-side pagination following OData nextLink.

8. **DAB empty permissions:** Never leave `permissions: []`. Always include at least the `authenticated` role.
