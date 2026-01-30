# Production DAB Deployment Status

## Current Status: MOSTLY WORKING - Proxy Path Issue

Last Updated: 2026-01-30 21:55 UTC

## What's Working

1. **DAB Container App is running** (moved from App Service to Container Apps to fix TLS issue)
   - URL: https://dab-ca-modern-accounting.bravesky-c584bf83.westus2.azurecontainerapps.io/
   - Health endpoint returns `{"status":"Healthy","version":"1.7.83"}`
   - Direct API access works: `/api/accounts` returns 403 (Auth required) - correct behavior

2. **Database schema deployed**
   - 137 tables created in AccountingDB on Azure SQL
   - Core tables (Customers, Vendors, Accounts, Invoices, etc.) all exist

3. **Environment variables configured**
   - `DAB_URL` = Container App base URL
   - `DAB_MCP_URL` = Container App MCP endpoint
   - `DAB_REST_URL` = Container App REST API endpoint

4. **Proxy middleware added to chat-api**
   - Routes `/api/*` requests to DAB (excluding internal paths like /api/chat, /api/health)
   - Deployed to production

## Resolved Issues

### TLS Handshake Failure (FIXED)
**Original Error**: "Connection reset by peer" during TLS negotiation with Azure SQL
**Solution**: Moved DAB from Azure App Service to Azure Container Apps
- Container Apps handles TLS correctly with Azure SQL
- Database connections now work

### Missing Database Schema (FIXED)
**Original Error**: "Invalid object name 'dbo.Customers'"
**Solution**: Deployed database schema using Node.js deployment script
- All 137 tables now exist in production database

## Current Issue

### DAB Proxy Path Mismatch
**Symptom**: Accessing `/api/accounts` through main app returns "Invalid Path for route: accounts"

**Analysis**:
- Direct DAB access: `https://dab.../api/accounts` → Returns 403 (correct)
- Via main app: `https://app.../api/accounts` → Returns "Invalid Path" (wrong)

**Root Cause**: Express `app.use('/api', ...)` strips the `/api` prefix before passing to proxy middleware.
- Request comes in as `/api/accounts`
- Express strips to `/accounts`
- Proxy forwards to `https://dab.../accounts` (missing `/api`)
- DAB doesn't recognize the path

**Attempted Fix**: Added `pathRewrite: (path) => '/api' + path` - not working as expected

## Architecture

```
User Browser
    ↓
app-modern-accounting-prod.azurewebsites.net:443 (Express server)
    ↓ (proxy middleware for /api/* routes)
dab-ca-modern-accounting...azurecontainerapps.io:443 (DAB Container App)
    ↓ (SQL connection over TLS)
sql-modern-accounting-prod.database.windows.net:1433 (Azure SQL)
```

## Azure Resources

| Resource | Type | Status | Notes |
|----------|------|--------|-------|
| dab-ca-modern-accounting | Container App | Running | DAB v1.7.83-rc |
| cae-modern-accounting-prod | Container Apps Env | Active | Consumption tier |
| stmodernaccountingprod/dab-config | Azure Files | Mounted | Config file storage |
| sql-modern-accounting-prod/AccountingDB | Azure SQL | Online | 137 tables |
| app-modern-accounting-prod | App Service | Running | Main app |
| dab-modern-accounting-prod | App Service | Can Delete | Old failed deployment |

## Files Modified

1. **chat-api/server.js**
   - Added http-proxy-middleware dependency
   - Added proxy configuration for DAB routing
   - Excluded internal API paths from proxy

2. **chat-api/package.json**
   - Added `http-proxy-middleware: ^3.0.5`

3. **dab-config.production.json**
   - Changed `salesreceipts` to use table instead of missing view
   - Removed `overdueinvoicesforreminder` entity

## Next Steps

1. **Fix proxy pathRewrite** - Debug why the `/api` prefix isn't being preserved
2. **Alternative approach** - Move proxy to use explicit route matching instead of stripping
3. **Test with auth** - Once path works, test with valid Azure AD JWT token
4. **Cleanup** - Delete old failed App Service deployment

## Debug Commands

```bash
# Test DAB directly (should return 403)
curl "https://dab-ca-modern-accounting.bravesky-c584bf83.westus2.azurecontainerapps.io/api/accounts"

# Test through main app (currently returns path error)
curl "https://app-modern-accounting-prod.azurewebsites.net/api/accounts"

# Check DAB logs
az containerapp logs show --name dab-ca-modern-accounting -g rg-modern-accounting-prod --type console --tail 50

# Check main app settings
az webapp config appsettings list --name app-modern-accounting-prod -g rg-modern-accounting-prod -o table

# Restart main app
az webapp restart --name app-modern-accounting-prod -g rg-modern-accounting-prod
```

## History

| Date | Issue | Resolution |
|------|-------|------------|
| Jan 30 | TLS handshake failure on App Service | Moved to Container Apps |
| Jan 30 | Database schema not deployed | Ran Node.js deploy script |
| Jan 30 | Missing views in DAB config | Updated config to use tables |
| Jan 30 | Proxy path stripping | In progress |
