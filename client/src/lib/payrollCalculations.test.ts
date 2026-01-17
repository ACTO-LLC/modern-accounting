import { describe, it, expect } from 'vitest';
import {
  calculateGrossPay,
  calculateFederalWithholding,
  calculateStateWithholding,
  calculateSocialSecurity,
  calculateMedicare,
  calculatePayStub,
  Employee,
  YTDTotals,
} from './payrollCalculations';

// Helper to create test employees
function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    Id: 'test-id',
    EmployeeNumber: 'E001',
    FirstName: 'Test',
    LastName: 'Employee',
    PayType: 'Hourly',
    PayRate: 25,
    PayFrequency: 'Biweekly',
    FederalFilingStatus: 'Single',
    FederalAllowances: 0,
    StateCode: 'CA',
    StateFilingStatus: 'Single',
    StateAllowances: 0,
    ...overrides,
  };
}

// =============================================================================
// TEST 1: Federal Tax Bracket Calculations
// Problems: Progressive bracket math, boundary conditions, rounding errors
// =============================================================================
describe('Federal Tax Bracket Calculations', () => {
  it('should calculate zero tax for income below standard deduction equivalent', () => {
    // Very low income with allowances should result in minimal/zero tax
    const tax = calculateFederalWithholding(
      100, // $100 per pay period
      'Biweekly',
      'Single',
      2, // 2 allowances ($8,600 reduction)
      new Date('2024-06-15')
    );
    expect(tax).toBe(0);
  });

  it('should apply 10% bracket correctly for low income', () => {
    // $500/biweekly = $13,000/year (in 10% bracket for Single after allowances)
    const tax = calculateFederalWithholding(
      500,
      'Biweekly',
      'Single',
      0,
      new Date('2024-06-15')
    );
    // Annual: $13,000, all in 10% bracket = $1,300/year = $50/period
    expect(tax).toBeGreaterThan(0);
    expect(tax).toBeLessThan(100); // Should be reasonable for this income
  });

  it('should handle married filing jointly differently than single', () => {
    const singleTax = calculateFederalWithholding(
      3000,
      'Biweekly',
      'Single',
      0,
      new Date('2024-06-15')
    );

    const marriedTax = calculateFederalWithholding(
      3000,
      'Biweekly',
      'MarriedFilingJointly',
      0,
      new Date('2024-06-15')
    );

    // Married should pay less due to wider brackets
    expect(marriedTax).toBeLessThan(singleTax);
  });

  it('should apply higher brackets for high income', () => {
    // $10,000/biweekly = $260,000/year (should hit 32%+ bracket)
    const tax = calculateFederalWithholding(
      10000,
      'Biweekly',
      'Single',
      0,
      new Date('2024-06-15')
    );
    // Effective rate should be somewhere around 20-25% for this income
    const effectiveRate = (tax * 26) / 260000;
    expect(effectiveRate).toBeGreaterThan(0.15);
    expect(effectiveRate).toBeLessThan(0.35);
  });

  it('should reduce tax with allowances', () => {
    const taxNoAllowances = calculateFederalWithholding(
      2000,
      'Biweekly',
      'Single',
      0,
      new Date('2024-06-15')
    );

    const taxWithAllowances = calculateFederalWithholding(
      2000,
      'Biweekly',
      'Single',
      3,
      new Date('2024-06-15')
    );

    expect(taxWithAllowances).toBeLessThan(taxNoAllowances);
  });
});

// =============================================================================
// TEST 2: Social Security Wage Base Limit
// Problems: Stop collecting after $168,600 (2024), partial period calculations
// =============================================================================
describe('Social Security Wage Base Limit', () => {
  it('should collect full 6.2% when under wage base', () => {
    const ss = calculateSocialSecurity(
      1000,
      0, // No YTD earnings
      new Date('2024-06-15')
    );
    expect(ss).toBe(62); // $1000 * 6.2% = $62
  });

  it('should stop collecting when YTD exceeds wage base ($168,600)', () => {
    const ss = calculateSocialSecurity(
      5000,
      170000, // Already over the wage base
      new Date('2024-06-15')
    );
    expect(ss).toBe(0); // Should be zero - already maxed out
  });

  it('should calculate partial SS when approaching wage base', () => {
    // YTD is $165,000, current pay is $5,000
    // Only $3,600 is taxable ($168,600 - $165,000)
    const ss = calculateSocialSecurity(
      5000,
      165000,
      new Date('2024-06-15')
    );
    expect(ss).toBe(223.2); // $3,600 * 6.2% = $223.20
  });

  it('should handle exactly hitting the wage base', () => {
    // YTD is $163,600, current pay is $5,000
    // Exactly $5,000 is taxable (to reach $168,600)
    const ss = calculateSocialSecurity(
      5000,
      163600,
      new Date('2024-06-15')
    );
    expect(ss).toBe(310); // $5,000 * 6.2% = $310
  });

  it('should return 0 when YTD exactly equals wage base', () => {
    const ss = calculateSocialSecurity(
      1000,
      168600, // Exactly at wage base
      new Date('2024-06-15')
    );
    expect(ss).toBe(0);
  });
});

