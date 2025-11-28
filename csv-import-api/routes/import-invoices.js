const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse');
const sql = require('mssql');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const csvData = req.file.buffer.toString('utf-8');

        // Parse CSV
        const records = await new Promise((resolve, reject) => {
            parse(csvData, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            }, (err, output) => {
                if (err) reject(err);
                else resolve(output);
            });
        });

        if (records.length === 0) {
            return res.status(400).json({ error: 'Empty CSV file' });
        }

        // Group by InvoiceNumber
        const invoicesMap = new Map();

        for (const row of records) {
            // Expected columns: InvoiceNumber, CustomerName, IssueDate, DueDate, Description, Quantity, UnitPrice
            const invoiceNum = row.InvoiceNumber;
            if (!invoiceNum) continue;

            if (!invoicesMap.has(invoiceNum)) {
                invoicesMap.set(invoiceNum, {
                    InvoiceNumber: invoiceNum,
                    CustomerName: row.CustomerName,
                    IssueDate: row.IssueDate,
                    DueDate: row.DueDate,
                    Lines: []
                });
            }

            const invoice = invoicesMap.get(invoiceNum);
            invoice.Lines.push({
                Description: row.Description,
                Quantity: parseFloat(row.Quantity) || 0,
                UnitPrice: parseFloat(row.UnitPrice) || 0
            });
        }

        // Process each invoice
        const results = {
            total: invoicesMap.size,
            success: 0,
            failed: 0,
            details: []
        };

        await sql.connect(process.env.DB_CONNECTION_STRING);

        for (const invoiceData of invoicesMap.values()) {
            try {
                // 1. Lookup Customer
                const customerResult = await sql.query`SELECT Id FROM v_Customers WHERE Name = ${invoiceData.CustomerName}`;

                if (customerResult.recordset.length === 0) {
                    throw new Error(`Customer '${invoiceData.CustomerName}' not found`);
                }

                const customerId = customerResult.recordset[0].Id;

                // 2. Prepare Payload
                const payload = {
                    InvoiceNumber: invoiceData.InvoiceNumber,
                    CustomerId: customerId,
                    IssueDate: invoiceData.IssueDate,
                    DueDate: invoiceData.DueDate,
                    Status: 'Draft',
                    TotalAmount: invoiceData.Lines.reduce((sum, line) => sum + (line.Quantity * line.UnitPrice), 0),
                    Lines: invoiceData.Lines
                };

                // 3. Call Stored Procedure
                const request = new sql.Request();
                request.input('InvoiceJson', sql.NVarChar(sql.MAX), JSON.stringify(payload));

                const spResult = await request.execute('dbo.CreateInvoice');

                if (spResult.recordset && spResult.recordset.length > 0) {
                    results.success++;
                    results.details.push({
                        invoiceNumber: invoiceData.InvoiceNumber,
                        status: 'created',
                        id: spResult.recordset[0].Id
                    });
                } else {
                    throw new Error('Stored procedure returned no data');
                }

            } catch (err) {
                results.failed++;
                results.details.push({
                    invoiceNumber: invoiceData.InvoiceNumber,
                    status: 'failed',
                    error: err.message
                });
            }
        }

        res.json(results);

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Import failed', details: error.message });
    } finally {
        // Don't close connection if other requests might need it, 
        // but for this simple app we can leave it or manage it globally.
        // server.js seems to open/close or rely on global pool. 
        // The existing invoices.js closes it. Let's follow that pattern cautiously 
        // or better, check if we can reuse the pool. 
        // For now, to be safe and consistent with invoices.js:
        await sql.close();
    }
});

module.exports = router;
