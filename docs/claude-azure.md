# Claude Guidelines: Azure Deployment & Infrastructure

## Azure App Service Node.js Deployment - Oryx Bypass (Jan 2026)

**Problem:** Node.js app fails to start on Azure App Service (Linux) with `ERR_MODULE_NOT_FOUND` errors, even when `node_modules` is included in the deployment package.

**Root Cause:** Azure's **Oryx build system runs at container runtime**, not just deployment time. Even with these settings:
```
SCM_DO_BUILD_DURING_DEPLOYMENT=false
ENABLE_ORYX_BUILD=false
```

Oryx still executes `npm install --omit=dev && npm start` during container startup, which:
1. Partially extracts/corrupts pre-deployed `node_modules`
2. Fails with `EACCES` permission errors
3. Leaves Node.js unable to find dependencies

**Solution:** Set a custom startup command to bypass Oryx entirely:

```bash
az webapp config set \
  --resource-group rg-modern-accounting-prod \
  --name app-modern-accounting-prod \
  --startup-file "node server.js"
```

In GitHub Actions workflow:
```yaml
- name: Configure Startup Command
  run: |
    az webapp config set \
      --resource-group ${{ env.AZURE_RESOURCE_GROUP }} \
      --name ${{ env.AZURE_WEBAPP_NAME }} \
      --startup-file "node server.js"
```

**What Doesn't Work:**
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false` (only affects Kudu, not container startup)
- `ENABLE_ORYX_BUILD=false` (ignored at runtime)
- Pre-zipped `node_modules` without startup command override

**CRITICAL: Always set `WEBSITE_RUN_FROM_PACKAGE=1`** (Feb 2026 update):
Even with startup command override, Oryx can still corrupt `node_modules` if it finds a stale `oryx-manifest.toml` from a previous deploy. It extracts an old `node_modules.tar.gz`, replaces the real `node_modules/` with a broken symlink, and the app crashes with `MODULE_NOT_FOUND`. Setting `WEBSITE_RUN_FROM_PACKAGE=1` mounts the zip as read-only wwwroot on every start, bypassing Oryx entirely.

```bash
az webapp config appsettings set \
  --resource-group rg-modern-accounting-prod \
  --name app-modern-accounting-prod \
  --settings WEBSITE_RUN_FROM_PACKAGE="1"
```

**Key Insight:** The startup command must be set to skip Oryx's default startup script. Your `server.js` must:
- Use `__dirname` relative paths (not `process.cwd()`)
- Not rely on `npm start` (use `node server.js` directly)
- Have all dependencies pre-installed in `node_modules`

---

## Azure Key Vault Access for App Service (Jan 2026)

**Problem:** App Service can't resolve Key Vault references (e.g., `@Microsoft.KeyVault(SecretUri=...)`) - settings show the reference syntax instead of actual values.

**Root Cause:** App Service's managed identity doesn't have RBAC access to Key Vault secrets.

**Solution:** Grant "Key Vault Secrets User" role to App Service identity:

```bash
# Get App Service managed identity principal ID
az webapp identity show --name app-modern-accounting-prod \
  --resource-group rg-modern-accounting-prod --query principalId -o tsv

# Grant access (if Key Vault uses RBAC, not access policies)
az role assignment create \
  --assignee-object-id "<principal-id>" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.KeyVault/vaults/<kv-name>"
```

**Check if Key Vault uses RBAC:**
```bash
az keyvault show --name <vault-name> --query "properties.enableRbacAuthorization"
# true = uses RBAC, false = uses access policies
```

**Key Insight:** When Key Vault references don't resolve, the app receives the literal string `@Microsoft.KeyVault(...)` instead of the secret value, causing configuration failures.

---

## DAB Container App Config Updates (Jan 2026)

**Problem:** Need to update DAB configuration file stored in Azure Files.

**Solution:**

1. **Download current config:**
```bash
az storage file download --share-name dab-config --path dab-config.json \
  --account-name stmodernaccountingprod --dest ./downloaded-config.json
```

2. **Upload updated config:**
```bash
az storage file upload --source ./updated-config.json --share-name dab-config \
  --path dab-config.json --account-name stmodernaccountingprod
