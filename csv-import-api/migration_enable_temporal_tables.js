const sql = require('mssql');
require('dotenv').config();

// List of tables to convert to temporal tables
const tables = [
    'Accounts',
    'BankTransactions',
    'Customers',
    'InvoiceLines',
    'Invoices',
    'JournalEntries',
    'JournalEntryLines'
];

async function isTemporalTable(tableName) {
    const result = await sql.query`
        SELECT temporal_type
        FROM sys.tables
        WHERE name = ${tableName} AND schema_id = SCHEMA_ID('dbo')
    `;
    // temporal_type: 0 = non-temporal, 2 = system-versioned temporal
    return result.recordset.length > 0 && result.recordset[0].temporal_type === 2;
}

async function enableTemporalTable(tableName) {
    const historyTable = `${tableName}_History`;

    console.log(`Converting ${tableName} to temporal table...`);

    // Add temporal columns and period
    // HIDDEN keyword makes columns invisible to SELECT * queries
    await sql.query(`
        ALTER TABLE dbo.${tableName}
        ADD
            ValidFrom DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN
                NOT NULL DEFAULT SYSUTCDATETIME(),
            ValidTo DATETIME2 GENERATED ALWAYS AS ROW END HIDDEN
                NOT NULL DEFAULT CONVERT(DATETIME2, '9999-12-31 23:59:59.9999999'),
            PERIOD FOR SYSTEM_TIME (ValidFrom, ValidTo)
    `);

    // Enable system versioning with history table
    await sql.query(`
        ALTER TABLE dbo.${tableName}
        SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.${historyTable}))
    `);

    console.log(`  ✓ ${tableName} is now a temporal table with history in dbo.${historyTable}`);
}

async function runMigration() {
    try {
        console.log('Connecting to database...');
        await sql.connect(process.env.DB_CONNECTION_STRING);
        console.log('Connected.\n');

        console.log('=== Enabling Temporal Tables ===\n');

        let converted = 0;
        let skipped = 0;

        for (const tableName of tables) {
            try {
                const isTemporal = await isTemporalTable(tableName);

                if (isTemporal) {
                    console.log(`⊘ ${tableName} is already a temporal table, skipping.`);
                    skipped++;
                } else {
                    await enableTemporalTable(tableName);
                    converted++;
                }
            } catch (err) {
                console.error(`✗ Failed to convert ${tableName}:`, err.message);
            }
        }

        console.log('\n=== Migration Complete ===');
        console.log(`Tables converted: ${converted}`);
        console.log(`Tables skipped (already temporal): ${skipped}`);

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        await sql.close();
    }
}

runMigration();
