# Health Check Script for Modern Accounting
# Verifies all services are running and responding correctly

param(
    [switch]$Verbose,
    [switch]$Wait  # Wait for services to be healthy
)

$ErrorActionPreference = "SilentlyContinue"

function Test-Endpoint($Name, $Url, $ExpectedContent = $null) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            if ($ExpectedContent -and $response.Content -notmatch $ExpectedContent) {
                return @{ Status = "WARN"; Message = "Unexpected response" }
            }
            return @{ Status = "OK"; Message = "Healthy" }
        }
        return @{ Status = "FAIL"; Message = "HTTP $($response.StatusCode)" }
    } catch {
        return @{ Status = "FAIL"; Message = $_.Exception.Message -replace '\n.*','' }
    }
}

function Show-Result($Name, $Result) {
    $color = switch ($Result.Status) {
        "OK"   { "Green" }
        "WARN" { "Yellow" }
        default { "Red" }
    }
    $icon = switch ($Result.Status) {
        "OK"   { "[OK]" }
        "WARN" { "[!!]" }
        default { "[FAIL]" }
    }

    Write-Host "  $icon " -ForegroundColor $color -NoNewline
    Write-Host "$Name" -NoNewline
    if ($Verbose -or $Result.Status -ne "OK") {
        Write-Host " - $($Result.Message)" -ForegroundColor Gray
    } else {
        Write-Host ""
    }
}

# Find client port
function Find-ClientPort {
    foreach ($p in 5173..5185) {
        $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
                Where-Object State -eq 'Listen'
        if ($conn) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq 'node') {
                return $p
            }
        }
    }
    return $null
}

Write-Host ""
Write-Host "=== Health Check ===" -ForegroundColor Cyan
Write-Host ""

$allHealthy = $true

# DAB API
$dab = Test-Endpoint "DAB API" "http://localhost:5000/api/accounts" '"value"'
Show-Result "DAB API (5000)" $dab
if ($dab.Status -ne "OK") { $allHealthy = $false }

# Chat API
$chat = Test-Endpoint "Chat API" "http://localhost:7071/api/qbo/status" '"connected"'
Show-Result "Chat API (7071)" $chat
if ($chat.Status -ne "OK") { $allHealthy = $false }

# Email API
$email = Test-Endpoint "Email API" "http://localhost:7073/email-api/health"
Show-Result "Email API (7073)" $email
if ($email.Status -ne "OK") { $allHealthy = $false }

# Client
$clientPort = Find-ClientPort
if ($clientPort) {
    $client = Test-Endpoint "Client" "http://localhost:$clientPort"
    Show-Result "Client ($clientPort)" $client
    if ($client.Status -ne "OK") { $allHealthy = $false }
} else {
    Write-Host "  [FAIL] " -ForegroundColor Red -NoNewline
    Write-Host "Client - Not running"
    $allHealthy = $false
}

# Database (via DAB)
if ($dab.Status -eq "OK") {
    Write-Host "  [OK] " -ForegroundColor Green -NoNewline
    Write-Host "Database (via DAB)"
} else {
    Write-Host "  [??] " -ForegroundColor Yellow -NoNewline
    Write-Host "Database - Cannot verify (DAB not responding)"
}

Write-Host ""

if ($allHealthy) {
    Write-Host "All services healthy!" -ForegroundColor Green
    if ($clientPort) {
        Write-Host "Open: http://localhost:$clientPort" -ForegroundColor Cyan
    }
    exit 0
} else {
    Write-Host "Some services are not healthy." -ForegroundColor Yellow
    Write-Host "Run: .\dev.ps1 to start services" -ForegroundColor Gray
    exit 1
}
