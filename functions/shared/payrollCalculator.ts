/**
 * Payroll Calculator - Shared logic for Azure Functions and client-side
 * Handles federal and state tax calculations, Social Security, Medicare
 */

import {
  FEDERAL_TAX_2024,
  FEDERAL_TAX_2025,
  SOCIAL_SECURITY_WAGE_BASE,
  SOCIAL_SECURITY_RATE,
  MEDICARE_RATE,
  MEDICARE_ADDITIONAL_RATE,
  MEDICARE_ADDITIONAL_THRESHOLD,
  STATE_TAX_RATES,
  PAY_FREQUENCY_DIVISORS,
  TaxBracket,
  TaxTable,
} from './taxTables';

export interface Employee {
  Id: string;
  EmployeeNumber: string;
  FirstName: string;
  LastName: string;
  PayType: 'Hourly' | 'Salary';
  PayRate: number;
  PayFrequency: string;
  FederalFilingStatus: string;
  FederalAllowances: number;
  StateCode?: string;
  StateFilingStatus?: string;
  StateAllowances: number;
  ResidentState?: string;
}

export interface WorkStateAllocation {
  stateCode: string;
  percentage: number;
  isPrimary: boolean;
}

export interface ReciprocityAgreement {
  residentState: string;
  workState: string;
  reciprocityType: 'Full' | 'Partial' | 'Conditional';
}

export interface StateWithholdingBreakdown {
  stateCode: string;
  grossWages: number;
  percentage: number;
  stateWithholding: number;
  reciprocityApplied: boolean;
  reciprocityStateCode?: string;
}

export interface PayStubCalculation {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  otherEarnings: number;
  grossPay: number;
  federalWithholding: number;
  stateWithholding: number;
  stateWithholdingBreakdown?: StateWithholdingBreakdown[];
  socialSecurity: number;
  medicare: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
}

export interface YTDTotals {
  grossPay: number;
  federalWithholding: number;
  stateWithholding: number;
  socialSecurity: number;
  medicare: number;
  netPay: number;
}

export interface EmployeePayInput {
  employee: Employee;
  regularHours: number;
  overtimeHours: number;
  otherEarnings: number;
  otherDeductions: number;
  ytdTotals?: YTDTotals;
  workStates?: WorkStateAllocation[];
  reciprocityAgreements?: ReciprocityAgreement[];
}

export interface BatchPayrollRequest {
  payRunId: string;
  payDate: string;
  employees: EmployeePayInput[];
}

export interface BatchPayrollResponse {
  payRunId: string;
  payDate: string;
  results: PayStubCalculation[];
  summary: {
    employeeCount: number;
    totalGrossPay: number;
    totalDeductions: number;
    totalNetPay: number;
    processingTimeMs: number;
  };
}

/**
 * Get tax year from pay date
 */
function getTaxYear(payDate: Date): number {
  return payDate.getFullYear();
}

/**
 * Get federal tax table for the given year
 */
function getFederalTaxTable(year: number): TaxTable {
  return year >= 2025 ? FEDERAL_TAX_2025 : FEDERAL_TAX_2024;
}

/**
 * Calculate progressive tax using bracket-based computation
 */
function calculateProgressiveTax(annualIncome: number, brackets: TaxBracket[]): number {
  if (annualIncome <= 0) return 0;

  for (let i = brackets.length - 1; i >= 0; i--) {
    const bracket = brackets[i];
    if (annualIncome > bracket.min) {
      const taxableInBracket = bracket.max
        ? Math.min(annualIncome, bracket.max) - bracket.min
        : annualIncome - bracket.min;
      return bracket.flatAmount + (taxableInBracket * bracket.rate);
    }
  }

  return 0;
}

/**
 * Calculate gross pay for an employee
 */
export function calculateGrossPay(
  employee: Employee,
  regularHours: number,
  overtimeHours: number = 0,
  otherEarnings: number = 0
): { regularPay: number; overtimePay: number; grossPay: number } {
  let regularPay: number;
  let overtimePay: number;

  if (employee.PayType === 'Hourly') {
    regularPay = regularHours * employee.PayRate;
    overtimePay = overtimeHours * employee.PayRate * 1.5; // Time and a half
  } else {
    // Salary - calculate per-period amount
    const periodsPerYear = PAY_FREQUENCY_DIVISORS[employee.PayFrequency] || 26;
    regularPay = employee.PayRate / periodsPerYear;
    overtimePay = 0; // Salary employees typically don't get overtime (exempt)
  }

  const grossPay = regularPay + overtimePay + otherEarnings;

  return {
    regularPay: Math.round(regularPay * 100) / 100,
    overtimePay: Math.round(overtimePay * 100) / 100,
    grossPay: Math.round(grossPay * 100) / 100,
  };
}

