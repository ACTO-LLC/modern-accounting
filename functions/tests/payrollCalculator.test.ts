import { describe, it, expect } from 'vitest';
import {
  calculateGrossPay,
  calculateFederalWithholding,
  calculateStateWithholding,
  calculateSocialSecurity,
  calculateMedicare,
  calculatePayStub,
  calculateBatchPayroll,
  Employee,
  EmployeePayInput,
  BatchPayrollRequest,
} from '../shared/payrollCalculator';

// Test employee fixtures
const createHourlyEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  Id: 'emp-001',
  EmployeeNumber: 'E001',
  FirstName: 'John',
  LastName: 'Doe',
  PayType: 'Hourly',
  PayRate: 25.00,
  PayFrequency: 'Biweekly',
  FederalFilingStatus: 'Single',
  FederalAllowances: 1,
  StateCode: 'TX',
  StateFilingStatus: 'Single',
  StateAllowances: 0,
  ...overrides,
});

const createSalaryEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  Id: 'emp-002',
  EmployeeNumber: 'E002',
  FirstName: 'Jane',
  LastName: 'Smith',
  PayType: 'Salary',
  PayRate: 75000,
  PayFrequency: 'Biweekly',
  FederalFilingStatus: 'MarriedFilingJointly',
  FederalAllowances: 2,
  StateCode: 'CA',
  StateFilingStatus: 'MarriedFilingJointly',
  StateAllowances: 2,
  ...overrides,
});

describe('calculateGrossPay', () => {
  it('calculates hourly employee gross pay correctly', () => {
    const employee = createHourlyEmployee();
    const result = calculateGrossPay(employee, 80, 10, 100);

    expect(result.regularPay).toBe(2000); // 80 * 25
    expect(result.overtimePay).toBe(375); // 10 * 25 * 1.5
    expect(result.grossPay).toBe(2475); // 2000 + 375 + 100
  });

  it('calculates salary employee gross pay correctly', () => {
    const employee = createSalaryEmployee();
    const result = calculateGrossPay(employee, 80, 0, 0);

    // 75000 / 26 pay periods = 2884.615...
    expect(result.regularPay).toBeCloseTo(2884.62, 2);
    expect(result.overtimePay).toBe(0);
    expect(result.grossPay).toBeCloseTo(2884.62, 2);
  });

  it('ignores overtime for salary employees', () => {
    const employee = createSalaryEmployee();
    const result = calculateGrossPay(employee, 80, 20, 0);

    // Should still be the same - salary employees don't get OT
    expect(result.overtimePay).toBe(0);
  });

  it('handles zero hours', () => {
    const employee = createHourlyEmployee();
    const result = calculateGrossPay(employee, 0, 0, 0);

    expect(result.regularPay).toBe(0);
    expect(result.overtimePay).toBe(0);
    expect(result.grossPay).toBe(0);
  });
});

describe('calculateFederalWithholding', () => {
  it('calculates withholding for single filer', () => {
    const result = calculateFederalWithholding(
      2000,
      'Biweekly',
      'Single',
      1,
      new Date('2025-01-15')
    );

    // $2000 biweekly = $52,000 annual
    // After 1 allowance ($4,300): $47,700 taxable
    // Tax brackets apply...
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(400); // Reasonable range check
  });

  it('calculates withholding for married filing jointly', () => {
    const single = calculateFederalWithholding(
      3000,
      'Biweekly',
      'Single',
      0,
      new Date('2025-01-15')
    );

    const married = calculateFederalWithholding(
      3000,
      'Biweekly',
      'MarriedFilingJointly',
      0,
      new Date('2025-01-15')
    );

    // Married filing jointly should have lower withholding
    expect(married).toBeLessThan(single);
  });

  it('reduces withholding with more allowances', () => {
    const noAllowance = calculateFederalWithholding(
      2500,
      'Biweekly',
      'Single',
      0,
      new Date('2025-01-15')
    );

    const twoAllowances = calculateFederalWithholding(
      2500,
      'Biweekly',
      'Single',
      2,
      new Date('2025-01-15')
    );

    expect(twoAllowances).toBeLessThan(noAllowance);
  });

  it('handles different pay frequencies', () => {
    const biweekly = calculateFederalWithholding(
      2000,
      'Biweekly',
      'Single',
      1,
      new Date('2025-01-15')
    );

    // Monthly pay of 4333.33 (roughly same annual)
    const monthly = calculateFederalWithholding(
      4333.33,
      'Monthly',
      'Single',
      1,
      new Date('2025-01-15')
    );

    // Per-period amounts differ, but annual should be close
    expect(biweekly * 26).toBeCloseTo(monthly * 12, 0);
  });
});

