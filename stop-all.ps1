# Stop All Services for Modern Accounting
# Usage: .\stop-all.ps1
# Options:
#   -KeepDocker    Keep Docker containers running

param(
    [switch]$KeepDocker
)

$ErrorActionPreference = "SilentlyContinue"
$Root = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Modern Accounting - Service Stopper   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Stop Node.js processes on specific ports
function Stop-NodeOnPort {
    param([int]$Port, [string]$Name)

    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
                  Where-Object { $_.State -eq 'Listen' } |
                  Select-Object -First 1

    if ($connection) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq 'node') {
            Stop-Process -Id $process.Id -Force
            Write-Host "  Stopped $Name (PID: $($process.Id))" -ForegroundColor Green
            return $true
        }
    }
    Write-Host "  $Name not running" -ForegroundColor DarkGray
    return $false
}

Write-Host "[1/3] Stopping chat-api (port 7071)..." -ForegroundColor Yellow
Stop-NodeOnPort -Port 7071 -Name "chat-api"

Write-Host ""
Write-Host "[2/3] Stopping client (port 5173)..." -ForegroundColor Yellow
Stop-NodeOnPort -Port 5173 -Name "client"

Write-Host ""
if (-not $KeepDocker) {
    Write-Host "[3/3] Stopping Docker services..." -ForegroundColor Yellow
    Push-Location $Root
    try {
        docker compose down
        Write-Host "  Docker containers stopped" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[3/3] Keeping Docker services running" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services stopped!                 " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
