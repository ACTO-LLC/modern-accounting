# Start All Services for Modern Accounting
# Usage: .\start-all.ps1
#
# For isolated dev environments, use Dev Containers instead:
#   VS Code: "Dev Containers: Reopen in Container"

param(
    [switch]$SkipDocker,
    [switch]$ClientOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Modern Accounting - Service Launcher  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a port is in use
function Test-Port {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Function to wait for a service
function Wait-ForService {
    param([string]$Url, [string]$Name, [int]$TimeoutSeconds = 30)
    Write-Host "  Waiting for $Name..." -NoNewline
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            Write-Host " Ready!" -ForegroundColor Green
            return $true
        } catch { }
        Start-Sleep -Seconds 1
        $elapsed++
        Write-Host "." -NoNewline
    }
    Write-Host " Timeout!" -ForegroundColor Yellow
    return $false
}

# Start Docker services
if (-not $SkipDocker -and -not $ClientOnly) {
    Write-Host "[1/3] Starting Docker services..." -ForegroundColor Yellow
    Push-Location $Root
    try {
        docker compose up -d
        Write-Host "  Docker containers started" -ForegroundColor Green
        Wait-ForService -Url "http://localhost:5000/api/accounts" -Name "DAB API" -TimeoutSeconds 60
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/3] Skipping Docker" -ForegroundColor DarkGray
}

# Start chat-api
if (-not $ClientOnly) {
    Write-Host ""
    Write-Host "[2/3] Starting chat-api (port 7071)..." -ForegroundColor Yellow
    if (Test-Port 7071) {
        Write-Host "  Already running" -ForegroundColor DarkGray
    } else {
        $chatApiPath = Join-Path $Root "chat-api"
        Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$chatApiPath`" && npm start" -WindowStyle Minimized
        Start-Sleep -Seconds 2
        Wait-ForService -Url "http://localhost:7071/api/qbo/status" -Name "chat-api" -TimeoutSeconds 30
    }
} else {
    Write-Host "[2/3] Skipping chat-api" -ForegroundColor DarkGray
}

# Start client
Write-Host ""
Write-Host "[3/3] Starting client (port 5173)..." -ForegroundColor Yellow
if (Test-Port 5173) {
    Write-Host "  Already running" -ForegroundColor DarkGray
} else {
    $clientPath = Join-Path $Root "client"
    Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$clientPath`" && npm run dev" -WindowStyle Minimized
    Start-Sleep -Seconds 3
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!                 " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  http://localhost:5173" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Stop: .\stop-all.ps1" -ForegroundColor Gray
Write-Host ""