describe('calculateStateWithholding', () => {
  it('returns 0 for no-tax states', () => {
    const noTaxStates = ['TX', 'FL', 'NV', 'WA', 'WY', 'SD', 'AK', 'NH', 'TN'];

    for (const state of noTaxStates) {
      const result = calculateStateWithholding(2000, 'Biweekly', state, 'Single', 0);
      expect(result).toBe(0);
    }
  });

  it('calculates withholding for taxable states', () => {
    const result = calculateStateWithholding(
      3000,
      'Biweekly',
      'CA',
      'Single',
      0
    );

    // CA has progressive tax with top rate of 9.3%
    expect(result).toBeGreaterThan(0);
  });

  it('reduces withholding with allowances', () => {
    const noAllowance = calculateStateWithholding(2500, 'Biweekly', 'CA', 'Single', 0);
    const withAllowance = calculateStateWithholding(2500, 'Biweekly', 'CA', 'Single', 2);

    expect(withAllowance).toBeLessThan(noAllowance);
  });

  it('returns 0 for undefined state', () => {
    const result = calculateStateWithholding(2000, 'Biweekly', undefined, 'Single', 0);
    expect(result).toBe(0);
  });
});

describe('calculateSocialSecurity', () => {
  it('calculates at standard rate', () => {
    const result = calculateSocialSecurity(2000, 0, new Date('2025-01-15'));

    // 2000 * 0.062 = 124
    expect(result).toBe(124);
  });

  it('stops at wage base', () => {
    // 2025 wage base is $176,100
    const ytdAlmostAtBase = 175000;
    const result = calculateSocialSecurity(5000, ytdAlmostAtBase, new Date('2025-01-15'));

    // Only $1,100 is taxable (176100 - 175000)
    expect(result).toBeCloseTo(68.20, 2); // 1100 * 0.062
  });

  it('returns 0 when YTD exceeds wage base', () => {
    const result = calculateSocialSecurity(5000, 180000, new Date('2025-01-15'));
    expect(result).toBe(0);
  });
});

describe('calculateMedicare', () => {
  it('calculates at standard rate', () => {
    const result = calculateMedicare(2000, 0);

    // 2000 * 0.0145 = 29
    expect(result).toBe(29);
  });

  it('applies additional tax over $200k threshold', () => {
    const belowThreshold = calculateMedicare(5000, 190000);
    const aboveThreshold = calculateMedicare(5000, 200000);

    // Additional 0.9% on amount over $200k
    expect(aboveThreshold).toBeGreaterThan(belowThreshold);
  });

  it('calculates additional tax correctly', () => {
    // YTD is $198k, this pay is $5k, so $3k is over threshold
    const result = calculateMedicare(5000, 198000);

    // Base: 5000 * 0.0145 = 72.50
    // Additional: 3000 * 0.009 = 27
    // Total: 99.50
    expect(result).toBeCloseTo(99.50, 2);
  });
});

describe('calculatePayStub', () => {
  it('calculates complete pay stub for hourly employee', () => {
    const employee = createHourlyEmployee();
    const input: EmployeePayInput = {
      employee,
      regularHours: 80,
      overtimeHours: 5,
      otherEarnings: 50,
      otherDeductions: 100,
    };

    const result = calculatePayStub(input, new Date('2025-01-15'));

    expect(result.employeeId).toBe('emp-001');
    expect(result.regularPay).toBe(2000);
    expect(result.overtimePay).toBe(187.50); // 5 * 25 * 1.5
    expect(result.grossPay).toBe(2237.50);
    expect(result.federalWithholding).toBeGreaterThan(0);
    expect(result.stateWithholding).toBe(0); // TX has no state tax
    expect(result.socialSecurity).toBeGreaterThan(0);
    expect(result.medicare).toBeGreaterThan(0);
    expect(result.otherDeductions).toBe(100);
    expect(result.totalDeductions).toBeGreaterThan(100);
    expect(result.netPay).toBe(result.grossPay - result.totalDeductions);
  });

  it('calculates complete pay stub for salary employee in CA', () => {
    const employee = createSalaryEmployee();
    const input: EmployeePayInput = {
      employee,
      regularHours: 80,
      overtimeHours: 0,
      otherEarnings: 0,
      otherDeductions: 200,
    };

    const result = calculatePayStub(input, new Date('2025-01-15'));

    expect(result.employeeId).toBe('emp-002');
    expect(result.regularPay).toBeCloseTo(2884.62, 2);
    expect(result.overtimePay).toBe(0);
    expect(result.stateWithholding).toBeGreaterThan(0); // CA has state tax
    expect(result.netPay).toBeLessThan(result.grossPay);
  });

  it('uses YTD totals for SS/Medicare calculations', () => {
    const employee = createHourlyEmployee();
    const input: EmployeePayInput = {
      employee,
      regularHours: 80,
      overtimeHours: 0,
      otherEarnings: 0,
      otherDeductions: 0,
      ytdTotals: {
        grossPay: 200000, // Over Medicare threshold
        federalWithholding: 30000,
        stateWithholding: 0,
        socialSecurity: 10000,
        medicare: 3000,
        netPay: 157000,
      },
    };

    const result = calculatePayStub(input, new Date('2025-01-15'));

    // Medicare should have additional tax
    // $2000 gross * (0.0145 + 0.009) = $47
    expect(result.medicare).toBeCloseTo(47, 0);
  });
});

