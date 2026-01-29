<#
.SYNOPSIS
    Stops Azure App Services during off-hours to reduce costs.

.DESCRIPTION
    This runbook is triggered by Azure Automation at 6 PM PT (Monday-Friday).
    It stops the specified App Services and logs the results.

.NOTES
    Author: Modern Accounting Team
    Schedule: 6 PM PT, Monday-Friday
    Uses Azure Automation managed identity for authentication.
#>

# Import required modules
Import-Module Az.Accounts
Import-Module Az.Websites

# Get automation variables (set during Bicep deployment)
$ResourceGroup = Get-AutomationVariable -Name 'ResourceGroupName'
$AppServiceNamesString = Get-AutomationVariable -Name 'AppServiceNames'

Write-Output "=============================================="
Write-Output "Stop App Services Runbook"
Write-Output "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') UTC"
Write-Output "=============================================="

# Authenticate using managed identity
try {
    Write-Output "Connecting to Azure using managed identity..."
    Connect-AzAccount -Identity -ErrorAction Stop
    Write-Output "Successfully authenticated to Azure."
}
catch {
    Write-Error "Failed to authenticate: $_"
    throw
}

# Parse App Service names
$AppServiceNames = $AppServiceNamesString -split ','
Write-Output "Resource Group: $ResourceGroup"
Write-Output "App Services to stop: $($AppServiceNames -join ', ')"
Write-Output "----------------------------------------------"

$successCount = 0
$failCount = 0

foreach ($appName in $AppServiceNames) {
    $appName = $appName.Trim()
    if ([string]::IsNullOrWhiteSpace($appName)) {
        continue
    }

    Write-Output ""
    Write-Output "Processing: $appName"

    try {
        # Check current state
        $app = Get-AzWebApp -ResourceGroupName $ResourceGroup -Name $appName -ErrorAction Stop
        Write-Output "  Current state: $($app.State)"

        if ($app.State -eq 'Running') {
            Write-Output "  Stopping $appName..."
            Stop-AzWebApp -ResourceGroupName $ResourceGroup -Name $appName -ErrorAction Stop
            Write-Output "  Successfully stopped $appName at $(Get-Date -Format 'HH:mm:ss') UTC"
            $successCount++
        }
        else {
            Write-Output "  $appName is already stopped. Skipping."
            $successCount++
        }
    }
    catch {
        Write-Warning "  Failed to stop $appName : $_"
        $failCount++
    }
}

Write-Output ""
Write-Output "=============================================="
Write-Output "Summary"
Write-Output "=============================================="
Write-Output "Successful: $successCount"
Write-Output "Failed: $failCount"
Write-Output "Completed: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') UTC"

if ($failCount -gt 0) {
    Write-Warning "Some App Services failed to stop. Check the logs above."
}
else {
    Write-Output "All App Services stopped successfully."
}
