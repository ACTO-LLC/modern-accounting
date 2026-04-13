/**
 * Azure SQL Database Management Script
 *
 * Backup, restore, list, and delete Azure SQL databases to manage costs.
 * Azure SQL Serverless (GP_S_Gen5_1) costs ~$5-15/month even when idle.
 * This script enables backing up to blob storage, deleting the DB, and
 * restoring later to eliminate ongoing costs during inactive periods.
 *
 * Usage:
 *   node scripts/manage-db.js backup  [--env prod] [--delete-after] [--confirm-prod]
 *   node scripts/manage-db.js restore [--env prod] [--file <name>] [--latest] [--confirm-prod]
 *   node scripts/manage-db.js list    [--env prod]
 *   node scripts/manage-db.js delete  [--env prod] [--confirm-prod]
 *   node scripts/manage-db.js clone   [--env prod] [--skip-export]
 *
 * Credential resolution order:
 *   1. --admin-user / --admin-password CLI flags
 *   2. SQL_ADMIN_LOGIN / SQL_ADMIN_PASSWORD env vars
 *   3. Key Vault lookup (parse SqlConnectionString secret)
 *
 * Environment Variables:
 *   SQL_ADMIN_LOGIN    - SQL admin username
 *   SQL_ADMIN_PASSWORD - SQL admin password
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ============================================================================
// Utility Functions (matching deploy-db.js patterns)
// ============================================================================

function log(message, type = 'info') {
  const prefix = {
    info: '\x1b[36m[INFO]\x1b[0m',
    success: '\x1b[32m[OK]\x1b[0m',
    warn: '\x1b[33m[WARN]\x1b[0m',
    error: '\x1b[31m[ERROR]\x1b[0m',
    step: '\x1b[35m[STEP]\x1b[0m',
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

/**
 * Shell-quote a value for safe interpolation into a command string.
 * Windows cmd.exe uses double quotes; bash/sh uses single quotes.
 */
function q(value) {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function az(command, { json: parseJson = false, silent = false } = {}) {
  try {
    const output = execSync(`az ${command}`, {
      encoding: 'utf8',
      stdio: silent ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'inherit'],
      timeout: 600000, // 10 minutes
    });
    if (parseJson && output.trim()) {
      return JSON.parse(output.trim());
    }
    return output.trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    throw new Error(`Azure CLI failed: ${stderr || stdout || err.message}`);
  }
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name) {
  return args.includes(`--${name}`);
}