```

3. **Restart DAB container (trigger new revision):**
```bash
az containerapp update --name dab-ca-modern-accounting \
  --resource-group rg-modern-accounting-prod \
  --set-env-vars "RESTART_TRIGGER=$(date +%s)"
```

**Note:** Container Apps don't have a simple "restart" command. Setting an env var triggers a new revision deployment.

---

## Custom Domains & SSL (Feb 2026)

Production uses custom domains on `a-cto.com` with free App Service Managed Certificates.

### Current Setup

| Service | Custom Domain | App Service |
|---------|--------------|-------------|
| Main App | `accounting.a-cto.com` | `app-modern-accounting-prod` |
| QBO MCP | `mcp-qbo.a-cto.com` | `mcp-qbo-modern-accounting-prod` |
| MA MCP | `mcp-ma.a-cto.com` | `mcp-ma-modern-accounting-prod` |

### DNS Zone Location

The DNS zone for `a-cto.com` lives in a **separate subscription and resource group** from the app services:

- **DNS Zone:** subscription `8883174d...`, RG `acto-dns-prod-rg` (nameservers `ns1-05.azure-dns.com`)
- **App Services:** subscription `a6f5a418...`, RG `rg-modern-accounting-prod`

Namecheap is the domain registrar, already pointing to Azure DNS nameservers `ns1-05`.

**IMPORTANT:** Do NOT create a new DNS zone in `rg-modern-accounting-prod`. The Bicep `dns-zone.bicep` module would create a duplicate zone with different nameservers, breaking all existing DNS records (email, other services).

### App Registration

**Name:** "Modern Accounting Production"
**Client ID:** `2685fbc4-b4fd-4ea7-8773-77ec0826e7af`
**Tenant ID:** `f8ac75ce-d250-407e-b8cb-e05f5b4cd913`

SPA Redirect URIs (already configured):
- `https://accounting.a-cto.com`
- `https://app-modern-accounting-prod.azurewebsites.net`
- `http://localhost:5173`

### Adding a New Custom Domain

To add a new subdomain (e.g., `newservice.a-cto.com`):

1. **Get the App Service verification ID:**
   ```bash
   az webapp show --name <app-service-name> --resource-group rg-modern-accounting-prod \
     --query customDomainVerificationId -o tsv
   ```

2. **Add DNS records to the existing zone** (switch to DNS subscription first):
   ```bash
   az account set --subscription 8883174d-a6ce-48b0-b0a1-c5ec5c397666

   # CNAME record
   az network dns record-set cname set-record \
     --resource-group acto-dns-prod-rg --zone-name a-cto.com \
     --record-set-name newservice --cname <app-service-name>.azurewebsites.net

   # TXT verification record
   az network dns record-set txt add-record \
     --resource-group acto-dns-prod-rg --zone-name a-cto.com \
     --record-set-name asuid.newservice --value <verification-id>
   ```

3. **Deploy hostname binding + managed cert** (switch back to app subscription):
   ```bash
   az account set --subscription a6f5a418-461f-42c0-a07a-90142521e5fb

   az deployment group create \
     --resource-group rg-modern-accounting-prod \
     --name custom-domain-newservice \
     --template-file infra/azure/modules/custom-domain.bicep \
     --parameters appServiceName=<app-service-name> \
       customHostname=newservice.a-cto.com \
       location=westus2 \
       'tags={"application":"modern-accounting","environment":"prod","managedBy":"bicep","company":"A CTO LLC"}'
   ```

4. **Bind SSL cert:**
   ```bash
   # Get thumbprint from deployment output, then:
   az webapp config ssl bind \
     --resource-group rg-modern-accounting-prod \
     --name <app-service-name> \
     --certificate-thumbprint <THUMBPRINT> --ssl-type SNI
   ```

5. **Update App Registration** (if the service uses Azure AD auth):
   ```bash
   az ad app update --id 2685fbc4-b4fd-4ea7-8773-77ec0826e7af \
     --spa-redirect-uris https://accounting.a-cto.com https://app-modern-accounting-prod.azurewebsites.net http://localhost:5173 https://newservice.a-cto.com
   ```
