const sql = require('mssql');

async function seedInvoices() {
  const pool = await sql.connect('Server=localhost,14330;Database=AccountingDB;User Id=sa;Password=StrongPassword123!;TrustServerCertificate=true');

  // Check if seed invoices already exist
  const existing = await pool.query("SELECT COUNT(*) as cnt FROM Invoices WHERE InvoiceNumber LIKE 'INV-2025%'");
  if (existing.recordset[0].cnt > 0) {
    console.log('Seed invoices already exist:', existing.recordset[0].cnt);
    pool.close();
    return;
  }

  // Get customer IDs
  const customers = await pool.query("SELECT Id, Name FROM Customers WHERE Name IN ('Acme Corporation', 'TechStart Inc', 'Green Valley Foods', 'Metro Healthcare', 'Summit Construction', 'Coastal Retail Group', 'Pacific Logistics', 'Mountain View Consulting')");
  const custMap = {};
  customers.recordset.forEach(c => custMap[c.Name] = c.Id);

  // Get product IDs
  const products = await pool.query("SELECT Id, Name, SalesPrice FROM ProductsServices");
  const prodMap = {};
  products.recordset.forEach(p => prodMap[p.Name] = { id: p.Id, price: p.SalesPrice });

  console.log('Found customers:', Object.keys(custMap).length);
  console.log('Found products:', Object.keys(prodMap).length);

  if (Object.keys(custMap).length < 5) {
    console.log('Not enough customers. Running customer seed first...');
    await pool.query(`
      INSERT INTO Customers (Id, Name, Email, Phone, Address) VALUES
      (NEWID(), 'Acme Corporation', 'billing@acme.com', '555-0101', '123 Main St'),
      (NEWID(), 'TechStart Inc', 'ap@techstart.io', '555-0102', '456 Innovation Blvd'),
      (NEWID(), 'Green Valley Foods', 'orders@greenvalley.com', '555-0103', '789 Farm Road'),
      (NEWID(), 'Metro Healthcare', 'procurement@metrohc.org', '555-0104', '321 Medical Center Dr'),
      (NEWID(), 'Summit Construction', 'projects@summitbuild.com', '555-0105', '654 Builder Way'),
      (NEWID(), 'Coastal Retail Group', 'purchasing@coastalretail.com', '555-0106', '987 Commerce St'),
      (NEWID(), 'Pacific Logistics', 'accounts@pacificlog.com', '555-0107', '147 Shipping Lane'),
      (NEWID(), 'Mountain View Consulting', 'finance@mvcons.com', '555-0108', '258 Advisor Pkwy')
    `);
    const newCustomers = await pool.query("SELECT Id, Name FROM Customers WHERE Name IN ('Acme Corporation', 'TechStart Inc', 'Green Valley Foods', 'Metro Healthcare', 'Summit Construction', 'Coastal Retail Group', 'Pacific Logistics', 'Mountain View Consulting')");
    newCustomers.recordset.forEach(c => custMap[c.Name] = c.Id);
  }

  // Invoice data
  const invoices = [
    { number: 'INV-2025-0001', customer: 'Acme Corporation', date: '2025-01-15', due: '2025-02-14', amount: 2999.90, status: 'Paid' },
    { number: 'INV-2025-0002', customer: 'TechStart Inc', date: '2025-01-20', due: '2025-02-19', amount: 4599.85, status: 'Paid' },
    { number: 'INV-2025-0003', customer: 'Green Valley Foods', date: '2025-02-10', due: '2025-03-12', amount: 1649.93, status: 'Paid' },
    { number: 'INV-2025-0004', customer: 'Metro Healthcare', date: '2025-02-25', due: '2025-03-27', amount: 8699.88, status: 'Paid' },
    { number: 'INV-2025-0005', customer: 'Summit Construction', date: '2025-03-05', due: '2025-04-04', amount: 3799.92, status: 'Paid' },
    { number: 'INV-2025-0006', customer: 'Coastal Retail Group', date: '2025-03-18', due: '2025-04-17', amount: 6299.90, status: 'Paid' },
    { number: 'INV-2025-0007', customer: 'Acme Corporation', date: '2025-10-01', due: '2025-10-31', amount: 4249.95, status: 'Paid' },
    { number: 'INV-2025-0008', customer: 'Pacific Logistics', date: '2025-10-15', due: '2025-11-14', amount: 2874.97, status: 'Paid' },
    { number: 'INV-2025-0009', customer: 'Mountain View Consulting', date: '2025-11-10', due: '2025-12-10', amount: 5400.00, status: 'Sent' },
    { number: 'INV-2025-0010', customer: 'TechStart Inc', date: '2025-11-20', due: '2025-12-20', amount: 3599.94, status: 'Sent' },
    { number: 'INV-2025-0011', customer: 'Metro Healthcare', date: '2025-12-15', due: '2026-01-14', amount: 7199.92, status: 'Sent' },
    { number: 'INV-2026-0001', customer: 'Coastal Retail Group', date: '2026-01-10', due: '2026-02-09', amount: 4949.95, status: 'Draft' },
  ];

  for (const inv of invoices) {
    const customerId = custMap[inv.customer];
    if (!customerId) {
      console.log('Customer not found:', inv.customer);
      continue;
    }

    const amountPaid = inv.status === 'Paid' ? inv.amount : 0;

    const request = pool.request();
    request.input('number', sql.NVarChar, inv.number);
    request.input('customerId', sql.UniqueIdentifier, customerId);
    request.input('issueDate', sql.Date, inv.date);
    request.input('dueDate', sql.Date, inv.due);
    request.input('totalAmount', sql.Decimal(19, 4), inv.amount);
    request.input('amountPaid', sql.Decimal(19, 4), amountPaid);
    request.input('status', sql.NVarChar, inv.status);

    await request.query(`
      INSERT INTO Invoices (InvoiceNumber, CustomerId, IssueDate, DueDate, TotalAmount, AmountPaid, Status)
      VALUES (@number, @customerId, @issueDate, @dueDate, @totalAmount, @amountPaid, @status)
    `);
    console.log('Created:', inv.number);
  }

  // Verify
  const count = await pool.query("SELECT COUNT(*) as cnt FROM Invoices WHERE InvoiceNumber LIKE 'INV-2025%' OR InvoiceNumber LIKE 'INV-2026%'");
  console.log('Total seed invoices:', count.recordset[0].cnt);

  pool.close();
}

seedInvoices().catch(e => { console.error(e.message); process.exit(1); });
