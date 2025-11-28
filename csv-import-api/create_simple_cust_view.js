const sql = require('mssql');
require('dotenv').config();

async function createSimpleCustView() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating v_Customers_Simple view...');
        await sql.query`
            CREATE OR ALTER VIEW v_Customers_Simple AS
            SELECT Id, Name FROM Customers
        `;
        console.log('View created successfully.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

createSimpleCustView();
