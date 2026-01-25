// =============================================================================
// Staging Environment Parameters
// Similar to production but with cost optimizations (~$15-25/month)
// =============================================================================

using '../main.bicep'

param environment = 'staging'
param location = 'eastus'
param baseName = 'modern-accounting'

// App Service - Basic tier for staging (supports custom domains, SSL)
param appServiceSku = 'B1'

// SQL Database - Serverless with moderate auto-pause
// Auto-pauses after 2 hours to balance cost vs availability
param sqlDatabaseSku = 'GP_S_Gen5_1'
param sqlAutoPauseDelayMinutes = 120

// SendGrid - Free tier (100 emails/day is sufficient for staging)
param sendGridAdminEmail = 'admin@a-cto.com'

// Tags
param tags = {
  application: 'modern-accounting'
  environment: 'staging'
  managedBy: 'bicep'
  costCenter: 'staging'
}

// Secrets - These should be provided at deployment time
// Use: az deployment sub create --parameters staging.bicepparam --parameters sqlAdminLogin=admin sqlAdminPassword=YourPassword
param sqlAdminLogin = '' // Required - provide at deployment
param sqlAdminPassword = '' // Required - provide at deployment