// =============================================================================
// TEST 3: Overtime Pay Calculations
// Problems: 1.5x multiplier, hourly vs salary handling, rounding
// =============================================================================
describe('Overtime Pay Calculations', () => {
  it('should calculate overtime at 1.5x rate for hourly employees', () => {
    const employee = createEmployee({
      PayType: 'Hourly',
      PayRate: 20,
    });

    const result = calculateGrossPay(employee, 40, 10);

    expect(result.regularPay).toBe(800); // 40 * $20
    expect(result.overtimePay).toBe(300); // 10 * $20 * 1.5
    expect(result.grossPay).toBe(1100);
  });

  it('should not apply overtime to salaried employees', () => {
    const employee = createEmployee({
      PayType: 'Salary',
      PayRate: 52000, // Annual salary
      PayFrequency: 'Biweekly',
    });

    const result = calculateGrossPay(employee, 80, 10); // Even with OT hours

    expect(result.overtimePay).toBe(0); // Salary = no OT
    expect(result.regularPay).toBe(2000); // $52,000 / 26 periods
    expect(result.grossPay).toBe(2000);
  });

  it('should handle zero overtime correctly', () => {
    const employee = createEmployee({
      PayType: 'Hourly',
      PayRate: 15,
    });

    const result = calculateGrossPay(employee, 40, 0);

    expect(result.regularPay).toBe(600);
    expect(result.overtimePay).toBe(0);
    expect(result.grossPay).toBe(600);
  });

  it('should include other earnings in gross pay', () => {
    const employee = createEmployee({
      PayType: 'Hourly',
      PayRate: 20,
    });

    const result = calculateGrossPay(employee, 40, 0, 500); // $500 bonus

    expect(result.regularPay).toBe(800);
    expect(result.grossPay).toBe(1300); // $800 + $500 bonus
  });

  it('should calculate different pay frequencies correctly for salary', () => {
    const weeklyEmployee = createEmployee({
      PayType: 'Salary',
      PayRate: 52000,
      PayFrequency: 'Weekly',
    });

    const monthlyEmployee = createEmployee({
      PayType: 'Salary',
      PayRate: 52000,
      PayFrequency: 'Monthly',
    });

    const weeklyResult = calculateGrossPay(weeklyEmployee, 40);
    const monthlyResult = calculateGrossPay(monthlyEmployee, 160);

    expect(weeklyResult.grossPay).toBe(1000); // $52,000 / 52
    expect(monthlyResult.grossPay).toBeCloseTo(4333.33, 2); // $52,000 / 12
  });
});

// =============================================================================
// TEST 4: State Tax Handling (including no-income-tax states)
// Problems: No-tax states returning 0, missing state codes, rate variations
// =============================================================================
describe('State Tax Handling', () => {
  it('should return zero tax for Texas (no state income tax)', () => {
    const tax = calculateStateWithholding(
      5000,
      'Biweekly',
      'TX',
      'Single',
      0
    );
    expect(tax).toBe(0);
  });

  it('should return zero tax for Florida (no state income tax)', () => {
    const tax = calculateStateWithholding(
      5000,
      'Biweekly',
      'FL',
      'Single',
      0
    );
    expect(tax).toBe(0);
  });

  it('should return zero tax for Washington (no state income tax)', () => {
    const tax = calculateStateWithholding(
      5000,
      'Biweekly',
      'WA',
      'Single',
      0
    );
    expect(tax).toBe(0);
  });

  it('should calculate tax for California (has state income tax)', () => {
    const tax = calculateStateWithholding(
      5000,
      'Biweekly',
      'CA',
      'Single',
      0
    );
    // CA uses 9.3% simplified rate
    // $5,000 biweekly = $130,000 annual
    // $130,000 * 9.3% = $12,090 annual / 26 = $465 per period
    expect(tax).toBe(465);
  });

  it('should calculate correct CA tax for typical software engineer salary', () => {
    // $180k/year salary, biweekly = $6,923.08 per period
    const tax = calculateStateWithholding(
      6923.08,
      'Biweekly',
      'CA',
      'Single',
      0
    );
    // $180,000 * 9.3% = $16,740 annual / 26 = $643.85 per period
    expect(tax).toBeCloseTo(643.85, 2);
  });

  it('should return zero for undefined state code', () => {
    const tax = calculateStateWithholding(
      5000,
      'Biweekly',
      undefined,
      'Single',
      0
    );
    expect(tax).toBe(0);
  });

  it('should return zero for invalid state code', () => {
    const tax = calculateStateWithholding(
      5000,
      'Biweekly',
      'XX', // Invalid state
      'Single',
      0
    );
    expect(tax).toBe(0);
  });

  it('should reduce tax with state allowances', () => {
    const taxNoAllowances = calculateStateWithholding(
      3000,
      'Biweekly',
      'CA',
      'Single',
      0
    );

    const taxWithAllowances = calculateStateWithholding(
      3000,
      'Biweekly',
      'CA',
      'Single',
      3
    );

    expect(taxWithAllowances).toBeLessThan(taxNoAllowances);
  });
});

