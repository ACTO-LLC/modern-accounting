import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Azure Functions SDK
vi.mock('@azure/functions', () => ({
  app: {
    http: vi.fn(),
  },
  HttpRequest: class MockHttpRequest {
    constructor(public options: any) {}
    async json() {
      return this.options.body;
    }
  },
}));

// Import after mocking
import payrollCalculate from '../PayrollCalculate/index';

// Helper to create mock context
function createMockContext() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

// Helper to create mock request
function createMockRequest(body: any) {
  return {
    json: async () => body,
    method: 'POST',
  };
}

describe('payrollCalculate HTTP Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for empty body', async () => {
    const request = createMockRequest(null);
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toHaveProperty('error');
  });

  it('returns 400 for missing payRunId', async () => {
    const request = createMockRequest({
      payDate: '2025-01-15',
      employees: [],
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(400);
    expect(result.jsonBody?.error).toContain('payRunId');
  });

  it('returns 400 for missing payDate', async () => {
    const request = createMockRequest({
      payRunId: 'PR001',
      employees: [],
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(400);
    expect(result.jsonBody?.error).toContain('payDate');
  });

  it('returns 400 for empty employees array', async () => {
    const request = createMockRequest({
      payRunId: 'PR001',
      payDate: '2025-01-15',
      employees: [],
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(400);
    expect(result.jsonBody?.error).toContain('empty');
  });

  it('returns 400 for invalid employee data', async () => {
    const request = createMockRequest({
      payRunId: 'PR001',
      payDate: '2025-01-15',
      employees: [
        {
          employee: null,
          regularHours: 80,
          overtimeHours: 0,
          otherEarnings: 0,
          otherDeductions: 0,
        },
      ],
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(400);
    expect(result.jsonBody?.error).toContain('employee');
  });

  it('returns 400 for negative hours', async () => {
    const request = createMockRequest({
      payRunId: 'PR001',
      payDate: '2025-01-15',
      employees: [
        {
          employee: {
            Id: 'emp-001',
            EmployeeNumber: 'E001',
            FirstName: 'John',
            LastName: 'Doe',
            PayType: 'Hourly',
            PayRate: 25,
            PayFrequency: 'Biweekly',
            FederalFilingStatus: 'Single',
            FederalAllowances: 0,
            StateAllowances: 0,
          },
          regularHours: -10,
          overtimeHours: 0,
          otherEarnings: 0,
          otherDeductions: 0,
        },
      ],
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(400);
    expect(result.jsonBody?.error).toContain('regularHours');
  });

  it('returns 200 with calculated payroll for valid request', async () => {
    const request = createMockRequest({
      payRunId: 'PR001',
      payDate: '2025-01-15',
      employees: [
        {
          employee: {
            Id: 'emp-001',
            EmployeeNumber: 'E001',
            FirstName: 'John',
            LastName: 'Doe',
            PayType: 'Hourly',
            PayRate: 25,
            PayFrequency: 'Biweekly',
            FederalFilingStatus: 'Single',
            FederalAllowances: 1,
            StateCode: 'TX',
            StateAllowances: 0,
          },
          regularHours: 80,
          overtimeHours: 10,
          otherEarnings: 100,
          otherDeductions: 50,
        },
      ],
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toHaveProperty('payRunId', 'PR001');
    expect(result.jsonBody).toHaveProperty('payDate', '2025-01-15');
    expect(result.jsonBody).toHaveProperty('results');
    expect(result.jsonBody?.results).toHaveLength(1);
    expect(result.jsonBody).toHaveProperty('summary');
    expect(result.jsonBody?.summary.employeeCount).toBe(1);
    expect(result.jsonBody?.summary.totalGrossPay).toBeGreaterThan(0);
    expect(result.headers?.['X-Processing-Time-Ms']).toBeDefined();
  });

  it('includes cache stats in response', async () => {
    const request = createMockRequest({
      payRunId: 'PR001',
      payDate: '2025-01-15',
      employees: [
        {
          employee: {
            Id: 'emp-001',
            EmployeeNumber: 'E001',
            FirstName: 'John',
            LastName: 'Doe',
            PayType: 'Hourly',
            PayRate: 25,
            PayFrequency: 'Biweekly',
            FederalFilingStatus: 'Single',
            FederalAllowances: 1,
            StateCode: 'TX',
            StateAllowances: 0,
          },
          regularHours: 80,
          overtimeHours: 0,
          otherEarnings: 0,
          otherDeductions: 0,
        },
      ],
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toHaveProperty('cacheStats');
    expect(result.jsonBody?.cacheStats).toHaveProperty('size');
    expect(result.jsonBody?.cacheStats).toHaveProperty('keys');
  });

  it('handles multiple employees', async () => {
    const employees = [
      {
        employee: {
          Id: 'emp-001',
          EmployeeNumber: 'E001',
          FirstName: 'John',
          LastName: 'Doe',
          PayType: 'Hourly',
          PayRate: 25,
          PayFrequency: 'Biweekly',
          FederalFilingStatus: 'Single',
          FederalAllowances: 1,
          StateCode: 'TX',
          StateAllowances: 0,
        },
        regularHours: 80,
        overtimeHours: 0,
        otherEarnings: 0,
        otherDeductions: 0,
      },
      {
        employee: {
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
          StateAllowances: 2,
        },
        regularHours: 80,
        overtimeHours: 0,
        otherEarnings: 0,
        otherDeductions: 200,
      },
    ];

    const request = createMockRequest({
      payRunId: 'PR002',
      payDate: '2025-01-15',
      employees,
    });
    const context = createMockContext();

    const result = await payrollCalculate(request as any, context as any);

    expect(result.status).toBe(200);
    expect(result.jsonBody?.results).toHaveLength(2);
    expect(result.jsonBody?.summary.employeeCount).toBe(2);

    // Verify individual calculations
    const emp1 = result.jsonBody?.results.find((r: any) => r.employeeId === 'emp-001');
    const emp2 = result.jsonBody?.results.find((r: any) => r.employeeId === 'emp-002');

    expect(emp1).toBeDefined();
    expect(emp2).toBeDefined();
    expect(emp1.grossPay).toBe(2000); // 80 * 25
    expect(emp2.grossPay).toBeCloseTo(2884.62, 1); // 75000 / 26
  });
});