describe('calculateBatchPayroll', () => {
  it('processes multiple employees', () => {
    const employees: EmployeePayInput[] = [
      {
        employee: createHourlyEmployee({ Id: 'emp-001' }),
        regularHours: 80,
        overtimeHours: 0,
        otherEarnings: 0,
        otherDeductions: 0,
      },
      {
        employee: createSalaryEmployee({ Id: 'emp-002' }),
        regularHours: 80,
        overtimeHours: 0,
        otherEarnings: 0,
        otherDeductions: 0,
      },
    ];

    const request: BatchPayrollRequest = {
      payRunId: 'PR20250115-001',
      payDate: '2025-01-15',
      employees,
    };

    const response = calculateBatchPayroll(request);

    expect(response.payRunId).toBe('PR20250115-001');
    expect(response.payDate).toBe('2025-01-15');
    expect(response.results).toHaveLength(2);
    expect(response.summary.employeeCount).toBe(2);
    expect(response.summary.totalGrossPay).toBeGreaterThan(0);
    expect(response.summary.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('calculates correct totals', () => {
    const employees: EmployeePayInput[] = [
      {
        employee: createHourlyEmployee({ Id: 'emp-001', PayRate: 20 }),
        regularHours: 80,
        overtimeHours: 0,
        otherEarnings: 0,
        otherDeductions: 0,
      },
      {
        employee: createHourlyEmployee({ Id: 'emp-002', PayRate: 30 }),
        regularHours: 80,
        overtimeHours: 0,
        otherEarnings: 0,
        otherDeductions: 0,
      },
    ];

    const request: BatchPayrollRequest = {
      payRunId: 'PR20250115-002',
      payDate: '2025-01-15',
      employees,
    };

    const response = calculateBatchPayroll(request);

    // 80 * 20 + 80 * 30 = 1600 + 2400 = 4000
    expect(response.summary.totalGrossPay).toBe(4000);

    // Verify individual results sum to total
    const sumGross = response.results.reduce((sum, r) => sum + r.grossPay, 0);
    expect(sumGross).toBe(response.summary.totalGrossPay);

    const sumDeductions = response.results.reduce((sum, r) => sum + r.totalDeductions, 0);
    expect(sumDeductions).toBeCloseTo(response.summary.totalDeductions, 2);

    const sumNet = response.results.reduce((sum, r) => sum + r.netPay, 0);
    expect(sumNet).toBeCloseTo(response.summary.totalNetPay, 2);
  });

  it('handles large batch efficiently', () => {
    const employees: EmployeePayInput[] = [];

    // Create 500 employees
    for (let i = 0; i < 500; i++) {
      employees.push({
        employee: createHourlyEmployee({
          Id: `emp-${i.toString().padStart(3, '0')}`,
          PayRate: 20 + (i % 20),
        }),
        regularHours: 80,
        overtimeHours: i % 2 === 0 ? 5 : 0,
        otherEarnings: 0,
        otherDeductions: 0,
      });
    }

    const request: BatchPayrollRequest = {
      payRunId: 'PR20250115-LARGE',
      payDate: '2025-01-15',
      employees,
    };

    const startTime = Date.now();
    const response = calculateBatchPayroll(request);
    const totalTime = Date.now() - startTime;

    expect(response.results).toHaveLength(500);
    expect(response.summary.employeeCount).toBe(500);

    // Should complete in under 5 seconds (acceptance criteria)
    expect(totalTime).toBeLessThan(5000);
    console.log(`500 employees processed in ${totalTime}ms`);
  });

  it('handles 1000 employees within 5 seconds', () => {
    const employees: EmployeePayInput[] = [];

    for (let i = 0; i < 1000; i++) {
      employees.push({
        employee: createHourlyEmployee({
          Id: `emp-${i.toString().padStart(4, '0')}`,
          StateCode: ['CA', 'NY', 'TX', 'FL', 'IL'][i % 5],
          PayRate: 15 + (i % 35),
        }),
        regularHours: 80,
        overtimeHours: i % 3 === 0 ? 10 : 0,
        otherEarnings: i % 5 === 0 ? 100 : 0,
        otherDeductions: i % 10 === 0 ? 50 : 0,
      });
    }

    const request: BatchPayrollRequest = {
      payRunId: 'PR20250115-1000',
      payDate: '2025-01-15',
      employees,
    };

    const startTime = Date.now();
    const response = calculateBatchPayroll(request);
    const totalTime = Date.now() - startTime;

    expect(response.results).toHaveLength(1000);

    // Acceptance criteria: < 5s for 1,000 employees
    expect(totalTime).toBeLessThan(5000);
    console.log(`1000 employees processed in ${totalTime}ms`);
  });
});
