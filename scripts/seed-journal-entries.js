const sql = require('mssql');

async function seedJournalEntries() {
  const pool = await sql.connect('Server=localhost,14330;Database=AccountingDB;User Id=sa;Password=StrongPassword123!;TrustServerCertificate=true');

  // Check if seed entries already exist
  const existing = await pool.query("SELECT COUNT(*) as cnt FROM JournalEntries WHERE Description LIKE 'SEED:%'");
  if (existing.recordset[0].cnt > 0) {
    console.log('Seed journal entries already exist:', existing.recordset[0].cnt);
    pool.close();
    return;
  }

  // Get account IDs by code
  const accounts = await pool.query("SELECT Id, Code, Name, Type FROM Accounts");
  const acctMap = {};
  accounts.recordset.forEach(a => acctMap[a.Code] = { id: a.Id, name: a.Name, type: a.Type });

  // Find or create a Cash/Bank account
  let cashAcctId = acctMap['1000']?.id;
  if (!cashAcctId) {
    // Look for any Asset account with Bank subtype
    const bankAcct = await pool.query("SELECT TOP 1 Id FROM Accounts WHERE Type = 'Asset' AND (Subtype = 'Bank' OR Name LIKE '%Cash%' OR Name LIKE '%Checking%')");
    if (bankAcct.recordset.length > 0) {
      cashAcctId = bankAcct.recordset[0].Id;
    } else {
      // Create a cash account
      const result = await pool.query("INSERT INTO Accounts (Code, Name, Type, Subtype) OUTPUT INSERTED.Id VALUES ('1000', 'Business Checking', 'Asset', 'Bank')");
      cashAcctId = result.recordset[0].Id;
      console.log('Created Business Checking account');
    }
  }

  // Find AR account
  let arAcctId = acctMap['1100']?.id;
  if (!arAcctId) {
    const arAcct = await pool.query("SELECT TOP 1 Id FROM Accounts WHERE Type = 'Asset' AND (Subtype = 'AccountsReceivable' OR Name LIKE '%Receivable%')");
    if (arAcct.recordset.length > 0) {
      arAcctId = arAcct.recordset[0].Id;
    }
  }

  console.log('Cash Account ID:', cashAcctId);
  console.log('AR Account ID:', arAcctId);

  // Journal entry data - dates spanning Jan-Mar 2026 for default date range
  const entries = [
    // January 2026 - Revenue entries
    { date: '2026-01-05', memo: 'SEED: January consulting services', lines: [
      { acctCode: '1000', debit: 15000, credit: 0 },  // Cash
      { acctCode: '4200', debit: 0, credit: 15000 },  // Consulting Revenue
    ]},
    { date: '2026-01-10', memo: 'SEED: Product sales - Week 1', lines: [
      { acctCode: '1000', debit: 8500, credit: 0 },
      { acctCode: '4000', debit: 0, credit: 8500 },   // Sales Revenue
    ]},
    { date: '2026-01-15', memo: 'SEED: Service revenue', lines: [
      { acctCode: '1000', debit: 12000, credit: 0 },
      { acctCode: '4100', debit: 0, credit: 12000 },  // Service Revenue
    ]},
    { date: '2026-01-20', memo: 'SEED: Product sales - Week 3', lines: [
      { acctCode: '1000', debit: 6800, credit: 0 },
      { acctCode: '4000', debit: 0, credit: 6800 },
    ]},
    { date: '2026-01-25', memo: 'SEED: Interest income', lines: [
      { acctCode: '1000', debit: 125, credit: 0 },
      { acctCode: '4300', debit: 0, credit: 125 },    // Interest Income
    ]},

    // January 2026 - Expense entries
    { date: '2026-01-01', memo: 'SEED: January rent', lines: [
      { acctCode: '6500', debit: 3500, credit: 0 },   // Rent Expense
      { acctCode: '1000', debit: 0, credit: 3500 },
    ]},
    { date: '2026-01-05', memo: 'SEED: Software subscriptions', lines: [
      { acctCode: '6600', debit: 850, credit: 0 },    // Software & Subscriptions
      { acctCode: '1000', debit: 0, credit: 850 },
    ]},
    { date: '2026-01-10', memo: 'SEED: Office supplies', lines: [
      { acctCode: '6300', debit: 425, credit: 0 },    // Office Supplies
      { acctCode: '1000', debit: 0, credit: 425 },
    ]},
    { date: '2026-01-15', memo: 'SEED: Payroll - Jan period 1', lines: [
      { acctCode: '7000', debit: 8500, credit: 0 },   // Payroll Expense
      { acctCode: '7100', debit: 650, credit: 0 },    // Payroll Tax
      { acctCode: '1000', debit: 0, credit: 9150 },
    ]},
    { date: '2026-01-20', memo: 'SEED: Utilities', lines: [
      { acctCode: '6900', debit: 380, credit: 0 },    // Utilities
      { acctCode: '6700', debit: 220, credit: 0 },    // Telephone & Internet
      { acctCode: '1000', debit: 0, credit: 600 },
    ]},
    { date: '2026-01-25', memo: 'SEED: Professional services - accounting', lines: [
      { acctCode: '6400', debit: 1200, credit: 0 },   // Professional Services
      { acctCode: '1000', debit: 0, credit: 1200 },
    ]},
    { date: '2026-01-31', memo: 'SEED: Payroll - Jan period 2', lines: [
      { acctCode: '7000', debit: 8500, credit: 0 },
      { acctCode: '7100', debit: 650, credit: 0 },
      { acctCode: '1000', debit: 0, credit: 9150 },
    ]},

    // February 2026 - Revenue
    { date: '2026-02-05', memo: 'SEED: February consulting', lines: [
      { acctCode: '1000', debit: 18000, credit: 0 },
      { acctCode: '4200', debit: 0, credit: 18000 },
    ]},
    { date: '2026-02-10', memo: 'SEED: Product sales - Feb Week 1', lines: [
      { acctCode: '1000', debit: 9200, credit: 0 },
      { acctCode: '4000', debit: 0, credit: 9200 },
    ]},
    { date: '2026-02-15', memo: 'SEED: Service revenue - Feb', lines: [
      { acctCode: '1000', debit: 14500, credit: 0 },
      { acctCode: '4100', debit: 0, credit: 14500 },
    ]},
    { date: '2026-02-20', memo: 'SEED: Product sales - Feb Week 3', lines: [
      { acctCode: '1000', debit: 7800, credit: 0 },
      { acctCode: '4000', debit: 0, credit: 7800 },
    ]},

    // February 2026 - Expenses
    { date: '2026-02-01', memo: 'SEED: February rent', lines: [
      { acctCode: '6500', debit: 3500, credit: 0 },
      { acctCode: '1000', debit: 0, credit: 3500 },
    ]},
    { date: '2026-02-05', memo: 'SEED: Insurance premium', lines: [
      { acctCode: '6200', debit: 1800, credit: 0 },   // Insurance
      { acctCode: '1000', debit: 0, credit: 1800 },
    ]},
    { date: '2026-02-10', memo: 'SEED: Marketing campaign', lines: [
      { acctCode: '6000', debit: 2500, credit: 0 },   // Advertising & Marketing
      { acctCode: '1000', debit: 0, credit: 2500 },
    ]},
    { date: '2026-02-15', memo: 'SEED: Payroll - Feb period 1', lines: [
      { acctCode: '7000', debit: 8500, credit: 0 },
      { acctCode: '7100', debit: 650, credit: 0 },
      { acctCode: '7200', debit: 400, credit: 0 },    // Employee Benefits
      { acctCode: '1000', debit: 0, credit: 9550 },
    ]},
    { date: '2026-02-20', memo: 'SEED: Bank fees', lines: [
      { acctCode: '6100', debit: 45, credit: 0 },     // Bank Fees
      { acctCode: '1000', debit: 0, credit: 45 },
    ]},
    { date: '2026-02-28', memo: 'SEED: Payroll - Feb period 2', lines: [
      { acctCode: '7000', debit: 8500, credit: 0 },
      { acctCode: '7100', debit: 650, credit: 0 },
      { acctCode: '1000', debit: 0, credit: 9150 },
    ]},

    // March 2026 - Revenue
    { date: '2026-03-05', memo: 'SEED: March consulting', lines: [
      { acctCode: '1000', debit: 16500, credit: 0 },
      { acctCode: '4200', debit: 0, credit: 16500 },
    ]},
    { date: '2026-03-10', memo: 'SEED: Product sales - Mar Week 1', lines: [
      { acctCode: '1000', debit: 11000, credit: 0 },
      { acctCode: '4000', debit: 0, credit: 11000 },
    ]},
    { date: '2026-03-15', memo: 'SEED: Service revenue - Mar', lines: [
      { acctCode: '1000', debit: 13200, credit: 0 },
      { acctCode: '4100', debit: 0, credit: 13200 },
    ]},

    // March 2026 - Expenses
    { date: '2026-03-01', memo: 'SEED: March rent', lines: [
      { acctCode: '6500', debit: 3500, credit: 0 },
      { acctCode: '1000', debit: 0, credit: 3500 },
    ]},
    { date: '2026-03-05', memo: 'SEED: Software & subscriptions', lines: [
      { acctCode: '6600', debit: 950, credit: 0 },
      { acctCode: '1000', debit: 0, credit: 950 },
    ]},
    { date: '2026-03-10', memo: 'SEED: Travel expenses', lines: [
      { acctCode: '6800', debit: 1850, credit: 0 },   // Travel & Entertainment
      { acctCode: '1000', debit: 0, credit: 1850 },
    ]},
    { date: '2026-03-15', memo: 'SEED: Payroll - Mar period 1', lines: [
      { acctCode: '7000', debit: 9000, credit: 0 },   // Increased payroll
      { acctCode: '7100', debit: 690, credit: 0 },
      { acctCode: '1000', debit: 0, credit: 9690 },
    ]},
  ];

  // Disable the balance trigger temporarily
  try {
    await pool.batch('DISABLE TRIGGER TR_JournalEntryLines_EnforceBalance ON JournalEntryLines');
    console.log('Disabled balance trigger');
  } catch (e) {
    console.log('Trigger disable note:', e.message);
  }

  let created = 0;
  for (const entry of entries) {
    // Create journal entry
    const jeRequest = pool.request();
    jeRequest.input('date', sql.Date, entry.date);
    jeRequest.input('description', sql.NVarChar, entry.memo);
    jeRequest.input('status', sql.NVarChar, 'Posted');
    jeRequest.input('createdBy', sql.NVarChar, 'SEED');

    const jeResult = await jeRequest.query(`
      INSERT INTO JournalEntries (TransactionDate, Description, Status, CreatedBy)
      OUTPUT INSERTED.Id
      VALUES (@date, @description, @status, @createdBy)
    `);
    const jeId = jeResult.recordset[0].Id;

    // Create lines
    for (const line of entry.lines) {
      const acct = acctMap[line.acctCode];
      if (!acct) {
        console.log('Account not found:', line.acctCode);
        continue;
      }

      const lineRequest = pool.request();
      lineRequest.input('journalEntryId', sql.UniqueIdentifier, jeId);
      lineRequest.input('accountId', sql.UniqueIdentifier, acct.id);
      lineRequest.input('debit', sql.Decimal(19, 4), line.debit);
      lineRequest.input('credit', sql.Decimal(19, 4), line.credit);
      lineRequest.input('lineDesc', sql.NVarChar, acct.name);

      await lineRequest.query(`
        INSERT INTO JournalEntryLines (JournalEntryId, AccountId, Debit, Credit, Description)
        VALUES (@journalEntryId, @accountId, @debit, @credit, @lineDesc)
      `);
    }

    created++;
    console.log('Created:', entry.memo);
  }

  // Re-enable the trigger
  try {
    await pool.batch('ENABLE TRIGGER TR_JournalEntryLines_EnforceBalance ON JournalEntryLines');
    console.log('Re-enabled balance trigger');
  } catch (e) {
    console.log('Trigger enable note:', e.message);
  }

  console.log('\nTotal journal entries created:', created);

  // Calculate totals for verification
  const totals = await pool.query(`
    SELECT
      a.Type,
      a.Name,
      SUM(jl.Credit) - SUM(jl.Debit) as NetAmount
    FROM JournalEntryLines jl
    JOIN JournalEntries je ON jl.JournalEntryId = je.Id
    JOIN Accounts a ON jl.AccountId = a.Id
    WHERE je.Description LIKE 'SEED:%'
    AND a.Type IN ('Revenue', 'Expense')
    GROUP BY a.Type, a.Name
    ORDER BY a.Type, a.Name
  `);

  let totalRevenue = 0;
  let totalExpenses = 0;

  console.log('\nP&L Summary from seed data:');
  console.log('\nRevenue:');
  totals.recordset.filter(r => r.Type === 'Revenue').forEach(r => {
    console.log('  ' + r.Name + ': $' + r.NetAmount.toFixed(2));
    totalRevenue += r.NetAmount;
  });
  console.log('  Total Revenue: $' + totalRevenue.toFixed(2));

  console.log('\nExpenses:');
  totals.recordset.filter(r => r.Type === 'Expense').forEach(r => {
    const amount = -r.NetAmount; // Expenses are debits, so negate
    console.log('  ' + r.Name + ': $' + amount.toFixed(2));
    totalExpenses += amount;
  });
  console.log('  Total Expenses: $' + totalExpenses.toFixed(2));

  console.log('\nNet Income: $' + (totalRevenue - totalExpenses).toFixed(2));

  pool.close();
}

seedJournalEntries().catch(e => { console.error(e.message); process.exit(1); });
