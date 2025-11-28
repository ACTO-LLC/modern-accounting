const express = require('express');
const router = express.Router();
const sql = require('mssql');

router.post('/', async (req, res) => {
    try {
        const invoiceData = req.body;

        // Basic validation
        if (!invoiceData || !invoiceData.CustomerId || !invoiceData.Lines || invoiceData.Lines.length === 0) {
            return res.status(400).json({ error: 'Invalid invoice data. CustomerId and Lines are required.' });
        }

        // Ensure connection is closed before connecting (in case of previous errors)
        await sql.close();
        await sql.connect(process.env.DB_CONNECTION_STRING);

        const request = new sql.Request();
        // The SP expects a JSON string
        request.input('InvoiceJson', sql.NVarChar(sql.MAX), JSON.stringify(invoiceData));

        const result = await request.execute('dbo.CreateInvoice');

        // The SP returns the created invoice as a result set
        if (result.recordset && result.recordset.length > 0) {
            res.status(201).json(result.recordset[0]);
        } else {
            res.status(500).json({ error: 'Invoice created but no data returned' });
        }

    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ error: 'Failed to create invoice', details: error.message });
    } finally {
        await sql.close();
    }
});

module.exports = router;
