const sql = require('mssql');

const config = {
    server: 'localhost',
    port: 14330,
    database: 'AccountingDB',
    user: 'sa',
    password: 'StrongPassword123!',
    options: { trustServerCertificate: true }
};

// Reference IDs from existing data
const accounts = {
    checking: 'E1015339-4B5C-4CB8-990C-733AF15C04E6',
    savings: '267411B5-6BC9-4F5B-828E-BBA63DBD035A',
    ar: '7F6E97A2-3555-4C4C-839B-F56E880C4D6F',
    ap: '729E360A-DD02-465B-9026-0E7DB8925252',
    salesRevenue: '854883F8-7F57-432C-B85A-6E93A5B19E39',
    serviceRevenue: '4AC6355D-E3C0-4BFE-8588-168C9D43AE5B',
    consultingRevenue: '38A423D5-F050-4A32-BC43-96D51FD4D554',
    cogs: 'E98BAB52-21B0-4528-ACF4-DB2536F2E13A',
    payrollExpense: '7001C298-D0D2-4563-85AE-AC84ADA3F33B',
    rent: 'AD16F2AB-127E-4614-89EF-B7FF9FB16B6F',
    utilities: '82D45B30-60BD-4C02-8FE3-C447FA7FBC04',
    software: '40D0C898-C35F-4847-B9CD-492AFEB58FF3',
    officeSupplies: '07DFE56C-1913-49DF-92C5-1F2F8F32E589',
    professional: 'E97F56CA-C10E-40E7-936E-50881EDE52D4',
    subcontractor: '092D8F9B-1527-4F3B-8CE3-B092B0B6B274',
    inventory: 'CDA5B559-46F6-407E-9456-DB82BCA1A58A'
};

const customers = [
    '5E660FF8-CDE1-42A3-917B-05862133D6D6',
    '2F2A83CD-77A3-4000-AEFC-120D46E54DB1',
    '8DD45AFF-97E6-4508-9BFD-281C19D95909',
    '45B28EE7-56D8-4685-A17B-7374FDDCDD90',
    '1F42D5EF-3034-4752-BDEB-A07A55D41723',
    '974882A2-DE74-4D08-984A-AE3BEDBE07FD',
    '8C341CC4-EA3B-4AFA-A94A-EA7545053942',
    '83133C08-C910-4660-8A29-F11BCF8532F4'
];

const vendors = [
    '5FA05A9E-4604-4EF9-9711-19624ED8E56A',
    'BCDF837F-6277-44B8-AB3E-2EC780510CC0',
    '1BB6259F-A534-498D-8768-CBD863A6CC8B',
    '40A621B0-024D-4BF9-B2FA-9FFFB472804C',
    '25D54EE4-40B8-4F8D-82CF-94219C091CC8',
    '18AF7AF0-0637-4658-A79F-7620F9A4968E',
    '52CD67DB-222F-4C08-B427-FD0DBF632BA0',
    '50190707-B087-4DA5-B94D-E71A54089927'
];

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

