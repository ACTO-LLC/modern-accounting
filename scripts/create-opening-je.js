const sql = require('mssql');

// Complete mapping: QBO ID -> MA Account ID
const accountMapping = {
  '114': 'F0A7D981-06B1-4B0E-AA77-086984D71690', // checking -> Personal Checking
  '112': 'F17CC510-4489-4EF3-8B45-043C538E66ED', // Initiate Business -> Business Checking
  '113': 'CF97EB0D-73CA-4869-85C9-6B76955F4E1C', // Wells Fargo Savings -> Personal Savings
  '119': '8E9FE90F-8AEA-467D-A9E0-6C82508A5CA5', // Credit Card 9278
  '115': '897A485B-F6F7-4311-863B-0CF8109452E1', // Spark Cash
  '116': 'D44AE157-95D9-45FB-A251-462E841517D4', // Venture
  '49': 'E92884EB-DE90-48AF-9018-1970483BA16D',  // Federal estimated taxes
  '120': 'FEDAD7DB-9EFE-4592-A201-886307D78735', // Opening Balance Adjustment
  '48': '1C4C2A4C-08B6-4DD5-86F6-69A1EE76C11C',  // Personal expenses
  '106': '671EB644-4B18-49CC-9C24-C76A8BC7D0B6', // Personal expenses:Federal taxes
  '107': '0075ADEF-17AC-4908-B2B3-07BEF6DD2947', // Personal expenses:State taxes
  '108': '90223C3B-A2EE-4134-A518-78ED8C0AA38B', // Personal healthcare:Insurance
  '51': 'BA00E9C5-C1AA-49B0-AA88-CF2336BF3D46',  // Personal income
  '25': 'CB23C0EE-F3A5-45DD-A6A3-497218527204',  // Retained Earnings
  '33': 'E617C9A3-CF27-414B-834E-783FCE3C311B',  // Income -> Service Revenue
  '4': 'A7BE87C4-40F3-4790-BFEE-B614A5C202C7',   // Advertising & Marketing
  '54': 'A7BE87C4-40F3-4790-BFEE-B614A5C202C7',  // Advertising:Advertising
  '37': 'E98AB714-E3FC-4F92-B7ED-404EDE128C3B',  // Contract labor (NEW)
  '81': '6CAB6380-A4A5-462C-A28C-2B9685108A5C',  // Memberships -> Software Subscriptions
  '77': 'E8960719-3014-4A4E-B93B-106417A05C0E',  // Other expenses -> Miscellaneous
  '69': '18A96F7A-DB39-4F03-8424-249EFEBF2ADA',  // Credit card interest -> Bank Fees
  '40': 'D51651BF-6787-482B-A8DA-73AF3B80B60B',  // Meals -> Meals & Entertainment
  '76': '18A96F7A-DB39-4F03-8424-249EFEBF2ADA',  // Merchant fees -> Bank Fees
  '71': '609F3DA3-4D20-416F-9915-114F1FFF3689',  // Office supplies
  '73': '6CAB6380-A4A5-462C-A28C-2B9685108A5C',  // Software & apps -> Software Subscriptions
  '16': 'F73D4E24-7C64-4E36-AA35-C6E03CFD205E',  // Repairs & Maintenance (NEW)
  '39': '609F3DA3-4D20-416F-9915-114F1FFF3689',  // Supplies -> Office Supplies
  '87': '90202C65-7022-4A5E-901B-7EC359B9F768',  // Business licenses -> Taxes & Licenses (NEW)
  '19': 'FB270FE2-E255-4FA5-A593-CAE7E5760EF6',  // Travel
  '2': 'E8960719-3014-4A4E-B93B-106417A05C0E',   // Uncategorized -> Miscellaneous
  '20': '74DD8FF0-0266-4BBE-B49C-9BADF11AFFC6',  // Utilities
  '90': 'CFC5A694-5829-4E34-B725-BE8EE7843842',  // Phone service -> Telephone & Internet
  '101': '02538E87-8449-4FB3-83F3-D65BD3346EAF', // Homeowner insurance -> Insurance
  '104': 'F73D4E24-7C64-4E36-AA35-C6E03CFD205E', // Home office:Repairs -> Repairs & Maint
  '97': 'FB270FE2-E255-4FA5-A593-CAE7E5760EF6',  // Parking & tolls -> Travel
  '96': '2D1F1F82-338D-4E22-A1B1-080EF58C6611',  // Vehicle gas -> Auto Expense (NEW)
  '92': '02538E87-8449-4FB3-83F3-D65BD3346EAF',  // Vehicle insurance -> Insurance
  '100': '2D1F1F82-338D-4E22-A1B1-080EF58C6611'  // Vehicle wash -> Auto Expense
};

