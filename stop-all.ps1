# Stop All Services for Modern Accounting
param([switch]$KeepDocker)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping services..." -ForegroundColor Yellow

# Stop Node processes on dev ports
@(7071, 5173) | ForEach-Object {
    $conn = Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen'
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc.ProcessName -eq 'node') {
            Stop-Process -Id $proc.Id -Force
            Write-Host "  Stopped port $_" -ForegroundColor Green
        }
    }
}

# Stop Docker
if (-not $KeepDocker) {
    docker compose down 2>$null
    Write-Host "  Docker stopped" -ForegroundColor Green
}

Write-Host "Done." -ForegroundColor Cyan
