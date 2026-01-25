// =============================================================================
// Development Environment Parameters
// Cost-optimized for development/testing (~$5-10/month)
// =============================================================================

using '../main.bicep'

param environment = 'dev'
param location = 'eastus'
param baseName = 'modern-accounting'

// App Service - Free tier for development
param appServiceSku = 'F1'

// SQL Database - Serverless with aggressive auto-pause
// Auto-pauses after 1 hour of inactivity to save costs
param sqlDatabaseSku = 'GP_S_Gen5_1'
param sqlAutoPauseDelayMinutes = 60

// SendGrid - Free tier (100 emails/day)
param sendGridAdminEmail = 'admin@a-cto.com'

// Tags
param tags = {
  application: 'modern-accounting'
  environment: 'dev'
  managedBy: 'bicep'
  costCenter: 'development'
}

// Secrets - These should be provided at deployment time
// Use: az deployment sub create --parameters dev.bicepparam --parameters sqlAdminLogin=admin sqlAdminPassword=YourPassword
param sqlAdminLogin = '' // Required - provide at deployment
param sqlAdminPassword = '' // Required - provide at deployment
