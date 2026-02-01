/**
 * Run a migration script against production SQL database
 * Usage: node scripts/run-prod-migration.js <migration-file>
 *
 * Requires SQL_CONNECTION_STRING environment variable or will prompt for connection details
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

function parseConnectionString(connectionString) {
    const parts = {};
    for (const part of connectionString.split(';')) {
        const [key, ...valueParts] = part.split('=');
        if (key && valueParts.length > 0) {
            parts[key.trim().toLowerCase()] = valueParts.join('=').trim();
        }
    }

    let server = parts['server'] || parts['data source'] || 'localhost';
    let port = 1433;

    if (server.startsWith('tcp:')) server = server.substring(4);
    if (server.includes(',')) {
        const [host, portStr] = server.split(',');
        server = host;
        port = parseInt(portStr, 10);
    }

    return {
        server,
        port,
        database: parts['database'] || parts['initial catalog'] || 'AccountingDB',
        user: parts['user id'] || parts['uid'] || 'sa',
        password: parts['password'] || parts['pwd'] || '',
        options: {
            encrypt: true,
            trustServerCertificate: false,
            enableArithAbort: true,
        },
    };
}

async function runMigration(migrationFile) {
    // Get connection string
    let connectionString = process.env.SQL_CONNECTION_STRING;

    if (!connectionString) {
        console.log('SQL_CONNECTION_STRING not set. Please provide connection details:');
        const server = await prompt('Server (e.g., sql-modern-accounting-prod.database.windows.net): ');
        const database = await prompt('Database [AccountingDB]: ') || 'AccountingDB';
        const user = await prompt('User: ');
        const password = await prompt('Password: ');

        connectionString = `Server=tcp:${server},1433;Database=${database};User ID=${user};Password=${password};Encrypt=true;TrustServerCertificate=false;`;
    }

    const config = parseConnectionString(connectionString);
    console.log(`\nConnecting to ${config.server}/${config.database}...`);

    // Read migration file
    const scriptPath = path.resolve(migrationFile);
    if (!fs.existsSync(scriptPath)) {
        console.error(`Migration file not found: ${scriptPath}`);
        process.exit(1);
    }

    const script = fs.readFileSync(scriptPath, 'utf8');
    console.log(`Running migration: ${path.basename(scriptPath)}\n`);

    // Connect and run
    let pool;
    try {
        pool = await sql.connect(config);

        // Split by GO statements and run each batch
        const batches = script.split(/^GO\s*$/gmi).filter(b => b.trim());

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i].trim();
            if (!batch) continue;

            console.log(`--- Batch ${i + 1}/${batches.length} ---`);

            try {
                const result = await pool.request().query(batch);

                // Show any result sets
                if (result.recordsets && result.recordsets.length > 0) {
                    for (const recordset of result.recordsets) {
                        if (recordset.length > 0) {
                            console.table(recordset);
                        }
                    }
                }

                // Show rows affected if applicable
                if (result.rowsAffected && result.rowsAffected.some(r => r > 0)) {
                    console.log(`Rows affected: ${result.rowsAffected.filter(r => r > 0).join(', ')}`);
                }
            } catch (batchError) {
                console.error(`Batch ${i + 1} failed:`, batchError.message);
                throw batchError;
            }
        }

        console.log('\n✓ Migration completed successfully');

    } catch (error) {
        console.error('\n✗ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (pool) await pool.close();
    }
}

// Main
const migrationFile = process.argv[2];
if (!migrationFile) {
    console.log('Usage: node scripts/run-prod-migration.js <migration-file>');
    console.log('Example: node scripts/run-prod-migration.js database/migrations/035_BackfillVendorSourceSystem.sql');
    process.exit(1);
}

runMigration(migrationFile);
