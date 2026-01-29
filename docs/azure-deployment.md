# Azure Deployment Guide for Modern Accounting

This guide covers deploying Modern Accounting to Azure for A CTO, LLC.

## Target Environment

| Setting | Value |
|---------|-------|
| Tenant | A CTO, LLC (`f8ac75ce-d250-407e-b8cb-e05f5b4cd913`) |
| Subscription | MCPP Subscription (`a6f5a418-461f-42c0-a07a-90142521e5fb`) |
| Environment | prod |
| Region | East US |
| Timezone | Pacific Time (America/Los_Angeles) |

## Cost Estimate

| Resource | Tier | Monthly Cost |
|----------|------|--------------|
| App Service | B1 Basic | ~$13 (or ~$4 with off-hours stop) |
| SQL Database | Serverless GP_S_Gen5_1 | ~$5-15 |
| Storage Account | Standard_LRS | ~$0.50 |
| Key Vault | Standard | ~$0.03 |
| Azure OpenAI | S0 (pay-per-use) | ~$0-5 |
| SendGrid | Free | $0 |
| App Insights | Free tier | $0 |
| Azure Automation | Free tier | $0 (500 min/month free) |
| **Total (24/7)** | | **~$19-34/month** |
| **Total (off-hours stop)** | | **~$10-25/month** |

## Prerequisites

1. Azure CLI installed and authenticated
2. Contributor access to the subscription
3. Node.js 20+ installed
4. PowerShell (for runbook scripts)

## Deployment Steps

### Step 1: Login to Azure

```powershell
az login --tenant f8ac75ce-d250-407e-b8cb-e05f5b4cd913
az account set --subscription a6f5a418-461f-42c0-a07a-90142521e5fb
```

### Step 2: Generate SQL Password

```powershell
# Generate a 32-character secure random password
$sqlPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Output "SQL Password: $sqlPassword"
# IMPORTANT: Save this password securely - you'll need it for deployment and database access
```

### Step 3: Deploy Infrastructure

```powershell
az deployment sub create `
  --name "modern-accounting-prod-$(Get-Date -Format yyyyMMdd)" `
  --location eastus `
  --template-file infra/azure/main.bicep `
  --parameters infra/azure/parameters/prod.bicepparam `
  --parameters sqlAdminLogin=sqladmin sqlAdminPassword=$sqlPassword
```

This deploys:
- Resource Group: `rg-modern-accounting-prod`
- Key Vault: `kv-modern-accounting-prod`
- Storage Account: `stmodernaccountingprod`
- SQL Server: `sql-modern-accounting-prod`
- SQL Database: `AccountingDB`
- App Service Plan: `plan-modern-accounting-prod`
- App Service: `app-modern-accounting-prod`
- MCP Service: `mcp-ma-modern-accounting-prod`
- Azure OpenAI: `oai-modern-accounting-prod`
- SendGrid: `sendgrid-modern-accounting-prod`
- Automation Account: `auto-modern-accounting-prod`

### Step 4: Upload Runbook Scripts

After infrastructure deployment, upload the PowerShell runbook scripts:

```powershell
# Upload and publish Stop runbook
az automation runbook replace-content `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --name StopAppServices `
  --content @infra/scripts/Stop-AppServices.ps1

az automation runbook publish `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --name StopAppServices

# Upload and publish Start runbook
az automation runbook replace-content `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --name StartAppServices `
  --content @infra/scripts/Start-AppServices.ps1

az automation runbook publish `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --name StartAppServices
```

### Step 5: Link Runbooks to Schedules

After publishing runbooks, link them to the schedules:

```powershell
# Link Stop runbook to Stop schedule
az automation job-schedule create `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --runbook-name StopAppServices `
  --schedule-name StopSchedule-Weekdays

# Link Start runbook to Start schedule
az automation job-schedule create `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --runbook-name StartAppServices `
  --schedule-name StartSchedule-Weekdays
