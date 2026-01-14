# Security and Secrets Management

## Overview

This document describes how secrets and sensitive configuration are managed in the Modern Accounting application.

## Environment Variables

Sensitive values like database passwords and API keys should **never** be hardcoded in source files. Instead, they must be provided via environment variables.

### Required Environment Variables

#### Local Development

For local development, create a `.env` file in the root directory (this file is `.gitignore`d):

```bash
# Copy the example file
cp .env.example .env

# Edit .env and set your values
SQL_SA_PASSWORD=YourStrongPasswordHere123!
```

The application will automatically load these variables when running Docker Compose or deployment scripts.

#### Environment Variables Reference

| Variable | Description | Default (Dev Only) | Required |
|----------|-------------|-------------------|----------|
| `SQL_SA_PASSWORD` | SQL Server SA password | `StrongPassword123!` | Yes |
| `SQL_SERVER` | SQL Server hostname | `localhost` | No |
| `SQL_PORT` | SQL Server port | `14330` | No |
| `SQL_USER` | SQL Server username | `sa` | No |
| `SQL_DATABASE` | Database name | `AccountingDB` | No |
| `DAB_CONNECTION_STRING` | Full connection string for DAB | Auto-constructed | No |

#### Azure/Production Variables

For production deployments, these should be set in your Azure environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_SQL_CONNECTION_STRING` | Azure SQL connection string | `Server=tcp:yourserver.database.windows.net,1433;...` |
| `CORS_ORIGINS` | Allowed CORS origins | `https://your-domain.com` |
| `AZURE_AD_AUDIENCE` | Azure AD audience for JWT validation | `api://your-client-id` |
| `AZURE_AD_ISSUER` | Azure AD issuer URL | `https://login.microsoftonline.com/{tenant}/v2.0` |

## Configuration Files

### Development vs Production

- **`dab-config.development.json`**: Used for local development with Simulator auth
- **`dab-config.production.json`**: Used for production with Azure AD auth
- Both files use `@env('VARIABLE_NAME')` syntax to reference environment variables

### Docker Compose

The `docker-compose.yml` file uses environment variable substitution:
- `${SQL_SA_PASSWORD:-StrongPassword123!}` - Uses env var if set, otherwise falls back to default
- The `$$` syntax (`$${VAR}`) is used to escape variable substitution in nested contexts

## Client Configuration

The client application uses separate `.env.example` files in the `client/` and `qbo-mcp-http-server/` directories:

### Client (`client/.env.example`)
- Contains Azure AD configuration (Client ID, Tenant ID)
- These IDs are **not secrets** - they're public identifiers that need to be embedded in the client app
- Copy to `.env.local` and customize the redirect URI for your environment

### QuickBooks MCP Server (`qbo-mcp-http-server/.env.example`)
- Contains OAuth credentials for QuickBooks integration
- **Must** be copied to `.env` with actual values before use
- The `.env` file is `.gitignore`d

## Security Best Practices

### ✅ DO:
- Use environment variables for all secrets
- Store production secrets in Azure Key Vault or similar
- Use strong passwords (min 8 chars, mixed case, numbers, special chars)
- Rotate secrets regularly
- Use `.env.local` for local development (gitignored)
- Review `.gitignore` to ensure secrets are excluded

### ❌ DON'T:
- Commit `.env` files (except `.env.example` templates)
- Hardcode passwords, API keys, or connection strings in code
- Share secrets via email, chat, or other insecure channels
- Use the default password (`StrongPassword123!`) in production
- Commit actual OAuth client secrets

## Checking for Exposed Secrets

Before committing code, you can check for accidentally hardcoded secrets:

```bash
# Check for potential secrets in tracked files
git grep -i "password\|secret\|api.key\|token" -- "*.js" "*.ts" "*.json" "*.yml"

# Check what's staged for commit
git diff --cached
```

## What About `.env.example` Files?

The `.env.example` files in this repository contain:
- **Public identifiers** (like Azure AD Client IDs) - not secrets
- **Placeholder values** (like `your_client_id_here`) - clearly marked
- **Documentation** of required variables

These files are safe to commit and help developers understand what configuration is needed.

## Emergency: Secret Leaked in Git History

If a secret is accidentally committed:

1. **Immediately rotate the secret** (change passwords, revoke keys)
2. Remove the secret from Git history:
   ```bash
   # Use BFG Repo Cleaner or git filter-branch
   # Contact repository administrator for assistance
   ```
3. Force push the cleaned history (requires coordination with team)
4. Notify all team members to re-clone the repository

## Questions?

If you have questions about secrets management, contact the repository maintainers.
