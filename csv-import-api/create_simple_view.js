const sql = require('mssql');
require('dotenv').config();

async function createSimpleView() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating v_BankTransactions_Simple view...');
        await sql.query`
            CREATE OR ALTER VIEW v_BankTransactions_Simple AS
            SELECT Id, Description FROM BankTransactions
        `;
        console.log('View created successfully.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

createSimpleView();
