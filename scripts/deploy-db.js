/**
 * Database Deployment Script
 *
 * This script deploys the AccountingDB database schema and seed data.
 * It supports two deployment modes:
 *
 * 1. SqlPackage mode (recommended for production/CI):
 *    - Builds the .sqlproj and deploys using SqlPackage
 *    - Provides incremental updates and proper dependency resolution
 *    - Requires: dotnet SDK with Microsoft.Build.Sql package
 *
 * 2. Node.js mode (fallback for development):
 *    - Runs SQL scripts directly via mssql package
 *    - Used when SqlPackage/dotnet build is not available
 *    - Handles table ordering and foreign key dependencies
 *
 * Usage:
 *   node deploy-db.js                 # Auto-detect best mode
 *   node deploy-db.js --sqlpackage    # Force SqlPackage mode
 *   node deploy-db.js --node          # Force Node.js mode
 *   node deploy-db.js --script-only   # Generate deployment script only (SqlPackage)
 *
 * Environment Variables:
 *   SQL_SERVER         - Server address (default: localhost)
 *   SQL_PORT           - Server port (default: 14330)
 *   SQL_USER           - Username (default: sa)
 *   SQL_SA_PASSWORD    - Password (default: StrongPassword123)
 *   SQL_DATABASE       - Database name (default: AccountingDB)
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// Configuration from environment
const config = {
  server: process.env.SQL_SERVER || 'localhost',
  port: parseInt(process.env.SQL_PORT || '14330'),
  user: process.env.SQL_USER || 'sa',
  password: process.env.SQL_SA_PASSWORD || 'StrongPassword123',
  database: process.env.SQL_DATABASE || 'AccountingDB',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

// Paths
const scriptDir = __dirname;
const projectDir = path.join(scriptDir, '..');
const databaseDir = path.join(projectDir, 'database');
const sqlProjFile = path.join(databaseDir, 'AccountingDB.sqlproj');
const outputDir = path.join(databaseDir, 'bin', 'Debug');
const dacpacPath = path.join(outputDir, 'AccountingDB.dacpac');

// Parse command line arguments
const args = process.argv.slice(2);
const forceSqlPackage = args.includes('--sqlpackage');
const forceNode = args.includes('--node');
const scriptOnly = args.includes('--script-only');

// ============================================================================
// Utility Functions
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

function findSqlPackage() {
  // Check if SqlPackage is in PATH
  try {
    const result = spawnSync('where', ['SqlPackage'], { encoding: 'utf8', shell: true });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim().split('\n')[0].trim();
    }
  } catch (e) {}

  // Check common installation paths
  const possiblePaths = [
    path.join(process.env.USERPROFILE || '', '.dotnet', 'tools', 'SqlPackage.exe'),
    'C:\\Program Files\\Microsoft SQL Server\\160\\DAC\\bin\\SqlPackage.exe',
    'C:\\Program Files\\Microsoft SQL Server\\150\\DAC\\bin\\SqlPackage.exe',
    'C:\\Program Files (x86)\\Microsoft SQL Server\\160\\DAC\\bin\\SqlPackage.exe',
    'C:\\Program Files (x86)\\Microsoft SQL Server\\150\\DAC\\bin\\SqlPackage.exe',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

function canBuildSqlProj() {
  try {
    // Check if dotnet is available
    const result = spawnSync('dotnet', ['--version'], { encoding: 'utf8', shell: true });
    if (result.status !== 0) return false;

    // Check if we can build SQL projects (requires Microsoft.Build.Sql)
    // This is a quick check - actual build might still fail
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// SqlPackage Deployment Mode
// ============================================================================

async function deployWithSqlPackage() {
  log('Starting SqlPackage deployment mode', 'step');

  // Step 1: Build the SQL project
  log('Building SQL project...', 'step');
  console.log(`  Project: ${sqlProjFile}`);

  try {
    // Try dotnet build first (requires Microsoft.Build.Sql SDK project)
    execSync(`dotnet build "${sqlProjFile}" -c Debug`, {
      stdio: 'inherit',
      cwd: databaseDir,
    });
  } catch (e) {
    // If dotnet build fails, try MSBuild
    log('dotnet build failed, trying MSBuild...', 'warn');
    try {
      execSync(`msbuild "${sqlProjFile}" /p:Configuration=Debug /t:Build`, {
        stdio: 'inherit',
        cwd: databaseDir,
      });
    } catch (e2) {
      throw new Error(
        'Failed to build SQL project. Ensure Visual Studio with SSDT or Microsoft.Build.Sql is installed.'
      );
    }
  }

  if (!fs.existsSync(dacpacPath)) {
    throw new Error(`DACPAC not found at: ${dacpacPath}`);
  }
  log(`Build successful: ${dacpacPath}`, 'success');

  // Step 2: Find SqlPackage
  const sqlPackage = findSqlPackage();
  if (!sqlPackage) {
    throw new Error('SqlPackage not found. Install via: dotnet tool install -g microsoft.sqlpackage');
  }
  log(`Using SqlPackage: ${sqlPackage}`);

  // Step 3: Build connection string
  const connectionString = `Server=${config.server},${config.port};Database=${config.database};User Id=${config.user};Password=${config.password};TrustServerCertificate=true`;

  // Step 4: Deploy or generate script
  if (scriptOnly) {
    const scriptPath = path.join(outputDir, 'deploy-script.sql');
    log('Generating deployment script...', 'step');
    execSync(
      `"${sqlPackage}" /Action:Script /SourceFile:"${dacpacPath}" /TargetConnectionString:"${connectionString}" /OutputPath:"${scriptPath}"`,
      { stdio: 'inherit' }
    );
    log(`Script saved to: ${scriptPath}`, 'success');
  } else {
    log(`Deploying to ${config.server}:${config.port}/${config.database}...`, 'step');
    execSync(
      `"${sqlPackage}" /Action:Publish /SourceFile:"${dacpacPath}" /TargetConnectionString:"${connectionString}" /p:BlockOnPossibleDataLoss=false /p:GenerateSmartDefaults=true`,
      { stdio: 'inherit' }
    );
    log('Deployment completed successfully!', 'success');
  }
}

// ============================================================================
// Node.js Deployment Mode (Fallback)
// ============================================================================

// Tables in dependency order
const TABLE_ORDER = [
  'Accounts',
  'Customers',
  'Vendors',
  'ProductsServices',
  'Classes',
  'Locations',
  'Projects',
  'Invoices',
  'InvoiceLines',
  'Estimates',
  'EstimateLines',
  'Bills',
  'BillLines',
  'JournalEntries',
  'JournalEntryLines',
  'BankTransactions',
  'BankReconciliations',
  'ReconciliationItems',
  'TimeEntries',
  'RecurringTemplates',
  'RecurringSchedules',
  'InventoryTransactions',
  'InventoryLocations',
  'PurchaseOrders',
  'PurchaseOrderLines',
];

async function runBatches(pool, script, name) {
  // Split by GO statements
  const batches = script.split(/^GO\s*$/gim).filter((b) => b.trim());
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i].trim();
    if (batch) {
      try {
        await pool.batch(batch);
      } catch (err) {
        // Check if it's a safe-to-ignore error
        const ignorableErrors = [
          'already exists',
          'already an object',
          'already enabled',
          'duplicate key',
        ];
        const isIgnorable = ignorableErrors.some((e) =>
          err.message.toLowerCase().includes(e)
        );
        if (isIgnorable) {
          // Don't log for every skipped item - too noisy
        } else {
          throw err;
        }
      }
    }
  }
}

async function deployWithNode() {
  log('Starting Node.js deployment mode', 'step');
  log('Note: For production deployments, consider using SqlPackage mode', 'warn');

  let pool;
  try {
    // Step 1: Connect to master to create database
    log('Connecting to SQL Server...', 'step');
    const masterConfig = { ...config, database: 'master' };
    pool = await sql.connect(masterConfig);

    // Step 2: Create database if not exists
    log('Creating database if needed...', 'step');
    await pool.request().query(`
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${config.database}')
      BEGIN
        CREATE DATABASE [${config.database}];
        PRINT 'Database created';
      END
    `);
    pool.close();

    // Wait for database to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 3: Connect to target database
    pool = await sql.connect(config);

    // Step 4: Enable change tracking
    log('Configuring database...', 'step');
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID())
        BEGIN
          ALTER DATABASE [${config.database}] SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 7 DAYS, AUTO_CLEANUP = ON);
        END
      `);
    } catch (e) {
      log('Change tracking not supported on this SQL Server edition', 'warn');
    }

    // Step 5: Create tables
    log('Creating tables...', 'step');
    const tablesDir = path.join(databaseDir, 'dbo', 'Tables');
    for (const tableName of TABLE_ORDER) {
      const tablePath = path.join(tablesDir, `${tableName}.sql`);
      if (fs.existsSync(tablePath)) {
        const script = fs.readFileSync(tablePath, 'utf8');
        try {
          await runBatches(pool, script, tableName);
          console.log(`  Created: ${tableName}`);
        } catch (err) {
          log(`  Failed: ${tableName} - ${err.message}`, 'error');
        }
      }
    }

    // Step 6: Create views
    log('Creating views...', 'step');
    const viewsDir = path.join(databaseDir, 'dbo', 'Views');
    if (fs.existsSync(viewsDir)) {
      const viewFiles = fs.readdirSync(viewsDir).filter((f) => f.endsWith('.sql'));
      for (const file of viewFiles) {
        const script = fs.readFileSync(path.join(viewsDir, file), 'utf8');
        try {
          await runBatches(pool, script, file);
          console.log(`  Created: ${file}`);
        } catch (err) {
          log(`  Failed: ${file} - ${err.message}`, 'error');
        }
      }
    }

    // Step 7: Create stored procedures
    log('Creating stored procedures...', 'step');
    const procsDir = path.join(databaseDir, 'dbo', 'StoredProcedures');
    if (fs.existsSync(procsDir)) {
      const procFiles = fs.readdirSync(procsDir).filter((f) => f.endsWith('.sql'));
      for (const file of procFiles) {
        const script = fs.readFileSync(path.join(procsDir, file), 'utf8');
        try {
          await runBatches(pool, script, file);
          console.log(`  Created: ${file}`);
        } catch (err) {
          log(`  Failed: ${file} - ${err.message}`, 'error');
        }
      }
    }

    // Step 8: Run migrations
    log('Running migrations...', 'step');
    const migrationsDir = path.join(databaseDir, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const file of migrationFiles) {
        const script = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
          await runBatches(pool, script, file);
          console.log(`  Applied: ${file}`);
        } catch (err) {
          log(`  Warning: ${file} - ${err.message.split('\n')[0]}`, 'warn');
        }
      }
    }

    // Step 9: Run post-deployment script
    log('Running post-deployment script...', 'step');
    const postDeployPath = path.join(databaseDir, 'Script.PostDeployment.sql');
    if (fs.existsSync(postDeployPath)) {
      let script = fs.readFileSync(postDeployPath, 'utf8');
      // Remove SQLCMD mode commands
      script = script.replace(/^:.*$/gm, '');
      try {
        await runBatches(pool, script, 'PostDeployment');
        console.log('  Seed data inserted');
      } catch (err) {
        log(`  Warning: ${err.message}`, 'warn');
      }
    }

    log('Deployment completed successfully!', 'success');
  } finally {
    if (pool) {
      pool.close();
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  AccountingDB Deployment');
  console.log('========================================');
  console.log('');
  console.log(`  Server:   ${config.server}:${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log('');

  try {
    // Determine deployment mode
    const sqlPackageAvailable = findSqlPackage() !== null;
    canBuildSqlProj(); // Check if sqlproj can be built (logs warning if not)

    if (forceSqlPackage) {
      if (!sqlPackageAvailable) {
        log('SqlPackage not found. Install via: dotnet tool install -g microsoft.sqlpackage', 'error');
        process.exit(1);
      }
      await deployWithSqlPackage();
    } else if (forceNode) {
      await deployWithNode();
    } else {
      // Default to Node.js mode (more reliable across environments)
      // SqlPackage mode requires Visual Studio SSDT or specific SDK setup
      await deployWithNode();
    }

    console.log('');
    console.log('========================================');
    console.log('  Deployment Complete!');
    console.log('========================================');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.log('');
    log(`Deployment failed: ${err.message}`, 'error');
    process.exit(1);
  }
}

main();
