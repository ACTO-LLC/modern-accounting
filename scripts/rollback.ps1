<#
.SYNOPSIS
    Rolls back a deployment to a previous commit.

.DESCRIPTION
    This script safely rolls back deployments by reverting commits and redeploying.
    For staging, it automatically redeploys. For production, it requires manual approval.

.PARAMETER CommitHash
    The commit hash to roll back TO (not the bad commit to revert).
    All commits after this hash will be reverted.

.PARAMETER Environment
    The target environment: staging (default) or production.

.PARAMETER DryRun
    Show what would be done without making changes.

.PARAMETER Force
    Skip confirmation prompts (use with caution).

.EXAMPLE
    .\rollback.ps1 -CommitHash abc1234
    Rolls back staging to commit abc1234.

.EXAMPLE
    .\rollback.ps1 -CommitHash abc1234 -Environment production
    Prepares production rollback (requires manual steps).

.EXAMPLE
    .\rollback.ps1 -CommitHash abc1234 -DryRun
    Shows what would be rolled back without making changes.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$CommitHash,

    [ValidateSet("staging", "production")]
    [string]$Environment = "staging",

    [switch]$DryRun,
    [switch]$Force
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
Write-Status "  Deployment Rollback"
Write-Status "========================================"
Write-Host ""
Write-Host "  Target Commit: $CommitHash" -ForegroundColor Gray
Write-Host "  Environment:   $Environment" -ForegroundColor Gray
Write-Host "  Mode:          $(if ($DryRun) { 'Dry Run' } else { 'Live' })" -ForegroundColor Gray
Write-Host ""

Push-Location $projectDir
try {
    # Verify the commit exists
    $commitExists = git rev-parse --verify $CommitHash 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Error: Commit $CommitHash not found"
        exit 1
    }

    # Get short hash for display
    $shortHash = git rev-parse --short $CommitHash

    # Show commits that will be reverted
    Write-Status "Commits that will be reverted:"
    Write-Host ""
    $commitsToRevert = git log --oneline "$CommitHash..HEAD"
    if ([string]::IsNullOrWhiteSpace($commitsToRevert)) {
        Write-Warn "  No commits to revert - already at $shortHash"
        exit 0
    }
    Write-Host $commitsToRevert
    Write-Host ""

    # Count commits
    $commitCount = ($commitsToRevert -split "`n").Count
    Write-Warn "  $commitCount commit(s) will be reverted"
    Write-Host ""

    # Confirmation
    if (-not $Force -and -not $DryRun) {
        $confirm = Read-Host "Continue with rollback? (y/N)"
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host "Rollback cancelled."
            exit 0
        }
    }

    if ($DryRun) {
        Write-Status "[DRY RUN] Would execute the following:"
        Write-Host "  git revert --no-commit $CommitHash..HEAD" -ForegroundColor Gray
        Write-Host "  git commit -m 'Rollback to $shortHash'" -ForegroundColor Gray

        if ($Environment -eq "staging") {
            Write-Host "  .\scripts\deploy-staging.ps1 -SkipPiiScrub" -ForegroundColor Gray
        } else {
            Write-Host "  (Manual production deployment required)" -ForegroundColor Gray
        }

        Write-Host ""
        Write-Ok "[DRY RUN] No changes made"
        exit 0
    }

    # Perform the rollback
    Write-Status "[1/3] Creating revert commits..."

    # Check for uncommitted changes
    $status = git status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($status)) {
        Write-Err "Error: Working directory has uncommitted changes"
        Write-Host "Please commit or stash changes before rolling back."
        exit 1
    }

    # Revert commits
    git revert --no-commit "$CommitHash..HEAD"
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Error: git revert failed"
        Write-Host "There may be conflicts. Resolve them manually."
        exit 1
    }

    Write-Status "[2/3] Committing rollback..."
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "Rollback to $shortHash ($timestamp)"
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Error: git commit failed"
        exit 1
    }
    Write-Ok "  Rollback committed"

    Write-Status "[3/3] Deploying rollback..."
    if ($Environment -eq "staging") {
        # Auto-deploy to staging
        & "$scriptDir\deploy-staging.ps1" -SkipPiiScrub
        Write-Ok "  Staging deployment complete"
    } else {
        # Production requires manual approval
        Write-Warn ""
        Write-Warn "  PRODUCTION ROLLBACK PREPARED"
        Write-Warn ""
        Write-Host "  The rollback commit has been created locally." -ForegroundColor White
        Write-Host "  To complete the production rollback:" -ForegroundColor White
        Write-Host ""
        Write-Host "  1. Review the changes:" -ForegroundColor Gray
        Write-Host "     git show HEAD" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  2. Push to remote:" -ForegroundColor Gray
        Write-Host "     git push origin main" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  3. Deploy to production through your CI/CD pipeline" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  4. Notify the team:" -ForegroundColor Gray
        Write-Host "     node scripts/notify.js slack <webhook_url> 'Production rolled back to $shortHash'" -ForegroundColor Yellow
        Write-Host ""
    }

    # Summary
    Write-Host ""
    Write-Status "========================================"
    Write-Ok "  Rollback complete!"
    Write-Status "========================================"
    Write-Host ""
    Write-Host "  New HEAD: $(git rev-parse --short HEAD)" -ForegroundColor Gray
    Write-Host "  Rolled back to: $shortHash" -ForegroundColor Gray
    Write-Host ""

} finally {
    Pop-Location
}
