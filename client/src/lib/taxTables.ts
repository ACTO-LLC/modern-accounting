// Tax Tables for 2024 and 2025 US Federal Income Tax

export interface TaxBracket {
  min: number;
  max: number | null; // null means no upper limit
  rate: number;
  flatAmount: number; // Base tax amount for this bracket
}

export interface TaxTable {
  [filingStatus: string]: TaxBracket[];
}

// 2024 Federal Income Tax Brackets
export const FEDERAL_TAX_2024: TaxTable = {
  Single: [
    { min: 0, max: 11600, rate: 0.10, flatAmount: 0 },
    { min: 11600, max: 47150, rate: 0.12, flatAmount: 1160 },
    { min: 47150, max: 100525, rate: 0.22, flatAmount: 5426 },
    { min: 100525, max: 191950, rate: 0.24, flatAmount: 17168.50 },
    { min: 191950, max: 243725, rate: 0.32, flatAmount: 39110.50 },
    { min: 243725, max: 609350, rate: 0.35, flatAmount: 55678.50 },
    { min: 609350, max: null, rate: 0.37, flatAmount: 183647.25 },
  ],
  MarriedFilingJointly: [
    { min: 0, max: 23200, rate: 0.10, flatAmount: 0 },
    { min: 23200, max: 94300, rate: 0.12, flatAmount: 2320 },
    { min: 94300, max: 201050, rate: 0.22, flatAmount: 10852 },
    { min: 201050, max: 383900, rate: 0.24, flatAmount: 34337 },
    { min: 383900, max: 487450, rate: 0.32, flatAmount: 78221 },
    { min: 487450, max: 731200, rate: 0.35, flatAmount: 111357 },
    { min: 731200, max: null, rate: 0.37, flatAmount: 196669.50 },
  ],
  MarriedFilingSeparately: [
    { min: 0, max: 11600, rate: 0.10, flatAmount: 0 },
    { min: 11600, max: 47150, rate: 0.12, flatAmount: 1160 },
    { min: 47150, max: 100525, rate: 0.22, flatAmount: 5426 },
    { min: 100525, max: 191950, rate: 0.24, flatAmount: 17168.50 },
    { min: 191950, max: 243725, rate: 0.32, flatAmount: 39110.50 },
    { min: 243725, max: 365600, rate: 0.35, flatAmount: 55678.50 },
    { min: 365600, max: null, rate: 0.37, flatAmount: 98334.75 },
  ],
  HeadOfHousehold: [
    { min: 0, max: 16550, rate: 0.10, flatAmount: 0 },
    { min: 16550, max: 63100, rate: 0.12, flatAmount: 1655 },
    { min: 63100, max: 100500, rate: 0.22, flatAmount: 7241 },
    { min: 100500, max: 191950, rate: 0.24, flatAmount: 15469 },
    { min: 191950, max: 243700, rate: 0.32, flatAmount: 37417 },
    { min: 243700, max: 609350, rate: 0.35, flatAmount: 53977 },
    { min: 609350, max: null, rate: 0.37, flatAmount: 181954.50 },
  ],
};

