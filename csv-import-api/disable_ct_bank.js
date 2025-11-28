const sql = require('mssql');
require('dotenv').config();

async function disableCTBank() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Disabling change tracking on BankTransactions...');
        try {
            await sql.query`ALTER TABLE BankTransactions DISABLE CHANGE_TRACKING`;
            console.log('Change tracking disabled.');
        } catch (e) { console.log('Error:', e.message); }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

disableCTBank();
