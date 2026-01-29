// =============================================================================
// Azure OpenAI Module
// Azure OpenAI Service for AI capabilities (Milton assistant)
// =============================================================================

@description('Azure OpenAI account name')
param name string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

@description('Key Vault name for storing secrets')
param keyVaultName string

@description('SKU name')
@allowed(['S0'])
param skuName string = 'S0'

@description('GPT-4o model deployment name')
param gpt4oDeploymentName string = 'gpt-4o'

@description('GPT-4o model capacity (tokens per minute in thousands)')
param gpt4oCapacity int = 30

// -----------------------------------------------------------------------------
// Azure OpenAI Resource
// -----------------------------------------------------------------------------

resource openAI 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: name
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: skuName
  }
  properties: {
    customSubDomainName: name
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

// -----------------------------------------------------------------------------
// GPT-4o Model Deployment
// -----------------------------------------------------------------------------

resource gpt4oDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: openAI
  name: gpt4oDeploymentName
  sku: {
    name: 'Standard'
    capacity: gpt4oCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: 'gpt-4o'
      version: '2024-08-06'
    }
    raiPolicyName: 'Microsoft.Default'
  }
}

// -----------------------------------------------------------------------------
// Key Vault Integration (store API key)
// -----------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource openAIKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-openai-key'
  properties: {
    value: openAI.listKeys().key1
  }
}

resource openAIEndpointSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'azure-openai-endpoint'
  properties: {
    value: openAI.properties.endpoint
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output openAIName string = openAI.name
output openAIEndpoint string = openAI.properties.endpoint
output openAIId string = openAI.id
output gpt4oDeploymentName string = gpt4oDeployment.name
output apiKeySecretUri string = openAIKeySecret.properties.secretUri
output endpointSecretUri string = openAIEndpointSecret.properties.secretUri