async function seed() {
    const pool = await sql.connect(config);
    const now = new Date().toISOString();

    console.log('Seeding database...\n');

    // 1. Products & Services (columns: Id, Name, SKU, Type, Description, SalesPrice, IncomeAccountId, Status, CreatedAt)
    console.log('Creating Products & Services...');
    const products = [
        { id: uuid(), name: 'Web Development Services', sku: 'SVC-WEB', type: 'Service', price: 150, incomeAccountId: accounts.serviceRevenue },
        { id: uuid(), name: 'Consulting - Hourly', sku: 'SVC-CONS', type: 'Service', price: 200, incomeAccountId: accounts.consultingRevenue },
        { id: uuid(), name: 'Software License', sku: 'SVC-LIC', type: 'Service', price: 500, incomeAccountId: accounts.salesRevenue },
        { id: uuid(), name: 'Technical Support', sku: 'SVC-SUP', type: 'Service', price: 100, incomeAccountId: accounts.serviceRevenue },
        { id: uuid(), name: 'Training Session', sku: 'SVC-TRN', type: 'Service', price: 750, incomeAccountId: accounts.serviceRevenue },
        { id: uuid(), name: 'Hardware - Server', sku: 'HW-SRV', type: 'Inventory', price: 2500, incomeAccountId: accounts.salesRevenue },
        { id: uuid(), name: 'Hardware - Workstation', sku: 'HW-WRK', type: 'Inventory', price: 1200, incomeAccountId: accounts.salesRevenue },
        { id: uuid(), name: 'Cloud Hosting - Monthly', sku: 'SVC-HOST', type: 'Service', price: 299, incomeAccountId: accounts.serviceRevenue }
    ];

    for (const p of products) {
        await pool.query`
            INSERT INTO ProductsServices (Id, Name, SKU, Type, Description, SalesPrice, IncomeAccountId, Status, CreatedAt)
            VALUES (${p.id}, ${p.name}, ${p.sku}, ${p.type}, ${p.name + ' - professional grade'}, ${p.price}, ${p.incomeAccountId}, 'Active', ${now})
        `;
    }
    console.log(`  Created ${products.length} products/services`);

    // 2. Invoices (columns: Id, InvoiceNumber, CustomerId, IssueDate, DueDate, TotalAmount, Status, CreatedAt)
    console.log('Creating Invoices...');
    const invoices = [];
    const invoiceLines = [];

    for (let i = 0; i < 15; i++) {
        const invId = uuid();
        const custId = customers[i % customers.length];
        const invDate = randomDate(new Date('2024-10-01'), new Date('2025-01-15'));
        const dueDate = new Date(invDate);
        dueDate.setDate(dueDate.getDate() + 30);
        const invNum = `INV-${String(1001 + i).padStart(4, '0')}`;
        const status = i < 10 ? 'Sent' : (i < 13 ? 'Paid' : 'Draft');

        const lineCount = Math.floor(Math.random() * 3) + 1;
        let total = 0;

        for (let j = 0; j < lineCount; j++) {
            const prod = products[Math.floor(Math.random() * products.length)];
            const qty = Math.floor(Math.random() * 5) + 1;
            const amount = prod.price * qty;
            total += amount;

            invoiceLines.push({
                id: uuid(),
                invoiceId: invId,
                description: prod.name,
                quantity: qty,
                unitPrice: prod.price,
                amount: amount
            });
        }

        invoices.push({
            id: invId,
            invoiceNumber: invNum,
            customerId: custId,
            issueDate: formatDate(invDate),
            dueDate: formatDate(dueDate),
            status: status,
            totalAmount: total
        });
    }

    for (const inv of invoices) {
        await pool.query`
            INSERT INTO Invoices (Id, InvoiceNumber, CustomerId, IssueDate, DueDate, Status, TotalAmount, CreatedAt)
            VALUES (${inv.id}, ${inv.invoiceNumber}, ${inv.customerId}, ${inv.issueDate}, ${inv.dueDate}, ${inv.status}, ${inv.totalAmount}, ${now})
        `;
    }

    for (const line of invoiceLines) {
        await pool.query`
            INSERT INTO InvoiceLines (Id, InvoiceId, Description, Quantity, UnitPrice, CreatedAt)
            VALUES (${line.id}, ${line.invoiceId}, ${line.description}, ${line.quantity}, ${line.unitPrice}, ${now})
        `;
    }
    console.log(`  Created ${invoices.length} invoices with ${invoiceLines.length} line items`);

    // 3. Bills (columns: Id, VendorId, BillNumber, BillDate, DueDate, TotalAmount, AmountPaid, Status, CreatedAt)
    console.log('Creating Bills...');
    const bills = [];
    const billLines = [];
    const expenseAccounts = [accounts.rent, accounts.utilities, accounts.software, accounts.officeSupplies, accounts.professional, accounts.subcontractor];
    const billDescriptions = ['Monthly rent', 'Electricity', 'Software subscription', 'Office supplies', 'Legal services', 'Contract work'];

    for (let i = 0; i < 12; i++) {
        const billId = uuid();
        const vendorId = vendors[i % vendors.length];
        const billDate = randomDate(new Date('2024-10-01'), new Date('2025-01-15'));
        const dueDate = new Date(billDate);
        dueDate.setDate(dueDate.getDate() + 30);
        const billNum = `BILL-${String(2001 + i).padStart(4, '0')}`;
        const status = i < 8 ? 'Received' : (i < 10 ? 'Paid' : 'Draft');

        const expIdx = i % expenseAccounts.length;
        const amount = Math.floor(Math.random() * 2000) + 200;

        billLines.push({
            id: uuid(),
            billId: billId,
            description: billDescriptions[expIdx],
            amount: amount,
            accountId: expenseAccounts[expIdx]
        });

        bills.push({
            id: billId,
            billNumber: billNum,
            vendorId: vendorId,
            billDate: formatDate(billDate),
            dueDate: formatDate(dueDate),
            status: status,
            totalAmount: amount
        });
    }

    for (const bill of bills) {
        await pool.query`
            INSERT INTO Bills (Id, BillNumber, VendorId, BillDate, DueDate, Status, TotalAmount, AmountPaid, CreatedAt)
            VALUES (${bill.id}, ${bill.billNumber}, ${bill.vendorId}, ${bill.billDate}, ${bill.dueDate}, ${bill.status}, ${bill.totalAmount}, 0, ${now})
        `;
    }

    for (const line of billLines) {
        await pool.query`
            INSERT INTO BillLines (Id, BillId, AccountId, Description, Amount, CreatedAt)
            VALUES (${line.id}, ${line.billId}, ${line.accountId}, ${line.description}, ${line.amount}, ${now})
        `;
    }
    console.log(`  Created ${bills.length} bills with ${billLines.length} line items`);

    // 4. Employees (columns: Id, EmployeeNumber, FirstName, LastName, Email, PayType, PayRate, PayFrequency, Status, HireDate, CreatedAt)
    console.log('Creating Employees...');
    const employees = [
        { id: uuid(), empNum: 'EMP001', firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@company.com', payType: 'Salary', payRate: 95000 },
        { id: uuid(), empNum: 'EMP002', firstName: 'Michael', lastName: 'Chen', email: 'michael.chen@company.com', payType: 'Salary', payRate: 85000 },
        { id: uuid(), empNum: 'EMP003', firstName: 'Emily', lastName: 'Williams', email: 'emily.williams@company.com', payType: 'Salary', payRate: 75000 },
        { id: uuid(), empNum: 'EMP004', firstName: 'James', lastName: 'Brown', email: 'james.brown@company.com', payType: 'Hourly', payRate: 45 },
        { id: uuid(), empNum: 'EMP005', firstName: 'Jessica', lastName: 'Davis', email: 'jessica.davis@company.com', payType: 'Salary', payRate: 65000 },
        { id: uuid(), empNum: 'EMP006', firstName: 'Robert', lastName: 'Miller', email: 'robert.miller@company.com', payType: 'Hourly', payRate: 35 }
    ];

    for (const emp of employees) {
        await pool.query`
            INSERT INTO Employees (Id, EmployeeNumber, FirstName, LastName, Email, PayType, PayRate, PayFrequency, Status, HireDate, CreatedAt)
            VALUES (${emp.id}, ${emp.empNum}, ${emp.firstName}, ${emp.lastName}, ${emp.email}, ${emp.payType}, ${emp.payRate}, 'Biweekly', 'Active', '2024-01-15', ${now})
        `;
    }
    console.log(`  Created ${employees.length} employees`);

    // 5. PayRuns & PayStubs
    console.log('Creating PayRuns and PayStubs...');
    const payRuns = [];
    const payStubs = [];
    let payRunNum = 1;

    for (let month = 10; month <= 12; month++) {
        const payRunId = uuid();
        const payDate = new Date(2024, month - 1, 15);
        const periodStart = new Date(2024, month - 1, 1);
        const periodEnd = new Date(2024, month - 1, 14);

        let totalGross = 0;
        let totalDeductions = 0;
        let totalNet = 0;

        for (const emp of employees) {
            const gross = emp.payType === 'Salary' ? emp.payRate / 24 : (emp.payRate * 80);
            const fedTax = gross * 0.12;
            const stateTax = gross * 0.05;
            const ss = gross * 0.062;
            const medicare = gross * 0.0145;
            const deductions = fedTax + stateTax + ss + medicare;
            const net = gross - deductions;

            totalGross += gross;
            totalDeductions += deductions;
            totalNet += net;

            payStubs.push({
                id: uuid(),
                payRunId: payRunId,
                employeeId: emp.id,
                regularHours: emp.payType === 'Hourly' ? 80 : 0,
                regularPay: gross,
                grossPay: gross,
                federalWithholding: fedTax,
                stateWithholding: stateTax,
                socialSecurity: ss,
                medicare: medicare,
                totalDeductions: deductions,
                netPay: net
            });
        }

        payRuns.push({
            id: payRunId,
            payRunNumber: `PR-2024-${String(payRunNum++).padStart(3, '0')}`,
            payDate: formatDate(payDate),
            periodStart: formatDate(periodStart),
            periodEnd: formatDate(periodEnd),
            status: 'Completed',
            totalGross: totalGross,
            totalDeductions: totalDeductions,
            totalNet: totalNet,
            employeeCount: employees.length
        });
    }

    for (const pr of payRuns) {
        await pool.query`
            INSERT INTO PayRuns (Id, PayRunNumber, PayPeriodStart, PayPeriodEnd, PayDate, Status, TotalGrossPay, TotalDeductions, TotalNetPay, EmployeeCount, CreatedAt)
            VALUES (${pr.id}, ${pr.payRunNumber}, ${pr.periodStart}, ${pr.periodEnd}, ${pr.payDate}, ${pr.status}, ${pr.totalGross}, ${pr.totalDeductions}, ${pr.totalNet}, ${pr.employeeCount}, ${now})
        `;
    }

    for (const ps of payStubs) {
        await pool.query`
            INSERT INTO PayStubs (Id, PayRunId, EmployeeId, RegularHours, RegularPay, GrossPay, FederalWithholding, StateWithholding, SocialSecurity, Medicare, TotalDeductions, NetPay, Status, CreatedAt)
            VALUES (${ps.id}, ${ps.payRunId}, ${ps.employeeId}, ${ps.regularHours}, ${ps.regularPay}, ${ps.grossPay}, ${ps.federalWithholding}, ${ps.stateWithholding}, ${ps.socialSecurity}, ${ps.medicare}, ${ps.totalDeductions}, ${ps.netPay}, 'Processed', ${now})
        `;
    }
    console.log(`  Created ${payRuns.length} pay runs with ${payStubs.length} pay stubs`);

    // 6. Projects (columns: Id, Name, CustomerId, Status, BudgetedAmount, BudgetedHours, StartDate, CreatedAt)
    console.log('Creating Projects...');
    const projects = [
        { id: uuid(), name: 'Website Redesign', customerId: customers[0], status: 'Active', budget: 25000, hours: 150 },
        { id: uuid(), name: 'Mobile App Development', customerId: customers[1], status: 'Active', budget: 75000, hours: 500 },
        { id: uuid(), name: 'System Integration', customerId: customers[2], status: 'Completed', budget: 45000, hours: 300 },
        { id: uuid(), name: 'Cloud Migration', customerId: customers[3], status: 'Active', budget: 35000, hours: 200 },
        { id: uuid(), name: 'Security Audit', customerId: customers[4], status: 'Completed', budget: 15000, hours: 80 }
    ];

    for (const proj of projects) {
        await pool.query`
            INSERT INTO Projects (Id, Name, CustomerId, Status, BudgetedAmount, BudgetedHours, StartDate, CreatedAt)
            VALUES (${proj.id}, ${proj.name}, ${proj.customerId}, ${proj.status}, ${proj.budget}, ${proj.hours}, '2024-09-01', ${now})
        `;
    }
    console.log(`  Created ${projects.length} projects`);

    // 7. Time Entries (columns: Id, ProjectId, CustomerId, EmployeeName, EntryDate, Hours, HourlyRate, Description, IsBillable, Status, CreatedAt)
    console.log('Creating Time Entries...');
    const timeEntries = [];
    const empNames = ['Sarah Johnson', 'Michael Chen', 'Emily Williams', 'James Brown', 'Jessica Davis', 'Robert Miller'];

    for (const proj of projects) {
        for (let i = 0; i < 8; i++) {
            const empIdx = Math.floor(Math.random() * empNames.length);
            const entryDate = randomDate(new Date('2024-10-01'), new Date('2025-01-10'));
            const hours = Math.floor(Math.random() * 6) + 2;

            timeEntries.push({
                id: uuid(),
                projectId: proj.id,
                customerId: proj.customerId,
                employeeName: empNames[empIdx],
                date: formatDate(entryDate),
                hours: hours,
                hourlyRate: 150,
                description: 'Development work on ' + proj.name,
                isBillable: true
            });
        }
    }

    for (const te of timeEntries) {
        await pool.query`
            INSERT INTO TimeEntries (Id, ProjectId, CustomerId, EmployeeName, EntryDate, Hours, HourlyRate, Description, IsBillable, Status, CreatedAt)
            VALUES (${te.id}, ${te.projectId}, ${te.customerId}, ${te.employeeName}, ${te.date}, ${te.hours}, ${te.hourlyRate}, ${te.description}, ${te.isBillable ? 1 : 0}, 'Approved', ${now})
        `;
    }
    console.log(`  Created ${timeEntries.length} time entries`);

    // 8. Estimates (columns: Id, EstimateNumber, CustomerId, IssueDate, ExpirationDate, TotalAmount, Status, CreatedAt)
    console.log('Creating Estimates...');
    const estimates = [];
    const estimateLines = [];

    for (let i = 0; i < 5; i++) {
        const estId = uuid();
        const custId = customers[i % customers.length];
        const estDate = randomDate(new Date('2024-11-01'), new Date('2025-01-10'));
        const expDate = new Date(estDate);
        expDate.setDate(expDate.getDate() + 30);
        const estNum = `EST-${String(3001 + i).padStart(4, '0')}`;
        const status = i < 2 ? 'Accepted' : (i < 4 ? 'Sent' : 'Draft');

        let total = 0;
        const lineCount = Math.floor(Math.random() * 3) + 1;

        for (let j = 0; j < lineCount; j++) {
            const prod = products[Math.floor(Math.random() * products.length)];
            const qty = Math.floor(Math.random() * 10) + 1;
            const amount = prod.price * qty;
            total += amount;

            estimateLines.push({
                id: uuid(),
                estimateId: estId,
                productId: prod.id,
                description: prod.name,
                quantity: qty,
                unitPrice: prod.price,
                amount: amount
            });
        }

        estimates.push({
            id: estId,
            estimateNumber: estNum,
            customerId: custId,
            issueDate: formatDate(estDate),
            expirationDate: formatDate(expDate),
            status: status,
            totalAmount: total
        });
    }

    for (const est of estimates) {
        await pool.query`
            INSERT INTO Estimates (Id, EstimateNumber, CustomerId, IssueDate, ExpirationDate, Status, TotalAmount, CreatedAt)
            VALUES (${est.id}, ${est.estimateNumber}, ${est.customerId}, ${est.issueDate}, ${est.expirationDate}, ${est.status}, ${est.totalAmount}, ${now})
        `;
    }

    for (const line of estimateLines) {
        await pool.query`
            INSERT INTO EstimateLines (Id, EstimateId, ProductServiceId, Description, Quantity, UnitPrice, CreatedAt)
            VALUES (${line.id}, ${line.estimateId}, ${line.productId}, ${line.description}, ${line.quantity}, ${line.unitPrice}, ${now})
        `;
    }
    console.log(`  Created ${estimates.length} estimates with ${estimateLines.length} line items`);

    // 9. Classes (columns: Id, Name, Description, Status, CreatedAt)
    console.log('Creating Classes...');
    const classes = [
        { id: uuid(), name: 'Engineering', description: 'Engineering department' },
        { id: uuid(), name: 'Sales', description: 'Sales department' },
        { id: uuid(), name: 'Marketing', description: 'Marketing department' },
        { id: uuid(), name: 'Operations', description: 'Operations department' }
    ];

    for (const cls of classes) {
        await pool.query`
            INSERT INTO Classes (Id, Name, Description, Status, CreatedAt)
            VALUES (${cls.id}, ${cls.name}, ${cls.description}, 'Active', ${now})
        `;
    }
    console.log(`  Created ${classes.length} classes`);

    // 10. Locations (columns: Id, Name, Address, Status, CreatedAt)
    console.log('Creating Locations...');
    const locations = [
        { id: uuid(), name: 'Headquarters', address: '100 Main Street, New York, NY 10001' },
        { id: uuid(), name: 'West Coast Office', address: '500 Market Street, San Francisco, CA 94102' },
        { id: uuid(), name: 'Remote', address: 'Various' }
    ];

    for (const loc of locations) {
        await pool.query`
            INSERT INTO Locations (Id, Name, Address, Status, CreatedAt)
            VALUES (${loc.id}, ${loc.name}, ${loc.address}, 'Active', ${now})
        `;
    }
    console.log(`  Created ${locations.length} locations`);

    console.log('\n✅ Seed complete!');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
