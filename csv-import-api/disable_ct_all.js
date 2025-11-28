const sql = require('mssql');
require('dotenv').config();

async function disableChangeTracking() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);

        console.log('Disabling change tracking on Customers and Invoices...');

        try {
            await sql.query`ALTER TABLE Customers DISABLE CHANGE_TRACKING`;
            console.log('Change tracking disabled on Customers.');
        } catch (e) { console.log('Error disabling CT on Customers:', e.message); }

        try {
            await sql.query`ALTER TABLE Invoices DISABLE CHANGE_TRACKING`;
            console.log('Change tracking disabled on Invoices.');
        } catch (e) { console.log('Error disabling CT on Invoices:', e.message); }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

disableChangeTracking();
