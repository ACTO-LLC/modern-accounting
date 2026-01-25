// =============================================================================
// SQL Server Module
// Azure SQL Database (Serverless for cost optimization)
// =============================================================================

@description('SQL Server name')
param serverName string

@description('Database name')
param databaseName string

@description('Azure region')
param location string

@description('Administrator login')
@secure()
param administratorLogin string

@description('Administrator password')
@secure()
param administratorPassword string

@description('Database SKU (GP_S_Gen5_1 for serverless)')
@allowed(['Basic', 'S0', 'S1', 'GP_S_Gen5_1'])
param databaseSku string = 'GP_S_Gen5_1'

@description('Auto-pause delay in minutes (0 to disable, min 60)')
param autoPauseDelayMinutes int = 60

@description('Resource tags')
param tags object

@description('Key Vault name for storing connection string')
param keyVaultName string

// -----------------------------------------------------------------------------
// Variables
// -----------------------------------------------------------------------------

var isServerless = databaseSku == 'GP_S_Gen5_1'

// SKU configuration based on tier
var skuConfig = {
  Basic: {
    name: 'Basic'
    tier: 'Basic'
    capacity: 5
  }
  S0: {
    name: 'S0'
    tier: 'Standard'
    capacity: 10
  }
  S1: {
    name: 'S1'
    tier: 'Standard'
    capacity: 20
  }
  GP_S_Gen5_1: {
    name: 'GP_S_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
}

// -----------------------------------------------------------------------------
// SQL Server
// -----------------------------------------------------------------------------

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: serverName
  location: location
  tags: tags
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// -----------------------------------------------------------------------------
// SQL Database
// -----------------------------------------------------------------------------

resource database 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sqlServer
  name: databaseName
  location: location
  tags: tags
  sku: {
    name: skuConfig[databaseSku].name
    tier: skuConfig[databaseSku].tier
    family: isServerless ? skuConfig[databaseSku].family : null
    capacity: skuConfig[databaseSku].capacity
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: isServerless ? 34359738368 : 2147483648 // 32GB for serverless, 2GB for basic/standard
    autoPauseDelay: isServerless ? autoPauseDelayMinutes : null
    minCapacity: isServerless ? json('0.5') : null
    zoneRedundant: false
    requestedBackupStorageRedundancy: 'Local'
  }
}

// -----------------------------------------------------------------------------
// Firewall Rules
// -----------------------------------------------------------------------------

// Allow Azure services to access
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// -----------------------------------------------------------------------------
// Key Vault Reference for Connection String
// -----------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource connectionStringSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SqlConnectionString'
  properties: {
    value: 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Database=${databaseName};User ID=${administratorLogin};Password=${administratorPassword};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;'
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output sqlServerName string = sqlServer.name
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output databaseName string = database.name
output connectionStringSecretUri string = connectionStringSecret.properties.secretUri
