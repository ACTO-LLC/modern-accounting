# Claude Guidelines: MCP Servers (Local vs Production)

## Overview

Claude Code uses two MCP servers for data access:

| MCP Server | Type | Default (Local) | Production |
|------------|------|-----------------|------------|
| **MSSQL** | stdio | Docker SQL `localhost,14330` | Azure SQL `sql-modern-accounting-prod.database.windows.net` |
| **QBO** | HTTP | `http://localhost:8001/mcp` (Docker container, sandbox) | Same URL, native process with prod OAuth creds |

Configuration lives in `.mcp.json` (gitignored — safe to contain credentials).

---

## Quick Start: Switching Environments

```bash
# Switch to production (fully automated)
node scripts/switch-mcp.js prod

# Switch back to local (fully automated)
node scripts/switch-mcp.js local

# Check current config
node scripts/switch-mcp.js status
```

**After switching:** Restart Claude Code for MSSQL changes to take effect (stdio MCP servers are spawned at startup). QBO token injection is immediate — no restart needed.

---

## What the Switch Script Does

### `switch-mcp.js prod`

1. Fetches SQL connection string from Key Vault (`kv2suhqabgprod` / `SqlConnectionString`)
2. Fetches QBO OAuth credentials (`qbo-client-id`, `qbo-client-secret`) from Key Vault
3. Rewrites `.mcp.json` MSSQL section with Azure SQL credentials
4. Checks QBO MCP `/health` — if already `"production"`, skips to step 8
5. Stops Docker container (`accounting-qbo-mcp`) if running
6. Kills any existing native QBO MCP process (via PID file or port scan)
7. Starts `node qbo-mcp-http-server/dist/index.js` as a detached background process with prod env vars, saves PID to `.qbo-mcp.pid`
8. Polls `/health` until `environment: "production"`
9. Connects to prod SQL, reads QBO OAuth tokens from `QBOConnections` table
10. POSTs tokens to `/auth/inject-tokens` — QBO MCP auto-refreshes expired access tokens on first query

### `switch-mcp.js local`

1. Rewrites `.mcp.json` MSSQL section with Docker SQL defaults (`sa` / `StrongPassword123`)
2. Checks QBO MCP `/health` — if already `"sandbox"`, skips to step 5
3. Kills native QBO MCP process (from PID file)
4. Starts Docker container (`accounting-qbo-mcp`) back up, polls `/health`
5. Attempts to read QBO tokens from local SQL and inject (skips if unavailable)

### `switch-mcp.js status`

Shows current state of both MSSQL and QBO MCP:
- MSSQL target (local vs prod), host, database, user
- QBO MCP running state, environment (sandbox/production), mode (Docker/native)
- Docker container status, PID file info, OAuth connection status

---

## Prerequisites for Production Access

### Azure CLI

```bash
# Must be logged in to the correct tenant
az login
az account set --subscription "MCPP Subscription"

# Verify — tenant should be f8ac75ce-...
az account show --query "{name:name, tenant:tenantId}" -o json
```

**Common issue:** Claude Code's shell may inherit a different Azure tenant than your terminal. If you see `AKV10032: Invalid issuer`, run `az account set --subscription "MCPP Subscription"` inside Claude Code's Bash tool.

### SQL Firewall

Your IP must be whitelisted on the Azure SQL server:

```bash
# Check current rules
az sql server firewall-rule list \
  --server sql-modern-accounting-prod \
  --resource-group rg-modern-accounting-prod \
  --query "[].{name:name, start:startIpAddress}" -o table

# Add your IP if needed
MY_IP=$(curl -s https://api.ipify.org)
az sql server firewall-rule create \
  --resource-group rg-modern-accounting-prod \
  --server sql-modern-accounting-prod \
  --name "Dev-$(date +%Y%m%d)" \
  --start-ip-address $MY_IP --end-ip-address $MY_IP
```

---

## How It Works Under the Hood

