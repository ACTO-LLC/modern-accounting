const sql = require('mssql');
require('dotenv').config();

async function createViews() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Creating v_Customers view...');
        await sql.query`
            CREATE OR ALTER VIEW v_Customers AS
            SELECT * FROM Customers
        `;

        console.log('Creating v_Invoices view...');
        await sql.query`
            CREATE OR ALTER VIEW v_Invoices AS
            SELECT * FROM Invoices
        `;

        console.log('Views created successfully.');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

createViews();
