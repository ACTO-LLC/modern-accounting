const sql = require('mssql');

const invoicesToMigrate = [
    {
        qboId: '1000000279',
        docNumber: '103164',
        txnDate: '2026-01-05',
        dueDate: '2026-02-04',
        customerId: 'F7685C04-51FC-49B7-A9AF-A1C8F7CCC496', // KDIT, LLC
        totalAmt: 12716.67,
        balance: 12716.67,
        taxAmount: 0,
        lines: [
            {
                description: 'MBC Scheduler + EHR + Practice Management Integration - Work Order 00365',
                quantity: 1,
                unitPrice: 12716.67,
                amount: 12716.67
            }
        ]
    },
    {
        qboId: '1000000283',
        docNumber: '103168',
        txnDate: '2026-01-06',
        dueDate: '2026-02-05',
        customerId: 'E078A389-CB05-4BF9-92DE-B7200900995B', // Bamert Seed Co
        totalAmt: 4946.50,
        balance: 4946.50,
        taxAmount: 284.39,
        lines: [
            { description: 'Dynamics 365 Team Members (NCE COM MTH)', quantity: 4, unitPrice: 9.60, amount: 38.40 },
            { description: 'December - IT Support/Planning Sr. Consultant (Eric)', quantity: 6, unitPrice: 115, amount: 690 },
            { description: 'December hours - Junior Developer', quantity: 15, unitPrice: 35, amount: 525 },
            { description: 'Power Bi Pro (NCE COM MTH)', quantity: 4, unitPrice: 16.80, amount: 67.20 },
            { description: 'Dataverse Database Capacity add-on', quantity: 28, unitPrice: 48, amount: 1344 },
            { description: 'Dataverse File Capacity add-on', quantity: 6, unitPrice: 2.40, amount: 14.40 },
            { description: 'Dataverse Log Capacity add-on', quantity: 4, unitPrice: 12, amount: 48 },
            { description: 'Dynamics 365 Sales Enterprise Edition (NCE COM MTH)', quantity: 14, unitPrice: 126, amount: 1764 },
            { description: 'Microsoft 365 Business Standard (NCE COM MTH)', quantity: 7, unitPrice: 13.13, amount: 91.91 },
            { description: 'Microsoft 365 Business Basic (NCE COM MTH)', quantity: 11, unitPrice: 7.20, amount: 79.20 }
        ]
    }
];

(async () => {
    const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);

    for (const inv of invoicesToMigrate) {
        // Check if already migrated
        const existing = await pool.request()
            .input('docNum', sql.NVarChar, inv.docNumber)
            .query('SELECT Id FROM Invoices WHERE InvoiceNumber = @docNum');

        if (existing.recordset.length > 0) {
            console.log('Invoice ' + inv.docNumber + ' already exists, skipping');
            continue;
        }

        const subtotal = inv.totalAmt - inv.taxAmount;
        const amountPaid = inv.totalAmt - inv.balance;
        const status = inv.balance === 0 ? 'Paid' : (amountPaid > 0 ? 'Partial' : 'Sent');

        // Create invoice header
        const headerResult = await pool.request()
            .input('InvoiceNumber', sql.NVarChar, inv.docNumber)
            .input('CustomerId', sql.UniqueIdentifier, inv.customerId)
            .input('IssueDate', sql.Date, inv.txnDate)
            .input('DueDate', sql.Date, inv.dueDate)
            .input('Subtotal', sql.Decimal(18,2), subtotal)
            .input('TaxAmount', sql.Decimal(18,2), inv.taxAmount)
            .input('TotalAmount', sql.Decimal(18,2), inv.totalAmt)
            .input('AmountPaid', sql.Decimal(18,2), amountPaid)
            .input('Status', sql.NVarChar, status)
            .input('SourceSystem', sql.NVarChar, 'QBO')
            .input('SourceId', sql.NVarChar, inv.qboId)
            .input('IsPersonal', sql.Bit, false)
            .query(`INSERT INTO Invoices (InvoiceNumber, CustomerId, IssueDate, DueDate, Subtotal, TaxAmount, TotalAmount, AmountPaid, Status, SourceSystem, SourceId, IsPersonal)
                    OUTPUT INSERTED.Id
                    VALUES (@InvoiceNumber, @CustomerId, @IssueDate, @DueDate, @Subtotal, @TaxAmount, @TotalAmount, @AmountPaid, @Status, @SourceSystem, @SourceId, @IsPersonal)`);

        const invoiceId = headerResult.recordset[0].Id;
        console.log('Created invoice ' + inv.docNumber + ' with ID: ' + invoiceId);

        // Create invoice lines
        for (const line of inv.lines) {
            await pool.request()
                .input('InvoiceId', sql.UniqueIdentifier, invoiceId)
                .input('Description', sql.NVarChar, line.description)
                .input('Quantity', sql.Decimal(18,4), line.quantity)
                .input('UnitPrice', sql.Decimal(18,4), line.unitPrice)
                .input('Amount', sql.Decimal(18,2), line.amount)
                .query(`INSERT INTO InvoiceLines (InvoiceId, Description, Quantity, UnitPrice, Amount)
                        VALUES (@InvoiceId, @Description, @Quantity, @UnitPrice, @Amount)`);
        }
        console.log('  Added ' + inv.lines.length + ' line items');
    }

    // Verify
    const total = await pool.request().query("SELECT COUNT(*) as Count, SUM(TotalAmount - AmountPaid) as TotalAR FROM Invoices WHERE SourceSystem = 'QBO'");
    console.log('\n=== MIGRATED INVOICES ===');
    console.log('Count:', total.recordset[0].Count);
    console.log('Total AR:', '$' + Number(total.recordset[0].TotalAR).toFixed(2));

    await pool.close();
})();
