# Claude Guidelines: MCP Servers (Local vs Production)

## Overview

Claude Code uses two MCP servers for data access:

| MCP Server | Type | Default (Local) | Production |
|------------|------|-----------------|------------|
| **MSSQL** | stdio | Docker SQL `localhost,14330` | Azure SQL `sql-modern-accounting-prod.database.windows.net` |
| **QBO** | HTTP | `http://localhost:8001/mcp` | Same server, different OAuth tokens + `QBO_ENVIRONMENT=production` |

Configuration lives in `.mcp.json` (gitignored — safe to contain credentials).

---

## Quick Start: Switching Environments

```bash
# Switch to production
node scripts/switch-mcp.js prod

# Switch back to local
node scripts/switch-mcp.js local

# Check current config
node scripts/switch-mcp.js status
```

**After switching:** Restart Claude Code for MSSQL changes to take effect (stdio MCP servers are spawned at startup). QBO token injection is immediate — no restart needed.

---

## What the Switch Script Does

### `switch-mcp.js prod`

1. Fetches SQL connection string from Key Vault (`kv2suhqabgprod` / `SqlConnectionString`)
2. Rewrites `.mcp.json` MSSQL section with Azure SQL credentials
3. Connects to prod SQL, reads QBO OAuth tokens from `QBOConnections` table
4. POSTs tokens to `http://localhost:8001/auth/inject-tokens` (QBO MCP)
5. QBO MCP auto-refreshes expired access tokens on first query

### `switch-mcp.js local`

1. Rewrites `.mcp.json` MSSQL section with Docker SQL defaults (`sa` / `StrongPassword123`)
2. Attempts to read QBO tokens from local SQL (skips if unavailable)

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

### QBO MCP Server (Production Mode)

The QBO MCP must be started with **production** OAuth credentials for token refresh to work. The sandbox client ID/secret cannot refresh production tokens.

```bash
# Fetch prod credentials and start QBO MCP in production mode
PROD_CLIENT_ID=$(az keyvault secret show --vault-name kv2suhqabgprod --name qbo-client-id --query value -o tsv)
PROD_CLIENT_SECRET=$(az keyvault secret show --vault-name kv2suhqabgprod --name qbo-client-secret --query value -o tsv)

cd qbo-mcp-http-server
QBO_CLIENT_ID="$PROD_CLIENT_ID" \
QBO_CLIENT_SECRET="$PROD_CLIENT_SECRET" \
QBO_ENVIRONMENT=production \
node dist/index.js
```

Verify with `curl http://localhost:8001/health` — `environment` should say `"production"`.

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

---

## Troubleshooting

### "Error querying X: undefined"

The QBO API returned an error that node-quickbooks didn't surface properly. Since Mar 2026, the error handler extracts the Intuit `Fault` object. Common causes:

- **AuthenticationFailed (3200):** Access token expired and refresh failed. Check that QBO MCP is running with **production** `QBO_CLIENT_ID`/`QBO_CLIENT_SECRET` (not sandbox).
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

### QBO MCP shows "sandbox" in health check

The `.env` file in `qbo-mcp-http-server/` defaults to sandbox. For production, override with env vars at startup (see "QBO MCP Server (Production Mode)" above). Do not change `.env` — it's checked into git for local dev.

---

## Key Vault Secrets Reference

| Secret | Purpose |
|--------|---------|
| `SqlConnectionString` | Full SQL connection string (server, user, password) |
| `qbo-client-id` | QBO OAuth production client ID |
| `qbo-client-secret` | QBO OAuth production client secret |

All in vault: `kv2suhqabgprod` (MCPP Subscription)