// =============================================================================
// TEST 5: Medicare Additional Tax (0.9% over $200k)
// Problems: Threshold tracking across pay periods, partial calculations
// =============================================================================
describe('Medicare Additional Tax', () => {
  it('should calculate standard 1.45% Medicare when under threshold', () => {
    const medicare = calculateMedicare(
      5000,
      50000 // YTD well under $200k
    );
    expect(medicare).toBe(72.5); // $5,000 * 1.45%
  });

  it('should add 0.9% additional tax when YTD exceeds $200k threshold', () => {
    const medicare = calculateMedicare(
      5000,
      210000 // Already over $200k
    );
    // Standard: $5000 * 1.45% = $72.50
    // Additional: $5000 * 0.9% = $45.00
    // Total: $117.50
    expect(medicare).toBe(117.5);
  });

  it('should handle crossing the $200k threshold mid-period', () => {
    const medicare = calculateMedicare(
      10000,
      195000 // YTD is $195k, pay is $10k, so $5k is over threshold
    );
    // Standard: $10,000 * 1.45% = $145.00
    // Additional: $5,000 (amount over $200k) * 0.9% = $45.00
    // Total: $190.00
    expect(medicare).toBe(190);
  });

  it('should not apply additional tax when just under threshold', () => {
    const medicare = calculateMedicare(
      5000,
      190000 // YTD + pay = $195k, still under $200k
    );
    expect(medicare).toBe(72.5); // Just standard 1.45%
  });

  it('should apply additional tax to entire amount when starting over threshold', () => {
    const medicare = calculateMedicare(
      1000,
      250000 // Way over threshold
    );
    // Standard: $1,000 * 1.45% = $14.50
    // Additional: $1,000 * 0.9% = $9.00
    // Total: $23.50
    expect(medicare).toBe(23.5);
  });
});

// =============================================================================
// INTEGRATION TEST: Full Pay Stub Calculation
// =============================================================================
describe('Full Pay Stub Calculation Integration', () => {
  it('should calculate complete pay stub with all deductions', () => {
    const employee = createEmployee({
      PayType: 'Hourly',
      PayRate: 50,
      PayFrequency: 'Biweekly',
      FederalFilingStatus: 'Single',
      FederalAllowances: 1,
      StateCode: 'CA',
    });

    const ytd: YTDTotals = {
      grossPay: 50000,
      federalWithholding: 8000,
      stateWithholding: 3000,
      socialSecurity: 3100,
      medicare: 725,
      netPay: 35175,
    };

    const payStub = calculatePayStub(
      employee,
      80, // Regular hours
      10, // Overtime hours
      0, // Other earnings
      100, // Other deductions (401k, etc.)
      ytd,
      new Date('2024-06-15')
    );

    // Verify gross pay calculation
    expect(payStub.regularPay).toBe(4000); // 80 * $50
    expect(payStub.overtimePay).toBe(750); // 10 * $50 * 1.5
    expect(payStub.grossPay).toBe(4750);

    // Verify all deductions are calculated
    expect(payStub.federalWithholding).toBeGreaterThan(0);
    expect(payStub.stateWithholding).toBeGreaterThan(0);
    expect(payStub.socialSecurity).toBeGreaterThan(0);
    expect(payStub.medicare).toBeGreaterThan(0);

    // Verify totals (use toBeCloseTo for floating point comparison)
    const expectedTotalDeductions =
      payStub.federalWithholding +
      payStub.stateWithholding +
      payStub.socialSecurity +
      payStub.medicare +
      payStub.otherDeductions;
    expect(payStub.totalDeductions).toBeCloseTo(expectedTotalDeductions, 2);

    expect(payStub.netPay).toBe(payStub.grossPay - payStub.totalDeductions);
  });

  it('should handle employee in no-tax state correctly', () => {
    const employee = createEmployee({
      PayType: 'Salary',
      PayRate: 100000,
      PayFrequency: 'Biweekly',
      StateCode: 'TX', // Texas - no state income tax
    });

    const payStub = calculatePayStub(
      employee,
      80,
      0,
      0,
      0,
      { grossPay: 0, federalWithholding: 0, stateWithholding: 0, socialSecurity: 0, medicare: 0, netPay: 0 },
      new Date('2024-06-15')
    );

    expect(payStub.stateWithholding).toBe(0);
    expect(payStub.federalWithholding).toBeGreaterThan(0); // Should still have federal
  });
});
