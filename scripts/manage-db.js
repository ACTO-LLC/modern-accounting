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
    `--admin-user "${creds.user}" ` +
    `--admin-password "${creds.password}" ` +
    `--storage-key-type StorageAccessKey ` +
    `--storage-key "${storageKey}" ` +
    `--storage-uri "${storageUri}"`
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

  let targetFile = backupFile;

  if (latest) {
    log('Finding most recent backup...', 'step');
    const storageKey = getStorageKey();
    const blobs = az(
      `storage blob list ` +
      `--account-name ${storageAccount} ` +
      `--account-key "${storageKey}" ` +
      `--container-name ${container} ` +
      `--query "[?ends_with(name, '.bacpac')] | sort_by(@, &properties.lastModified) | [-1].name" ` +
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

  log(`Importing ${targetFile}...`, 'step');
  log(`Storage URI: ${storageUri}`);

  az(
    `sql db import ` +
    `--resource-group ${resourceGroup} ` +
    `--server ${sqlServer} ` +
    `--name ${database} ` +
    `--admin-user "${creds.user}" ` +
    `--admin-password "${creds.password}" ` +
    `--storage-key-type StorageAccessKey ` +
    `--storage-key "${storageKey}" ` +
    `--storage-uri "${storageUri}" ` +
    `--edition GeneralPurpose ` +
    `--service-objective GP_S_Gen5 ` +
    `--capacity 1 ` +
    `--family Gen5`
  );

  log('Import complete', 'success');

  // Re-apply auto-pause setting (60 min)
  log('Configuring auto-pause (60 minutes)...', 'step');
  az(
    `sql db update ` +
    `--resource-group ${resourceGroup} ` +
    `--server ${sqlServer} ` +
    `--name ${database} ` +
    `--auto-pause-delay 60`
  );
  log('Auto-pause configured', 'success');

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
      `--value "${connStr}"`,
      { silent: true }
    );
    log('Key Vault updated', 'success');
  } catch (err) {
    log(`Key Vault update failed: ${err.message}`, 'warn');
    log('You may need to update the SqlConnectionString secret manually', 'warn');
  }

  log(`Database ${database} restored from ${targetFile}`, 'success');
}

function doList() {
  log(`Listing backups in ${storageAccount}/${container}...`, 'step');

  const storageKey = getStorageKey();
  const blobs = az(
    `storage blob list ` +
    `--account-name ${storageAccount} ` +
    `--account-key "${storageKey}" ` +
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

  if (!command || !['backup', 'restore', 'list', 'delete'].includes(command)) {
    console.log('Usage:');
    console.log('  node scripts/manage-db.js backup  [--env prod] [--delete-after] [--confirm-prod]');
    console.log('  node scripts/manage-db.js restore [--env prod] [--file <name>] [--latest] [--confirm-prod]');
    console.log('  node scripts/manage-db.js list    [--env prod]');
    console.log('  node scripts/manage-db.js delete  [--env prod] [--confirm-prod]');
    console.log('');
    console.log('Options:');
    console.log('  --env <name>           Target environment (default: dev)');
    console.log('  --delete-after         Delete DB after backup');
    console.log('  --confirm-prod         Required for destructive prod operations');
    console.log('  --file <name>          Specific .bacpac file to restore');
    console.log('  --latest               Restore most recent backup');
    console.log('  --admin-user <user>    SQL admin username');
    console.log('  --admin-password <pw>  SQL admin password');
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
        doList();
        break;
      case 'delete':
        requireProdConfirmation('delete');
        doDeleteDb();
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
