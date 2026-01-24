const sql = require('mssql');

// Parse command line arguments
const args = process.argv.slice(2);
const shouldClean = args.includes('--clean');
const isVerbose = args.includes('--verbose');

const config = {
    server: process.env.SQL_SERVER || 'localhost',
    port: parseInt(process.env.SQL_PORT || '14330'),
    database: process.env.SQL_DATABASE || 'AccountingDB',
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_SA_PASSWORD || 'StrongPassword123!',
    options: { trustServerCertificate: true }
};

// Reference IDs from existing data (will be populated dynamically)
let accounts = {};
let customers = [];
let vendors = [];
let products = [];

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }).toUpperCase();
}

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(d) {
    return d.toISOString().split('T')[0];
}

function randomAmount(min, max) {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

async function loadExistingData(pool) {
    console.log('Loading existing reference data...');

    // Load accounts
    const accountResult = await pool.query`SELECT Id, Code, Name, Type FROM Accounts`;
    for (const acc of accountResult.recordset) {
        const key = acc.Code;
        accounts[key] = acc.Id;
    }
    console.log(`  Loaded ${Object.keys(accounts).length} accounts`);

    // Load customers
    const customerResult = await pool.query`SELECT Id, Name FROM Customers`;
    customers = customerResult.recordset.map(c => c.Id);
    console.log(`  Loaded ${customers.length} customers`);

    // Load vendors
    const vendorResult = await pool.query`SELECT Id, Name FROM Vendors`;
    vendors = vendorResult.recordset.map(v => v.Id);
    console.log(`  Loaded ${vendors.length} vendors`);

    // Load products/services
    const productResult = await pool.query`SELECT Id, Name, SalesPrice, IncomeAccountId FROM ProductsServices WHERE Status = 'Active'`;
    products = productResult.recordset;
    console.log(`  Loaded ${products.length} products/services`);
}

async function cleanData(pool) {
    console.log('\nCleaning existing demo data...');

    // Delete in order to respect foreign keys (most dependent first)
    const tables = [
        'BankTransactions',
        'JournalEntryLines',
        'JournalEntries',
        'InvoiceLines',
        'Invoices',
        'BillLines',
        'Bills',
        'PayStubs',
        'PayRuns',
        'TimeEntries',
        'EstimateLines',
        'Estimates'
    ];

    for (const table of tables) {
        try {
            const result = await pool.query(`DELETE FROM ${table}`);
            console.log(`  Cleared ${table}: ${result.rowsAffected[0]} rows deleted`);
        } catch (err) {
            // Table may not exist or have dependencies
            if (isVerbose) console.log(`  Skipped ${table}: ${err.message}`);
        }
    }
    console.log('Clean complete.\n');
}

async function seedJournalEntries(pool) {
    console.log('Creating Journal Entries (6 months of transactions)...');

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const journalEntries = [];
    const journalLines = [];

    // Get account IDs
    const checkingId = accounts['1000'];  // Checking Account
    const arId = accounts['1100'];        // Accounts Receivable
    const apId = accounts['2000'];        // Accounts Payable
    const salesRevenueId = accounts['4000'];    // Sales Revenue
    const serviceRevenueId = accounts['4100'];  // Service Revenue
    const consultingRevenueId = accounts['4200']; // Consulting Revenue
    const cogsId = accounts['5000'];      // COGS
    const rentId = accounts['6500'];      // Rent
    const utilitiesId = accounts['6900']; // Utilities
    const softwareId = accounts['6600'];  // Software
    const officeSuppliesId = accounts['6300']; // Office Supplies
    const professionalId = accounts['6400'];   // Professional Services
    const payrollId = accounts['7000'];   // Payroll Expense

    if (!checkingId || !salesRevenueId) {
        console.error('  ERROR: Required accounts not found. Run the post-deployment script first.');
        return;
    }

    // Generate entries for each month
    for (let monthOffset = 5; monthOffset >= 0; monthOffset--) {
        const monthDate = new Date(now);
        monthDate.setMonth(monthDate.getMonth() - monthOffset);
        const monthName = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

        // Revenue entries for the month (5-8 per month)
        const revenueCount = Math.floor(Math.random() * 4) + 5;
        for (let i = 0; i < revenueCount; i++) {
            const entryId = uuid();
            const amount = randomAmount(1000, 15000);
            const entryDate = randomDate(
                new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
                new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
            );

            const revenueAccounts = [salesRevenueId, serviceRevenueId, consultingRevenueId].filter(Boolean);
            const revenueAccount = revenueAccounts[Math.floor(Math.random() * revenueAccounts.length)];

            journalEntries.push({
                id: entryId,
                date: formatDate(entryDate),
                description: `Revenue - ${monthName} Invoice Payment #${i + 1}`,
                reference: `REV-${formatDate(entryDate).replace(/-/g, '')}-${i + 1}`,
                status: 'Posted'
            });

            // Debit Checking (or AR), Credit Revenue
            journalLines.push({
                id: uuid(),
                journalEntryId: entryId,
                accountId: checkingId,
                description: 'Payment received',
                debit: amount,
                credit: 0
            });
            journalLines.push({
                id: uuid(),
                journalEntryId: entryId,
                accountId: revenueAccount,
                description: 'Revenue recognition',
                debit: 0,
                credit: amount
            });
        }

        // Expense entries for the month (4-7 per month)
        const expenseCount = Math.floor(Math.random() * 4) + 4;
        const expenseAccounts = [
            { id: rentId, name: 'Monthly Rent', min: 2500, max: 5000 },
            { id: utilitiesId, name: 'Utilities', min: 200, max: 800 },
            { id: softwareId, name: 'Software Subscription', min: 100, max: 500 },
            { id: officeSuppliesId, name: 'Office Supplies', min: 50, max: 300 },
            { id: professionalId, name: 'Professional Services', min: 500, max: 3000 },
            { id: payrollId, name: 'Payroll', min: 8000, max: 25000 },
            { id: cogsId, name: 'Cost of Goods Sold', min: 500, max: 5000 }
        ].filter(e => e.id);

        for (let i = 0; i < expenseCount; i++) {
            const entryId = uuid();
            const expenseType = expenseAccounts[i % expenseAccounts.length];
            const amount = randomAmount(expenseType.min, expenseType.max);
            const entryDate = randomDate(
                new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
                new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
            );

            journalEntries.push({
                id: entryId,
                date: formatDate(entryDate),
                description: `${expenseType.name} - ${monthName}`,
                reference: `EXP-${formatDate(entryDate).replace(/-/g, '')}-${i + 1}`,
                status: 'Posted'
            });

            // Debit Expense, Credit Checking (or AP)
            journalLines.push({
                id: uuid(),
                journalEntryId: entryId,
                accountId: expenseType.id,
                description: expenseType.name,
                debit: amount,
                credit: 0
            });
            journalLines.push({
                id: uuid(),
                journalEntryId: entryId,
                accountId: checkingId,
                description: 'Payment made',
                debit: 0,
                credit: amount
            });
        }
    }

    // Initial cash balance entry (6 months ago)
    const initialCashId = uuid();
    const initialCash = 50000;
    journalEntries.unshift({
        id: initialCashId,
        date: formatDate(sixMonthsAgo),
        description: 'Opening Balance - Cash on Hand',
        reference: 'OPEN-BALANCE',
        status: 'Posted'
    });

    const ownersEquityId = accounts['3000'];
    if (ownersEquityId) {
        journalLines.unshift({
            id: uuid(),
            journalEntryId: initialCashId,
            accountId: checkingId,
            description: 'Opening cash balance',
            debit: initialCash,
            credit: 0
        });
        journalLines.unshift({
            id: uuid(),
            journalEntryId: initialCashId,
            accountId: ownersEquityId,
            description: 'Owner investment',
            debit: 0,
            credit: initialCash
        });
    }

    // Insert journal entries
    const createdBy = 'seed-script@system';
    const nowStr = new Date().toISOString();

    for (const entry of journalEntries) {
        await pool.query`
            INSERT INTO JournalEntries (Id, TransactionDate, Description, Reference, Status, CreatedAt, CreatedBy, PostedAt, PostedBy)
            VALUES (${entry.id}, ${entry.date}, ${entry.description}, ${entry.reference}, ${entry.status}, ${nowStr}, ${createdBy}, ${nowStr}, ${createdBy})
        `;
    }

    for (const line of journalLines) {
        await pool.query`
            INSERT INTO JournalEntryLines (Id, JournalEntryId, AccountId, Description, Debit, Credit, CreatedAt)
            VALUES (${line.id}, ${line.journalEntryId}, ${line.accountId}, ${line.description}, ${line.debit}, ${line.credit}, ${nowStr})
        `;
    }

    console.log(`  Created ${journalEntries.length} journal entries with ${journalLines.length} lines`);
}

async function seedBankTransactions(pool) {
    console.log('Creating Bank Transactions...');

    const checkingId = accounts['1000'];
    const utilitiesId = accounts['6900'];
    const softwareId = accounts['6600'];
    const officeSuppliesId = accounts['6300'];

    if (!checkingId) {
        console.error('  ERROR: Checking account not found');
        return;
    }

    const transactions = [];
    const now = new Date();

    // Create mix of pending, approved, and posted transactions
    const txDescriptions = [
        { desc: 'Amazon Web Services', merchant: 'AWS', category: 'Software', amount: -299.99, suggestedAccountId: softwareId },
        { desc: 'Office Depot Purchase', merchant: 'Office Depot', category: 'Supplies', amount: -156.78, suggestedAccountId: officeSuppliesId },
        { desc: 'Electric Company', merchant: 'City Power', category: 'Utilities', amount: -245.00, suggestedAccountId: utilitiesId },
        { desc: 'Microsoft 365 Subscription', merchant: 'Microsoft', category: 'Software', amount: -22.99, suggestedAccountId: softwareId },
        { desc: 'Staples Office Supplies', merchant: 'Staples', category: 'Supplies', amount: -89.45, suggestedAccountId: officeSuppliesId },
        { desc: 'Water Bill', merchant: 'City Water', category: 'Utilities', amount: -67.50, suggestedAccountId: utilitiesId },
        { desc: 'Zoom Pro Subscription', merchant: 'Zoom', category: 'Software', amount: -14.99, suggestedAccountId: softwareId },
        { desc: 'Internet Service', merchant: 'Comcast Business', category: 'Utilities', amount: -189.00, suggestedAccountId: utilitiesId },
        { desc: 'Adobe Creative Cloud', merchant: 'Adobe', category: 'Software', amount: -54.99, suggestedAccountId: softwareId },
        { desc: 'Gas Bill', merchant: 'Gas Company', category: 'Utilities', amount: -112.30, suggestedAccountId: utilitiesId },
        { desc: 'Customer Payment - Acme Corp', merchant: 'Acme Corp', category: 'Income', amount: 5000.00, suggestedAccountId: null },
        { desc: 'Customer Payment - TechStart', merchant: 'TechStart', category: 'Income', amount: 3500.00, suggestedAccountId: null },
        { desc: 'Slack Subscription', merchant: 'Slack', category: 'Software', amount: -12.50, suggestedAccountId: softwareId },
        { desc: 'Phone Bill', merchant: 'AT&T Business', category: 'Utilities', amount: -165.00, suggestedAccountId: utilitiesId },
        { desc: 'Customer Payment - Global Dynamics', merchant: 'Global Dynamics', category: 'Income', amount: 7500.00, suggestedAccountId: null }
    ];

    // Recent transactions in the last month
    for (let i = 0; i < txDescriptions.length; i++) {
        const tx = txDescriptions[i];
        const daysAgo = Math.floor(Math.random() * 30);
        const txDate = new Date(now);
        txDate.setDate(txDate.getDate() - daysAgo);

        // First 5 are pending (for dashboard pending count), rest are processed
        const status = i < 5 ? 'Pending' : (i < 10 ? 'Approved' : 'Posted');

        transactions.push({
            id: uuid(),
            sourceType: 'Bank',
            sourceName: 'Wells Fargo Checking',
            sourceAccountId: checkingId,
            transactionDate: formatDate(txDate),
            postDate: formatDate(txDate),
            amount: tx.amount,
            description: tx.desc,
            merchant: tx.merchant,
            originalCategory: tx.category,
            transactionType: tx.amount < 0 ? 'Debit' : 'Credit',
            status: status,
            suggestedAccountId: tx.suggestedAccountId,
            suggestedCategory: tx.category,
            confidenceScore: 0.85
        });
    }

    const nowStr = new Date().toISOString();

    for (const tx of transactions) {
        await pool.query`
            INSERT INTO BankTransactions (
                Id, SourceType, SourceName, SourceAccountId, TransactionDate, PostDate,
                Amount, Description, Merchant, OriginalCategory, TransactionType,
                Status, SuggestedAccountId, SuggestedCategory, ConfidenceScore, CreatedDate
            )
            VALUES (
                ${tx.id}, ${tx.sourceType}, ${tx.sourceName}, ${tx.sourceAccountId},
                ${tx.transactionDate}, ${tx.postDate}, ${tx.amount}, ${tx.description},
                ${tx.merchant}, ${tx.originalCategory}, ${tx.transactionType}, ${tx.status},
                ${tx.suggestedAccountId}, ${tx.suggestedCategory}, ${tx.confidenceScore}, ${nowStr}
            )
        `;
    }

    const pendingCount = transactions.filter(t => t.Status === 'Pending').length;
    console.log(`  Created ${transactions.length} bank transactions (${pendingCount} pending)`);
}

async function seedInvoices(pool) {
    console.log('Creating Invoices...');

    if (customers.length === 0) {
        console.log('  Skipping - no customers found');
        return;
    }

    const invoices = [];
    const invoiceLines = [];
    const now = new Date();
    const nowStr = now.toISOString();

    // Create invoices spread over 6 months
    for (let i = 0; i < 25; i++) {
        const invId = uuid();
        const custId = customers[i % customers.length];
        const monthsAgo = Math.floor(i / 5);
        const invDate = new Date(now);
        invDate.setMonth(invDate.getMonth() - monthsAgo);
        invDate.setDate(Math.floor(Math.random() * 28) + 1);

        const dueDate = new Date(invDate);
        dueDate.setDate(dueDate.getDate() + 30);

        const invNum = `INV-${String(1001 + i).padStart(4, '0')}`;

        // Status distribution: mostly Paid for older, mix for recent
        let status;
        if (monthsAgo >= 3) {
            status = 'Paid';
        } else if (monthsAgo >= 1) {
            status = Math.random() > 0.3 ? 'Paid' : 'Sent';
        } else {
            const rand = Math.random();
            if (rand < 0.3) status = 'Draft';
            else if (rand < 0.6) status = 'Sent';
            else if (rand < 0.8) status = 'Paid';
            else status = 'Overdue';
        }

        // Create 1-4 line items
        const lineCount = Math.floor(Math.random() * 4) + 1;
        let total = 0;

        for (let j = 0; j < lineCount; j++) {
            const qty = Math.floor(Math.random() * 10) + 1;
            const unitPrice = randomAmount(100, 500);
            const lineAmount = qty * unitPrice;
            total += lineAmount;

            const productNames = [
                'Consulting Services',
                'Development Work',
                'Technical Support',
                'Training Session',
                'Software License',
                'Cloud Hosting',
                'Project Management',
                'Design Services'
            ];

            invoiceLines.push({
                id: uuid(),
                invoiceId: invId,
                description: productNames[Math.floor(Math.random() * productNames.length)],
                quantity: qty,
                unitPrice: unitPrice
            });
        }

        invoices.push({
            id: invId,
            invoiceNumber: invNum,
            customerId: custId,
            issueDate: formatDate(invDate),
            dueDate: formatDate(dueDate),
            status: status,
            totalAmount: Math.round(total * 100) / 100
        });
    }

    for (const inv of invoices) {
        await pool.query`
            INSERT INTO Invoices (Id, InvoiceNumber, CustomerId, IssueDate, DueDate, Status, TotalAmount, CreatedAt)
            VALUES (${inv.id}, ${inv.invoiceNumber}, ${inv.customerId}, ${inv.issueDate}, ${inv.dueDate}, ${inv.status}, ${inv.totalAmount}, ${nowStr})
        `;
    }

    for (const line of invoiceLines) {
        await pool.query`
            INSERT INTO InvoiceLines (Id, InvoiceId, Description, Quantity, UnitPrice, CreatedAt)
            VALUES (${line.id}, ${line.invoiceId}, ${line.description}, ${line.quantity}, ${line.unitPrice}, ${nowStr})
        `;
    }

    const statusCounts = invoices.reduce((acc, inv) => {
        acc[inv.status] = (acc[inv.status] || 0) + 1;
        return acc;
    }, {});

    console.log(`  Created ${invoices.length} invoices with ${invoiceLines.length} line items`);
    console.log(`    Status breakdown: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
}

async function seedBills(pool) {
    console.log('Creating Bills...');

    if (vendors.length === 0) {
        console.log('  Skipping - no vendors found');
        return;
    }

    const bills = [];
    const billLines = [];
    const now = new Date();
    const nowStr = now.toISOString();

    const expenseAccountCodes = ['6300', '6400', '6500', '6600', '6700', '6800', '6900', '5000'];
    const billDescriptions = [
        'Office Supplies',
        'Professional Services',
        'Monthly Rent',
        'Software Subscription',
        'Phone & Internet',
        'Travel Expense',
        'Utilities',
        'Inventory Purchase'
    ];

    // Create bills spread over 6 months
    for (let i = 0; i < 20; i++) {
        const billId = uuid();
        const vendorId = vendors[i % vendors.length];
        const monthsAgo = Math.floor(i / 4);
        const billDate = new Date(now);
        billDate.setMonth(billDate.getMonth() - monthsAgo);
        billDate.setDate(Math.floor(Math.random() * 28) + 1);

        const dueDate = new Date(billDate);
        dueDate.setDate(dueDate.getDate() + 30);

        const billNum = `BILL-${String(2001 + i).padStart(4, '0')}`;

        // Status distribution
        let status, amountPaid;
        if (monthsAgo >= 3) {
            status = 'Paid';
            amountPaid = 1; // Will be set to total
        } else if (monthsAgo >= 1) {
            status = Math.random() > 0.3 ? 'Paid' : 'Open';
            amountPaid = status === 'Paid' ? 1 : 0;
        } else {
            const rand = Math.random();
            if (rand < 0.2) { status = 'Draft'; amountPaid = 0; }
            else if (rand < 0.5) { status = 'Open'; amountPaid = 0; }
            else if (rand < 0.7) { status = 'Partial'; amountPaid = 0.5; }
            else if (rand < 0.9) { status = 'Paid'; amountPaid = 1; }
            else { status = 'Overdue'; amountPaid = 0; }
        }

        const idx = i % expenseAccountCodes.length;
        const expenseAccountId = accounts[expenseAccountCodes[idx]];
        const amount = randomAmount(200, 3000);

        if (expenseAccountId) {
            billLines.push({
                id: uuid(),
                billId: billId,
                accountId: expenseAccountId,
                description: billDescriptions[idx],
                amount: amount
            });
        }

        bills.push({
            id: billId,
            billNumber: billNum,
            vendorId: vendorId,
            billDate: formatDate(billDate),
            dueDate: formatDate(dueDate),
            status: status,
            totalAmount: amount,
            amountPaid: Math.round(amount * amountPaid * 100) / 100
        });
    }

    for (const bill of bills) {
        await pool.query`
            INSERT INTO Bills (Id, BillNumber, VendorId, BillDate, DueDate, Status, TotalAmount, AmountPaid, CreatedAt)
            VALUES (${bill.id}, ${bill.billNumber}, ${bill.vendorId}, ${bill.billDate}, ${bill.dueDate}, ${bill.status}, ${bill.totalAmount}, ${bill.amountPaid}, ${nowStr})
        `;
    }

    for (const line of billLines) {
        await pool.query`
            INSERT INTO BillLines (Id, BillId, AccountId, Description, Amount, CreatedAt)
            VALUES (${line.id}, ${line.billId}, ${line.accountId}, ${line.description}, ${line.amount}, ${nowStr})
        `;
    }

    console.log(`  Created ${bills.length} bills with ${billLines.length} line items`);
}

async function seedEstimates(pool) {
    console.log('Creating Estimates...');

    if (customers.length === 0) {
        console.log('  Skipping - no customers found');
        return;
    }

    const estimates = [];
    const estimateLines = [];
    const now = new Date();
    const nowStr = now.toISOString();

    for (let i = 0; i < 8; i++) {
        const estId = uuid();
        const custId = customers[i % customers.length];
        const estDate = new Date(now);
        estDate.setDate(estDate.getDate() - Math.floor(Math.random() * 60));

        const expDate = new Date(estDate);
        expDate.setDate(expDate.getDate() + 30);

        const estNum = `EST-${String(3001 + i).padStart(4, '0')}`;
        const statuses = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'];
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        const lineCount = Math.floor(Math.random() * 3) + 1;
        let total = 0;

        for (let j = 0; j < lineCount; j++) {
            const qty = Math.floor(Math.random() * 20) + 1;
            const unitPrice = randomAmount(100, 1000);
            const lineAmount = qty * unitPrice;
            total += lineAmount;

            estimateLines.push({
                id: uuid(),
                estimateId: estId,
                description: `Project Work Item ${j + 1}`,
                quantity: qty,
                unitPrice: unitPrice
            });
        }

        estimates.push({
            id: estId,
            estimateNumber: estNum,
            customerId: custId,
            issueDate: formatDate(estDate),
            expirationDate: formatDate(expDate),
            status: status,
            totalAmount: Math.round(total * 100) / 100
        });
    }

    for (const est of estimates) {
        await pool.query`
            INSERT INTO Estimates (Id, EstimateNumber, CustomerId, IssueDate, ExpirationDate, Status, TotalAmount, CreatedAt)
            VALUES (${est.id}, ${est.estimateNumber}, ${est.customerId}, ${est.issueDate}, ${est.expirationDate}, ${est.status}, ${est.totalAmount}, ${nowStr})
        `;
    }

    for (const line of estimateLines) {
        await pool.query`
            INSERT INTO EstimateLines (Id, EstimateId, Description, Quantity, UnitPrice, CreatedAt)
            VALUES (${line.id}, ${line.estimateId}, ${line.description}, ${line.quantity}, ${line.unitPrice}, ${nowStr})
        `;
    }

    console.log(`  Created ${estimates.length} estimates with ${estimateLines.length} line items`);
}

async function seed() {
    console.log('========================================');
    console.log('Demo Data Seed Script');
    console.log('========================================');
    console.log(`Server:   ${config.server}:${config.port}`);
    console.log(`Database: ${config.database}`);
    console.log(`Options:  ${shouldClean ? '--clean ' : ''}${isVerbose ? '--verbose' : ''}`);
    console.log('');

    let pool;
    try {
        pool = await sql.connect(config);
        console.log('Connected to database.\n');

        // Load existing reference data (accounts, customers, vendors)
        await loadExistingData(pool);

        // Optionally clean existing data
        if (shouldClean) {
            await cleanData(pool);
        }

        console.log('\nSeeding demo data...\n');

        // Seed in order (respecting dependencies)
        await seedJournalEntries(pool);
        await seedBankTransactions(pool);
        await seedInvoices(pool);
        await seedBills(pool);
        await seedEstimates(pool);

        console.log('\n========================================');
        console.log('Seed complete!');
        console.log('');
        console.log('Dashboard should now show:');
        console.log('  - Total Revenue (from journal entries)');
        console.log('  - Total Expenses (from journal entries)');
        console.log('  - Net Income (revenue - expenses)');
        console.log('  - Cash on Hand (bank account balance)');
        console.log('  - 6 months of cash flow chart data');
        console.log('  - Pending bank transactions count');
        console.log('  - Recent activity (journal entries)');
        console.log('========================================');

        process.exit(0);
    } catch (err) {
        console.error('\nError:', err.message);
        if (isVerbose) console.error(err);
        process.exit(1);
    } finally {
        if (pool) await pool.close();
    }
}

// Show help if requested
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Demo Data Seed Script for Modern Accounting

Usage:
  node seed-data.cjs [options]

Options:
  --clean     Delete existing demo data before seeding
  --verbose   Show detailed output and error messages
  --help, -h  Show this help message

Environment Variables:
  SQL_SERVER        Server hostname (default: localhost)
  SQL_PORT          Server port (default: 14330)
  SQL_DATABASE      Database name (default: AccountingDB)
  SQL_USER          Username (default: sa)
  SQL_SA_PASSWORD   Password (default: StrongPassword123!)

Examples:
  node seed-data.cjs                    # Add demo data
  node seed-data.cjs --clean            # Clear and reseed
  node seed-data.cjs --clean --verbose  # Clear, reseed, show details
`);
    process.exit(0);
}

seed();
