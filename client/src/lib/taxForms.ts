// W-2 and 1099-NEC Tax Form Data Structures and Utilities

/**
 * W-2 Form Data Structure
 * Wage and Tax Statement for employees
 */
export interface W2FormData {
  // Control information
  taxYear: number;
  controlNumber: string; // Box d - Control number (employer assigned)

  // Employer information (Box b, c)
  employerEIN: string; // Box b - Employer identification number
  employerName: string;
  employerAddress: string;
  employerCity: string;
  employerState: string;
  employerZip: string;

  // Employee information (Box a, e, f)
  employeeSSN: string; // Box a - Employee's SSN (masked)
  employeeSSNLast4: string; // For display purposes
  employeeFirstName: string;
  employeeLastName: string;
  employeeAddress: string;
  employeeCity: string;
  employeeState: string;
  employeeZip: string;

  // Wage and Tax boxes
  box1WagesTips: number; // Wages, tips, other compensation
  box2FederalTax: number; // Federal income tax withheld
  box3SocialSecurityWages: number; // Social security wages
  box4SocialSecurityTax: number; // Social security tax withheld
  box5MedicareWages: number; // Medicare wages and tips
  box6MedicareTax: number; // Medicare tax withheld
  box7SocialSecurityTips: number; // Social security tips
  box8AllocatedTips: number; // Allocated tips
  // Box 9 is blank (formerly used for advance EIC)
  box10DependentCareBenefits: number; // Dependent care benefits
  box11NonqualifiedPlans: number; // Nonqualified plans
  box12Codes: W2Box12Entry[]; // Box 12a-12d codes
  box13Statutory: boolean; // Statutory employee
  box13RetirementPlan: boolean; // Retirement plan
  box13ThirdPartySickPay: boolean; // Third-party sick pay

  // State/Local information (Boxes 15-20)
  stateInfo: W2StateInfo[];
  localInfo: W2LocalInfo[];

  // Metadata
  employeeId: string;
  generatedAt: string;
}

export interface W2Box12Entry {
  code: string; // e.g., 'D' for 401(k), 'DD' for health insurance
  amount: number;
}

export interface W2StateInfo {
  state: string; // Box 15 - State abbreviation
  stateEIN: string; // Box 15 - Employer's state ID number
  stateWages: number; // Box 16 - State wages, tips, etc.
  stateTax: number; // Box 17 - State income tax
}

export interface W2LocalInfo {
  localWages: number; // Box 18 - Local wages, tips, etc.
  localTax: number; // Box 19 - Local income tax
  localityName: string; // Box 20 - Locality name
}

/**
 * 1099-NEC Form Data Structure
 * Nonemployee Compensation (for contractors)
 */
export interface Form1099NECData {
  // Control information
  taxYear: number;
  corrected: boolean; // Is this a corrected form?

  // Payer information (company)
  payerName: string;
  payerAddress: string;
  payerCity: string;
  payerState: string;
  payerZip: string;
  payerTIN: string; // Tax Identification Number (EIN)
  payerPhone: string;

  // Recipient information (contractor/vendor)
  recipientTIN: string; // SSN or EIN
  recipientTINType: 'SSN' | 'EIN';
  recipientName: string;
  recipientAddress: string;
  recipientCity: string;
  recipientState: string;
  recipientZip: string;
  accountNumber: string; // Optional account number

  // Income boxes
  box1NonemployeeCompensation: number; // Nonemployee compensation
  box2DirectSalesIndicator: boolean; // $5,000 or more of consumer products
  box4FederalTaxWithheld: number; // Federal income tax withheld

  // State information
  stateInfo: Form1099StateInfo[];

  // Metadata
  vendorId: string;
  generatedAt: string;
}

export interface Form1099StateInfo {
  state: string;
  statePayerNumber: string;
  stateIncome: number;
  stateTaxWithheld: number;
}

/**
 * Calculate annual totals from pay stubs for W-2 generation
 */
export interface AnnualPayrollTotals {
  employeeId: string;
  taxYear: number;
  totalGrossPay: number;
  totalFederalWithholding: number;
  totalStateWithholding: number;
  totalSocialSecurityWages: number;
  totalSocialSecurityTax: number;
  totalMedicareWages: number;
  totalMedicareTax: number;
  totalLocalWithholding: number;
  stateCode: string;
  payStubCount: number;
}

/**
 * Calculate annual payments to a 1099 vendor
 */
export interface AnnualVendorPayments {
  vendorId: string;
  vendorName: string;
  taxYear: number;
  totalPayments: number;
  is1099Vendor: boolean;
  taxId: string;
}

/**
 * W-2 Box 12 common codes reference
 */
