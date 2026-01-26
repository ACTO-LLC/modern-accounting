const sql = require('mssql');

const config = {
    server: process.env.SQL_SERVER || 'localhost',
    port: parseInt(process.env.SQL_PORT || '14330'),
    database: process.env.SQL_DATABASE || 'AccountingDB',
    user: process.env.SQL_USER || 'sa',
    password: process.env.SQL_SA_PASSWORD || 'StrongPassword123!',
    options: { trustServerCertificate: true }
};

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }).toUpperCase();
}

function formatDate(d) {
    return d.toISOString().split('T')[0];
}

// Tax calculation helpers (simplified 2025 rates)
function calculateFederalWithholding(grossPay, filingStatus, allowances) {
    const annualized = grossPay * 26; // Biweekly
    let taxable = annualized - (allowances * 4300);
    if (taxable < 0) taxable = 0;

    // Simplified 2025 brackets for Single
    let annualTax = 0;
    if (filingStatus === 'Single') {
        if (taxable <= 11600) annualTax = taxable * 0.10;
        else if (taxable <= 47150) annualTax = 1160 + (taxable - 11600) * 0.12;
        else if (taxable <= 100525) annualTax = 5426 + (taxable - 47150) * 0.22;
        else annualTax = 17168 + (taxable - 100525) * 0.24;
    } else { // Married
        if (taxable <= 23200) annualTax = taxable * 0.10;
        else if (taxable <= 94300) annualTax = 2320 + (taxable - 23200) * 0.12;
        else if (taxable <= 201050) annualTax = 10852 + (taxable - 94300) * 0.22;
        else annualTax = 34337 + (taxable - 201050) * 0.24;
    }

    return Math.round((annualTax / 26) * 100) / 100;
}

function calculateStateWithholding(grossPay, stateCode) {
    // Simplified state tax rates
    const stateRates = {
        'CA': 0.0725,
        'NY': 0.0685,
        'TX': 0,      // No state income tax
        'FL': 0,      // No state income tax
        'WA': 0,      // No state income tax
        'IL': 0.0495,
        'PA': 0.0307,
        'OH': 0.04,
        'GA': 0.055,
        'NC': 0.0525
    };
    const rate = stateRates[stateCode] || 0.05;
    return Math.round(grossPay * rate * 100) / 100;
}

function calculateSocialSecurity(grossPay, ytdGross) {
    const ssLimit = 168600; // 2025 limit
    const ssRate = 0.062;

    if (ytdGross >= ssLimit) return 0;

    const taxableAmount = Math.min(grossPay, ssLimit - ytdGross);
    return Math.round(taxableAmount * ssRate * 100) / 100;
}

function calculateMedicare(grossPay) {
    return Math.round(grossPay * 0.0145 * 100) / 100;
}

