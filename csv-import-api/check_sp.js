const sql = require('mssql');
require('dotenv').config();

async function checkSP() {
    try {
        await sql.connect(process.env.DB_CONNECTION_STRING);
        const result = await sql.query`
            SELECT * FROM sys.objects 
            WHERE object_id = OBJECT_ID(N'[dbo].[CreateInvoice]') 
            AND type in (N'P', N'PC')
        `;
        console.log('SP Exists:', result.recordset.length > 0);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkSP();
