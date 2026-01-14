<#
.SYNOPSIS
    Manually deploys the AccountingDB database by running SQL scripts directly.

.DESCRIPTION
    This script creates the database and runs all table, view, and stored procedure
    scripts in the correct order. Use this when SqlPackage/SSDT is not available.

.PARAMETER Server
    The SQL Server instance. Default: localhost,14330

.PARAMETER Database
    The target database name. Default: AccountingDB

.PARAMETER User
    SQL Server username. Default: sa

.PARAMETER Password
    SQL Server password. Default: Value from SQL_SA_PASSWORD environment variable or StrongPassword123!

.EXAMPLE
    .\deploy-database-manual.ps1
    Deploys to local Docker instance with default settings.
#>

param(
    [string]$Server = "localhost,14330",
    [string]$Database = "AccountingDB",
    [string]$User = "sa",
    [string]$Password = $(if ($env:SQL_SA_PASSWORD) { $env:SQL_SA_PASSWORD } else { "StrongPassword123!" })
)

$ErrorActionPreference = "Stop"

# Paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$databaseDir = Join-Path $projectDir "database"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AccountingDB Manual Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Server: $Server"
Write-Host "Database: $Database"
Write-Host ""

# Build connection string for sqlcmd
$sqlcmdParams = @("-S", $Server, "-U", $User, "-P", $Password, "-C")

function Invoke-SqlScript {
    param([string]$ScriptPath, [string]$DatabaseName = "master")

    Write-Host "  Running: $(Split-Path -Leaf $ScriptPath)" -ForegroundColor Gray
    $result = sqlcmd @sqlcmdParams -d $DatabaseName -i $ScriptPath -b 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: $result" -ForegroundColor Red
        throw "Script failed: $ScriptPath"
    }
}

function Invoke-SqlCommand {
    param([string]$Query, [string]$DatabaseName = "master")

    $result = sqlcmd @sqlcmdParams -d $DatabaseName -Q $Query -b 2>&1
    return $result
}

# Step 1: Create database if it doesn't exist
Write-Host "Step 1: Creating database..." -ForegroundColor Yellow

$createDbQuery = @"
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'$Database')
BEGIN
    CREATE DATABASE [$Database];
    PRINT 'Database created: $Database';
END
ELSE
BEGIN
    PRINT 'Database already exists: $Database';
END
"@

Invoke-SqlCommand -Query $createDbQuery
Write-Host "  Database ready" -ForegroundColor Green

# Step 2: Enable change tracking on database
Write-Host ""
Write-Host "Step 2: Configuring database..." -ForegroundColor Yellow

$configQuery = @"
IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID('$Database'))
BEGIN
    ALTER DATABASE [$Database] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 7 DAYS, AUTO_CLEANUP = ON);
    PRINT 'Change tracking enabled';
END
"@

try {
    Invoke-SqlCommand -Query $configQuery -DatabaseName $Database
    Write-Host "  Change tracking configured" -ForegroundColor Green
} catch {
    Write-Host "  Warning: Could not enable change tracking (may not be supported)" -ForegroundColor Yellow
}

# Step 3: Run table scripts (in dependency order)
Write-Host ""
Write-Host "Step 3: Creating tables..." -ForegroundColor Yellow

$tableOrder = @(
    "Accounts.sql",        # No dependencies
    "Customers.sql",       # No dependencies
    "Vendors.sql",         # Depends on Accounts
    "ProductsServices.sql", # Depends on Accounts
    "Projects.sql",        # Depends on Customers
    "Invoices.sql",        # Depends on Customers
    "InvoiceLines.sql",    # Depends on Invoices
    "JournalEntries.sql",  # No dependencies
    "JournalEntryLines.sql", # Depends on JournalEntries, Accounts
    "TimeEntries.sql",     # Depends on Projects, Customers, InvoiceLines
    "BankTransactions.sql", # Depends on Accounts, JournalEntries
    "BankReconciliations.sql", # Depends on Accounts
    "ReconciliationItems.sql"  # Depends on BankReconciliations
)

$tablesDir = Join-Path $databaseDir "dbo\Tables"

foreach ($table in $tableOrder) {
    $tablePath = Join-Path $tablesDir $table
    if (Test-Path $tablePath) {
        try {
            Invoke-SqlScript -ScriptPath $tablePath -DatabaseName $Database
        } catch {
            Write-Host "  Warning: $table may already exist or failed: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Skipped (not found): $table" -ForegroundColor Yellow
    }
}

Write-Host "  Tables created" -ForegroundColor Green

# Step 4: Run view scripts
Write-Host ""
Write-Host "Step 4: Creating views..." -ForegroundColor Yellow

$viewsDir = Join-Path $databaseDir "dbo\Views"
if (Test-Path $viewsDir) {
    Get-ChildItem -Path $viewsDir -Filter "*.sql" | ForEach-Object {
        try {
            Invoke-SqlScript -ScriptPath $_.FullName -DatabaseName $Database
        } catch {
            Write-Host "  Warning: $($_.Name) may already exist: $_" -ForegroundColor Yellow
        }
    }
}
Write-Host "  Views created" -ForegroundColor Green

# Step 5: Run stored procedure scripts
Write-Host ""
Write-Host "Step 5: Creating stored procedures..." -ForegroundColor Yellow

$procsDir = Join-Path $databaseDir "dbo\StoredProcedures"
if (Test-Path $procsDir) {
    Get-ChildItem -Path $procsDir -Filter "*.sql" | ForEach-Object {
        try {
            Invoke-SqlScript -ScriptPath $_.FullName -DatabaseName $Database
        } catch {
            Write-Host "  Warning: $($_.Name) may already exist: $_" -ForegroundColor Yellow
        }
    }
}
Write-Host "  Stored procedures created" -ForegroundColor Green

# Step 6: Run post-deployment (seed data)
Write-Host ""
Write-Host "Step 6: Running seed data script..." -ForegroundColor Yellow

$postDeployPath = Join-Path $databaseDir "Script.PostDeployment.sql"
if (Test-Path $postDeployPath) {
    try {
        Invoke-SqlScript -ScriptPath $postDeployPath -DatabaseName $Database
        Write-Host "  Seed data inserted" -ForegroundColor Green
    } catch {
        Write-Host "  Warning: Seed data script had issues: $_" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart the DAB container: docker-compose restart dab" -ForegroundColor Gray
Write-Host "  2. Access the app at: http://localhost:5179" -ForegroundColor Gray