async function seedEmployees(pool) {
    console.log('Creating Employees...');

    const employees = [
        { num: 'EMP001', first: 'John', last: 'Smith', payType: 'Salary', rate: 75000, status: 'Single', state: 'CA', allowances: 1 },
        { num: 'EMP002', first: 'Sarah', last: 'Johnson', payType: 'Salary', rate: 85000, status: 'Married', state: 'CA', allowances: 2 },
        { num: 'EMP003', first: 'Michael', last: 'Williams', payType: 'Hourly', rate: 35, status: 'Single', state: 'NY', allowances: 1 },
        { num: 'EMP004', first: 'Emily', last: 'Brown', payType: 'Hourly', rate: 28, status: 'Married', state: 'TX', allowances: 3 },
        { num: 'EMP005', first: 'David', last: 'Garcia', payType: 'Salary', rate: 95000, status: 'Married', state: 'FL', allowances: 2 },
        { num: 'EMP006', first: 'Jessica', last: 'Martinez', payType: 'Hourly', rate: 42, status: 'Single', state: 'WA', allowances: 0 },
        { num: 'EMP007', first: 'Robert', last: 'Anderson', payType: 'Salary', rate: 62000, status: 'Single', state: 'IL', allowances: 1 },
        { num: 'EMP008', first: 'Amanda', last: 'Taylor', payType: 'Hourly', rate: 32, status: 'Married', state: 'PA', allowances: 4 },
    ];

    const nowStr = new Date().toISOString();
    const employeeIds = [];

    for (const emp of employees) {
        const id = uuid();
        const hireDate = new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);

        await pool.query`
            INSERT INTO Employees (
                Id, EmployeeNumber, FirstName, LastName, Email, Phone,
                SSNLast4, DateOfBirth, HireDate, PayType, PayRate, PayFrequency,
                FederalFilingStatus, FederalAllowances, StateCode, StateFilingStatus, StateAllowances,
                BankRoutingNumber, BankAccountNumber, BankAccountType,
                Address, City, State, ZipCode, Status, CreatedAt, UpdatedAt
            ) VALUES (
                ${id}, ${emp.num}, ${emp.first}, ${emp.last},
                ${emp.first.toLowerCase() + '.' + emp.last.toLowerCase() + '@company.com'},
                ${'555-' + String(Math.floor(Math.random() * 900) + 100) + '-' + String(Math.floor(Math.random() * 9000) + 1000)},
                ${String(Math.floor(Math.random() * 9000) + 1000)},
                ${formatDate(new Date(1980 + Math.floor(Math.random() * 20), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1))},
                ${formatDate(hireDate)},
                ${emp.payType}, ${emp.rate}, 'Biweekly',
                ${emp.status}, ${emp.allowances}, ${emp.state}, ${emp.status}, ${emp.allowances},
                '121000358', ${String(Math.floor(Math.random() * 900000000) + 100000000)}, 'Checking',
                ${Math.floor(Math.random() * 9000) + 1000 + ' Main Street'},
                ${['Los Angeles', 'New York', 'Houston', 'Miami', 'Seattle', 'Chicago', 'Philadelphia'][Math.floor(Math.random() * 7)]},
                ${emp.state},
                ${String(Math.floor(Math.random() * 90000) + 10000)},
                'Active', ${nowStr}, ${nowStr}
            )
        `;

        employeeIds.push({ id, ...emp });
    }

    console.log(`  Created ${employees.length} employees`);
    return employeeIds;
}