function getOption(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

const env = getOption('env') || 'dev';
const deleteAfter = getFlag('delete-after');
const confirmProd = getFlag('confirm-prod');
const latest = getFlag('latest');
const backupFile = getOption('file');
const adminUserFlag = getOption('admin-user');
const adminPasswordFlag = getOption('admin-password');

// ============================================================================
// Resource Naming (from infra/azure/main.bicep)
// ============================================================================

const resourceGroup = `rg-modern-accounting-${env}`;
const sqlServer = `sql-modern-accounting-${env}`;
const database = 'AccountingDB';
const storageAccount = `stmodernaccounting${env}`;
const container = 'backups';

// ============================================================================
// Safety Checks
// ============================================================================

function requireProdConfirmation(action) {
  if (env === 'prod' && !confirmProd) {
    log(`Production ${action} requires --confirm-prod flag`, 'error');
    log(`Usage: node scripts/manage-db.js ${action} --env prod --confirm-prod`, 'info');
    process.exit(1);
  }
}

// ============================================================================
// Credential Resolution
// ============================================================================

function getCredentials() {
  // 1. CLI flags
  if (adminUserFlag && adminPasswordFlag) {
    log('Using credentials from CLI flags');
    return { user: adminUserFlag, password: adminPasswordFlag };
  }

  // 2. Environment variables
  if (process.env.SQL_ADMIN_LOGIN && process.env.SQL_ADMIN_PASSWORD) {
    log('Using credentials from environment variables');
    return { user: process.env.SQL_ADMIN_LOGIN, password: process.env.SQL_ADMIN_PASSWORD };
  }

  // 3. Key Vault lookup
  log('Looking up credentials from Key Vault...');
  try {
    const vaults = az(`keyvault list --resource-group ${resourceGroup} --query "[].name" -o tsv`, { silent: true });
    const vaultName = vaults.split('\n')[0].trim();
    if (!vaultName) {
      throw new Error('No Key Vault found');
    }
    log(`Found Key Vault: ${vaultName}`);

    const connStr = az(
      `keyvault secret show --vault-name ${vaultName} --name SqlConnectionString --query value -o tsv`,
      { silent: true }
    );

    // Parse: Server=tcp:...;Database=...;User ID=xxx;Password=yyy;...
    const userMatch = connStr.match(/User ID=([^;]+)/i);
    const passMatch = connStr.match(/Password=([^;]+)/i);

    if (!userMatch || !passMatch) {
      throw new Error('Could not parse credentials from SqlConnectionString');
    }

    log('Using credentials from Key Vault');
    return { user: userMatch[1], password: passMatch[1] };
  } catch (err) {
    log(`Key Vault lookup failed: ${err.message}`, 'error');
    log('Provide credentials via --admin-user/--admin-password or SQL_ADMIN_LOGIN/SQL_ADMIN_PASSWORD env vars', 'info');
    process.exit(1);
  }
}

// ============================================================================
// Storage Key Helper
// ============================================================================

function getStorageKey() {
  log('Getting storage account key...');
  const keys = az(
    `storage account keys list --resource-group ${resourceGroup} --account-name ${storageAccount} --query "[0].value" -o tsv`,
    { silent: true }
  );
  return keys;
}

// ============================================================================
// Key Vault Helper
// ============================================================================

function getKeyVaultName() {
  const vaults = az(`keyvault list --resource-group ${resourceGroup} --query "[].name" -o tsv`, { silent: true });
  const vaultName = vaults.split('\n')[0].trim();
  if (!vaultName) {
    throw new Error(`No Key Vault found in resource group ${resourceGroup}`);
  }
  return vaultName;
}

// ============================================================================
// Commands
// ============================================================================

async function doBackup() {
  log('Starting database backup...', 'step');

  const storageKey = getStorageKey();
  const creds = getCredentials();
  const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '-').split('.')[0];
  const fileName = `${database}-${env}-${timestamp}.bacpac`;
  const storageUri = `https://${storageAccount}.blob.core.windows.net/${container}/${fileName}`;

  log(`Exporting ${database} to ${fileName}...`, 'step');
  log(`Storage URI: ${storageUri}`);

  az(
    `sql db export ` +
    `--resource-group ${resourceGroup} ` +
    `--server ${sqlServer} ` +
    `--name ${database} ` +
    `--admin-user ${q(creds.user)} ` +
    `--admin-password ${q(creds.password)} ` +
    `--storage-key-type StorageAccessKey ` +
    `--storage-key ${q(storageKey)} ` +
    `--storage-uri ${q(storageUri)}`
  );

  log(`Backup complete: ${fileName}`, 'success');

  if (deleteAfter) {
    log('--delete-after specified, deleting database...', 'warn');
    requireProdConfirmation('delete');
    doDeleteDb();
  }
}

function doDeleteDb() {
  requireProdConfirmation('delete');
  log(`Deleting database ${database} from ${sqlServer}...`, 'step');
  log(`Environment: ${env}`, 'warn');

  az(
    `sql db delete ` +
    `--resource-group ${resourceGroup} ` +
    `--server ${sqlServer} ` +
    `--name ${database} ` +
    `--yes`
  );

  log(`Database ${database} deleted`, 'success');
  log('To restore, run: node scripts/manage-db.js restore --env ' + env + ' --latest', 'info');
}

