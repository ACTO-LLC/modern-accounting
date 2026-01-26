/**
 * Seed 1099-NEC Data
 *
 * Creates contractors (1099 vendors), bills, and bill payments for 2024 and 2025
 * to test the Form 1099-NEC generation functionality.
 *
 * Usage: node scripts/seed-1099.js
 */

const sql = require('mssql');

const config = {
  server: 'localhost',
  port: 14330,
  database: 'AccountingDB',
  user: 'sa',
  password: process.env.DB_PASSWORD || 'StrongPassword123!',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// Contractor data - independent contractors who receive 1099-NEC forms
const contractors = [
  {
    name: 'Smith Consulting LLC',
    email: 'john@smithconsulting.com',
    phone: '555-0101',
    address: '123 Business Park Dr, Suite 100, Austin, TX 78701',
    taxId: '12-3456789',
    paymentTerms: 'Net 15',
  },
  {
    name: 'Johnson Web Design',
    email: 'sarah@johnsonweb.com',
    phone: '555-0102',
    address: '456 Tech Lane, Seattle, WA 98101',
    taxId: '23-4567890',
    paymentTerms: 'Net 30',
  },
  {
    name: 'Creative Marketing Solutions',
    email: 'mike@creativemktg.com',
    phone: '555-0103',
    address: '789 Madison Ave, New York, NY 10065',
    taxId: '34-5678901',
    paymentTerms: 'Net 15',
  },
  {
    name: 'DataTech Analytics',
    email: 'analytics@datatech.io',
    phone: '555-0104',
    address: '321 Data Drive, San Francisco, CA 94102',
    taxId: '45-6789012',
    paymentTerms: 'Due on Receipt',
  },
  {
    name: 'Green IT Services',
    email: 'support@greenit.com',
    phone: '555-0105',
    address: '555 Eco Way, Portland, OR 97201',
    taxId: '56-7890123',
    paymentTerms: 'Net 30',
  },
  {
    name: 'Martinez Legal Consulting',
    email: 'rosa@martinezlegal.com',
    phone: '555-0106',
    address: '888 Legal Plaza, Miami, FL 33101',
    taxId: '67-8901234',
    paymentTerms: 'Net 15',
  },
  {
    name: 'Thompson Security Consulting',
    email: 'james@thompsonsec.com',
    phone: '555-0107',
    address: '999 Secure Blvd, Denver, CO 80201',
    taxId: '78-9012345',
    paymentTerms: 'Net 30',
  },
  {
    name: 'Lee Photography',
    email: 'amy@leephotos.com',
    phone: '555-0108',
    address: '111 Studio Lane, Los Angeles, CA 90001',
    taxId: '89-0123456',
    paymentTerms: 'Due on Receipt',
  },
];

// Service descriptions for generating realistic bills
const services = [
  'Consulting Services',
  'Web Development',
  'Marketing Campaign',
  'Data Analysis',
  'IT Support',
  'Legal Review',
  'Security Audit',
  'Photography Session',
  'Strategy Workshop',
  'Technical Training',
  'Content Creation',
  'System Integration',
];

// Generate a random date within a month
function randomDateInMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.floor(Math.random() * daysInMonth) + 1;
  return new Date(year, month, day);
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Generate bill number
function generateBillNumber(vendorIndex, year, billIndex) {
  return `BILL-${year}-${String(vendorIndex + 1).padStart(2, '0')}-${String(billIndex + 1).padStart(3, '0')}`;
}

// Generate payment number
function generatePaymentNumber(year, paymentIndex) {
  return `PAY-${year}-${String(paymentIndex + 1).padStart(4, '0')}`;
}

async function seed() {
  let pool;

  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('Connected successfully.\n');

    // Get existing checking account for payments
    const accountResult = await pool.request().query(`
      SELECT TOP 1 Id FROM Accounts WHERE Type = 'Asset' AND Subtype = 'Bank' AND Name LIKE '%Checking%'
    `);
    let checkingAccountId = accountResult.recordset[0]?.Id;

    if (!checkingAccountId) {
      // Try to find any bank account
      const bankResult = await pool.request().query(`
        SELECT TOP 1 Id FROM Accounts WHERE Type = 'Asset' AND (Subtype = 'Bank' OR Name LIKE '%Checking%' OR Name LIKE '%Bank%')
      `);
      checkingAccountId = bankResult.recordset[0]?.Id;

      if (!checkingAccountId) {
        // Create a checking account if none exists
        const createAccountResult = await pool.request().query(`
          INSERT INTO Accounts (Code, Name, Type, Subtype)
          OUTPUT INSERTED.Id
          VALUES ('1000', 'Business Checking', 'Asset', 'Bank')
        `);
        checkingAccountId = createAccountResult.recordset[0].Id;
        console.log('Created Business Checking account');
      }
    }

    // Track created vendors
    const vendorIds = [];

    // Create or update contractors
    console.log('Creating contractors (1099 vendors)...');
    for (const contractor of contractors) {
      // Check if vendor already exists
      const existingVendor = await pool.request()
        .input('name', sql.NVarChar, contractor.name)
        .query('SELECT Id FROM Vendors WHERE Name = @name');

      let vendorId;
      if (existingVendor.recordset.length > 0) {
        // Update existing vendor to be 1099 vendor
        vendorId = existingVendor.recordset[0].Id;
        await pool.request()
          .input('id', sql.UniqueIdentifier, vendorId)
          .input('email', sql.NVarChar, contractor.email)
          .input('phone', sql.NVarChar, contractor.phone)
          .input('address', sql.NVarChar, contractor.address)
          .input('taxId', sql.NVarChar, contractor.taxId)
          .input('paymentTerms', sql.NVarChar, contractor.paymentTerms)
          .query(`
            UPDATE Vendors
            SET Email = @email, Phone = @phone, Address = @address,
                TaxId = @taxId, PaymentTerms = @paymentTerms,
                Is1099Vendor = 1, Status = 'Active', UpdatedAt = SYSDATETIME()
            WHERE Id = @id
          `);
        console.log(`  Updated: ${contractor.name}`);
      } else {
        // Create new vendor
        const result = await pool.request()
          .input('name', sql.NVarChar, contractor.name)
          .input('email', sql.NVarChar, contractor.email)
          .input('phone', sql.NVarChar, contractor.phone)
          .input('address', sql.NVarChar, contractor.address)
          .input('taxId', sql.NVarChar, contractor.taxId)
          .input('paymentTerms', sql.NVarChar, contractor.paymentTerms)
          .query(`
            INSERT INTO Vendors (Name, Email, Phone, Address, TaxId, PaymentTerms, Is1099Vendor, Status)
            OUTPUT INSERTED.Id
            VALUES (@name, @email, @phone, @address, @taxId, @paymentTerms, 1, 'Active')
          `);
        vendorId = result.recordset[0].Id;
        console.log(`  Created: ${contractor.name}`);
      }
      vendorIds.push(vendorId);
    }

    // Generate bills and payments for 2024 and 2025
    const years = [2024, 2025];
    let totalBills = 0;
    let totalPayments = 0;

    for (const year of years) {
      console.log(`\nGenerating bills and payments for ${year}...`);
      let paymentIndex = 0;

      for (let vendorIndex = 0; vendorIndex < vendorIds.length; vendorIndex++) {
        const vendorId = vendorIds[vendorIndex];
        const contractor = contractors[vendorIndex];

        // Each contractor gets 3-8 bills per year (ensuring most exceed $600 threshold)
        const numBills = Math.floor(Math.random() * 6) + 3;
        const billIds = [];

        for (let billIndex = 0; billIndex < numBills; billIndex++) {
          // Random month for the bill
          const month = Math.floor(Math.random() * 12);
          const billDate = randomDateInMonth(year, month);
          const dueDate = new Date(billDate);
          dueDate.setDate(dueDate.getDate() + 30);

          // Bill amounts - vary to create realistic 1099 totals
          // Higher amounts to ensure $600+ threshold is met
          const baseAmount = Math.floor(Math.random() * 3000) + 500;
          const amount = Math.round(baseAmount * 100) / 100;

          const billNumber = generateBillNumber(vendorIndex, year, billIndex);
          const service = services[Math.floor(Math.random() * services.length)];

          const billResult = await pool.request()
            .input('vendorId', sql.UniqueIdentifier, vendorId)
            .input('billNumber', sql.NVarChar, billNumber)
            .input('billDate', sql.Date, billDate)
            .input('dueDate', sql.Date, dueDate)
            .input('totalAmount', sql.Decimal(19, 4), amount)
            .input('memo', sql.NVarChar, `${service} - ${contractor.name}`)
            .query(`
              INSERT INTO Bills (VendorId, BillNumber, BillDate, DueDate, TotalAmount, AmountPaid, Status, Memo)
              OUTPUT INSERTED.Id
              VALUES (@vendorId, @billNumber, @billDate, @dueDate, @totalAmount, @totalAmount, 'Paid', @memo)
            `);

          billIds.push({ id: billResult.recordset[0].Id, amount, date: billDate });
          totalBills++;
        }

        // Create payments for the bills (sometimes multiple bills in one payment)
        let i = 0;
        while (i < billIds.length) {
          // Randomly combine 1-3 bills into a single payment
          const numBillsInPayment = Math.min(Math.floor(Math.random() * 3) + 1, billIds.length - i);
          const billsInPayment = billIds.slice(i, i + numBillsInPayment);

          // Payment date is shortly after the latest bill in the batch
          const latestBillDate = billsInPayment.reduce((max, b) => b.date > max ? b.date : max, billsInPayment[0].date);
          const paymentDate = new Date(latestBillDate);
          paymentDate.setDate(paymentDate.getDate() + Math.floor(Math.random() * 14) + 1);

          // Ensure payment date is in the same year
          if (paymentDate.getFullYear() > year) {
            paymentDate.setFullYear(year);
            paymentDate.setMonth(11);
            paymentDate.setDate(28);
          }

          const totalAmount = billsInPayment.reduce((sum, b) => sum + b.amount, 0);
          const paymentNumber = generatePaymentNumber(year, paymentIndex++);

          const paymentResult = await pool.request()
            .input('paymentNumber', sql.NVarChar, paymentNumber)
            .input('vendorId', sql.UniqueIdentifier, vendorId)
            .input('paymentDate', sql.Date, paymentDate)
            .input('totalAmount', sql.Decimal(19, 4), totalAmount)
            .input('paymentMethod', sql.NVarChar, Math.random() > 0.5 ? 'Check' : 'ACH')
            .input('paymentAccountId', sql.UniqueIdentifier, checkingAccountId)
            .input('memo', sql.NVarChar, `Payment for ${billsInPayment.length} bill(s)`)
            .query(`
              INSERT INTO BillPayments (PaymentNumber, VendorId, PaymentDate, TotalAmount, PaymentMethod, PaymentAccountId, Memo, Status)
              OUTPUT INSERTED.Id
              VALUES (@paymentNumber, @vendorId, @paymentDate, @totalAmount, @paymentMethod, @paymentAccountId, @memo, 'Completed')
            `);

          const paymentId = paymentResult.recordset[0].Id;

          // Create BillPaymentApplications to link payment to bills
          for (const bill of billsInPayment) {
            await pool.request()
              .input('billPaymentId', sql.UniqueIdentifier, paymentId)
              .input('billId', sql.UniqueIdentifier, bill.id)
              .input('amountApplied', sql.Decimal(19, 4), bill.amount)
              .query(`
                INSERT INTO BillPaymentApplications (BillPaymentId, BillId, AmountApplied)
                VALUES (@billPaymentId, @billId, @amountApplied)
              `);
          }

          totalPayments++;
          i += numBillsInPayment;
        }
      }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Contractors (1099 vendors): ${contractors.length}`);
    console.log(`Bills created: ${totalBills}`);
    console.log(`Payments created: ${totalPayments}`);

    // Show payment totals per vendor per year
    console.log('\n--- Payment Totals by Vendor and Year ---');
    const summaryResult = await pool.request().query(`
      SELECT
        v.Name,
        YEAR(bp.PaymentDate) as TaxYear,
        SUM(bp.TotalAmount) as TotalPayments,
        CASE WHEN SUM(bp.TotalAmount) >= 600 THEN 'Yes' ELSE 'No' END as Requires1099
      FROM BillPayments bp
      JOIN Vendors v ON bp.VendorId = v.Id
      WHERE v.Is1099Vendor = 1
        AND YEAR(bp.PaymentDate) IN (2024, 2025)
      GROUP BY v.Name, YEAR(bp.PaymentDate)
      ORDER BY v.Name, TaxYear
    `);

    for (const row of summaryResult.recordset) {
      console.log(`  ${row.Name} (${row.TaxYear}): $${row.TotalPayments.toFixed(2)} - 1099 Required: ${row.Requires1099}`);
    }

    console.log('\nSeed data created successfully!');

  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

seed();