```

### Step 6: Deploy Database Schema

Add your IP to the SQL Server firewall:

```powershell
$myIp = (Invoke-WebRequest -Uri "https://ifconfig.me/ip").Content.Trim()
az sql server firewall-rule create `
  --resource-group rg-modern-accounting-prod `
  --server sql-modern-accounting-prod `
  --name AllowMyIP `
  --start-ip-address $myIp `
  --end-ip-address $myIp
```

Deploy the database schema:

```powershell
$env:SQL_SERVER = "sql-modern-accounting-prod.database.windows.net"
$env:SQL_PORT = "1433"
$env:SQL_USER = "sqladmin"
$env:SQL_SA_PASSWORD = $sqlPassword
$env:SQL_DATABASE = "AccountingDB"

node scripts/deploy-db.js --node
```

### Step 7: Deploy Application

Build and deploy the application:

```powershell
# Build client
cd client
npm ci
npm run build

# Prepare API
cd ../chat-api
npm ci --production

# Create deployment package
cd ..
Compress-Archive -Path chat-api/* -DestinationPath deploy.zip -Force

# Deploy to App Service
az webapp deployment source config-zip `
  --resource-group rg-modern-accounting-prod `
  --name app-modern-accounting-prod `
  --src deploy.zip
```

## Schedule Summary (Pacific Time)

| Day | Start (PT) | Stop (PT) | Hours Running |
|-----|-----------|-----------|---------------|
| Mon-Fri | 7:00 AM | 6:00 PM | 11 hours |
| Sat-Sun | (stopped) | (stopped) | 0 hours |

**Weekly hours:** 55 hours (vs 168 hours 24/7) = **67% cost reduction on App Service**

## Verification

### Check Infrastructure

```powershell
# List all resources in the resource group
az resource list --resource-group rg-modern-accounting-prod --output table

# Check automation account
az automation account show `
  --name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod

# List schedules
az automation schedule list `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --output table
```

### Check Application

```powershell
# Get App Service URL
az webapp show `
  --name app-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --query "defaultHostName" -o tsv

# Test health endpoint
curl https://app-modern-accounting-prod.azurewebsites.net/health
```

## Manual Operations

### Manual Start/Stop

```powershell
# Manual stop
az webapp stop --resource-group rg-modern-accounting-prod --name app-modern-accounting-prod
az webapp stop --resource-group rg-modern-accounting-prod --name mcp-ma-modern-accounting-prod

# Manual start
az webapp start --resource-group rg-modern-accounting-prod --name app-modern-accounting-prod
az webapp start --resource-group rg-modern-accounting-prod --name mcp-ma-modern-accounting-prod
```

### Check Automation Jobs

```powershell
# List recent jobs
az automation job list `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --output table

# Get job details
az automation job show `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --name <job-name>
```

### Test Runbooks Manually

```powershell
# Test stop runbook
az automation runbook start `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --name StopAppServices

# Test start runbook
az automation runbook start `
  --automation-account-name auto-modern-accounting-prod `
  --resource-group rg-modern-accounting-prod `
  --name StartAppServices
```

## Troubleshooting

### App Service Not Starting

1. Check the automation job output in Azure Portal
2. Verify the managed identity has Website Contributor role
3. Check App Service logs: `az webapp log tail --name app-modern-accounting-prod --resource-group rg-modern-accounting-prod`

### Schedule Not Running

1. Verify schedule is enabled in Azure Portal
2. Check that runbook is published (not draft)
3. Verify job schedule link exists

### Database Connection Issues

1. Verify firewall rules allow App Service IP
2. Check connection string in Key Vault
3. Wake up serverless database: `az sql db show --name AccountingDB --server sql-modern-accounting-prod --resource-group rg-modern-accounting-prod`

## Resource Cleanup

To delete all resources:

```powershell
az group delete --name rg-modern-accounting-prod --yes --no-wait
```

**Warning:** This is irreversible and will delete all data.