async function doRestore() {
  requireProdConfirmation('restore');

  if (latest && backupFile) {
    log('Cannot specify both --file and --latest', 'error');
    process.exit(1);
  }

  let targetFile = backupFile;

  if (latest) {
    log('Finding most recent backup...', 'step');
    const storageKey = getStorageKey();
    const blobs = az(
      `storage blob list ` +
      `--account-name ${storageAccount} ` +
      `--account-key ${q(storageKey)} ` +
      `--container-name ${container} ` +
      `--query "[?ends_with(name, '.bacpac') && contains(name, '-${env}-')] | sort_by(@, &properties.lastModified) | [-1].name" ` +
      `-o tsv`,
      { silent: true }
    );

    targetFile = blobs.trim();
    if (!targetFile) {
      log('No .bacpac files found in backups container', 'error');
      process.exit(1);
    }
    log(`Latest backup: ${targetFile}`);
  }

  if (!targetFile) {
    log('Specify --file <name> or --latest to select a backup', 'error');
    process.exit(1);
  }

  const storageKey = getStorageKey();
  const creds = getCredentials();
  const storageUri = `https://${storageAccount}.blob.core.windows.net/${container}/${targetFile}`;

  // Check if DB exists and delete it (az sql db import requires no existing DB)
  log('Checking if database exists...', 'step');
  try {
    az(
      `sql db show --resource-group ${resourceGroup} --server ${sqlServer} --name ${database}`,
      { silent: true, json: true }
    );
    log(`Database ${database} exists, deleting before import...`, 'warn');
    az(
      `sql db delete ` +
      `--resource-group ${resourceGroup} ` +
      `--server ${sqlServer} ` +
      `--name ${database} ` +
      `--yes`
    );
    log('Existing database deleted', 'success');
  } catch {
    log('No existing database found, proceeding with import');
  }

  // Create empty database for import (az sql db import requires existing DB)
  log('Creating database for import...', 'step');
  az(
    `sql db create ` +
    `--resource-group ${resourceGroup} ` +
    `--server ${sqlServer} ` +
    `--name ${database} ` +
    `--edition GeneralPurpose ` +
    `--capacity 1 ` +
    `--family Gen5 ` +
    `--compute-model Serverless ` +
    `--auto-pause-delay 60`
  );
  log('Empty database created', 'success');

  log(`Importing ${targetFile}...`, 'step');
  log(`Storage URI: ${storageUri}`);

  az(
    `sql db import ` +
    `--resource-group ${resourceGroup} ` +
    `--server ${sqlServer} ` +
    `--name ${database} ` +
    `--admin-user ${q(creds.user)} ` +
    `--admin-password ${q(creds.password)} ` +
    `--storage-key-type StorageAccessKey ` +
    `--storage-key ${q(storageKey)} ` +
    `--storage-uri ${q(storageUri)}`
  );

  log('Import complete', 'success');

  // Update Key Vault connection string
  log('Updating Key Vault connection string...', 'step');
  try {
    const vaultName = getKeyVaultName();
    const fqdn = `${sqlServer}.database.windows.net`;
    const connStr = `Server=tcp:${fqdn},1433;Database=${database};User ID=${creds.user};Password=${creds.password};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;`;
    az(
      `keyvault secret set ` +
      `--vault-name ${vaultName} ` +
      `--name SqlConnectionString ` +
      `--value ${q(connStr)}`,
      { silent: true }
    );
    log('Key Vault updated', 'success');
  } catch (err) {
    log(`Key Vault update failed: ${err.message}`, 'warn');
    log('You may need to update the SqlConnectionString secret manually', 'warn');
  }

  log(`Database ${database} restored from ${targetFile}`, 'success');
}

async function doList() {
  log(`Listing backups in ${storageAccount}/${container}...`, 'step');

  const storageKey = getStorageKey();
  const blobs = az(
    `storage blob list ` +
    `--account-name ${storageAccount} ` +
    `--account-key ${q(storageKey)} ` +
    `--container-name ${container} ` +
    `--query "[?ends_with(name, '.bacpac')].{Name:name, Size:properties.contentLength, Modified:properties.lastModified}" ` +
    `-o table`
  );

  if (blobs.trim()) {
    console.log('');
    console.log(blobs);
  } else {
    log('No backups found', 'warn');
  }

  // Also show current DB status
  log('Checking current database status...', 'step');
  try {
    const db = az(
      `sql db show ` +
      `--resource-group ${resourceGroup} ` +
      `--server ${sqlServer} ` +
      `--name ${database} ` +
      `--query "{Status:status, Sku:currentSku.name, Tier:currentSku.tier, AutoPause:autoPauseDelay, MaxSize:maxSizeBytes}" ` +
      `-o table`,
      { silent: true }
    );
    console.log('');
    log('Current database:', 'info');
    console.log(db);
  } catch {
    log(`Database ${database} does not exist on ${sqlServer}`, 'warn');
  }
}

