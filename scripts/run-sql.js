/**
 * SQL Script Runner
 *
 * Executes SQL scripts using the mssql Node.js package.
 * This is a workaround for sqlcmd password issues with special characters.
 * See CLAUDE.md for details.
 *
 * Usage:
 *   node run-sql.js <script.sql> [--staging] [--verbose]
 *
 * Environment Variables:
 *   SQL_SERVER    - Server hostname (default: localhost)
 *   SQL_PORT      - Server port (default: 14330, or 14331 for staging)
 *   SQL_USER      - Username (default: sa)
 *   SQL_SA_PASSWORD - Password (default: StrongPassword123!)
 *   SQL_SA_PASSWORD_STAGING - Staging password (default: StagingPassword123)
 *   SQL_DATABASE  - Database name (default: AccountingDB)
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isStaging = args.includes('--staging');
const isVerbose = args.includes('--verbose');
const scriptPath = args.find(arg => !arg.startsWith('--'));

if (!scriptPath) {
    console.error('Usage: node run-sql.js <script.sql> [--staging] [--verbose]');
    console.error('');
    console.error('Options:');
    console.error('  --staging   Use staging database (port 14331)');
    console.error('  --verbose   Show detailed output');
    process.exit(1);
}

// Build configuration
const config = {
    server: process.env.SQL_SERVER || 'localhost',
    port: isStaging
        ? parseInt(process.env.SQL_PORT_STAGING || '14331')
        : parseInt(process.env.SQL_PORT || '14330'),
    database: process.env.SQL_DATABASE || 'AccountingDB',
    user: process.env.SQL_USER || 'sa',
    password: isStaging
        ? (process.env.SQL_SA_PASSWORD_STAGING || 'StagingPassword123')
        : (process.env.SQL_SA_PASSWORD || 'StrongPassword123!'),
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

/**
 * Split SQL script into batches by GO statements
 */
function splitIntoBatches(script) {
    // Split by GO on its own line (case insensitive)
    const batches = script.split(/^\s*GO\s*$/gim);
    return batches
        .map(batch => batch.trim())
        .filter(batch => batch.length > 0);
}

/**
 * Execute a SQL script file
 */
async function runScript(scriptFile) {
    const resolvedPath = path.resolve(scriptFile);

    if (!fs.existsSync(resolvedPath)) {
        console.error(`Error: Script file not found: ${resolvedPath}`);
        process.exit(1);
    }

    console.log('========================================');
    console.log('SQL Script Runner');
    console.log('========================================');
    console.log(`Script:   ${path.basename(resolvedPath)}`);
    console.log(`Server:   ${config.server}:${config.port}`);
    console.log(`Database: ${config.database}`);
    console.log(`Mode:     ${isStaging ? 'Staging' : 'Development'}`);
    console.log('');

    let pool;
    try {
        // Connect to database
        console.log('Connecting to SQL Server...');
        pool = await sql.connect(config);
        console.log('Connected successfully.');
        console.log('');

        // Read and parse script
        const scriptContent = fs.readFileSync(resolvedPath, 'utf8');
        const batches = splitIntoBatches(scriptContent);

        console.log(`Executing ${batches.length} batch(es)...`);
        console.log('');

        // Execute each batch
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            if (isVerbose) {
                console.log(`--- Batch ${i + 1}/${batches.length} ---`);
                console.log(batch.substring(0, 200) + (batch.length > 200 ? '...' : ''));
                console.log('');
            }

            try {
                const result = await pool.request().query(batch);
                successCount++;

                if (isVerbose && result.recordset) {
                    console.log(`Rows affected: ${result.rowsAffected}`);
                }

                // Check for PRINT statements in messages
                if (result.output && Object.keys(result.output).length > 0) {
                    console.log('Output:', result.output);
                }
            } catch (err) {
                errorCount++;
                console.error(`Error in batch ${i + 1}: ${err.message}`);

                if (isVerbose) {
                    console.error('Batch content:');
                    console.error(batch);
                }
            }
        }

        // Summary
        console.log('');
        console.log('========================================');
        console.log(`Completed: ${successCount}/${batches.length} batches successful`);
        if (errorCount > 0) {
            console.log(`Errors: ${errorCount}`);
        }
        console.log('========================================');

        process.exit(errorCount > 0 ? 1 : 0);

    } catch (err) {
        console.error('');
        console.error('Connection failed:', err.message);
        console.error('');
        console.error('Troubleshooting:');
        console.error('  1. Ensure SQL Server is running');
        console.error('  2. Check connection parameters');
        console.error('  3. Verify firewall allows port', config.port);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

// Run the script
runScript(scriptPath);
