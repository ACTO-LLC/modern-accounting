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

/**
 * Get the appropriate tax year based on pay date
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
 * Calculate tax using progressive brackets
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
 * Calculate state income tax withholding
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

  // For simplicity, use the flat rate or top marginal rate
  // In production, you would fetch the actual brackets from the database
  // and calculate progressively for states with graduated rates
  let effectiveRate = stateInfo.rate;

  // Apply a simplified allowance reduction for state tax
  const allowanceReduction = allowances * 2000; // Simplified
  const taxableIncome = Math.max(0, annualGrossPay - allowanceReduction);

  // Calculate annual state tax
  const annualTax = taxableIncome * effectiveRate;

  // Convert back to per-period amount
  const periodTax = annualTax / periodsPerYear;

  return Math.round(periodTax * 100) / 100;
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

  // Check if already hit the wage base
  if (ytdGrossPay >= wageBase) {
    return 0;
  }

  // Calculate taxable amount (may be partial if approaching wage base)
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
  // Standard Medicare tax
  let medicareTax = grossPay * MEDICARE_RATE;

  // Additional Medicare tax for high earners (over $200k YTD)
  const newYtd = ytdGrossPay + grossPay;
  if (newYtd > MEDICARE_ADDITIONAL_THRESHOLD) {
    // Calculate the portion that's subject to additional tax
    const amountOverThreshold = newYtd - MEDICARE_ADDITIONAL_THRESHOLD;
    const additionalTaxableThisPeriod = Math.min(grossPay, amountOverThreshold);
    medicareTax += additionalTaxableThisPeriod * MEDICARE_ADDITIONAL_RATE;
  }

  return Math.round(medicareTax * 100) / 100;
}

/**
 * Calculate complete pay stub for an employee
 */
export function calculatePayStub(
  employee: Employee,
  regularHours: number,
  overtimeHours: number = 0,
  otherEarnings: number = 0,
  otherDeductions: number = 0,
  ytdTotals: YTDTotals = { grossPay: 0, federalWithholding: 0, stateWithholding: 0, socialSecurity: 0, medicare: 0, netPay: 0 },
  payDate: Date = new Date()
): PayStubCalculation {
  // Calculate gross pay
  const { regularPay, overtimePay, grossPay } = calculateGrossPay(
    employee,
    regularHours,
    overtimeHours,
    otherEarnings
  );

  // Calculate deductions
  const federalWithholding = calculateFederalWithholding(
    grossPay,
    employee.PayFrequency,
    employee.FederalFilingStatus,
    employee.FederalAllowances,
    payDate
  );

  const stateWithholding = calculateStateWithholding(
    grossPay,
    employee.PayFrequency,
    employee.StateCode,
    employee.StateFilingStatus || employee.FederalFilingStatus,
    employee.StateAllowances
  );

  const socialSecurity = calculateSocialSecurity(
    grossPay,
    ytdTotals.grossPay,
    payDate
  );

  const medicare = calculateMedicare(
    grossPay,
    ytdTotals.grossPay
  );

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
    socialSecurity,
    medicare,
    otherDeductions,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay: Math.round(netPay * 100) / 100,
  };
}

/**
 * Get default hours for an employee based on pay type and frequency
 */
export function getDefaultHours(employee: Employee): number {
  if (employee.PayType === 'Salary') {
    // Salary employees work standard hours per period
    switch (employee.PayFrequency) {
      case 'Weekly': return 40;
      case 'Biweekly': return 80;
      case 'Semimonthly': return 86.67; // ~2080 hours / 24 periods
      case 'Monthly': return 173.33; // ~2080 hours / 12 periods
      default: return 80;
    }
  } else {
    // Hourly employees need to enter their actual hours
    switch (employee.PayFrequency) {
      case 'Weekly': return 40;
      case 'Biweekly': return 80;
      case 'Semimonthly': return 86.67;
      case 'Monthly': return 173.33;
      default: return 0;
    }
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Generate a unique pay run number
 */
export function generatePayRunNumber(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PR${year}${month}${day}-${random}`;
}

/**
 * Calculate pay period dates based on frequency
 */
export function calculatePayPeriodDates(
  payDate: Date,
  payFrequency: string
): { start: Date; end: Date } {
  const end = new Date(payDate);
  const start = new Date(payDate);

  switch (payFrequency) {
    case 'Weekly':
      start.setDate(end.getDate() - 6);
      break;
    case 'Biweekly':
      start.setDate(end.getDate() - 13);
      break;
    case 'Semimonthly':
      // Either 1st-15th or 16th-end of month
      if (end.getDate() <= 15) {
        start.setDate(1);
        end.setDate(15);
      } else {
        start.setDate(16);
        end.setDate(new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate());
      }
      break;
    case 'Monthly':
      start.setDate(1);
      end.setDate(new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate());
      break;
    default:
      start.setDate(end.getDate() - 13); // Default to biweekly
  }

  return { start, end };
}
