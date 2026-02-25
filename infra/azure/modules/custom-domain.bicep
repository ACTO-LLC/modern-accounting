// =============================================================================
// Custom Domain Module
// Adds a custom hostname binding and App Service Managed Certificate
// =============================================================================

@description('Name of the existing App Service')
param appServiceName string

@description('Custom domain hostname (e.g., accounting.a-cto.com)')
param customHostname string

@description('Azure region')
param location string

@description('Resource tags')
param tags object

// -----------------------------------------------------------------------------
// Reference existing App Service
// -----------------------------------------------------------------------------

resource appService 'Microsoft.Web/sites@2023-12-01' existing = {
  name: appServiceName
}

// -----------------------------------------------------------------------------
// Hostname Binding
// Binds the custom domain to the App Service. DNS CNAME + TXT verification
// records must already exist before this resource is created.
// -----------------------------------------------------------------------------

resource hostnameBinding 'Microsoft.Web/sites/hostNameBindings@2023-12-01' = {
  parent: appService
  name: customHostname
  properties: {
    siteName: appServiceName
    hostNameType: 'Verified'
    sslState: 'Disabled' // SSL binding is done in a post-deploy step after cert is issued
  }
}

// -----------------------------------------------------------------------------
// App Service Managed Certificate (free SSL)
// Azure provisions and auto-renews the certificate.
// Note: The cert creation depends on the hostname binding being in place.
// SSL binding (sniEnabled) requires a separate az CLI step post-deploy.
// -----------------------------------------------------------------------------

resource managedCert 'Microsoft.Web/certificates@2023-12-01' = {
  name: '${customHostname}-cert'
  location: location
  tags: tags
  properties: {
    serverFarmId: appService.properties.serverFarmId
    canonicalName: customHostname
  }
  dependsOn: [
    hostnameBinding
  ]
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output certificateThumbprint string = managedCert.properties.thumbprint
output hostnameBindingName string = hostnameBinding.name
