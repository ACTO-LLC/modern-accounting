const sql = require('mssql');
require('dotenv').config();

async function createView() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating v_BankTransactions view...');
        await sql.query`
            CREATE OR ALTER VIEW v_BankTransactions AS
            SELECT * FROM BankTransactions
        `;
        console.log('View created successfully.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

createView();
