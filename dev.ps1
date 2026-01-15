# Modern Accounting Development Script
# Usage:
#   .\dev.ps1           Start all services
#   .\dev.ps1 -Stop     Stop all services
#   .\dev.ps1 -Status   Show service status
#   .\dev.ps1 -Reset    Full reset and restart

param(
    [switch]$Stop,
    [switch]$Status,
    [switch]$Reset
)

$ErrorActionPreference = "SilentlyContinue"
$Root = $PSScriptRoot

# Colors
function Write-Status($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

# Check if port is in use
function Test-Port($Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
            Where-Object State -eq 'Listen'
    return $null -ne $conn
}

# Get process on port
function Get-PortProcess($Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
            Where-Object State -eq 'Listen' | Select-Object -First 1
    if ($conn) {
        return Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    }
    return $null
}

# Kill process on port
function Stop-PortProcess($Port, $Name) {
    $proc = Get-PortProcess $Port
    if ($proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Write-Ok "  Stopped $Name (port $Port)"
        return $true
    }
    return $false
}

# Show status
function Show-Status {
    Write-Host ""
    Write-Status "=== Service Status ==="
    Write-Host ""

    # Docker
    $dbRunning = docker ps --filter "name=accounting-db" --format "{{.Names}}" 2>$null
    $dabRunning = docker ps --filter "name=accounting-dab" --format "{{.Names}}" 2>$null
    $emailRunning = docker ps --filter "name=accounting-email-api" --format "{{.Names}}" 2>$null

    if ($dbRunning) { Write-Ok "  [OK] Database (14330)" } else { Write-Err "  [--] Database" }
    if ($dabRunning) { Write-Ok "  [OK] DAB API (5000)" } else { Write-Err "  [--] DAB API" }
    if ($emailRunning) { Write-Ok "  [OK] Email API (7073)" } else { Write-Err "  [--] Email API" }

    # Node services
    $chatApi = Get-PortProcess 7071
    if ($chatApi) { Write-Ok "  [OK] Chat API (7071)" } else { Write-Err "  [--] Chat API" }

    # Client - check multiple ports
    $clientPort = $null
    foreach ($p in 5173..5180) {
        if (Test-Port $p) {
            $proc = Get-PortProcess $p
            if ($proc -and $proc.ProcessName -eq 'node') {
                $clientPort = $p
                break
            }
        }
    }
    if ($clientPort) {
        Write-Ok "  [OK] Client (http://localhost:$clientPort)"
    } else {
        Write-Err "  [--] Client"
    }

    Write-Host ""
}

# Stop all services
function Stop-All {
    Write-Status "Stopping services..."

    # Stop Node processes
    Stop-PortProcess 7071 "Chat API"
    foreach ($p in 5173..5180) {
        Stop-PortProcess $p "Client"
    }

    # Stop Docker
    Push-Location $Root
    docker compose down 2>$null
    Pop-Location
    Write-Ok "  Stopped Docker services"

    Write-Host ""
    Write-Ok "All services stopped."
}

# Start all services
function Start-All {
    Write-Host ""
    Write-Status "=== Modern Accounting Dev Environment ==="
    Write-Host ""

    # 1. Docker services
    Write-Status "[1/3] Starting Docker services..."
    Push-Location $Root
    $dockerOutput = docker compose up -d 2>&1
    Pop-Location

    # Wait for DAB
    Write-Host "  Waiting for DAB API..." -NoNewline
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:5000/api/accounts" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                Write-Ok " Ready!"
                break
            }
        } catch {}
        Start-Sleep -Seconds 1
        Write-Host "." -NoNewline
    }

    # 2. Chat API
    Write-Status "[2/3] Starting Chat API..."
    if (Test-Port 7071) {
        Write-Warn "  Already running on port 7071"
    } else {
        $chatApiPath = Join-Path $Root "chat-api"
        Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $chatApiPath -WindowStyle Hidden
        Start-Sleep -Seconds 2
        if (Test-Port 7071) {
            Write-Ok "  Started on port 7071"
        } else {
            Write-Err "  Failed to start - check chat-api logs"
        }
    }

    # 3. Client
    Write-Status "[3/3] Starting Client..."

    # Find first available port
    $clientPort = $null
    foreach ($p in 5173..5180) {
        $proc = Get-PortProcess $p
        if ($proc -and $proc.ProcessName -eq 'node') {
            $clientPort = $p
            Write-Warn "  Already running on port $p"
            break
        }
    }

    if (-not $clientPort) {
        $clientPath = Join-Path $Root "client"
        Start-Process -FilePath "cmd" -ArgumentList "/c npm run dev" -WorkingDirectory $clientPath -WindowStyle Hidden

        # Wait for Vite to start and find the port
        Write-Host "  Waiting for Vite..." -NoNewline
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 1
            foreach ($p in 5173..5180) {
                if (Test-Port $p) {
                    $proc = Get-PortProcess $p
                    if ($proc -and $proc.ProcessName -eq 'node') {
                        $clientPort = $p
                        break
                    }
                }
            }
            if ($clientPort) { break }
            Write-Host "." -NoNewline
        }

        if ($clientPort) {
            Write-Ok " Started!"
        } else {
            Write-Err " Timeout - check client logs"
        }
    }

    # Summary
    Write-Host ""
    Write-Status "=== Ready! ==="
    Write-Host ""
    if ($clientPort) {
        Write-Ok "  Open: http://localhost:$clientPort"
    }
    Write-Host ""
    Write-Host "  Services:" -ForegroundColor White
    Write-Host "    Client:    http://localhost:$clientPort" -ForegroundColor Gray
    Write-Host "    Chat API:  http://localhost:7071" -ForegroundColor Gray
    Write-Host "    DAB API:   http://localhost:5000/api" -ForegroundColor Gray
    Write-Host "    Database:  localhost,14330" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Commands:" -ForegroundColor White
    Write-Host "    .\dev.ps1 -Stop     Stop all" -ForegroundColor Gray
    Write-Host "    .\dev.ps1 -Status   Show status" -ForegroundColor Gray
    Write-Host ""
}

# Main
if ($Reset) {
    Stop-All
    Write-Status "Cleaning Docker..."
    docker system prune -f 2>$null | Out-Null
    Start-Sleep -Seconds 2
    Start-All
} elseif ($Stop) {
    Stop-All
} elseif ($Status) {
    Show-Status
} else {
    Start-All
}