### MSSQL MCP (stdio)

- Python executable: `mssql_mcp_server.exe`
- Configured in `.mcp.json` under `mcpServers.mssql.env`
- Env vars: `MSSQL_HOST`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD`
- **Spawned once at Claude Code startup** — `.mcp.json` changes require restart

### QBO MCP (HTTP)

- Node.js Express server at `http://localhost:8001/mcp`
- Source: `qbo-mcp-http-server/`
- Uses in-memory session store for OAuth tokens
- **Two modes of operation:**
  - **Sandbox (local):** Runs as Docker container `accounting-qbo-mcp` with sandbox OAuth creds from `.env`
  - **Production:** Runs as native Node.js process with Key Vault OAuth creds passed as env vars. PID tracked in `.qbo-mcp.pid`, logs written to `logs/qbo-mcp-prod.log`
- **Token injection endpoint:** `POST /auth/inject-tokens`
  - Accepts: `{ refreshToken, realmId, companyName }`
  - Sets `expiresIn: 0` to force token refresh on first query
  - No restart needed — tokens are injected into the running server

### Token Refresh Flow

1. `switch-mcp.js prod` reads `RefreshToken` from prod `QBOConnections` table
2. Injects into QBO MCP with `expiresIn: 0` (marks as expired)
3. First QBO query triggers `refreshAccessToken()` using `intuit-oauth`
4. Fresh access token is stored in memory, valid for ~1 hour
5. Subsequent queries use the fresh token; auto-refresh repeats as needed

### Why Native Process for Production?

The Docker container has sandbox OAuth credentials baked into its image. Production tokens require production `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` for refresh to work. Running natively with env var overrides is faster than rebuilding the Docker image and avoids modifying the `.env` file (which is checked into git for local dev).

---

## Troubleshooting

### "Error querying X: undefined"

The QBO API returned an error that node-quickbooks didn't surface properly. Since Mar 2026, the error handler extracts the Intuit `Fault` object. Common causes:

- **AuthenticationFailed (3200):** Access token expired and refresh failed. Run `node scripts/switch-mcp.js prod` to re-inject tokens and ensure QBO MCP is in production mode.
- **Token not injected:** Run `node scripts/switch-mcp.js prod` to inject tokens.

### MSSQL MCP can't connect to Azure SQL

The Python `mssql_mcp_server` uses the `SQL Server` ODBC driver by default, which may not support Azure SQL TLS requirements. Set `MSSQL_DRIVER` env var:

```json
"mssql": {
  "env": {
    "MSSQL_DRIVER": "ODBC Driver 17 for SQL Server",
    "MSSQL_HOST": "sql-modern-accounting-prod.database.windows.net,1433",
    ...
  }
}
```

### Wrong Azure tenant in Claude Code

Claude Code inherits the Azure CLI session from the shell it was launched in. Fix without restarting:

```bash
az account set --subscription "a6f5a418-461f-42c0-a07a-90142521e5fb"
```

### QBO MCP not starting in production mode

Check the log file at `logs/qbo-mcp-prod.log`. Common issues:
- Port 8001 still in use — the script should handle this, but if not, run `node scripts/switch-mcp.js prod` again (it kills orphaned processes)
- Missing `dist/index.js` — rebuild: `cd qbo-mcp-http-server && npm run build`

### Orphaned native process

If you killed Claude Code without switching back to local, a native QBO MCP process may be orphaned. The switch script handles this:
- First checks `.qbo-mcp.pid` file
- Falls back to scanning port 8001 with `netstat`
- Both `local` and `prod` commands clean up before starting

---

## Key Vault Secrets Reference

| Secret | Purpose |
|--------|---------|
| `SqlConnectionString` | Full SQL connection string (server, user, password) |
| `qbo-client-id` | QBO OAuth production client ID |
| `qbo-client-secret` | QBO OAuth production client secret |

All in vault: `kv2suhqabgprod` (MCPP Subscription)
