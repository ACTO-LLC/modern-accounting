<#
.SYNOPSIS
    Run the deployment scheduler

.DESCRIPTION
    This script runs the deployment scheduler to process scheduled deployments.
    It can be scheduled via Windows Task Scheduler or executed manually.

.EXAMPLE
    .\run-scheduler.ps1
    Runs the scheduler once and exits.

.NOTES
    Exit codes:
    0 - All deployments processed successfully
    1 - One or more deployments failed or scheduler error
#>

$ErrorActionPreference = "Stop"

# Determine paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$monitorAgentDir = Join-Path $projectDir "monitor-agent"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Scheduler" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# Load environment from .env file if it exists
$envFile = Join-Path $projectDir ".env"
if (Test-Path $envFile) {
    Write-Host "Loading environment from .env file..." -ForegroundColor Gray
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $key = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            # Remove surrounding quotes if present
            if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
                $value = $Matches[1]
            }
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

# Also check monitor-agent specific .env
$monitorEnvFile = Join-Path $monitorAgentDir ".env"
if (Test-Path $monitorEnvFile) {
    Write-Host "Loading environment from monitor-agent/.env file..." -ForegroundColor Gray
    Get-Content $monitorEnvFile | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $key = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            # Remove surrounding quotes if present
            if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") {
                $value = $Matches[1]
            }
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

# Run the scheduler
Write-Host "Running scheduler from: $monitorAgentDir" -ForegroundColor Gray
Write-Host ""

Push-Location $monitorAgentDir
try {
    npm run scheduler
    $exitCode = $LASTEXITCODE
} catch {
    Write-Host "Error running scheduler: $_" -ForegroundColor Red
    $exitCode = 1
} finally {
    Pop-Location
}

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Scheduler completed successfully" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "Scheduler completed with errors (exit code: $exitCode)" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
}

exit $exitCode
