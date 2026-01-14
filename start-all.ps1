# Start All Services for Modern Accounting
# Usage: .\start-all.ps1
# Options:
#   -SkipDocker    Skip starting Docker containers (if already running)
#   -ClientOnly    Only start the client (for frontend dev)
#   -ApiOnly       Only start chat-api (for backend dev)

param(
    [switch]$SkipDocker,
    [switch]$ClientOnly,
    [switch]$ApiOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$script:ClientPort = "5173"  # Default, will be updated if different

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

# Function to wait for a service to be ready
function Wait-ForService {
    param([string]$Url, [string]$Name, [int]$TimeoutSeconds = 30)

    Write-Host "  Waiting for $Name..." -NoNewline
    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host " Ready!" -ForegroundColor Green
                return $true
            }
        } catch { }
        Start-Sleep -Seconds 1
        $elapsed++
        Write-Host "." -NoNewline
    }
    Write-Host " Timeout!" -ForegroundColor Yellow
    return $false
}

# Start Docker services (Database + DAB)
if (-not $SkipDocker -and -not $ClientOnly -and -not $ApiOnly) {
    Write-Host "[1/4] Starting Docker services (Database + DAB)..." -ForegroundColor Yellow

    Push-Location $Root
    try {
        docker compose up -d
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Docker compose failed!" -ForegroundColor Red
            exit 1
        }
        Write-Host "  Docker containers started" -ForegroundColor Green

        # Wait for DAB to be ready
        Wait-ForService -Url "http://localhost:5000/api/accounts" -Name "DAB API" -TimeoutSeconds 60
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/4] Skipping Docker services" -ForegroundColor DarkGray
}

# Start chat-api
if (-not $ClientOnly) {
    Write-Host ""
    Write-Host "[2/4] Starting chat-api (port 7071)..." -ForegroundColor Yellow

    if (Test-Port 7071) {
        Write-Host "  Port 7071 already in use - chat-api may be running" -ForegroundColor DarkGray
    } else {
        $chatApiPath = Join-Path $Root "chat-api"
        Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$chatApiPath`" && npm start" -WindowStyle Minimized
        Write-Host "  chat-api starting in background..." -ForegroundColor Green
        Start-Sleep -Seconds 3
        Wait-ForService -Url "http://localhost:7071/api/qbo/status" -Name "chat-api" -TimeoutSeconds 30
    }
} else {
    Write-Host "[2/4] Skipping chat-api" -ForegroundColor DarkGray
}

# Skip step 3 (reserved for future services)
Write-Host ""
Write-Host "[3/4] Reserved for future services" -ForegroundColor DarkGray

# Start client
if (-not $ApiOnly) {
    Write-Host ""
    Write-Host "[4/4] Starting client..." -ForegroundColor Yellow

    # Check if Vite is already running on common ports
    $vitePort = $null
    foreach ($port in @(5173, 5174, 5175, 5219, 5220, 5221)) {
        if (Test-Port $port) {
            $vitePort = $port
            break
        }
    }

    if ($vitePort) {
        Write-Host "  Client already running on port $vitePort" -ForegroundColor DarkGray
        $script:ClientPort = $vitePort
    } else {
        $clientPath = Join-Path $Root "client"
        Start-Process -FilePath "cmd" -ArgumentList "/c cd /d `"$clientPath`" && npm run dev" -WindowStyle Minimized
        Write-Host "  Client starting in background..." -ForegroundColor Green

        # Wait for Vite to start on any port
        Write-Host "  Waiting for Vite..." -NoNewline
        $elapsed = 0
        $maxWait = 30
        while ($elapsed -lt $maxWait) {
            foreach ($port in @(5173, 5174, 5175, 5219, 5220, 5221)) {
                if (Test-Port $port) {
                    $script:ClientPort = $port
                    Write-Host " Ready on port $port!" -ForegroundColor Green
                    break
                }
            }
            if ($script:ClientPort) { break }
            Start-Sleep -Seconds 1
            $elapsed++
            Write-Host "." -NoNewline
        }
        if (-not $script:ClientPort) {
            Write-Host " Started (check minimized window for port)" -ForegroundColor Yellow
            $script:ClientPort = "5173"
        }
    }
} else {
    Write-Host "[4/4] Skipping client" -ForegroundColor DarkGray
    $script:ClientPort = "5173"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  All services started!                 " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Services:" -ForegroundColor White
Write-Host "    - Database:  localhost:14330" -ForegroundColor Gray
Write-Host "    - DAB API:   http://localhost:5000/api" -ForegroundColor Gray
Write-Host "    - chat-api:  http://localhost:7071" -ForegroundColor Gray
Write-Host "    - Client:    http://localhost:$script:ClientPort" -ForegroundColor Green
Write-Host ""
Write-Host "  Open in browser:" -ForegroundColor White
Write-Host "    http://localhost:$script:ClientPort" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To stop all services:" -ForegroundColor White
Write-Host "    .\stop-all.ps1" -ForegroundColor Gray
Write-Host ""
