<#
.SYNOPSIS
    Deploys the AccountingDB database using SqlPackage.

.DESCRIPTION
    This script builds the SQL project and deploys it to the local Docker SQL Server instance.
    It can also be used to deploy to other environments by specifying connection parameters.

.PARAMETER Server
    The SQL Server instance. Default: localhost,14330

.PARAMETER Database
    The target database name. Default: AccountingDB

.PARAMETER User
    SQL Server username. Default: sa

.PARAMETER Password
    SQL Server password. Default: StrongPassword123!

.PARAMETER Action
    The SqlPackage action: Publish (default), Script, or DacPac

.EXAMPLE
    .\deploy-database.ps1
    Deploys to local Docker instance with default settings.

.EXAMPLE
    .\deploy-database.ps1 -Server "myserver.database.windows.net" -User "admin" -Password "SecurePass!"
    Deploys to Azure SQL Database.
#>

param(
    [string]$Server = "localhost,14330",
    [string]$Database = "AccountingDB",
    [string]$User = "sa",
    [string]$Password = "StrongPassword123!",
    [ValidateSet("Publish", "Script", "DacPac")]
    [string]$Action = "Publish"
)

$ErrorActionPreference = "Stop"

# Paths
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$databaseDir = Join-Path $projectDir "database"
$sqlProjFile = Join-Path $databaseDir "AccountingDB.sqlproj"
$outputDir = Join-Path $databaseDir "bin\Debug"
$dacpacPath = Join-Path $outputDir "AccountingDB.dacpac"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AccountingDB Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if SqlPackage is available
$sqlPackage = Get-Command "SqlPackage" -ErrorAction SilentlyContinue
if (-not $sqlPackage) {
    # Try common installation paths
    $possiblePaths = @(
        "C:\Program Files\Microsoft SQL Server\160\DAC\bin\SqlPackage.exe",
        "C:\Program Files\Microsoft SQL Server\150\DAC\bin\SqlPackage.exe",
        "C:\Program Files (x86)\Microsoft SQL Server\160\DAC\bin\SqlPackage.exe",
        "C:\Program Files (x86)\Microsoft SQL Server\150\DAC\bin\SqlPackage.exe",
        "$env:USERPROFILE\.dotnet\tools\SqlPackage.exe"
    )

    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $sqlPackage = $path
            break
        }
    }

    if (-not $sqlPackage) {
        Write-Host "SqlPackage not found. Installing via dotnet..." -ForegroundColor Yellow
        dotnet tool install -g microsoft.sqlpackage
        $sqlPackage = "$env:USERPROFILE\.dotnet\tools\SqlPackage.exe"
    }
}

Write-Host "Using SqlPackage: $sqlPackage" -ForegroundColor Gray

# Build the SQL project
Write-Host ""
Write-Host "Step 1: Building SQL Project..." -ForegroundColor Yellow
Write-Host "Project: $sqlProjFile"

# Check if dotnet build works for sqlproj (requires SSDT or MSBuild)
$buildResult = dotnet build $sqlProjFile -c Debug 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "dotnet build failed, trying MSBuild..." -ForegroundColor Yellow

    # Try MSBuild
    $msbuild = Get-Command "msbuild" -ErrorAction SilentlyContinue
    if (-not $msbuild) {
        # Try VS locations
        $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
        if (Test-Path $vsWhere) {
            $vsPath = & $vsWhere -latest -products * -requires Microsoft.Component.MSBuild -property installationPath
            $msbuild = Join-Path $vsPath "MSBuild\Current\Bin\MSBuild.exe"
        }
    }

    if ($msbuild -and (Test-Path $msbuild)) {
        & $msbuild $sqlProjFile /p:Configuration=Debug /t:Build
    } else {
        Write-Host "MSBuild not found. Please install Visual Studio with SQL Server Data Tools." -ForegroundColor Red
        Write-Host ""
        Write-Host "Alternative: Use the manual deployment script instead:" -ForegroundColor Yellow
        Write-Host "  .\scripts\deploy-database-manual.ps1" -ForegroundColor Gray
        exit 1
    }
}

if (-not (Test-Path $dacpacPath)) {
    Write-Host "DACPAC not found at: $dacpacPath" -ForegroundColor Red
    Write-Host "Build may have failed. Check for errors above." -ForegroundColor Red
    exit 1
}

Write-Host "Build successful: $dacpacPath" -ForegroundColor Green

# Connection string
$connectionString = "Server=$Server;Database=$Database;User Id=$User;Password=$Password;TrustServerCertificate=true"

Write-Host ""
Write-Host "Step 2: Deploying to database..." -ForegroundColor Yellow
Write-Host "Server: $Server"
Write-Host "Database: $Database"

switch ($Action) {
    "Publish" {
        Write-Host "Action: Publishing (deploying changes)..." -ForegroundColor Cyan
        & $sqlPackage /Action:Publish /SourceFile:$dacpacPath /TargetConnectionString:$connectionString /p:BlockOnPossibleDataLoss=false
    }
    "Script" {
        $scriptPath = Join-Path $outputDir "deploy-script.sql"
        Write-Host "Action: Generating deployment script..." -ForegroundColor Cyan
        & $sqlPackage /Action:Script /SourceFile:$dacpacPath /TargetConnectionString:$connectionString /OutputPath:$scriptPath
        Write-Host "Script saved to: $scriptPath" -ForegroundColor Green
    }
    "DacPac" {
        Write-Host "Action: DacPac already built at $dacpacPath" -ForegroundColor Green
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Deployment completed successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Deployment failed with exit code: $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
