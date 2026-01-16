const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT || '14330'),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'StrongPassword123!',
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

// Tables must be created in dependency order (foreign key dependencies)
const tableOrder = [
  'Accounts',
  'Customers',
  'Vendors',
  'ProductsServices',
  'Projects',
  'Classes',
  'Locations',
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
];

// Views
const views = [
  'v_Invoices',
  'v_InvoiceLines',
  'v_Estimates',
  'v_Bills',
  'v_Projects',
  'v_TimeEntries',
];

// Migrations in order
const migrations = [
  '006_AddSubmissions.sql',
  '007_AddEmailSettings.sql',
  '007_AddMigrationFramework.sql',
  '008_AddQBOConnections.sql',
  '009_AddPaymentsAndJournalEntryMigration.sql',
  '010_AddCompanyOnboarding.sql',
  '011_EnhanceIndustryDetection.sql',
  '020_Enhancements.sql',
  '021_Deployments.sql',
  '022_AddClaimIdToInvoices.sql',
  '023_AddPayrollModule.sql',
];

async function runBatches(pool, script, name) {
  // Split by GO statements
  const batches = script.split(/^GO$/gim).filter(b => b.trim());
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i].trim();
    if (batch) {
      try {
        await pool.batch(batch);
      } catch (err) {
        console.error(`Error in ${name} batch ${i + 1}:`, err.message);
        throw err;
      }
    }
  }
}

async function init() {
  console.log('=== Database Initialization ===\n');

  // Connect to master to create database
  console.log('1. Creating AccountingDB database...');
  const masterPool = await sql.connect({ ...config, database: 'master' });

  try {
    await masterPool.query(`
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'AccountingDB')
      BEGIN
        CREATE DATABASE AccountingDB;
      END
    `);
    console.log('   Database created or already exists.');
  } finally {
    await masterPool.close();
  }

  // Wait for database to be ready
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Connect to AccountingDB
  console.log('\n2. Connecting to AccountingDB...');
  const pool = await sql.connect({ ...config, database: 'AccountingDB' });

  try {
    // Enable change tracking
    console.log('\n3. Enabling change tracking...');
    await pool.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.change_tracking_databases WHERE database_id = DB_ID())
      BEGIN
        ALTER DATABASE AccountingDB SET CHANGE_TRACKING = ON (CHANGE_RETENTION = 7 DAYS, AUTO_CLEANUP = ON);
      END
    `);
    console.log('   Change tracking enabled.');

    // Create tables
    console.log('\n4. Creating tables...');
    const tablesDir = path.join(__dirname, 'dbo', 'Tables');
    for (const tableName of tableOrder) {
      const tablePath = path.join(tablesDir, `${tableName}.sql`);
      if (fs.existsSync(tablePath)) {
        const script = fs.readFileSync(tablePath, 'utf8');

        // Check if table already exists
        const exists = await pool.query(`
          SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tableName}'
        `);

        if (exists.recordset.length === 0) {
          try {
            await runBatches(pool, script, tableName);
            console.log(`   Created: ${tableName}`);
          } catch (err) {
            console.log(`   Skipped: ${tableName} (${err.message})`);
          }
        } else {
          console.log(`   Exists: ${tableName}`);
        }
      }
    }

    // Create views
    console.log('\n5. Creating views...');
    const viewsDir = path.join(__dirname, 'dbo', 'Views');
    for (const viewName of views) {
      const viewPath = path.join(viewsDir, `${viewName}.sql`);
      if (fs.existsSync(viewPath)) {
        const script = fs.readFileSync(viewPath, 'utf8');

        // Check if view exists
        const exists = await pool.query(`
          SELECT 1 FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = '${viewName}'
        `);

        if (exists.recordset.length === 0) {
          try {
            await runBatches(pool, script, viewName);
            console.log(`   Created: ${viewName}`);
          } catch (err) {
            console.log(`   Skipped: ${viewName} (${err.message})`);
          }
        } else {
          console.log(`   Exists: ${viewName}`);
        }
      }
    }

    // Create stored procedures
    console.log('\n6. Creating stored procedures...');
    const spDir = path.join(__dirname, 'dbo', 'StoredProcedures');
    if (fs.existsSync(spDir)) {
      const spFiles = fs.readdirSync(spDir).filter(f => f.endsWith('.sql'));
      for (const spFile of spFiles) {
        const spPath = path.join(spDir, spFile);
        const script = fs.readFileSync(spPath, 'utf8');
        try {
          await runBatches(pool, script, spFile);
          console.log(`   Created: ${spFile}`);
        } catch (err) {
          console.log(`   Skipped: ${spFile} (${err.message})`);
        }
      }
    }

    // Run migrations
    console.log('\n7. Running migrations...');
    const migrationsDir = path.join(__dirname, 'migrations');
    for (const migration of migrations) {
      const migrationPath = path.join(migrationsDir, migration);
      if (fs.existsSync(migrationPath)) {
        console.log(`   Running: ${migration}`);
        const script = fs.readFileSync(migrationPath, 'utf8');
        try {
          await runBatches(pool, script, migration);
          console.log(`   Complete: ${migration}`);
        } catch (err) {
          console.log(`   Warning: ${migration} - ${err.message}`);
        }
      }
    }

    // Run post-deployment script
    console.log('\n8. Running post-deployment script...');
    const postDeployPath = path.join(__dirname, 'Script.PostDeployment.sql');
    if (fs.existsSync(postDeployPath)) {
      const script = fs.readFileSync(postDeployPath, 'utf8');
      try {
        await runBatches(pool, script, 'PostDeployment');
        console.log('   Post-deployment complete.');
      } catch (err) {
        console.log(`   Warning: Post-deployment - ${err.message}`);
      }
    }

    // Verify
    console.log('\n9. Verification...');
    const result = await pool.query(`
      SELECT 'Tables' AS Type, COUNT(*) AS [Count] FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'
      UNION ALL
      SELECT 'Views', COUNT(*) FROM INFORMATION_SCHEMA.VIEWS
    `);
    result.recordset.forEach(r => console.log(`   ${r.Type}: ${r.Count}`));

    console.log('\n=== Database initialization complete! ===');
  } finally {
    await pool.close();
  }
}

init().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
