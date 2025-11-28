const sql = require('mssql');
require('dotenv').config();

async function checkViews() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Checking v_Customers...');
        await sql.query`SELECT TOP 1 * FROM v_Customers`;
        console.log('v_Customers OK');

        console.log('Checking v_Invoices...');
        await sql.query`SELECT TOP 1 * FROM v_Invoices`;
        console.log('v_Invoices OK');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkViews();
