// =============================================================================
// MCP Service Module
// Azure App Service for hosting MCP (Model Context Protocol) servers
// =============================================================================

@description('Service name')
param serviceName string

@description('App Service Plan ID to use')
param appServicePlanId string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Key Vault name for secret access')
param keyVaultName string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('MCP server type (ma-mcp, qbo-mcp, etc.)')
@allowed(['ma-mcp', 'qbo-mcp', 'dab-mcp'])
param mcpType string = 'ma-mcp'

@description('Port the MCP server runs on')
param port int = 5002

@description('Additional CORS origins beyond the defaults')
param additionalCorsOrigins array = []

// -----------------------------------------------------------------------------
// App Service for MCP Server
// -----------------------------------------------------------------------------

resource mcpService 'Microsoft.Web/sites@2023-12-01' = {
  name: serviceName
  location: location
  tags: union(tags, { mcpType: mcpType })
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      cors: {
        allowedOrigins: union([
          'https://*.azurewebsites.net'
          'http://localhost:5173'
          'http://localhost:3000'
        ], additionalCorsOrigins)
        supportCredentials: true
      }
      appSettings: [
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'PORT'
          value: string(port)
        }
        {
          name: 'MCP_PORT'
          value: string(port)
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
      ]
    }
  }
}

// -----------------------------------------------------------------------------
// Key Vault Access Policy for MCP Service
// -----------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

// Grant MCP service managed identity access to Key Vault secrets
resource keyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, mcpService.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: mcpService.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output serviceName string = mcpService.name
output serviceUrl string = 'https://${mcpService.properties.defaultHostName}'
output defaultHostName string = mcpService.properties.defaultHostName
output principalId string = mcpService.identity.principalId
output customDomainVerificationId string = mcpService.properties.customDomainVerificationId