// ============================================================================
// Clone: Azure → Local Docker
// ============================================================================

async function doClone() {
  const localServer = getOption('local-server') || 'localhost,14330';
  const localUser = getOption('local-user') || 'sa';
  const localPassword = getOption('local-password') || process.env.SQL_SA_PASSWORD || 'StrongPassword123';
  const backupsDir = path.join(__dirname, '..', 'database', 'backups');
  const skipExport = getFlag('skip-export');

  // Ensure backups directory exists
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  // Check SqlPackage is available
  try {
    execSync('SqlPackage /version', { stdio: 'pipe' });
  } catch {
    log('SqlPackage not found. Install it via: dotnet tool install -g microsoft.sqlpackage', 'error');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace('T', '-').split('.')[0];
  const bacpacFile = path.join(backupsDir, `${database}-${env}-${timestamp}.bacpac`);

  // Check for existing .bacpac if --skip-export
  let importFile = bacpacFile;
  if (skipExport) {
    const existing = fs.readdirSync(backupsDir)
      .filter(f => f.endsWith('.bacpac') && f.includes(`-${env}-`))
      .sort()
      .pop();
    if (!existing) {
      log('No existing .bacpac found for --skip-export. Run without --skip-export first.', 'error');
      process.exit(1);
    }
    importFile = path.join(backupsDir, existing);
    log(`Reusing existing export: ${existing}`, 'info');
  }

  // Step 1: Export from Azure
  if (!skipExport) {
    log('Step 1/3: Exporting from Azure SQL...', 'step');
    const creds = getCredentials();
    const sourceFqdn = `${sqlServer}.database.windows.net`;

    log(`Source: ${sourceFqdn} / ${database}`);
    log(`Target file: ${bacpacFile}`);

    try {
      execSync(
        `SqlPackage /Action:Export ` +
        `/SourceServerName:${sourceFqdn} ` +
        `/SourceDatabaseName:${database} ` +
        `/SourceUser:${q(creds.user)} ` +
        `/SourcePassword:${q(creds.password)} ` +
        `/SourceEncryptConnection:true ` +
        `/SourceTrustServerCertificate:false ` +
        `/TargetFile:${q(bacpacFile)}`,
        { stdio: 'inherit', timeout: 600000 }
      );
    } catch (err) {
      log(`Export failed: ${err.message}`, 'error');
      process.exit(1);
    }

    importFile = bacpacFile;
    log('Export complete', 'success');
  } else {
    log('Step 1/3: Skipped (--skip-export)', 'info');
  }

  // Step 2: Ensure local Docker SQL Server is running
  log('Step 2/3: Checking local Docker SQL Server...', 'step');
  try {
    const containers = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf8' });
    if (!containers.includes('accounting-db')) {
      log('Starting Docker SQL Server...', 'info');
      execSync('docker compose up -d database', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      log('Waiting for SQL Server to be ready...', 'info');
      // Wait for SQL Server to accept connections
      for (let i = 0; i < 30; i++) {
        try {
          execSync(
            `sqlcmd -S ${localServer} -U ${localUser} -P ${q(localPassword)} -C -Q "SELECT 1"`,
            { stdio: 'pipe', timeout: 5000 }
          );
          break;
        } catch {
          if (i === 29) {
            log('SQL Server did not become ready in time', 'error');
            process.exit(1);
          }
          execSync('sleep 2', { stdio: 'pipe' });
        }
      }
    }
    log('Local SQL Server is running', 'success');
  } catch (err) {
    log(`Docker check failed: ${err.message}`, 'error');
    log('Make sure Docker is running and docker-compose.yml is present', 'info');
    process.exit(1);
  }

  // Step 3: Drop existing DB and import .bacpac
  log('Step 3/3: Importing into local SQL Server...', 'step');
  log(`Source: ${importFile}`);
  log(`Target: ${localServer} / ${database}`);

  // Drop existing database if it exists (SqlPackage Import requires no existing DB)
  try {
    execSync(
      `sqlcmd -S ${localServer} -U ${localUser} -P ${q(localPassword)} -C ` +
      `-Q "IF DB_ID('${database}') IS NOT NULL BEGIN ALTER DATABASE [${database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${database}]; END"`,
      { stdio: 'inherit', timeout: 30000 }
    );
    log('Dropped existing local database', 'info');
  } catch {
    log('No existing local database to drop', 'info');
  }

  try {
    execSync(
      `SqlPackage /Action:Import ` +
      `/SourceFile:${q(importFile)} ` +
      `/TargetServerName:${localServer} ` +
      `/TargetDatabaseName:${database} ` +
      `/TargetUser:${localUser} ` +
      `/TargetPassword:${q(localPassword)} ` +
      `/TargetEncryptConnection:false ` +
      `/TargetTrustServerCertificate:true`,
      { stdio: 'inherit', timeout: 600000 }
    );
  } catch (err) {
    log(`Import failed: ${err.message}`, 'error');
    process.exit(1);
  }

  log('Import complete', 'success');

  // Restart DAB to pick up the new data
  log('Restarting DAB...', 'info');
  try {
    execSync('docker restart accounting-dab', { stdio: 'pipe', timeout: 30000 });
    log('DAB restarted', 'success');
  } catch {
    log('DAB not running — start it with: docker compose up -d dab', 'warn');
  }

  console.log('');
  log(`Azure ${env} database cloned to local Docker successfully!`, 'success');
  log(`Local connection: Server=${localServer};Database=${database};User Id=${localUser}`, 'info');
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  Azure SQL Database Manager');
  console.log('========================================');
  console.log('');
  console.log(`  Environment:    ${env}`);
  console.log(`  Resource Group: ${resourceGroup}`);
  console.log(`  SQL Server:     ${sqlServer}`);
  console.log(`  Database:       ${database}`);
  console.log(`  Storage:        ${storageAccount}/${container}`);
  console.log('');

  if (!command || !['backup', 'restore', 'list', 'delete', 'clone'].includes(command)) {
    console.log('Usage:');
    console.log('  node scripts/manage-db.js backup  [--env prod] [--delete-after] [--confirm-prod]');
    console.log('  node scripts/manage-db.js restore [--env prod] [--file <name>] [--latest] [--confirm-prod]');
    console.log('  node scripts/manage-db.js list    [--env prod]');
    console.log('  node scripts/manage-db.js delete  [--env prod] [--confirm-prod]');
    console.log('  node scripts/manage-db.js clone   [--env prod] [--skip-export] [--local-server host,port]');
    console.log('');
    console.log('Options:');
    console.log('  --env <name>           Target environment (default: dev)');
    console.log('  --delete-after         Delete DB after backup');
    console.log('  --confirm-prod         Required for destructive prod operations');
    console.log('  --file <name>          Specific .bacpac file to restore');
    console.log('  --latest               Restore most recent backup');
    console.log('  --admin-user <user>    SQL admin username');
    console.log('  --admin-password <pw>  SQL admin password');
    console.log('');
    console.log('Clone options (Azure → local Docker):');
    console.log('  --skip-export          Reuse existing .bacpac (skip Azure export)');
    console.log('  --local-server <s>     Local SQL Server (default: localhost,14330)');
    console.log('  --local-user <u>       Local SQL user (default: sa)');
    console.log('  --local-password <p>   Local SQL password (default: from SQL_SA_PASSWORD or StrongPassword123)');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'backup':
        await doBackup();
        break;
      case 'restore':
        await doRestore();
        break;
      case 'list':
        await doList();
        break;
      case 'delete':
        requireProdConfirmation('delete');
        doDeleteDb();
        break;
      case 'clone':
        await doClone();
        break;
    }

    console.log('');
    console.log('========================================');
    console.log(`  ${command.charAt(0).toUpperCase() + command.slice(1)} Complete!`);
    console.log('========================================');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.log('');
    log(`${command} failed: ${err.message}`, 'error');
    process.exit(1);
  }
}

main();