export const W2_BOX_12_CODES: Record<string, string> = {
  'A': 'Uncollected social security or RRTA tax on tips',
  'B': 'Uncollected Medicare tax on tips',
  'C': 'Taxable cost of group-term life insurance over $50,000',
  'D': 'Elective deferrals to 401(k) plan',
  'E': 'Elective deferrals to 403(b) plan',
  'F': 'Elective deferrals to 408(k)(6) plan',
  'G': 'Elective deferrals to 457(b) plan',
  'H': 'Elective deferrals to 501(c)(18)(D) plan',
  'J': 'Nontaxable sick pay',
  'K': '20% excise tax on excess golden parachute payments',
  'L': 'Substantiated employee business expense reimbursements',
  'M': 'Uncollected SS/RRTA tax on group-term life insurance',
  'N': 'Uncollected Medicare tax on group-term life insurance',
  'P': 'Excludable moving expense reimbursements',
  'Q': 'Nontaxable combat pay',
  'R': 'Employer contributions to Archer MSA',
  'S': 'Employee salary reduction contributions to SIMPLE',
  'T': 'Adoption benefits',
  'V': 'Income from exercise of nonstatutory stock options',
  'W': 'Employer contributions to HSA',
  'Y': 'Deferrals under 409A nonqualified deferred compensation plan',
  'Z': 'Income under 409A on a nonqualified deferred compensation plan',
  'AA': 'Designated Roth contributions to 401(k) plan',
  'BB': 'Designated Roth contributions to 403(b) plan',
  'DD': 'Cost of employer-sponsored health coverage',
  'EE': 'Designated Roth contributions under governmental 457(b)',
  'FF': 'Permitted benefits under a qualified small employer HRA',
  'GG': 'Income from qualified equity grants under section 83(i)',
  'HH': 'Aggregate deferrals under section 83(i) elections',
};

/**
 * Generate a control number for W-2 forms
 */
export function generateW2ControlNumber(employeeNumber: string, taxYear: number): string {
  const yearPart = taxYear.toString().slice(-2);
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `W2-${yearPart}-${employeeNumber}-${randomPart}`;
}

/**
 * Mask SSN for display (show only last 4 digits)
 */
export function maskSSN(ssnLast4: string): string {
  return `***-**-${ssnLast4}`;
}

/**
 * Format EIN for display
 */
export function formatEIN(ein: string): string {
  if (!ein) return '';
  const cleaned = ein.replace(/\D/g, '');
  if (cleaned.length !== 9) return ein;
  return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
}

/**
 * Validate EIN format (XX-XXXXXXX or 9 digits)
 * Returns { valid: boolean, formatted: string, error?: string }
 */
export function validateEIN(ein: string): { valid: boolean; formatted: string; error?: string } {
  if (!ein) {
    return { valid: false, formatted: '', error: 'EIN is required' };
  }

  const cleaned = ein.replace(/\D/g, '');

  if (cleaned.length !== 9) {
    return {
      valid: false,
      formatted: ein,
      error: 'EIN must be 9 digits (XX-XXXXXXX)',
    };
  }

  // EIN cannot start with 00, 07, 08, 09, 17, 18, 19, 28, 29, 49, 69, 70, 78, 79, or 89
  const prefix = cleaned.slice(0, 2);
  const invalidPrefixes = ['00', '07', '08', '09', '17', '18', '19', '28', '29', '49', '69', '70', '78', '79', '89'];
  if (invalidPrefixes.includes(prefix)) {
    return {
      valid: false,
      formatted: formatEIN(ein),
      error: `Invalid EIN prefix: ${prefix}`,
    };
  }

  return {
    valid: true,
    formatted: `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`,
  };
}

/**
 * Get available tax years for form generation
 * Returns current year and previous 2 years
 */
export function getAvailableTaxYears(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear - 1, currentYear - 2, currentYear - 3].filter(y => y >= 2024);
}

/**
 * Check if 1099-NEC is required (payments >= $600)
 */
export function is1099Required(totalPayments: number): boolean {
  return totalPayments >= 600;
}

/**
 * Format currency for tax forms (no dollar sign, 2 decimals)
 */
export function formatTaxAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Social Security wage base limits by year
 */
export const SOCIAL_SECURITY_WAGE_BASES: Record<number, number> = {
  2024: 168600,
  2025: 176100,
  2026: 180000, // Estimated
};

/**
 * Get Social Security wage base for a given year
 */
export function getSocialSecurityWageBase(year: number): number {
  return SOCIAL_SECURITY_WAGE_BASES[year] || SOCIAL_SECURITY_WAGE_BASES[2025];
}