/**
 * Calculate federal income tax withholding
 */
export function calculateFederalWithholding(
  grossPay: number,
  payFrequency: string,
  filingStatus: string,
  allowances: number,
  payDate: Date = new Date()
): number {
  const taxYear = getTaxYear(payDate);
  const taxTable = getFederalTaxTable(taxYear);
  const brackets = taxTable[filingStatus] || taxTable['Single'];

  // Annualize the gross pay
  const periodsPerYear = PAY_FREQUENCY_DIVISORS[payFrequency] || 26;
  const annualGrossPay = grossPay * periodsPerYear;

  // Apply allowances reduction (each allowance reduces taxable income)
  // Using simplified $4,300 per allowance for 2024
  const allowanceReduction = allowances * 4300;
  const taxableIncome = Math.max(0, annualGrossPay - allowanceReduction);

  // Calculate annual tax
  const annualTax = calculateProgressiveTax(taxableIncome, brackets);

  // Convert back to per-period amount
  const periodTax = annualTax / periodsPerYear;

  return Math.round(periodTax * 100) / 100;
}

/**
 * Calculate state income tax withholding for a single state
 */
export function calculateStateWithholding(
  grossPay: number,
  payFrequency: string,
  stateCode?: string,
  _filingStatus?: string,
  allowances: number = 0
): number {
  if (!stateCode || !STATE_TAX_RATES[stateCode]) {
    return 0;
  }

  const stateInfo = STATE_TAX_RATES[stateCode];

  // No state tax
  if (stateInfo.rate === 0) {
    return 0;
  }

  // Annualize the gross pay
  const periodsPerYear = PAY_FREQUENCY_DIVISORS[payFrequency] || 26;
  const annualGrossPay = grossPay * periodsPerYear;

  // Use the flat rate or top marginal rate
  const effectiveRate = stateInfo.rate;

  // Apply a simplified allowance reduction for state tax
  const allowanceReduction = allowances * 2000;
  const taxableIncome = Math.max(0, annualGrossPay - allowanceReduction);

  // Calculate annual state tax
  const annualTax = taxableIncome * effectiveRate;

  // Convert back to per-period amount
  const periodTax = annualTax / periodsPerYear;

  return Math.round(periodTax * 100) / 100;
}

/**
 * Check for reciprocity agreement between states
 */
function checkReciprocity(
  residentState: string,
  workState: string,
  reciprocityAgreements: ReciprocityAgreement[]
): ReciprocityAgreement | undefined {
  return reciprocityAgreements.find(
    agreement =>
      agreement.residentState === residentState &&
      agreement.workState === workState
  );
}

/**
 * Calculate multi-state withholding for employees working in multiple states
 */
export function calculateMultiStateWithholding(
  grossPay: number,
  payFrequency: string,
  workStates: WorkStateAllocation[],
  residentState: string,
  filingStatus: string,
  allowances: number = 0,
  reciprocityAgreements: ReciprocityAgreement[] = []
): { totalWithholding: number; breakdown: StateWithholdingBreakdown[] } {
  const breakdown: StateWithholdingBreakdown[] = [];
  let totalWithholding = 0;

  for (const workState of workStates) {
    const allocatedWages = (grossPay * workState.percentage) / 100;
    const reciprocity = checkReciprocity(residentState, workState.stateCode, reciprocityAgreements);

    let stateWithholding = 0;
    let reciprocityApplied = false;
    let reciprocityStateCode: string | undefined;

    if (reciprocity && reciprocity.reciprocityType === 'Full') {
      reciprocityApplied = true;
      reciprocityStateCode = residentState;

      stateWithholding = calculateStateWithholding(
        allocatedWages,
        payFrequency,
        residentState,
        filingStatus,
        Math.round(allowances * workState.percentage / 100)
      );
    } else {
      stateWithholding = calculateStateWithholding(
        allocatedWages,
        payFrequency,
        workState.stateCode,
        filingStatus,
        Math.round(allowances * workState.percentage / 100)
      );
    }

    breakdown.push({
      stateCode: workState.stateCode,
      grossWages: Math.round(allocatedWages * 100) / 100,
      percentage: workState.percentage,
      stateWithholding,
      reciprocityApplied,
      reciprocityStateCode,
    });

    totalWithholding += stateWithholding;
  }

  return {
    totalWithholding: Math.round(totalWithholding * 100) / 100,
    breakdown,
  };
}

/**
 * Calculate Social Security withholding
 */