async function seedPayrollData(pool, employees) {
    console.log('Creating Pay Runs and Pay Stubs for 2024 and 2025...');

    const nowStr = new Date().toISOString();

    // Generate biweekly pay periods for 2024 AND 2025
    const payPeriods = [];
    let periodStart = new Date(2024, 0, 1); // Jan 1, 2024

    while (periodStart < new Date(2026, 0, 1)) {
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 13); // 2 weeks

        const payDate = new Date(periodEnd);
        payDate.setDate(payDate.getDate() + 5); // Pay 5 days after period end

        // Only include periods up to current date
        if (payDate <= new Date()) {
            payPeriods.push({
                start: new Date(periodStart),
                end: new Date(periodEnd),
                payDate: new Date(payDate),
                year: periodStart.getFullYear()
            });
        }

        periodStart.setDate(periodStart.getDate() + 14);
    }

    console.log(`  Generating ${payPeriods.length} pay periods...`);

    // Track YTD totals per employee per year
    const ytdTotals = {};
    let currentYear = null;

    function resetYtd() {
        for (const emp of employees) {
            ytdTotals[emp.id] = {
                gross: 0,
                federal: 0,
                state: 0,
                ss: 0,
                medicare: 0,
                net: 0
            };
        }
    }
    resetYtd();

    let payRunCount = 0;
    let payStubCount = 0;

    for (let i = 0; i < payPeriods.length; i++) {
        const period = payPeriods[i];

        // Reset YTD at start of new year
        if (currentYear !== period.year) {
            currentYear = period.year;
            resetYtd();
            console.log(`  Processing year ${currentYear}...`);
        }
        const payRunId = uuid();
        // Calculate the pay run number within the year
        const yearPayRuns = payPeriods.filter((p, idx) => idx <= i && p.year === period.year).length;
        const payRunNumber = `PR-${period.year}-${String(yearPayRuns).padStart(3, '0')}`;

        let totalGross = 0;
        let totalDeductions = 0;
        let totalNet = 0;

        // Determine status based on pay date
        const today = new Date();
        let status;
        if (period.payDate > today) {
            status = 'Draft';
        } else {
            status = 'Paid';
        }

        // Create pay stubs for each employee
        const stubs = [];

        for (const emp of employees) {
            const stubId = uuid();

            // Calculate hours/pay
            let regularHours, overtimeHours, regularPay, overtimePay;

            if (emp.payType === 'Hourly') {
                regularHours = 80; // Standard biweekly
                overtimeHours = Math.random() > 0.7 ? Math.floor(Math.random() * 10) : 0;
                regularPay = regularHours * emp.rate;
                overtimePay = overtimeHours * emp.rate * 1.5;
            } else {
                regularHours = 80;
                overtimeHours = 0;
                regularPay = Math.round((emp.rate / 26) * 100) / 100; // Biweekly salary
                overtimePay = 0;
            }

            const grossPay = regularPay + overtimePay;

            // Calculate deductions
            const federalWithholding = calculateFederalWithholding(grossPay, emp.status, emp.allowances);
            const stateWithholding = calculateStateWithholding(grossPay, emp.state);
            const socialSecurity = calculateSocialSecurity(grossPay, ytdTotals[emp.id].gross);
            const medicare = calculateMedicare(grossPay);
            const totalDeductionsForStub = federalWithholding + stateWithholding + socialSecurity + medicare;
            const netPay = Math.round((grossPay - totalDeductionsForStub) * 100) / 100;

            // Update YTD
            ytdTotals[emp.id].gross += grossPay;
            ytdTotals[emp.id].federal += federalWithholding;
            ytdTotals[emp.id].state += stateWithholding;
            ytdTotals[emp.id].ss += socialSecurity;
            ytdTotals[emp.id].medicare += medicare;
            ytdTotals[emp.id].net += netPay;

            stubs.push({
                id: stubId,
                payRunId,
                employeeId: emp.id,
                regularHours,
                overtimeHours,
                regularPay,
                overtimePay,
                otherEarnings: 0,
                grossPay,
                federalWithholding,
                stateWithholding,
                socialSecurity,
                medicare,
                otherDeductions: 0,
                totalDeductions: totalDeductionsForStub,
                netPay,
                ytdGross: Math.round(ytdTotals[emp.id].gross * 100) / 100,
                ytdFederal: Math.round(ytdTotals[emp.id].federal * 100) / 100,
                ytdState: Math.round(ytdTotals[emp.id].state * 100) / 100,
                ytdSS: Math.round(ytdTotals[emp.id].ss * 100) / 100,
                ytdMedicare: Math.round(ytdTotals[emp.id].medicare * 100) / 100,
                ytdNet: Math.round(ytdTotals[emp.id].net * 100) / 100,
                status: status === 'Paid' ? 'Paid' : 'Pending'
            });

            totalGross += grossPay;
            totalDeductions += totalDeductionsForStub;
            totalNet += netPay;
        }

        // Insert pay run
        await pool.query`
            INSERT INTO PayRuns (
                Id, PayRunNumber, PayPeriodStart, PayPeriodEnd, PayDate,
                Status, TotalGrossPay, TotalDeductions, TotalNetPay, EmployeeCount,
                ProcessedAt, ProcessedBy, ApprovedAt, ApprovedBy, CreatedAt, UpdatedAt
            ) VALUES (
                ${payRunId}, ${payRunNumber}, ${formatDate(period.start)}, ${formatDate(period.end)}, ${formatDate(period.payDate)},
                ${status}, ${Math.round(totalGross * 100) / 100}, ${Math.round(totalDeductions * 100) / 100}, ${Math.round(totalNet * 100) / 100}, ${employees.length},
                ${status === 'Paid' ? nowStr : null}, ${status === 'Paid' ? 'system' : null},
                ${status === 'Paid' ? nowStr : null}, ${status === 'Paid' ? 'system' : null},
                ${nowStr}, ${nowStr}
            )
        `;
        payRunCount++;

        // Insert pay stubs
        for (const stub of stubs) {
            await pool.query`
                INSERT INTO PayStubs (
                    Id, PayRunId, EmployeeId, RegularHours, OvertimeHours,
                    RegularPay, OvertimePay, OtherEarnings, GrossPay,
                    FederalWithholding, StateWithholding, SocialSecurity, Medicare,
                    OtherDeductions, TotalDeductions, NetPay,
                    YTDGrossPay, YTDFederalWithholding, YTDStateWithholding, YTDSocialSecurity, YTDMedicare, YTDNetPay,
                    PaymentMethod, Status, CreatedAt, UpdatedAt
                ) VALUES (
                    ${stub.id}, ${stub.payRunId}, ${stub.employeeId}, ${stub.regularHours}, ${stub.overtimeHours},
                    ${stub.regularPay}, ${stub.overtimePay}, ${stub.otherEarnings}, ${stub.grossPay},
                    ${stub.federalWithholding}, ${stub.stateWithholding}, ${stub.socialSecurity}, ${stub.medicare},
                    ${stub.otherDeductions}, ${stub.totalDeductions}, ${stub.netPay},
                    ${stub.ytdGross}, ${stub.ytdFederal}, ${stub.ytdState}, ${stub.ytdSS}, ${stub.ytdMedicare}, ${stub.ytdNet},
                    'DirectDeposit', ${stub.status}, ${nowStr}, ${nowStr}
                )
            `;
            payStubCount++;
        }
    }

    console.log(`  Created ${payRunCount} pay runs with ${payStubCount} pay stubs`);

    // Print YTD summary
    console.log('\n  YTD Summary (for W-2 data):');
    for (const emp of employees) {
        const ytd = ytdTotals[emp.id];
        console.log(`    ${emp.first} ${emp.last}: Gross $${ytd.gross.toFixed(2)}, Fed $${ytd.federal.toFixed(2)}, SS $${ytd.ss.toFixed(2)}, Med $${ytd.medicare.toFixed(2)}`);
    }
}

