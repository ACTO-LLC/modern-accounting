// =============================================================================
// DNS Zone Module
// Azure DNS Zone for a-cto.com with CNAME and TXT verification records
// =============================================================================

@description('DNS zone name (e.g., a-cto.com)')
param zoneName string

@description('Azure region (DNS zones are global, but metadata needs a region)')
param location string = 'global'

@description('Resource tags')
param tags object

@description('Custom domain verification ID from the main App Service')
param appServiceVerificationId string

// Domain-to-host mappings for CNAME records
@description('CNAME record mappings: subdomain -> target hostname')
param cnameRecords array = []

// -----------------------------------------------------------------------------
// DNS Zone
// -----------------------------------------------------------------------------

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' = {
  name: zoneName
  location: location
  tags: tags
  properties: {
    zoneType: 'Public'
  }
}

// -----------------------------------------------------------------------------
// CNAME Records (one per custom domain)
// -----------------------------------------------------------------------------

resource cnameRecord 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = [
  for record in cnameRecords: {
    parent: dnsZone
    name: record.name
    properties: {
      TTL: 3600
      CNAMERecord: {
        cname: record.target
      }
    }
  }
]

// -----------------------------------------------------------------------------
// TXT Verification Records (asuid.* for App Service domain verification)
// Each custom domain requires a TXT record at asuid.<subdomain> with the
// App Service's custom domain verification ID.
// -----------------------------------------------------------------------------

resource txtVerificationRecord 'Microsoft.Network/dnsZones/TXT@2018-05-01' = [
  for record in cnameRecords: {
    parent: dnsZone
    name: 'asuid.${record.name}'
    properties: {
      TTL: 3600
      TXTRecords: [
        {
          value: [
            record.verificationId
          ]
        }
      ]
    }
  }
]

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output dnsZoneId string = dnsZone.id
output dnsZoneName string = dnsZone.name
output nameServers array = dnsZone.properties.nameServers
