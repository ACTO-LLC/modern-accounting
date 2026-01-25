# Azure Infrastructure as Code

This directory contains Bicep templates for deploying Modern Accounting to Azure.

## Architecture Overview

```
                                    +------------------+
                                    |   Key Vault      |
                                    |  (Secrets Mgmt)  |
                                    +--------+---------+
                                             |
    +------------+     +-------------+       |       +------------------+
    |  Users     |---->| App Service |-------+------>| Azure SQL        |
    | (Browser)  |     | (Node.js)   |       |       | (Serverless)     |
    +------------+     +-------------+       |       +------------------+
                              |              |
                              v              |
                       +-------------+       |       +------------------+
                       | App Insights|       +------>| Storage Account  |
                       | (Monitoring)|               | (Blobs)          |
                       +-------------+               +------------------+
                                                             |
                                                     +-------+--------+
                                                     |   SendGrid     |
                                                     |   (Email)      |
                                                     +----------------+
```

## Cost Estimate (3 Users)

| Resource | SKU | Est. Cost/Month |
|----------|-----|-----------------|
| Azure SQL | Serverless (0.5-1 vCore, auto-pause) | $5-15 |
| App Service | F1 (Free) or B1 ($13) | $0-13 |
| Key Vault | Standard | ~$0.03 |
| Storage | LRS, 1 GB | ~$0.02 |
| Application Insights | <5 GB (free tier) | $0 |
| SendGrid | Free (100 emails/day) | $0 |
| **Total** | | **~$5-30/month** |

## Directory Structure

```
infra/azure/
├── main.bicep              # Main orchestration template
├── modules/
│   ├── app-service.bicep   # App Service + App Insights
│   ├── key-vault.bicep     # Key Vault for secrets
│   ├── sendgrid.bicep      # SendGrid email service
│   ├── sql-server.bicep    # Azure SQL Database
│   └── storage.bicep       # Blob storage
└── parameters/
    ├── dev.bicepparam      # Development environment
    ├── staging.bicepparam  # Staging environment
    └── prod.bicepparam     # Production environment
```

## Prerequisites

1. **Azure CLI** installed and logged in
   ```bash
   az login
   az account set --subscription "Your Subscription Name"
   ```

2. **Bicep CLI** (included with Azure CLI 2.20.0+)
   ```bash
   az bicep version
   # If not installed: az bicep install
   ```

3. **Required permissions**: Contributor role on the subscription

## Manual Deployment

### 1. Validate Templates

```bash
# Validate the main template
az bicep build --file infra/azure/main.bicep

# Validate with parameters
az deployment sub validate \
  --location eastus \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/dev.bicepparam \
  --parameters sqlAdminLogin=youradmin sqlAdminPassword=YourSecurePassword123!
```

### 2. Preview Changes (What-If)

```bash
az deployment sub what-if \
  --location eastus \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/dev.bicepparam \
  --parameters sqlAdminLogin=youradmin sqlAdminPassword=YourSecurePassword123!
```

### 3. Deploy

```bash
# Deploy to dev environment
az deployment sub create \
  --name "modern-accounting-dev-$(date +%Y%m%d)" \
  --location eastus \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/dev.bicepparam \
  --parameters sqlAdminLogin=youradmin sqlAdminPassword=YourSecurePassword123!

# Deploy to staging
az deployment sub create \
  --name "modern-accounting-staging-$(date +%Y%m%d)" \
  --location eastus \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/staging.bicepparam \
  --parameters sqlAdminLogin=youradmin sqlAdminPassword=YourSecurePassword123!

# Deploy to production
az deployment sub create \
  --name "modern-accounting-prod-$(date +%Y%m%d)" \
  --location eastus \
  --template-file infra/azure/main.bicep \
  --parameters infra/azure/parameters/prod.bicepparam \
  --parameters sqlAdminLogin=youradmin sqlAdminPassword=YourSecurePassword123!
```

## GitHub Actions Deployment

The repository includes a workflow for automated infrastructure deployment.

### Required Secrets

Configure these secrets in your GitHub repository:

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | Azure AD application (service principal) client ID |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `SQL_ADMIN_LOGIN` | SQL Server administrator username |
| `SQL_ADMIN_PASSWORD` | SQL Server administrator password |

### Workflow Triggers

- **On PR**: Validates templates and runs what-if preview
- **On push to main**: Deploys to dev environment
- **Manual dispatch**: Deploy to any environment (dev/staging/prod)

### Manual Deployment via GitHub Actions

1. Go to **Actions** > **Deploy Infrastructure**
2. Click **Run workflow**
3. Select environment (dev/staging/prod)
4. Select action (plan/deploy)
5. Click **Run workflow**

## Post-Deployment Steps

### 1. Configure SendGrid API Key

1. Navigate to the SendGrid resource in Azure Portal
2. Click **Manage** to open SendGrid dashboard
3. Create an API key in SendGrid settings
4. Update the Key Vault secret:
   ```bash
   az keyvault secret set \
     --vault-name kv-modern-accounting-{env} \
     --name SendGridApiKey \
     --value "SG.your-api-key-here"
   ```

### 2. Run Database Migrations

```bash
# Connect to Azure SQL and run migrations
sqlcmd -S sql-modern-accounting-{env}.database.windows.net \
  -U youradmin \
  -P YourPassword \
  -d AccountingDB \
  -i database/migrations/001_Initial.sql
```

### 3. Configure App Service Settings

The App Service is pre-configured with Key Vault references. Verify the settings:

```bash
az webapp config appsettings list \
  --name app-modern-accounting-{env} \
  --resource-group rg-modern-accounting-{env}
```

### 4. Add Firewall Rules (Optional)

To allow your IP address to access SQL directly:

```bash
az sql server firewall-rule create \
  --resource-group rg-modern-accounting-{env} \
  --server sql-modern-accounting-{env} \
  --name "YourIPAddress" \
  --start-ip-address YOUR.IP.HERE \
  --end-ip-address YOUR.IP.HERE
```

## Environment Differences

| Feature | Dev | Staging | Prod |
|---------|-----|---------|------|
| App Service SKU | F1 (Free) | B1 (Basic) | B1 (Basic) |
| SQL Auto-Pause | 60 min | 120 min | 240 min |
| SendGrid Plan | Free | Free | Bronze |
| Always On | No | Yes | Yes |

## Troubleshooting

### SQL Database is paused

The serverless SQL database auto-pauses after inactivity. The first connection takes ~30 seconds to resume.

To disable auto-pause (increases cost):
```bash
az sql db update \
  --resource-group rg-modern-accounting-{env} \
  --server sql-modern-accounting-{env} \
  --name AccountingDB \
  --auto-pause-delay -1
```

### App Service Key Vault access denied

Verify the managed identity has the correct role:
```bash
az role assignment list \
  --assignee $(az webapp identity show --name app-modern-accounting-{env} --resource-group rg-modern-accounting-{env} --query principalId -o tsv) \
  --scope $(az keyvault show --name kv-modern-accounting-{env} --query id -o tsv)
```

### Template validation errors

Run Bicep linter for detailed error messages:
```bash
az bicep lint --file infra/azure/main.bicep
```

## Security Considerations

1. **Secrets**: All sensitive values are stored in Key Vault
2. **Network**: SQL Server allows Azure services; consider private endpoints for prod
3. **TLS**: All services enforce TLS 1.2 minimum
4. **RBAC**: App Service uses managed identity for Key Vault access
5. **Audit**: Key Vault logging enabled by default

## Cleanup

To delete all resources for an environment:

```bash
az group delete \
  --name rg-modern-accounting-{env} \
  --yes --no-wait
```