async function seedExpenses(pool) {
    console.log('\nCreating Expenses...');

    const nowStr = new Date().toISOString();
    const descriptions = [
        'Office supplies purchase',
        'Software subscription',
        'Travel - airfare',
        'Travel - hotel',
        'Client dinner',
        'Team lunch',
        'Internet service',
        'Phone bill',
        'Marketing materials',
        'Equipment repair',
        'Professional services',
        'Training materials',
        'Conference registration',
        'Uber/Lyft rides',
        'Parking fees'
    ];
    const vendorNames = ['Amazon', 'Office Depot', 'Staples', 'Delta Airlines', 'Uber', 'Hilton', 'Adobe', 'Microsoft', 'Google', 'AT&T', 'Comcast', 'FedEx'];
    const paymentMethods = ['Credit Card', 'Debit Card', 'Cash', 'Check'];

    // Get expense accounts
    const accountResult = await pool.query`SELECT Id, Code, Name FROM Accounts WHERE Type = 'Expense'`;
    const expenseAccounts = accountResult.recordset;

    if (expenseAccounts.length === 0) {
        console.log('  Skipping - no expense accounts found');
        return;
    }

    // Get payment accounts (bank/cash accounts)
    const paymentAccountResult = await pool.query`SELECT Id, Code, Name FROM Accounts WHERE Type = 'Asset' AND Code IN ('1000', '1010', '1050')`;
    const paymentAccounts = paymentAccountResult.recordset;

    // Get vendors
    const vendorResult = await pool.query`SELECT Id, Name FROM Vendors`;
    const vendors = vendorResult.recordset;

    let expenseCount = 0;
    let expenseNum = 1000;

    // Create expenses for 2025
    for (let month = 0; month < 12; month++) {
        // Skip future months
        if (new Date(2025, month, 1) > new Date()) break;

        // 15-25 expenses per month
        const numExpenses = Math.floor(Math.random() * 11) + 15;

        for (let i = 0; i < numExpenses; i++) {
            const id = uuid();
            const expenseDate = new Date(2025, month, Math.floor(Math.random() * 28) + 1);
            if (expenseDate > new Date()) continue;

            const description = descriptions[Math.floor(Math.random() * descriptions.length)];
            const vendorName = vendorNames[Math.floor(Math.random() * vendorNames.length)];
            const amount = Math.round((Math.random() * 500 + 20) * 100) / 100;
            const account = expenseAccounts[Math.floor(Math.random() * expenseAccounts.length)];
            const paymentAccount = paymentAccounts.length > 0 ? paymentAccounts[Math.floor(Math.random() * paymentAccounts.length)] : null;
            const vendor = vendors.length > 0 ? vendors[Math.floor(Math.random() * vendors.length)] : null;
            const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

            const statuses = ['Recorded', 'Pending', 'Voided'];
            const statusWeights = [0.85, 0.10, 0.05];
            const rand = Math.random();
            let status = 'Recorded';
            let cumulative = 0;
            for (let j = 0; j < statuses.length; j++) {
                cumulative += statusWeights[j];
                if (rand < cumulative) {
                    status = statuses[j];
                    break;
                }
            }

            const isReimbursable = Math.random() > 0.8 ? 1 : 0;

            try {
                await pool.query`
                    INSERT INTO Expenses (
                        Id, ExpenseNumber, ExpenseDate, VendorId, VendorName, AccountId, Amount,
                        PaymentAccountId, PaymentMethod, Description, IsReimbursable, Status, CreatedAt, UpdatedAt
                    ) VALUES (
                        ${id}, ${'EXP-' + String(++expenseNum)}, ${formatDate(expenseDate)},
                        ${vendor?.Id || null}, ${vendorName}, ${account.Id}, ${amount},
                        ${paymentAccount?.Id || null}, ${paymentMethod}, ${description},
                        ${isReimbursable}, ${status}, ${nowStr}, ${nowStr}
                    )
                `;
                expenseCount++;
            } catch (err) {
                console.log(`    Warning: ${err.message}`);
            }
        }
    }

    console.log(`  Created ${expenseCount} expenses`);
}

