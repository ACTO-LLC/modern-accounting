const sql = require('mssql');

async function insertRules() {
  const pool = await sql.connect('Server=localhost,14330;Database=AccountingDB;User Id=sa;Password=StrongPassword123!;TrustServerCertificate=true');

  // Check existing count
  const existing = await pool.query('SELECT COUNT(*) as cnt FROM BankRules');
  if (existing.recordset[0].cnt > 0) {
    console.log('Bank rules already exist: ' + existing.recordset[0].cnt);
    pool.close();
    return;
  }

  // Get account IDs
  const accounts = await pool.query(`
    SELECT Id, Code, Name FROM Accounts WHERE Code IN ('6030', '6010', '6020', '6040', '6050', '6000', '6060', '6070', '6080', '6090')
  `);
  const acctMap = {};
  accounts.recordset.forEach(a => acctMap[a.Code] = a.Id);

  // Get vendor IDs
  const vendors = await pool.query(`SELECT Id, Name FROM Vendors`);
  const vendorMap = {};
  vendors.recordset.forEach(v => vendorMap[v.Name] = v.Id);

  const rules = [
    // Software
    { name: 'Amazon AWS Charges', matchField: 'Description', matchType: 'Contains', matchValue: 'AWS', acctCode: '6030', vendor: 'Amazon Web Services', memo: 'AWS cloud services', priority: 100 },
    { name: 'Microsoft 365/Azure', matchField: 'Description', matchType: 'Contains', matchValue: 'MICROSOFT', acctCode: '6030', vendor: 'Microsoft', memo: 'Microsoft services', priority: 100 },
    { name: 'Google Workspace', matchField: 'Description', matchType: 'Contains', matchValue: 'GOOGLE*', acctCode: '6030', vendor: null, memo: 'Google Workspace', priority: 100 },
    { name: 'Slack Subscription', matchField: 'Description', matchType: 'Contains', matchValue: 'SLACK', acctCode: '6030', vendor: null, memo: 'Slack subscription', priority: 90 },
    { name: 'Zoom Subscription', matchField: 'Description', matchType: 'Contains', matchValue: 'ZOOM', acctCode: '6030', vendor: null, memo: 'Zoom video conferencing', priority: 90 },
    { name: 'Adobe Creative Cloud', matchField: 'Description', matchType: 'Contains', matchValue: 'ADOBE', acctCode: '6030', vendor: null, memo: 'Adobe subscription', priority: 90 },

    // Utilities
    { name: 'Verizon Phone/Internet', matchField: 'Description', matchType: 'Contains', matchValue: 'VERIZON', acctCode: '6010', vendor: 'Verizon Business', memo: 'Phone and internet', priority: 80 },
    { name: 'AT&T Services', matchField: 'Description', matchType: 'Contains', matchValue: 'AT&T', acctCode: '6010', vendor: null, memo: 'Telecom services', priority: 80 },
    { name: 'Electric Company', matchField: 'Description', matchType: 'Contains', matchValue: 'ELECTRIC', acctCode: '6010', vendor: null, memo: 'Electricity', priority: 70 },

    // Office Supplies
    { name: 'Office Depot Purchases', matchField: 'Description', matchType: 'Contains', matchValue: 'OFFICE DEPOT', acctCode: '6020', vendor: 'Office Depot', memo: 'Office supplies', priority: 75 },
    { name: 'Staples Purchases', matchField: 'Description', matchType: 'Contains', matchValue: 'STAPLES', acctCode: '6020', vendor: 'Staples', memo: 'Office supplies', priority: 75 },
    { name: 'Amazon Business', matchField: 'Description', matchType: 'Contains', matchValue: 'AMZN MKTP', acctCode: '6020', vendor: null, memo: 'Amazon purchase', priority: 60 },

    // Insurance
    { name: 'State Farm Insurance', matchField: 'Description', matchType: 'Contains', matchValue: 'STATE FARM', acctCode: '6040', vendor: 'State Farm Insurance', memo: 'Business insurance', priority: 85 },

    // Professional Services
    { name: 'Accounting Fees', matchField: 'Description', matchType: 'Contains', matchValue: 'CPA', acctCode: '6050', vendor: 'Smith & Associates CPA', memo: 'Accounting services', priority: 70 },
    { name: 'Legal Services', matchField: 'Description', matchType: 'Contains', matchValue: 'LAW OFFICE', acctCode: '6050', vendor: null, memo: 'Legal services', priority: 70 },

    // Rent
    { name: 'Monthly Rent', matchField: 'Description', matchType: 'Contains', matchValue: 'DOWNTOWN PROP', acctCode: '6000', vendor: 'Downtown Properties LLC', memo: 'Office rent', priority: 95 },

    // Meals
    { name: 'DoorDash Orders', matchField: 'Description', matchType: 'Contains', matchValue: 'DOORDASH', acctCode: '6060', vendor: null, memo: 'Business meals', priority: 65 },
    { name: 'UberEats Orders', matchField: 'Description', matchType: 'Contains', matchValue: 'UBER EATS', acctCode: '6060', vendor: null, memo: 'Business meals', priority: 65 },

    // Travel
    { name: 'Uber Rides', matchField: 'Description', matchType: 'StartsWith', matchValue: 'UBER', acctCode: '6070', vendor: null, memo: 'Rideshare', priority: 65 },
    { name: 'Lyft Rides', matchField: 'Description', matchType: 'Contains', matchValue: 'LYFT', acctCode: '6070', vendor: null, memo: 'Rideshare', priority: 65 },
    { name: 'Airlines', matchField: 'Description', matchType: 'Contains', matchValue: 'AIRLINES', acctCode: '6070', vendor: null, memo: 'Air travel', priority: 60 },
    { name: 'Hotels', matchField: 'Description', matchType: 'Contains', matchValue: 'HOTEL', acctCode: '6070', vendor: null, memo: 'Lodging', priority: 55 },

    // Advertising
    { name: 'Google Ads', matchField: 'Description', matchType: 'Contains', matchValue: 'GOOGLE ADS', acctCode: '6080', vendor: null, memo: 'Google advertising', priority: 85 },
    { name: 'Facebook Ads', matchField: 'Description', matchType: 'Contains', matchValue: 'FACEBK', acctCode: '6080', vendor: null, memo: 'Social media ads', priority: 85 },

    // Bank Fees
    { name: 'Bank Service Charges', matchField: 'Description', matchType: 'Contains', matchValue: 'SERVICE CHARGE', acctCode: '6090', vendor: null, memo: 'Bank fees', priority: 30 },
    { name: 'ATM Fees', matchField: 'Description', matchType: 'Contains', matchValue: 'ATM FEE', acctCode: '6090', vendor: null, memo: 'ATM fee', priority: 30 },
  ];

  for (const r of rules) {
    const acctId = acctMap[r.acctCode];
    const vendorId = r.vendor ? vendorMap[r.vendor] : null;

    const request = pool.request();
    request.input('name', sql.NVarChar, r.name);
    request.input('matchField', sql.NVarChar, r.matchField);
    request.input('matchType', sql.NVarChar, r.matchType);
    request.input('matchValue', sql.NVarChar, r.matchValue);
    request.input('acctId', sql.UniqueIdentifier, acctId);
    request.input('vendorId', sql.UniqueIdentifier, vendorId);
    request.input('memo', sql.NVarChar, r.memo);
    request.input('priority', sql.Int, r.priority);

    await request.query(`
      INSERT INTO BankRules (Name, MatchField, MatchType, MatchValue, AssignAccountId, AssignVendorId, AssignMemo, Priority, TransactionType, IsEnabled)
      VALUES (@name, @matchField, @matchType, @matchValue, @acctId, @vendorId, @memo, @priority, 'Debit', 1)
    `);
  }

  const count = await pool.query('SELECT COUNT(*) as cnt FROM BankRules');
  console.log('Bank rules created: ' + count.recordset[0].cnt);
  pool.close();
}

insertRules().catch(e => { console.error(e.message); process.exit(1); });
