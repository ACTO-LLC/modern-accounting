// =============================================================================
// Azure Automation Account Module
// Start/Stop scheduling for App Services to reduce costs during off-hours
// =============================================================================

@description('Name of the automation account')
param name string

@description('Location for the automation account')
param location string

@description('Tags to apply')
param tags object

@description('App Service names to manage')
param appServiceNames array

@description('Resource group name for the App Services')
param appServiceResourceGroup string

@description('Start time in Pacific Time (HH:mm)')
param startTime string = '07:00'

@description('Stop time in Pacific Time (HH:mm)')
param stopTime string = '18:00'

@description('Base timestamp for schedule start (used to calculate tomorrow)')
param baseTime string = utcNow('yyyy-MM-dd')

// -----------------------------------------------------------------------------
// Automation Account
// Free tier includes 500 minutes/month of job runtime
// -----------------------------------------------------------------------------

resource automationAccount 'Microsoft.Automation/automationAccounts@2023-11-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    sku: {
      name: 'Free'
    }
    publicNetworkAccess: true
  }
}

// -----------------------------------------------------------------------------
// Runbooks - Created as empty shells, content uploaded via Azure CLI
// -----------------------------------------------------------------------------

resource stopRunbook 'Microsoft.Automation/automationAccounts/runbooks@2023-11-01' = {
  parent: automationAccount
  name: 'StopAppServices'
  location: location
  properties: {
    runbookType: 'PowerShell'
    logProgress: true
    logVerbose: false
    description: 'Stops App Services during off-hours (6 PM PT weekdays)'
  }
}

resource startRunbook 'Microsoft.Automation/automationAccounts/runbooks@2023-11-01' = {
  parent: automationAccount
  name: 'StartAppServices'
  location: location
  properties: {
    runbookType: 'PowerShell'
    logProgress: true
    logVerbose: false
    description: 'Starts App Services in the morning (7 AM PT weekdays)'
  }
}

// -----------------------------------------------------------------------------
// Variables - Store configuration used by runbooks
// -----------------------------------------------------------------------------

resource resourceGroupVar 'Microsoft.Automation/automationAccounts/variables@2023-11-01' = {
  parent: automationAccount
  name: 'ResourceGroupName'
  properties: {
    value: '"${appServiceResourceGroup}"'
    isEncrypted: false
    description: 'Resource group containing the App Services'
  }
}

resource appServiceNamesVar 'Microsoft.Automation/automationAccounts/variables@2023-11-01' = {
  parent: automationAccount
  name: 'AppServiceNames'
  properties: {
    value: '"${join(appServiceNames, ',')}"'
    isEncrypted: false
    description: 'Comma-separated list of App Service names to manage'
  }
}

// -----------------------------------------------------------------------------
// Schedules - Pacific Time (America/Los_Angeles)
// Note: Schedules are created but job links require published runbooks
// -----------------------------------------------------------------------------

// Calculate tomorrow's date for schedule start (must be in the future)
var tomorrow = dateTimeAdd(baseTime, 'P1D')

resource stopSchedule 'Microsoft.Automation/automationAccounts/schedules@2023-11-01' = {
  parent: automationAccount
  name: 'StopSchedule-Weekdays'
  properties: {
    startTime: '${tomorrow}T${stopTime}:00-08:00'
    expiryTime: '9999-12-31T23:59:59+00:00'
    interval: 1
    frequency: 'Week'
    timeZone: 'America/Los_Angeles'
    advancedSchedule: {
      weekDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    }
  }
}

resource startSchedule 'Microsoft.Automation/automationAccounts/schedules@2023-11-01' = {
  parent: automationAccount
  name: 'StartSchedule-Weekdays'
  properties: {
    startTime: '${tomorrow}T${startTime}:00-08:00'
    expiryTime: '9999-12-31T23:59:59+00:00'
    interval: 1
    frequency: 'Week'
    timeZone: 'America/Los_Angeles'
    advancedSchedule: {
      weekDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    }
  }
}

// -----------------------------------------------------------------------------
// Role Assignment - Website Contributor for App Service start/stop
// -----------------------------------------------------------------------------

resource websiteContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, automationAccount.id, 'Website Contributor')
  properties: {
    principalId: automationAccount.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'de139f84-1756-47ae-9be6-808fbbe84772') // Website Contributor
    principalType: 'ServicePrincipal'
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

output automationAccountId string = automationAccount.id
output automationAccountName string = automationAccount.name
output automationPrincipalId string = automationAccount.identity.principalId
output stopRunbookName string = stopRunbook.name
output startRunbookName string = startRunbook.name
output stopScheduleName string = stopSchedule.name
output startScheduleName string = startSchedule.name
