// =============================================================================
// Production Environment Parameters
// Optimized for small team (~3 users) with reliability (~$20-35/month)
// =============================================================================

using '../main.bicep'

param environment = 'prod'
param location = 'eastus'
param baseName = 'modern-accounting'

// App Service - Basic tier (supports custom domains, SSL, Always On)
param appServiceSku = 'B1'

// SQL Database - Serverless with longer auto-pause
// Auto-pauses after 4 hours to balance cost vs user experience
// First query after pause takes ~30 seconds to resume
param sqlDatabaseSku = 'GP_S_Gen5_1'
param sqlAutoPauseDelayMinutes = 240

// SendGrid - Bronze tier for production (40k emails/month)
param sendGridAdminEmail = 'admin@a-cto.com'

// Tags
param tags = {
  application: 'modern-accounting'
  environment: 'prod'
  managedBy: 'bicep'
  costCenter: 'production'
}

// Secrets - These should be provided at deployment time
// Use: az deployment sub create --parameters prod.bicepparam --parameters sqlAdminLogin=admin sqlAdminPassword=YourPassword
param sqlAdminLogin = '' // Required - provide at deployment
param sqlAdminPassword = '' // Required - provide at deployment
