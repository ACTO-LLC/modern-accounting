const sql = require('mssql');
require('dotenv').config();

async function runMigration() {
    try {
        console.log('Connecting to database...');
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Checking if AccountNumber column exists...');
        const checkResult = await sql.query`
            SELECT COL_LENGTH('Accounts', 'AccountNumber') AS ColumnLength
        `;

        if (checkResult.recordset[0].ColumnLength === null) {
            console.log('Adding AccountNumber column...');
            await sql.query`
                ALTER TABLE Accounts
                ADD AccountNumber NVARCHAR(50) NULL
            `;
            console.log('Column added successfully.');
        } else {
            console.log('Column already exists.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sql.close();
    }
}

runMigration();
