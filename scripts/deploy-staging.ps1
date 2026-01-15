<#
.SYNOPSIS
    Deploys the application to the staging environment.

.DESCRIPTION
    This script builds and deploys the Modern Accounting application to the staging environment.
    It pulls the latest code, builds Docker containers, and optionally runs PII scrubbing.

.PARAMETER Branch
    The git branch to deploy. Default: main

.PARAMETER SkipPiiScrub
    Skip the PII scrubbing step (useful when deploying fresh without production data).

.PARAMETER Rebuild
    Force rebuild of all Docker images (docker-compose build --no-cache).

.EXAMPLE
    .\deploy-staging.ps1
    Deploys the main branch to staging.

.EXAMPLE
    .\deploy-staging.ps1 -Branch "feature/new-feature" -SkipPiiScrub
    Deploys a feature branch without PII scrubbing.
#>

param(
    [string]$Branch = "main",
    [switch]$SkipPiiScrub,
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Status($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host $msg -ForegroundColor Green }
function Write-Warn($msg) { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host $msg -ForegroundColor Red }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

Write-Host ""
Write-Status "========================================"
Write-Status "  Staging Deployment"
Write-Status "========================================"
Write-Host ""
Write-Host "  Branch: $Branch" -ForegroundColor Gray
Write-Host "  Project: $projectDir" -ForegroundColor Gray
Write-Host ""

# Step 1: Pull latest code
Write-Status "[1/5] Pulling latest code..."
Push-Location $projectDir
try {
    git fetch origin
    git checkout $Branch
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to checkout branch: $Branch"
        exit 1
    }
    git pull origin $Branch
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Warning: Could not pull latest (may be a local branch)"
    }
    Write-Ok "  Code updated"
} finally {
    Pop-Location
}

# Step 2: Stop existing staging containers
Write-Status "[2/5] Stopping existing staging containers..."
Push-Location $projectDir
try {
    docker-compose -f docker-compose.staging.yml down 2>$null
    Write-Ok "  Containers stopped"
} finally {
    Pop-Location
}

# Step 3: Build and deploy
Write-Status "[3/5] Building and deploying containers..."
Push-Location $projectDir
try {
    if ($Rebuild) {
        Write-Host "  Building with --no-cache..." -ForegroundColor Gray
        docker-compose -f docker-compose.staging.yml build --no-cache
    } else {
        docker-compose -f docker-compose.staging.yml build
    }

    docker-compose -f docker-compose.staging.yml up -d

    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to start containers"
        exit 1
    }
    Write-Ok "  Containers started"
} finally {
    Pop-Location
}

# Step 4: Wait for SQL Server to be ready
Write-Status "[4/5] Waiting for SQL Server..."
$maxRetries = 30
$retryCount = 0

Write-Host "  " -NoNewline
while ($retryCount -lt $maxRetries) {
    try {
        $result = docker exec accounting-db-staging /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "StagingPassword123" -Q "SELECT 1" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok " Ready!"
            break
        }
    } catch {}

    $retryCount++
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
}

if ($retryCount -ge $maxRetries) {
    Write-Err " Timeout waiting for SQL Server"
    exit 1
}

# Step 5: Run PII scrubbing (optional)
if (-not $SkipPiiScrub) {
    Write-Status "[5/5] Running PII scrubbing..."

    # Check if run-sql.js exists
    $runSqlPath = Join-Path $scriptDir "run-sql.js"
    $piiScrubPath = Join-Path $scriptDir "pii-scrub.sql"

    if (-not (Test-Path $runSqlPath)) {
        Write-Warn "  run-sql.js not found, skipping PII scrub"
    } elseif (-not (Test-Path $piiScrubPath)) {
        Write-Warn "  pii-scrub.sql not found, skipping PII scrub"
    } else {
        Push-Location $projectDir
        try {
            node $runSqlPath $piiScrubPath --staging
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "  PII scrubbing complete"
            } else {
                Write-Warn "  PII scrubbing failed (non-fatal)"
            }
        } finally {
            Pop-Location
        }
    }
} else {
    Write-Status "[5/5] Skipping PII scrubbing (--SkipPiiScrub)"
}

# Summary
Write-Host ""
Write-Status "========================================"
Write-Ok "  Staging deployment complete!"
Write-Status "========================================"
Write-Host ""
Write-Host "  Services:" -ForegroundColor White
Write-Host "    Client:     http://localhost:3001" -ForegroundColor Gray
Write-Host "    DAB API:    http://localhost:5001/api" -ForegroundColor Gray
Write-Host "    Email API:  http://localhost:7074" -ForegroundColor Gray
Write-Host "    Database:   localhost,14331" -ForegroundColor Gray
Write-Host ""
Write-Host "  Commands:" -ForegroundColor White
Write-Host "    Stop:    docker-compose -f docker-compose.staging.yml down" -ForegroundColor Gray
Write-Host "    Logs:    docker-compose -f docker-compose.staging.yml logs -f" -ForegroundColor Gray
Write-Host ""
