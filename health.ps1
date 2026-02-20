# Health Check Script for Modern Accounting
# Verifies all services are running and responding correctly
#
# Usage:
#   .\health.ps1              # Check local services
#   .\health.ps1 -Env prod    # Check production services
#   .\health.ps1 -Env prod -Verbose  # Verbose output
#   .\health.ps1 -Wait        # Wait for local services to be healthy

param(
    [ValidateSet("local", "prod")]
    [string]$Env = "local",
    [switch]$Verbose,
    [switch]$Wait  # Wait for services to be healthy (local only)
)

$ErrorActionPreference = "SilentlyContinue"

# Environment configuration
$envConfig = @{
    local = @{
        App    = "http://localhost:{clientPort}"
        ChatApi = "http://localhost:7071"
        DAB    = "http://localhost:5000"
        EmailApi = "http://localhost:7073"
        Label  = "Local"
    }
    prod = @{
        App    = "https://app-modern-accounting-prod.azurewebsites.net"
        ChatApi = "https://app-modern-accounting-prod.azurewebsites.net"
        DAB    = "https://dab-modern-accounting-prod.azurewebsites.net"
        SqlServer = "sql-modern-accounting-prod"
        ResourceGroup = "rg-modern-accounting-prod"
        Database = "AccountingDB"
        Label  = "Production"
    }
}

$config = $envConfig[$Env]

function Test-Endpoint($Name, $Url, $ExpectedContent = $null, $TimeoutSec = 10) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        if ($response.StatusCode -eq 200) {
            if ($ExpectedContent -and $response.Content -notmatch $ExpectedContent) {
                return @{ Status = "WARN"; Message = "Unexpected response" }
            }
            return @{ Status = "OK"; Message = "Healthy" }
        }
        return @{ Status = "FAIL"; Message = "HTTP $($response.StatusCode)" }
    } catch {
        $msg = $_.Exception.Message -replace '\n.*',''
        # Shorten common Azure cold-start messages
        if ($msg -match '504|timeout') { $msg = "Timeout (service may be cold-starting)" }
        return @{ Status = "FAIL"; Message = $msg }
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

# Find client port (local only)
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
Write-Host "=== Health Check ($($config.Label)) ===" -ForegroundColor Cyan
Write-Host ""

$allHealthy = $true

if ($Env -eq "prod") {
    # --- Production checks ---

    # App Service (serves both client and chat-api)
    $app = Test-Endpoint "App Service" "$($config.App)/api/health" '"healthy"' 30
    Show-Result "App Service ($($config.App))" $app
    if ($app.Status -ne "OK") { $allHealthy = $false }

    # DAB API
    $dab = Test-Endpoint "DAB API" "$($config.DAB)/api/accounts" '"value"' 30
    Show-Result "DAB API ($($config.DAB))" $dab
    if ($dab.Status -ne "OK") { $allHealthy = $false }

    # Plaid
    $plaid = Test-Endpoint "Plaid" "$($config.ChatApi)/api/plaid/health" '"ok"' 15
    Show-Result "Plaid Integration" $plaid
    if ($plaid.Status -ne "OK") { $allHealthy = $false }

    # Azure SQL Database
    Write-Host "  " -NoNewline
    try {
        $dbStatus = az sql db show `
            --resource-group $config.ResourceGroup `
            --server $config.SqlServer `
            --name $config.Database `
            --query "status" -o tsv 2>$null
        if ($dbStatus -eq "Online") {
            Write-Host "[OK] " -ForegroundColor Green -NoNewline
            Write-Host "Azure SQL ($($config.Database))" -NoNewline
            if ($Verbose) { Write-Host " - Online" -ForegroundColor Gray } else { Write-Host "" }
        } elseif ($dbStatus -eq "Paused") {
            Write-Host "[!!] " -ForegroundColor Yellow -NoNewline
            Write-Host "Azure SQL ($($config.Database)) - Paused (auto-pause)" -ForegroundColor Gray
            $allHealthy = $false
        } else {
            Write-Host "[FAIL] " -ForegroundColor Red -NoNewline
            Write-Host "Azure SQL ($($config.Database)) - Status: $dbStatus" -ForegroundColor Gray
            $allHealthy = $false
        }
    } catch {
        Write-Host "[FAIL] " -ForegroundColor Red -NoNewline
        Write-Host "Azure SQL - Cannot query (check az login)" -ForegroundColor Gray
        $allHealthy = $false
    }

    # Azure AD Admin
    Write-Host "  " -NoNewline
    try {
        $adAdmin = az sql server ad-admin list `
            --resource-group $config.ResourceGroup `
            --server $config.SqlServer `
            --query "[0].login" -o tsv 2>$null
        if ($adAdmin) {
            Write-Host "[OK] " -ForegroundColor Green -NoNewline
            Write-Host "Azure AD Admin" -NoNewline
            if ($Verbose) { Write-Host " - $adAdmin" -ForegroundColor Gray } else { Write-Host "" }
        } else {
            Write-Host "[FAIL] " -ForegroundColor Red -NoNewline
            Write-Host "Azure AD Admin - Not configured! AAD auth will fail" -ForegroundColor Gray
            $allHealthy = $false
        }
    } catch {
        Write-Host "[??] " -ForegroundColor Yellow -NoNewline
        Write-Host "Azure AD Admin - Cannot verify" -ForegroundColor Gray
    }

    # Firewall rule for current IP
    Write-Host "  " -NoNewline
    try {
        $myIp = (Invoke-WebRequest -Uri "https://ifconfig.me/ip" -UseBasicParsing -TimeoutSec 5).Content.Trim()
        $rules = az sql server firewall-rule list `
            --resource-group $config.ResourceGroup `
            --server $config.SqlServer `
            --query "[?startIpAddress=='$myIp'].name" -o tsv 2>$null
        if ($rules) {
            Write-Host "[OK] " -ForegroundColor Green -NoNewline
            Write-Host "SQL Firewall" -NoNewline
            if ($Verbose) { Write-Host " - $myIp allowed ($rules)" -ForegroundColor Gray } else { Write-Host "" }
        } else {
            Write-Host "[!!] " -ForegroundColor Yellow -NoNewline
            Write-Host "SQL Firewall - Current IP ($myIp) not in firewall rules" -ForegroundColor Gray
        }
    } catch {
        Write-Host "[??] " -ForegroundColor Yellow -NoNewline
        Write-Host "SQL Firewall - Cannot verify" -ForegroundColor Gray
    }

} else {
    # --- Local checks ---

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
}

Write-Host ""

if ($allHealthy) {
    Write-Host "All services healthy!" -ForegroundColor Green
    if ($Env -eq "local") {
        $clientPort = Find-ClientPort
        if ($clientPort) {
            Write-Host "Open: http://localhost:$clientPort" -ForegroundColor Cyan
        }
    } else {
        Write-Host "Open: $($config.App)" -ForegroundColor Cyan
    }
    exit 0
} else {
    Write-Host "Some services are not healthy." -ForegroundColor Yellow
    if ($Env -eq "local") {
        Write-Host "Run: .\dev.ps1 to start services" -ForegroundColor Gray
    }
    exit 1
}
