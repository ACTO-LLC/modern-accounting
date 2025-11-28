const sql = require('mssql');
require('dotenv').config();

async function readTransactions() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Reading BankTransactions...');
        const result = await sql.query`
            SELECT TOP 5 Id, Description FROM BankTransactions
        `;
        console.log('Read successful. Count:', result.recordset.length);
        console.log(result.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

readTransactions();