export function calculateSocialSecurity(
  grossPay: number,
  ytdGrossPay: number = 0,
  payDate: Date = new Date()
): number {
  const taxYear = getTaxYear(payDate);
  const wageBase = SOCIAL_SECURITY_WAGE_BASE[taxYear] || SOCIAL_SECURITY_WAGE_BASE[2024];

  if (ytdGrossPay >= wageBase) {
    return 0;
  }

  const taxableAmount = Math.min(grossPay, wageBase - ytdGrossPay);
  const socialSecurityTax = taxableAmount * SOCIAL_SECURITY_RATE;

  return Math.round(socialSecurityTax * 100) / 100;
}

/**
 * Calculate Medicare withholding
 */
export function calculateMedicare(
  grossPay: number,
  ytdGrossPay: number = 0
): number {
  let medicareTax = grossPay * MEDICARE_RATE;

  const newYtd = ytdGrossPay + grossPay;
  if (newYtd > MEDICARE_ADDITIONAL_THRESHOLD) {
    const amountOverThreshold = newYtd - MEDICARE_ADDITIONAL_THRESHOLD;
    const additionalTaxableThisPeriod = Math.min(grossPay, amountOverThreshold);
    medicareTax += additionalTaxableThisPeriod * MEDICARE_ADDITIONAL_RATE;
  }

  return Math.round(medicareTax * 100) / 100;
}

/**
 * Calculate a single pay stub for an employee
 */
export function calculatePayStub(
  input: EmployeePayInput,
  payDate: Date = new Date()
): PayStubCalculation {
  const { employee, regularHours, overtimeHours, otherEarnings, otherDeductions, ytdTotals, workStates, reciprocityAgreements } = input;

  const defaultYtd: YTDTotals = {
    grossPay: 0,
    federalWithholding: 0,
    stateWithholding: 0,
    socialSecurity: 0,
    medicare: 0,
    netPay: 0,
  };
  const ytd = ytdTotals || defaultYtd;

  // Calculate gross pay
  const { regularPay, overtimePay, grossPay } = calculateGrossPay(
    employee,
    regularHours,
    overtimeHours,
    otherEarnings
  );

  // Calculate federal withholding
  const federalWithholding = calculateFederalWithholding(
    grossPay,
    employee.PayFrequency,
    employee.FederalFilingStatus,
    employee.FederalAllowances,
    payDate
  );

  // Calculate state withholding
  let stateWithholding: number;
  let stateWithholdingBreakdown: StateWithholdingBreakdown[] | undefined;

  if (workStates && workStates.length > 0) {
    const residentState = employee.ResidentState || employee.StateCode || '';
    const result = calculateMultiStateWithholding(
      grossPay,
      employee.PayFrequency,
      workStates,
      residentState,
      employee.StateFilingStatus || employee.FederalFilingStatus,
      employee.StateAllowances,
      reciprocityAgreements || []
    );
    stateWithholding = result.totalWithholding;
    stateWithholdingBreakdown = result.breakdown;
  } else {
    stateWithholding = calculateStateWithholding(
      grossPay,
      employee.PayFrequency,
      employee.StateCode,
      employee.StateFilingStatus || employee.FederalFilingStatus,
      employee.StateAllowances
    );
  }

  // Calculate Social Security and Medicare
  const socialSecurity = calculateSocialSecurity(grossPay, ytd.grossPay, payDate);
  const medicare = calculateMedicare(grossPay, ytd.grossPay);

  // Calculate totals
  const totalDeductions = federalWithholding + stateWithholding + socialSecurity + medicare + otherDeductions;
  const netPay = grossPay - totalDeductions;

  return {
    employeeId: employee.Id,
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    otherEarnings,
    grossPay,
    federalWithholding,
    stateWithholding,
    stateWithholdingBreakdown,
    socialSecurity,
    medicare,
    otherDeductions,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay: Math.round(netPay * 100) / 100,
  };
}

/**
 * Calculate pay stubs for a batch of employees
 * Optimized for parallel processing
 */
export function calculateBatchPayroll(request: BatchPayrollRequest): BatchPayrollResponse {
  const startTime = Date.now();
  const payDate = new Date(request.payDate);

  const results: PayStubCalculation[] = [];
  let totalGrossPay = 0;
  let totalDeductions = 0;
  let totalNetPay = 0;

  for (const input of request.employees) {
    const stub = calculatePayStub(input, payDate);
    results.push(stub);
    totalGrossPay += stub.grossPay;
    totalDeductions += stub.totalDeductions;
    totalNetPay += stub.netPay;
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    payRunId: request.payRunId,
    payDate: request.payDate,
    results,
    summary: {
      employeeCount: results.length,
      totalGrossPay: Math.round(totalGrossPay * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      totalNetPay: Math.round(totalNetPay * 100) / 100,
      processingTimeMs,
    },
  };
}