async function seed() {
    console.log('========================================');
    console.log('Payroll Seed Data Script');
    console.log('========================================');
    console.log(`Server:   ${config.server}:${config.port}`);
    console.log(`Database: ${config.database}`);
    console.log('');

    let pool;
    try {
        pool = await sql.connect(config);
        console.log('Connected to database.\n');

        // Check if employees already exist
        const existingEmps = await pool.query`SELECT COUNT(*) as cnt FROM Employees`;
        if (existingEmps.recordset[0].cnt > 0) {
            console.log(`Found ${existingEmps.recordset[0].cnt} existing employees.`);
            console.log('Clearing existing payroll data...');
            await pool.query`DELETE FROM PayStubs`;
            await pool.query`DELETE FROM PayRuns`;
            await pool.query`DELETE FROM Employees`;
            console.log('Cleared.\n');
        }

        // Seed employees
        const employees = await seedEmployees(pool);

        // Seed pay runs and stubs
        await seedPayrollData(pool, employees);

        // Seed expenses
        await seedExpenses(pool);

        console.log('\n========================================');
        console.log('Payroll seed complete!');
        console.log('');
        console.log('You can now test:');
        console.log('  - /reports/payroll-summary');
        console.log('  - /reports/expenses');
        console.log('  - /tax-forms/w2?year=2025');
        console.log('  - /employees');
        console.log('  - /payroll');
        console.log('========================================');

        process.exit(0);
    } catch (err) {
        console.error('\nError:', err.message);
        console.error(err);
        process.exit(1);
    } finally {
        if (pool) await pool.close();
    }
}

seed();
