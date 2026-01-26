const sql = require('mssql');

async function check() {
  const pool = await sql.connect('Server=localhost,14330;Database=AccountingDB;User Id=sa;Password=StrongPassword123!;TrustServerCertificate=true');

  // Check invoice dates
  const invoices = await pool.query(`
    SELECT TOP 10
      i.InvoiceNumber,
      i.IssueDate,
      c.Name as Customer,
      i.TotalAmount,
      i.Status,
      (SELECT COUNT(*) FROM InvoiceLines WHERE InvoiceId = i.Id) as LineCount
    FROM Invoices i
    JOIN Customers c ON i.CustomerId = c.Id
    ORDER BY i.IssueDate DESC
  `);
  console.log('Recent Invoices:');
  invoices.recordset.forEach(i =>
    console.log('  ' + i.IssueDate.toISOString().split('T')[0] + ' | ' + i.InvoiceNumber + ' | ' + i.Customer + ' | $' + i.TotalAmount + ' | ' + i.Status + ' | Lines: ' + i.LineCount)
  );

  // Check if invoice lines have ProductServiceId
  const lines = await pool.query(`
    SELECT TOP 5 il.*, ps.Name as ProductName
    FROM InvoiceLines il
    LEFT JOIN ProductsServices ps ON il.ProductServiceId = ps.Id
  `);
  console.log('\nSample Invoice Lines:');
  lines.recordset.forEach(l =>
    console.log('  ' + l.Description + ' | ProductServiceId: ' + (l.ProductServiceId || 'NULL') + ' | Product: ' + (l.ProductName || 'N/A'))
  );

  // Check what the Sales by Customer report would return
  const salesData = await pool.query(`
    SELECT
      c.Name as CustomerName,
      COUNT(DISTINCT i.Id) as InvoiceCount,
      SUM(i.TotalAmount) as TotalSales
    FROM Invoices i
    JOIN Customers c ON i.CustomerId = c.Id
    WHERE i.IssueDate >= '2024-12-31' AND i.IssueDate <= '2025-12-30'
    GROUP BY c.Name
    ORDER BY TotalSales DESC
  `);
  console.log('\nSales by Customer (date range 2024-12-31 to 2025-12-30):');
  if (salesData.recordset.length === 0) {
    console.log('  NO DATA FOUND');
  } else {
    salesData.recordset.forEach(s =>
      console.log('  ' + s.CustomerName + ' | Invoices: ' + s.InvoiceCount + ' | Total: $' + s.TotalSales)
    );
  }

  pool.close();
}

check().catch(e => { console.error(e.message); process.exit(1); });
