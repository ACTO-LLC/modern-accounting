/**
 * Payroll API Service
 *
 * Provides batch payroll calculation via Azure Functions for scalability,
 * with automatic fallback to client-side calculation if the function is unavailable.
 *
 * Usage:
 * - For large pay runs (500+ employees): Uses Azure Function for server-side calculation
 * - For single-employee preview: Uses client-side calculation for immediate feedback
 * - Automatic fallback: If Azure Function is unavailable, falls back to client-side
 */

import api from './api';
import {
  calculatePayStub as calculatePayStubLocal,
  Employee,
  PayStubCalculation,
  YTDTotals,
  WorkStateAllocation,
  ReciprocityAgreement,
} from './payrollCalculations';

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
  source: 'azure-function' | 'client-side';
}

// Threshold for using Azure Function vs client-side calculation
const BATCH_THRESHOLD = 50; // Use Azure Function for 50+ employees

// Track Azure Function availability
let functionAvailable = true;
let lastCheckTime = 0;
const AVAILABILITY_CHECK_INTERVAL = 60000; // 1 minute

/**
 * Calculate a single pay stub (client-side for immediate preview)
 * This is used for real-time calculation when editing hours in the UI.
 */
export function calculateSinglePayStub(
  input: EmployeePayInput,
  payDate: Date = new Date()
): PayStubCalculation {
  return calculatePayStubLocal(
    input.employee,
    input.regularHours,
    input.overtimeHours,
    input.otherEarnings,
    input.otherDeductions,
    input.ytdTotals || {
      grossPay: 0,
      federalWithholding: 0,
      stateWithholding: 0,
      socialSecurity: 0,
      medicare: 0,
      netPay: 0,
    },
    payDate,
    input.workStates && input.workStates.length > 0
      ? { workStates: input.workStates, reciprocityAgreements: input.reciprocityAgreements }
      : undefined
  );
}

/**
 * Calculate batch payroll via Azure Function with fallback to client-side
 */
export async function calculateBatchPayroll(
  request: BatchPayrollRequest
): Promise<BatchPayrollResponse> {
  const startTime = Date.now();

  // For small batches, use client-side calculation
  if (request.employees.length < BATCH_THRESHOLD) {
    return calculateBatchLocally(request, startTime);
  }

  // Check if we should try Azure Function
  const now = Date.now();
  if (!functionAvailable && now - lastCheckTime < AVAILABILITY_CHECK_INTERVAL) {
    // Azure Function was recently unavailable, use client-side
    console.log('Azure Function recently unavailable, using client-side calculation');
    return calculateBatchLocally(request, startTime);
  }

  try {
    // Try Azure Function
    const response = await api.post('/functions/payroll/calculate', request, {
      timeout: 30000, // 30 second timeout for large batches
    });

    // Mark function as available
    functionAvailable = true;
    lastCheckTime = now;

    return {
      ...response.data,
      source: 'azure-function',
    };
  } catch (error) {
    // Mark function as unavailable and fall back to client-side
    functionAvailable = false;
    lastCheckTime = now;

    console.warn('Azure Function unavailable, falling back to client-side calculation:', error);
    return calculateBatchLocally(request, startTime);
  }
}

/**
 * Calculate batch payroll using client-side logic
 */
function calculateBatchLocally(
  request: BatchPayrollRequest,
  startTime: number
): BatchPayrollResponse {
  const payDate = new Date(request.payDate);
  const results: PayStubCalculation[] = [];

  let totalGrossPay = 0;
  let totalDeductions = 0;
  let totalNetPay = 0;

  for (const input of request.employees) {
    const stub = calculateSinglePayStub(input, payDate);
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
    source: 'client-side',
  };
}

/**
 * Check if Azure Function is available
 */
export function isAzureFunctionAvailable(): boolean {
  return functionAvailable;
}

/**
 * Get the batch calculation threshold
 */
export function getBatchThreshold(): number {
  return BATCH_THRESHOLD;
}

/**
 * Force a refresh of Azure Function availability status
 */
export function resetFunctionAvailability(): void {
  functionAvailable = true;
  lastCheckTime = 0;
}
