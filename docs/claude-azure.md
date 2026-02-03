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
- `WEBSITE_RUN_FROM_PACKAGE=1` without blob storage URL
- Pre-zipped `node_modules` without startup command override

**Key Insight:** The startup command must be set to skip Oryx's default startup script. Your `server.js` must:
- Use `__dirname` relative paths (not `process.cwd()`)
- Not rely on `npm start` (use `node server.js` directly)
- Have all dependencies pre-installed in `node_modules`

**Alternative:** Use Azure Container Apps with a Dockerfile for full control.

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