// Trial balance as of Jan 31, 2026
const trialBalance = [
  {qboId:'114', debit:4752.14, credit:0},
  {qboId:'112', debit:30540.9, credit:0},
  {qboId:'113', debit:30133.83, credit:0},
  {qboId:'119', debit:0, credit:1015.76},
  {qboId:'115', debit:0, credit:7147.61},
  {qboId:'116', debit:0, credit:4137.63},
  {qboId:'49', debit:9000, credit:0},
  {qboId:'120', debit:0, credit:45154.76},
  {qboId:'48', debit:22.67, credit:0},
  {qboId:'106', debit:4886, credit:0},
  {qboId:'107', debit:38, credit:0},
  {qboId:'108', debit:3560.32, credit:0},
  {qboId:'51', debit:0, credit:480.85},
  {qboId:'25', debit:0, credit:20326.58},
  {qboId:'33', debit:0, credit:25047.81},
  {qboId:'4', debit:161.5, credit:0},
  {qboId:'54', debit:562.53, credit:0},
  {qboId:'37', debit:5000, credit:0},
  {qboId:'81', debit:3844.15, credit:0},
  {qboId:'77', debit:176.27, credit:0},
  {qboId:'69', debit:108.32, credit:0},
  {qboId:'40', debit:139.39, credit:0},
  {qboId:'76', debit:3, credit:0},
  {qboId:'71', debit:131.72, credit:0},
  {qboId:'73', debit:167.27, credit:0},
  {qboId:'16', debit:1839.62, credit:0},
  {qboId:'39', debit:467.35, credit:0},
  {qboId:'87', debit:177, credit:0},
  {qboId:'19', debit:216.74, credit:0},
  {qboId:'2', debit:5979.41, credit:0},
  {qboId:'20', debit:423.71, credit:0},
  {qboId:'90', debit:366.73, credit:0},
  {qboId:'101', debit:171.52, credit:0},
  {qboId:'104', debit:77, credit:0},
  {qboId:'97', debit:1, credit:0},
  {qboId:'96', debit:39.47, credit:0},
  {qboId:'92', debit:313.45, credit:0},
  {qboId:'100', debit:9.99, credit:0}
];

(async () => {
  const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);

  // Create JE header
  const jeDate = '2026-01-31';
  const jeRef = 'QBO-OPENING-2026-01-31';
  const jeMemo = 'Opening Balance from QuickBooks Online as of Jan 31, 2026';

  // Check if JE already exists
  const existing = await pool.request()
    .input('ref', sql.VarChar, jeRef)
    .query('SELECT Id FROM JournalEntries WHERE Reference = @ref');

  if (existing.recordset.length > 0) {
    console.log('Opening Balance JE already exists with ID: ' + existing.recordset[0].Id);
    await pool.close();
    return;
  }

  // Create JE header
  const headerResult = await pool.request()
    .input('Date', sql.Date, jeDate)
    .input('Reference', sql.NVarChar, jeRef)
    .input('Description', sql.NVarChar, jeMemo)
    .input('Status', sql.NVarChar, 'Posted')
    .input('SourceSystem', sql.NVarChar, 'QBO')
    .input('CreatedBy', sql.NVarChar, 'QBO Migration')
    .query('INSERT INTO JournalEntries (TransactionDate, Reference, Description, Status, SourceSystem, CreatedBy) OUTPUT INSERTED.Id VALUES (@Date, @Reference, @Description, @Status, @SourceSystem, @CreatedBy)');

  const jeId = headerResult.recordset[0].Id;
  console.log('Created JE header: ' + jeId);

  // Consolidate by MA account (since multiple QBO accounts may map to same MA account)
  const consolidated = {};
  trialBalance.forEach(line => {
    const maId = accountMapping[line.qboId];
    if (!maId) {
      console.log('WARNING: No mapping for QBO ID ' + line.qboId);
      return;
    }
    if (!consolidated[maId]) {
      consolidated[maId] = { debit: 0, credit: 0 };
    }
    consolidated[maId].debit += line.debit;
    consolidated[maId].credit += line.credit;
  });

  // Create JE lines
  let lineNum = 1;
  let totalDebit = 0;
  let totalCredit = 0;

  for (const [accountId, amounts] of Object.entries(consolidated)) {
    const debit = Math.round(amounts.debit * 100) / 100;
    const credit = Math.round(amounts.credit * 100) / 100;

    if (debit === 0 && credit === 0) continue;

    await pool.request()
      .input('JournalEntryId', sql.UniqueIdentifier, jeId)
      .input('AccountId', sql.UniqueIdentifier, accountId)
      .input('Debit', sql.Decimal(18,2), debit)
      .input('Credit', sql.Decimal(18,2), credit)
      .input('Description', sql.NVarChar, 'Opening balance from QBO')
      .query('INSERT INTO JournalEntryLines (JournalEntryId, AccountId, Debit, Credit, Description) VALUES (@JournalEntryId, @AccountId, @Debit, @Credit, @Description)');

    totalDebit += debit;
    totalCredit += credit;
    lineNum++;
  }

  console.log('\nCreated ' + (lineNum - 1) + ' journal entry lines');
  console.log('Total Debits: $' + totalDebit.toFixed(2));
  console.log('Total Credits: $' + totalCredit.toFixed(2));
  console.log('Balanced: ' + (Math.abs(totalDebit - totalCredit) < 0.01 ? 'YES' : 'NO - Difference: $' + Math.abs(totalDebit - totalCredit).toFixed(2)));
  console.log('\nOpening Balance JE ID: ' + jeId);

  await pool.close();
})();