// 2025 Federal Income Tax Brackets
export const FEDERAL_TAX_2025: TaxTable = {
  Single: [
    { min: 0, max: 11925, rate: 0.10, flatAmount: 0 },
    { min: 11925, max: 48475, rate: 0.12, flatAmount: 1192.50 },
    { min: 48475, max: 103350, rate: 0.22, flatAmount: 5578.50 },
    { min: 103350, max: 197300, rate: 0.24, flatAmount: 17651 },
    { min: 197300, max: 250525, rate: 0.32, flatAmount: 40199 },
    { min: 250525, max: 626350, rate: 0.35, flatAmount: 57231 },
    { min: 626350, max: null, rate: 0.37, flatAmount: 188769.75 },
  ],
  MarriedFilingJointly: [
    { min: 0, max: 23850, rate: 0.10, flatAmount: 0 },
    { min: 23850, max: 96950, rate: 0.12, flatAmount: 2385 },
    { min: 96950, max: 206700, rate: 0.22, flatAmount: 11157 },
    { min: 206700, max: 394600, rate: 0.24, flatAmount: 35302 },
    { min: 394600, max: 501050, rate: 0.32, flatAmount: 80398 },
    { min: 501050, max: 751600, rate: 0.35, flatAmount: 114462 },
    { min: 751600, max: null, rate: 0.37, flatAmount: 202154.50 },
  ],
  MarriedFilingSeparately: [
    { min: 0, max: 11925, rate: 0.10, flatAmount: 0 },
    { min: 11925, max: 48475, rate: 0.12, flatAmount: 1192.50 },
    { min: 48475, max: 103350, rate: 0.22, flatAmount: 5578.50 },
    { min: 103350, max: 197300, rate: 0.24, flatAmount: 17651 },
    { min: 197300, max: 250525, rate: 0.32, flatAmount: 40199 },
    { min: 250525, max: 375800, rate: 0.35, flatAmount: 57231 },
    { min: 375800, max: null, rate: 0.37, flatAmount: 101077.25 },
  ],
  HeadOfHousehold: [
    { min: 0, max: 17000, rate: 0.10, flatAmount: 0 },
    { min: 17000, max: 64850, rate: 0.12, flatAmount: 1700 },
    { min: 64850, max: 103350, rate: 0.22, flatAmount: 7442 },
    { min: 103350, max: 197300, rate: 0.24, flatAmount: 15912 },
    { min: 197300, max: 250500, rate: 0.32, flatAmount: 38460 },
    { min: 250500, max: 626350, rate: 0.35, flatAmount: 55484 },
    { min: 626350, max: null, rate: 0.37, flatAmount: 187031.50 },
  ],
};

// Social Security Wage Base
export const SOCIAL_SECURITY_WAGE_BASE: { [year: number]: number } = {
  2024: 168600,
  2025: 176100,
};

// Social Security Rate (employee portion)
export const SOCIAL_SECURITY_RATE = 0.062; // 6.2%

// Medicare Rates
export const MEDICARE_RATE = 0.0145; // 1.45%
export const MEDICARE_ADDITIONAL_RATE = 0.009; // 0.9% additional over $200k
export const MEDICARE_ADDITIONAL_THRESHOLD = 200000;

// State Tax Rates (flat-rate states and no-tax states)
export interface StateTaxInfo {
  rate: number;
  hasProgressiveTax: boolean;
  name: string;
}

