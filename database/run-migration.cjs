/**
 * Database Migration Runner
 * Runs SQL migration files using Node.js mssql package
 * (Avoids issues with sqlcmd and special characters in passwords)
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT || '14330'),
  database: process.env.DB_NAME || 'AccountingDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'StrongPassword123!',
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function runMigration(migrationFile) {
  let pool;
  try {
    console.log(`Connecting to ${config.server}:${config.port}/${config.database}...`);
    pool = await sql.connect(config);
    console.log('Connected successfully.\n');

    // Read the migration file
    const filePath = path.resolve(migrationFile);
    console.log(`Reading migration file: ${filePath}`);
    const script = fs.readFileSync(filePath, 'utf8');

    // Split by GO statements (SQL Server batch separator)
    const batches = script.split(/^GO\s*$/gim).filter(b => b.trim());
    console.log(`Found ${batches.length} batches to execute.\n`);

    // Execute each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i].trim();
      if (!batch) continue;

      try {
        console.log(`Executing batch ${i + 1}/${batches.length}...`);
        await pool.batch(batch);

        // Check for PRINT statements in the batch output
        const printMatch = batch.match(/PRINT\s+'([^']+)'/g);
        if (printMatch) {
          printMatch.forEach(p => {
            const msg = p.match(/PRINT\s+'([^']+)'/)?.[1];
            if (msg) console.log(`  > ${msg}`);
          });
        }
      } catch (err) {
        console.error(`Error in batch ${i + 1}:`, err.message);
        // Continue with other batches unless it's a critical error
        if (err.message.includes('already exists')) {
          console.log('  (Object already exists, continuing...)');
        } else {
          throw err;
        }
      }
    }

    console.log('\n✓ Migration completed successfully!');
  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

// Get migration file from command line argument
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: node run-migration.js <migration-file.sql>');
  console.error('Example: node run-migration.js migrations/023_AddPayrollModule.sql');
  process.exit(1);
}

runMigration(migrationFile);
