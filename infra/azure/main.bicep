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

@description('App Service SKU (F1 for free, B1 for basic)')
@allowed(['F1', 'B1', 'S1'])
param appServiceSku string = 'F1'

@description('SQL Database tier')
@allowed(['Basic', 'S0', 'S1', 'GP_S_Gen5_1'])
param sqlDatabaseSku string = 'GP_S_Gen5_1'

@description('Enable auto-pause for serverless SQL (only applies to GP_S tier)')
param sqlAutoPauseDelayMinutes int = 60

@description('Deploy Azure OpenAI (requires quota approval)')
param deployOpenAI bool = true

@description('Azure OpenAI location (may differ from main location due to quota availability)')
param openAILocation string = 'eastus'

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
    name: 'kv${take(uniqueString(subscription().subscriptionId, resourceGroupName), 8)}${environment}'
    location: location
    tags: tags
  }
}

// -----------------------------------------------------------------------------
// Azure OpenAI Module
// Provides GPT-4o for Milton AI assistant
// Note: Deployed to East US due to quota availability
// -----------------------------------------------------------------------------

module openAI 'modules/openai.bicep' = if (deployOpenAI) {
  name: 'openai-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    name: 'oai-${baseName}-${environment}'
    location: openAILocation
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
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
// MA MCP Server Module (Onboarding/Feature MCP)
// -----------------------------------------------------------------------------

module maMcpServer 'modules/mcp-service.bicep' = {
  name: 'maMcpServer-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    serviceName: 'mcp-ma-${baseName}-${environment}'
    appServicePlanId: appService.outputs.appServicePlanId
    location: location
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
    appInsightsConnectionString: appService.outputs.appInsightsConnectionString
    mcpType: 'ma-mcp'
    port: 5002
  }
}

// -----------------------------------------------------------------------------
// QBO MCP Server Module (QuickBooks Online MCP)
// -----------------------------------------------------------------------------

module qboMcpServer 'modules/mcp-service.bicep' = {
  name: 'qboMcpServer-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    serviceName: 'mcp-qbo-${baseName}-${environment}'
    appServicePlanId: appService.outputs.appServicePlanId
    location: location
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
    appInsightsConnectionString: appService.outputs.appInsightsConnectionString
    mcpType: 'qbo-mcp'
    port: 8001
  }
}

// -----------------------------------------------------------------------------
// Azure Automation Module (Start/Stop Scheduling)
// Reduces costs by stopping App Services during off-hours (6 PM - 7 AM PT)
// Only deployed for non-dev environments
// -----------------------------------------------------------------------------

module automation 'modules/automation.bicep' = if (environment != 'dev') {
  name: 'automation-${uniqueSuffix}'
  scope: resourceGroup
  params: {
    name: 'auto-${baseName}-${environment}'
    location: location
    tags: tags
    appServiceResourceGroup: resourceGroupName
    appServiceNames: [
      'app-${baseName}-${environment}'
      'mcp-ma-${baseName}-${environment}'
      'mcp-qbo-${baseName}-${environment}'
    ]
    startTime: '07:00'
    stopTime: '18:00'
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
output maMcpServerUrl string = maMcpServer.outputs.serviceUrl
output qboMcpServerUrl string = qboMcpServer.outputs.serviceUrl
output openAIEndpoint string = deployOpenAI ? openAI.outputs.openAIEndpoint : ''
output openAIDeploymentName string = deployOpenAI ? openAI.outputs.gpt4oDeploymentName : ''
output automationAccountName string = automation.?outputs.?automationAccountName ?? ''