export const STATE_TAX_RATES: { [stateCode: string]: StateTaxInfo } = {
  // No state income tax
  AK: { rate: 0, hasProgressiveTax: false, name: 'Alaska' },
  FL: { rate: 0, hasProgressiveTax: false, name: 'Florida' },
  NV: { rate: 0, hasProgressiveTax: false, name: 'Nevada' },
  NH: { rate: 0, hasProgressiveTax: false, name: 'New Hampshire' },
  SD: { rate: 0, hasProgressiveTax: false, name: 'South Dakota' },
  TN: { rate: 0, hasProgressiveTax: false, name: 'Tennessee' },
  TX: { rate: 0, hasProgressiveTax: false, name: 'Texas' },
  WA: { rate: 0, hasProgressiveTax: false, name: 'Washington' },
  WY: { rate: 0, hasProgressiveTax: false, name: 'Wyoming' },

  // Flat-rate states
  AZ: { rate: 0.025, hasProgressiveTax: false, name: 'Arizona' },
  CO: { rate: 0.044, hasProgressiveTax: false, name: 'Colorado' },
  IL: { rate: 0.0495, hasProgressiveTax: false, name: 'Illinois' },
  IN: { rate: 0.0305, hasProgressiveTax: false, name: 'Indiana' },
  KY: { rate: 0.04, hasProgressiveTax: false, name: 'Kentucky' },
  MA: { rate: 0.05, hasProgressiveTax: false, name: 'Massachusetts' },
  MI: { rate: 0.0425, hasProgressiveTax: false, name: 'Michigan' },
  MS: { rate: 0.05, hasProgressiveTax: false, name: 'Mississippi' },
  NC: { rate: 0.0475, hasProgressiveTax: false, name: 'North Carolina' },
  PA: { rate: 0.0307, hasProgressiveTax: false, name: 'Pennsylvania' },
  UT: { rate: 0.0465, hasProgressiveTax: false, name: 'Utah' },

  // Progressive tax states (will fetch from DB or use simplified rates)
  AL: { rate: 0.05, hasProgressiveTax: true, name: 'Alabama' },
  AR: { rate: 0.044, hasProgressiveTax: true, name: 'Arkansas' },
  CA: { rate: 0.093, hasProgressiveTax: true, name: 'California' }, // Top marginal rate for reference
  CT: { rate: 0.0699, hasProgressiveTax: true, name: 'Connecticut' },
  DC: { rate: 0.1075, hasProgressiveTax: true, name: 'District of Columbia' },
  DE: { rate: 0.066, hasProgressiveTax: true, name: 'Delaware' },
  GA: { rate: 0.055, hasProgressiveTax: true, name: 'Georgia' },
  HI: { rate: 0.11, hasProgressiveTax: true, name: 'Hawaii' },
  ID: { rate: 0.058, hasProgressiveTax: true, name: 'Idaho' },
  IA: { rate: 0.0574, hasProgressiveTax: true, name: 'Iowa' },
  KS: { rate: 0.057, hasProgressiveTax: true, name: 'Kansas' },
  LA: { rate: 0.0425, hasProgressiveTax: true, name: 'Louisiana' },
  ME: { rate: 0.0715, hasProgressiveTax: true, name: 'Maine' },
  MD: { rate: 0.0575, hasProgressiveTax: true, name: 'Maryland' },
  MN: { rate: 0.0985, hasProgressiveTax: true, name: 'Minnesota' },
  MO: { rate: 0.048, hasProgressiveTax: true, name: 'Missouri' },
  MT: { rate: 0.059, hasProgressiveTax: true, name: 'Montana' },
  NE: { rate: 0.0584, hasProgressiveTax: true, name: 'Nebraska' },
  NJ: { rate: 0.1075, hasProgressiveTax: true, name: 'New Jersey' },
  NM: { rate: 0.059, hasProgressiveTax: true, name: 'New Mexico' },
  NY: { rate: 0.109, hasProgressiveTax: true, name: 'New York' },
  ND: { rate: 0.0252, hasProgressiveTax: true, name: 'North Dakota' },
  OH: { rate: 0.035, hasProgressiveTax: true, name: 'Ohio' },
  OK: { rate: 0.0475, hasProgressiveTax: true, name: 'Oklahoma' },
  OR: { rate: 0.099, hasProgressiveTax: true, name: 'Oregon' },
  RI: { rate: 0.0599, hasProgressiveTax: true, name: 'Rhode Island' },
  SC: { rate: 0.064, hasProgressiveTax: true, name: 'South Carolina' },
  VT: { rate: 0.0875, hasProgressiveTax: true, name: 'Vermont' },
  VA: { rate: 0.0575, hasProgressiveTax: true, name: 'Virginia' },
  WV: { rate: 0.0512, hasProgressiveTax: true, name: 'West Virginia' },
  WI: { rate: 0.0765, hasProgressiveTax: true, name: 'Wisconsin' },
};

// Pay frequency divisors (for converting annual salary to per-period)
export const PAY_FREQUENCY_DIVISORS: { [frequency: string]: number } = {
  Weekly: 52,
  Biweekly: 26,
  Semimonthly: 24,
  Monthly: 12,
};

// Standard deduction amounts (2024)
export const STANDARD_DEDUCTION_2024: { [filingStatus: string]: number } = {
  Single: 14600,
  MarriedFilingJointly: 29200,
  MarriedFilingSeparately: 14600,
  HeadOfHousehold: 21900,
};

// Standard deduction amounts (2025)
export const STANDARD_DEDUCTION_2025: { [filingStatus: string]: number } = {
  Single: 15000,
  MarriedFilingJointly: 30000,
  MarriedFilingSeparately: 15000,
  HeadOfHousehold: 22500,
};
