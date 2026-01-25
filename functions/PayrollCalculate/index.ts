import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  calculateBatchPayroll,
  BatchPayrollRequest,
  BatchPayrollResponse,
} from "../shared/payrollCalculator";

/**
 * In-memory cache for tax brackets
 * In production, this could be backed by Azure Redis Cache for distributed scenarios
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TaxBracketCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_TTL_MS = 3600000; // 1 hour

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number = this.DEFAULT_TTL_MS): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Global cache instance (persists across function invocations in the same host)
const taxBracketCache = new TaxBracketCache();

/**
 * Validate incoming batch payroll request
 */
function validateRequest(body: any): { valid: boolean; error?: string } {
  if (!body) {
    return { valid: false, error: "Request body is required" };
  }

  if (!body.payRunId || typeof body.payRunId !== "string") {
    return { valid: false, error: "payRunId is required and must be a string" };
  }

  if (!body.payDate || typeof body.payDate !== "string") {
    return { valid: false, error: "payDate is required and must be a string" };
  }

  // Validate date format
  const payDate = new Date(body.payDate);
  if (isNaN(payDate.getTime())) {
    return { valid: false, error: "payDate must be a valid date string" };
  }

  if (!body.employees || !Array.isArray(body.employees)) {
    return { valid: false, error: "employees is required and must be an array" };
  }

  if (body.employees.length === 0) {
    return { valid: false, error: "employees array cannot be empty" };
  }

  // Validate each employee
  for (let i = 0; i < body.employees.length; i++) {
    const emp = body.employees[i];

    if (!emp.employee || typeof emp.employee !== "object") {
      return { valid: false, error: `employees[${i}].employee is required and must be an object` };
    }

    if (!emp.employee.Id) {
      return { valid: false, error: `employees[${i}].employee.Id is required` };
    }

    if (typeof emp.regularHours !== "number" || emp.regularHours < 0) {
      return { valid: false, error: `employees[${i}].regularHours must be a non-negative number` };
    }
  }

  return { valid: true };
}

/**
 * Azure Function: POST /api/payroll/calculate
 *
 * Calculates pay stubs for a batch of employees with tax withholdings.
 * Optimized for large pay runs (500+ employees) with:
 * - In-memory caching for tax brackets
 * - Parallel processing capability
 * - Performance metrics in response
 *
 * Request Body:
 * {
 *   "payRunId": "PR20260115-001",
 *   "payDate": "2026-01-15",
 *   "employees": [
 *     {
 *       "employee": { ... employee object ... },
 *       "regularHours": 80,
 *       "overtimeHours": 0,
 *       "otherEarnings": 0,
 *       "otherDeductions": 0,
 *       "ytdTotals": { ... optional YTD totals ... }
 *     }
 *   ]
 * }
 *
 * Response:
 * {
 *   "payRunId": "PR20260115-001",
 *   "payDate": "2026-01-15",
 *   "results": [ ... pay stub calculations ... ],
 *   "summary": {
 *     "employeeCount": 500,
 *     "totalGrossPay": 500000.00,
 *     "totalDeductions": 125000.00,
 *     "totalNetPay": 375000.00,
 *     "processingTimeMs": 150
 *   },
 *   "cacheStats": { "size": 5, "keys": [...] }
 * }
 */
async function payrollCalculate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("PayrollCalculate function processing request");
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json() as Record<string, any>;

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return {
        status: 400,
        jsonBody: { error: validation.error },
      };
    }

    const payrollRequest: BatchPayrollRequest = {
      payRunId: body.payRunId as string,
      payDate: body.payDate as string,
      employees: body.employees as any[],
    };

    // Log request stats
    context.log(`Processing pay run ${payrollRequest.payRunId} with ${payrollRequest.employees.length} employees`);

    // Calculate payroll
    const response: BatchPayrollResponse = calculateBatchPayroll(payrollRequest);

    // Log performance
    const totalTime = Date.now() - startTime;
    context.log(`Pay run ${payrollRequest.payRunId} completed in ${totalTime}ms (calc: ${response.summary.processingTimeMs}ms)`);

    // Return success response with cache stats for monitoring
    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Processing-Time-Ms": String(totalTime),
        "X-Employee-Count": String(response.summary.employeeCount),
      },
      jsonBody: {
        ...response,
        cacheStats: taxBracketCache.getStats(),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    context.error(`PayrollCalculate error: ${errorMessage}`);

    return {
      status: 500,
      jsonBody: {
        error: "Internal server error",
        message: errorMessage,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Register the function with Azure Functions runtime
app.http("payrollCalculate", {
  methods: ["POST"],
  authLevel: "function",
  route: "payroll/calculate",
  handler: payrollCalculate,
});

export default payrollCalculate;
