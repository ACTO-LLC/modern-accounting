// =============================================================================
// Production Environment Parameters
// Optimized for small team (~3 users) with reliability (~$10-25/month with off-hours stop)
// =============================================================================

using '../main.bicep'

param environment = 'prod'
param location = 'westus2'
param baseName = 'modern-accounting'

// App Service - Basic tier (supports custom domains, SSL, Always On)
// Cost: ~$13/month (24/7) or ~$4/month (with off-hours stop)
param appServiceSku = 'B1'

// SQL Database - Serverless with auto-pause
// Auto-pauses after 1 hour to minimize costs
// First query after pause takes ~30 seconds to resume
// Cost: ~$5-15/month depending on usage
param sqlDatabaseSku = 'GP_S_Gen5_1'
param sqlAutoPauseDelayMinutes = 60

// Custom domain
param enableCustomDomain = true
param customDomainName = 'a-cto.com'

// Tags
param tags = {
  application: 'modern-accounting'
  environment: 'prod'
  managedBy: 'bicep'
  company: 'A CTO LLC'
}

// Secrets - These should be provided at deployment time
// Use: az deployment sub create --parameters prod.bicepparam --parameters sqlAdminLogin=admin sqlAdminPassword=YourPassword
param sqlAdminLogin = '' // Required - provide at deployment
param sqlAdminPassword = '' // Required - provide at deployment
