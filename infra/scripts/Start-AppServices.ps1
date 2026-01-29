<#
.SYNOPSIS
    Starts Azure App Services in the morning to prepare for business hours.

.DESCRIPTION
    This runbook is triggered by Azure Automation at 7 AM PT (Monday-Friday).
    It starts the specified App Services and performs a warm-up request.

.NOTES
    Author: Modern Accounting Team
    Schedule: 7 AM PT, Monday-Friday
    Uses Azure Automation managed identity for authentication.
#>

# Import required modules
Import-Module Az.Accounts
Import-Module Az.Websites

# Get automation variables (set during Bicep deployment)
$ResourceGroup = Get-AutomationVariable -Name 'ResourceGroupName'
$AppServiceNamesString = Get-AutomationVariable -Name 'AppServiceNames'

Write-Output "=============================================="
Write-Output "Start App Services Runbook"
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
Write-Output "App Services to start: $($AppServiceNames -join ', ')"
Write-Output "----------------------------------------------"

$successCount = 0
$failCount = 0
$startedApps = @()

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

        if ($app.State -ne 'Running') {
            Write-Output "  Starting $appName..."
            Start-AzWebApp -ResourceGroupName $ResourceGroup -Name $appName -ErrorAction Stop
            Write-Output "  Successfully started $appName at $(Get-Date -Format 'HH:mm:ss') UTC"
            $startedApps += @{
                Name = $appName
                Hostname = $app.DefaultHostName
            }
            $successCount++
        }
        else {
            Write-Output "  $appName is already running. Skipping."
            $startedApps += @{
                Name = $appName
                Hostname = $app.DefaultHostName
            }
            $successCount++
        }
    }
    catch {
        Write-Warning "  Failed to start $appName : $_"
        $failCount++
    }
}

# Warm-up requests
Write-Output ""
Write-Output "----------------------------------------------"
Write-Output "Sending warm-up requests..."
Write-Output "----------------------------------------------"

# Wait for App Services to fully start
Start-Sleep -Seconds 30

foreach ($app in $startedApps) {
    $warmupUrl = "https://$($app.Hostname)/health"
    Write-Output ""
    Write-Output "Warming up: $($app.Name)"
    Write-Output "  URL: $warmupUrl"

    try {
        $response = Invoke-WebRequest -Uri $warmupUrl -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
        Write-Output "  Response: $($response.StatusCode) - Warm-up successful"
    }
    catch {
        # Non-critical - just log and continue
        Write-Output "  Warm-up request sent (response: $($_.Exception.Message))"
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
    Write-Warning "Some App Services failed to start. Check the logs above."
}
else {
    Write-Output "All App Services started successfully."
}
