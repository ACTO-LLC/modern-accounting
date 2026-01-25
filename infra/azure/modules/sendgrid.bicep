// =============================================================================
// SendGrid Module
// SendGrid email service for transactional emails
// =============================================================================

@description('SendGrid account name')
param name string

@description('Azure region')
param location string

@description('Administrator email')
param adminEmail string

@description('SendGrid plan (free = 100 emails/day)')
@allowed(['free', 'bronze', 'silver', 'gold', 'platinum'])
param plan string = 'free'

@description('Resource tags')
param tags object

@description('Key Vault name for storing API key')
param keyVaultName string

// -----------------------------------------------------------------------------
// SendGrid Account
// Note: SendGrid is a third-party marketplace offering
// The API key must be created manually in the SendGrid portal after deployment
// -----------------------------------------------------------------------------

resource sendgrid 'Sendgrid.Email/accounts@2020-12-01' = {
  name: name
  location: location
  tags: tags
  plan: {
    name: plan
    publisher: 'Sendgrid'
    product: 'sendgrid_azure'
  }
  properties: {
    acceptMarketingEmails: false
    email: adminEmail
    firstName: 'Modern'
    lastName: 'Accounting'
    company: 'Modern Accounting'
    website: 'https://modern-accounting.com'
  }
}

// -----------------------------------------------------------------------------
// Key Vault Secret Placeholder
// Note: The actual API key must be created in SendGrid portal and stored here
// -----------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource sendGridApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SendGridApiKey'
  properties: {
    value: 'PLACEHOLDER_CREATE_KEY_IN_SENDGRID_PORTAL'
    contentType: 'SendGrid API Key - Update after creating key in SendGrid portal'
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output sendGridId string = sendgrid.id
output sendGridName string = sendgrid.name
output apiKeySecretUri string = sendGridApiKeySecret.properties.secretUri
