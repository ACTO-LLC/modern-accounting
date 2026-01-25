// =============================================================================
// Modern Accounting - Azure Infrastructure Deployment
// Main orchestration template
// =============================================================================

targetScope = 'subscription'

// -----------------------------------------------------------------------------
// Parameters
// -----------------------------------------------------------------------------

@description('Environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Azure region for resources')
param location string = 'eastus'

@description('Base name for resources')
param baseName string = 'modern-accounting'

@description('SQL administrator login')
@secure()
param sqlAdminLogin string

@description('SQL administrator password')
@secure()
param sqlAdminPassword string

@description('SendGrid administrator email')
param sendGridAdminEmail string = 'admin@a-cto.com'

@description('App Service SKU (F1 for free, B1 for basic)')
@allowed(['F1', 'B1', 'S1'])
param appServiceSku string = 'F1'

@description('SQL Database tier')
@allowed(['Basic', 'S0', 'S1', 'GP_S_Gen5_1'])
param sqlDatabaseSku string = 'GP_S_Gen5_1'

@description('Enable auto-pause for serverless SQL (only applies to GP_S tier)')
param sqlAutoPauseDelayMinutes int = 60

@description('Tags to apply to all resources')
param tags object = {
  application: 'modern-accounting'
  environment: environment
  managedBy: 'bicep'
}

// -----------------------------------------------------------------------------
// Variables
// -----------------------------------------------------------------------------

var resourceGroupName = 'rg-${baseName}-${environment}'
var uniqueSuffix = uniqueString(subscription().subscriptionId, resourceGroupName)

// -----------------------------------------------------------------------------
// Resource Group
// -----------------------------------------------------------------------------

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// -----------------------------------------------------------------------------
// Key Vault Module (deploy first for secret storage)
// -----------------------------------------------------------------------------

module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVault-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    name: 'kv-${baseName}-${environment}'
    location: location
    tags: tags
  }
}

// -----------------------------------------------------------------------------
// Storage Account Module
// -----------------------------------------------------------------------------

module storage 'modules/storage.bicep' = {
  name: 'storage-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    name: 'st${replace(baseName, '-', '')}${environment}'
    location: location
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

// -----------------------------------------------------------------------------
// SQL Server Module
// -----------------------------------------------------------------------------

module sqlServer 'modules/sql-server.bicep' = {
  name: 'sqlServer-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    serverName: 'sql-${baseName}-${environment}'
    databaseName: 'AccountingDB'
    location: location
    administratorLogin: sqlAdminLogin
    administratorPassword: sqlAdminPassword
    databaseSku: sqlDatabaseSku
    autoPauseDelayMinutes: sqlAutoPauseDelayMinutes
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

// -----------------------------------------------------------------------------
// App Service Module
// -----------------------------------------------------------------------------

module appService 'modules/app-service.bicep' = {
  name: 'appService-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    appName: 'app-${baseName}-${environment}'
    planName: 'plan-${baseName}-${environment}'
    location: location
    sku: appServiceSku
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
    sqlConnectionStringSecretUri: sqlServer.outputs.connectionStringSecretUri
    storageConnectionStringSecretUri: storage.outputs.connectionStringSecretUri
  }
}

// -----------------------------------------------------------------------------
// SendGrid Module
// -----------------------------------------------------------------------------

module sendGrid 'modules/sendgrid.bicep' = {
  name: 'sendgrid-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    name: 'sendgrid-${baseName}-${environment}'
    location: location
    adminEmail: sendGridAdminEmail
    plan: environment == 'prod' ? 'bronze' : 'free'
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output resourceGroupName string = resourceGroup.name
output keyVaultName string = keyVault.outputs.keyVaultName
output keyVaultUri string = keyVault.outputs.keyVaultUri
output storageAccountName string = storage.outputs.storageAccountName
output sqlServerFqdn string = sqlServer.outputs.sqlServerFqdn
output sqlDatabaseName string = sqlServer.outputs.databaseName
output appServiceUrl string = appService.outputs.appServiceUrl
output appServicePrincipalId string = appService.outputs.principalId
