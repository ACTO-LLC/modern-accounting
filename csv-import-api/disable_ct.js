const sql = require('mssql');
require('dotenv').config();

async function disableChangeTracking() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Disabling change tracking on JournalEntries...');
        await sql.query`
            ALTER TABLE JournalEntries
            DISABLE CHANGE_TRACKING
        `;
        console.log('Change tracking disabled.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

disableChangeTracking();
