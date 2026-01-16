import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calculator, CheckCircle, DollarSign, AlertCircle, FileText } from 'lucide-react';
import api from '../lib/api';
import {
  calculatePayStub,
  formatCurrency,
  getDefaultHours,
  Employee,
  PayStubCalculation,
  YTDTotals,
} from '../lib/payrollCalculations';

interface PayRun {
  Id: string;
  PayRunNumber: string;
  PayPeriodStart: string;
  PayPeriodEnd: string;
  PayDate: string;
  Status: string;
  TotalGrossPay: number;
  TotalDeductions: number;
  TotalNetPay: number;
  EmployeeCount: number;
}

interface PayStub {
  Id: string;
  PayRunId: string;
  EmployeeId: string;
  EmployeeName: string;
  EmployeeNumber: string;
  RegularHours: number;
  OvertimeHours: number;
  RegularPay: number;
  OvertimePay: number;
  OtherEarnings: number;
  GrossPay: number;
  FederalWithholding: number;
  StateWithholding: number;
  SocialSecurity: number;
  Medicare: number;
  OtherDeductions: number;
  TotalDeductions: number;
  NetPay: number;
  Status: string;
}

interface EmployeeHours {
  employeeId: string;
  regularHours: number;
  overtimeHours: number;
  otherEarnings: number;
  otherDeductions: number;
}

export default function PayRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [employeeHours, setEmployeeHours] = useState<{ [key: string]: EmployeeHours }>({});
  const [calculatedStubs, setCalculatedStubs] = useState<{ [key: string]: PayStubCalculation }>({});

  // Fetch pay run
  const { data: payRun, isLoading: payRunLoading, error: payRunError } = useQuery({
    queryKey: ['payrun', id],
    queryFn: async () => {
      const response = await api.get<{ value: PayRun[] }>(`/payruns?$filter=Id eq ${id}`);
      return response.data.value[0];
    },
    enabled: !!id
  });

  // Fetch active employees
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: async () => {
      const response = await api.get<{ value: Employee[] }>(`/employees?$filter=Status eq 'Active'&$orderby=LastName,FirstName`);
      return response.data.value;
    }
  });

  // Fetch existing pay stubs for this pay run
  const { data: existingStubs } = useQuery({
    queryKey: ['paystubs', id],
    queryFn: async () => {
      const response = await api.get<{ value: PayStub[] }>(`/paystubs?$filter=PayRunId eq ${id}`);
      return response.data.value;
    },
    enabled: !!id
  });

  // Initialize employee hours when employees are loaded
  useEffect(() => {
    if (employees && !Object.keys(employeeHours).length) {
      const initial: { [key: string]: EmployeeHours } = {};
      employees.forEach(emp => {
        // Check if there's an existing stub for this employee
        const existingStub = existingStubs?.find(s => s.EmployeeId === emp.Id);
        if (existingStub) {
          initial[emp.Id] = {
            employeeId: emp.Id,
            regularHours: existingStub.RegularHours,
            overtimeHours: existingStub.OvertimeHours,
            otherEarnings: existingStub.OtherEarnings,
            otherDeductions: existingStub.OtherDeductions,
          };
        } else {
          initial[emp.Id] = {
            employeeId: emp.Id,
            regularHours: getDefaultHours(emp),
            overtimeHours: 0,
            otherEarnings: 0,
            otherDeductions: 0,
          };
        }
      });
      setEmployeeHours(initial);
    }
  }, [employees, existingStubs]);

  // Calculate all pay stubs
  const handleCalculate = () => {
    if (!employees || !payRun) return;

    const payDate = new Date(payRun.PayDate);
    const stubs: { [key: string]: PayStubCalculation } = {};

    employees.forEach(emp => {
      const hours = employeeHours[emp.Id] || {
        regularHours: getDefaultHours(emp),
        overtimeHours: 0,
        otherEarnings: 0,
        otherDeductions: 0,
      };

      // TODO: Fetch actual YTD totals from previous pay stubs
      const ytdTotals: YTDTotals = {
        grossPay: 0,
        federalWithholding: 0,
        stateWithholding: 0,
        socialSecurity: 0,
        medicare: 0,
        netPay: 0,
      };

      const stub = calculatePayStub(
        emp,
        hours.regularHours,
        hours.overtimeHours,
        hours.otherEarnings,
        hours.otherDeductions,
        ytdTotals,
        payDate
      );

      stubs[emp.Id] = stub;
    });

    setCalculatedStubs(stubs);
  };

  // Save pay stubs and update pay run totals
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!payRun || !employees) throw new Error('Missing data');

      // Calculate totals
      let totalGross = 0;
      let totalDeductions = 0;
      let totalNet = 0;

      const stubsToSave = employees.map(emp => {
        const stub = calculatedStubs[emp.Id];
        if (!stub) throw new Error(`Missing calculation for ${emp.Id}`);

        totalGross += stub.grossPay;
        totalDeductions += stub.totalDeductions;
        totalNet += stub.netPay;

        // Check if stub already exists
        const existingStub = existingStubs?.find(s => s.EmployeeId === emp.Id);

        return {
          Id: existingStub?.Id,
          PayRunId: payRun.Id,
          EmployeeId: emp.Id,
          RegularHours: stub.regularHours,
          OvertimeHours: stub.overtimeHours,
          RegularPay: stub.regularPay,
          OvertimePay: stub.overtimePay,
          OtherEarnings: stub.otherEarnings,
          GrossPay: stub.grossPay,
          FederalWithholding: stub.federalWithholding,
          StateWithholding: stub.stateWithholding,
          SocialSecurity: stub.socialSecurity,
          Medicare: stub.medicare,
          OtherDeductions: stub.otherDeductions,
          TotalDeductions: stub.totalDeductions,
          NetPay: stub.netPay,
          YTDGrossPay: stub.grossPay, // Simplified - should be cumulative
          YTDFederalWithholding: stub.federalWithholding,
          YTDStateWithholding: stub.stateWithholding,
          YTDSocialSecurity: stub.socialSecurity,
          YTDMedicare: stub.medicare,
          YTDNetPay: stub.netPay,
          PaymentMethod: 'DirectDeposit',
          Status: 'Pending',
        };
      });

      // Save each pay stub
      for (const stub of stubsToSave) {
        if (stub.Id) {
          await api.patch(`/paystubs_write/Id/${stub.Id}`, stub);
        } else {
          await api.post('/paystubs_write', stub);
        }
      }

      // Update pay run totals
      await api.patch(`/payruns_write/Id/${payRun.Id}`, {
        TotalGrossPay: totalGross,
        TotalDeductions: totalDeductions,
        TotalNetPay: totalNet,
        EmployeeCount: employees.length,
        Status: 'Processing',
        ProcessedAt: new Date().toISOString(),
        ProcessedBy: 'System', // TODO: Get actual user
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrun', id] });
      queryClient.invalidateQueries({ queryKey: ['paystubs', id] });
      queryClient.invalidateQueries({ queryKey: ['payruns'] });
    },
    onError: (error) => {
      console.error('Failed to save pay stubs:', error);
      alert('Failed to save pay run calculations');
    }
  });

  // Approve pay run
  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!payRun) throw new Error('Missing pay run');
      await api.patch(`/payruns_write/Id/${payRun.Id}`, {
        Status: 'Approved',
        ApprovedAt: new Date().toISOString(),
        ApprovedBy: 'System', // TODO: Get actual user
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrun', id] });
      queryClient.invalidateQueries({ queryKey: ['payruns'] });
    },
    onError: (error) => {
      console.error('Failed to approve pay run:', error);
      alert('Failed to approve pay run');
    }
  });

  const updateHours = (employeeId: string, field: keyof EmployeeHours, value: number) => {
    setEmployeeHours(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: value,
      }
    }));
    // Clear calculated results when hours change
    setCalculatedStubs(prev => {
      const { [employeeId]: _, ...rest } = prev;
      return rest;
    });
  };

  if (payRunLoading || employeesLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (payRunError || !payRun) {
    return <div className="p-4 text-red-600">Error loading pay run</div>;
  }

  const isDraft = payRun.Status === 'Draft';
  const isProcessing = payRun.Status === 'Processing';
  const isApproved = payRun.Status === 'Approved';
  const canEdit = isDraft || isProcessing;
  const hasCalculations = Object.keys(calculatedStubs).length > 0;

  // Calculate totals from current calculations
  const totals = Object.values(calculatedStubs).reduce(
    (acc, stub) => ({
      grossPay: acc.grossPay + stub.grossPay,
      totalDeductions: acc.totalDeductions + stub.totalDeductions,
      netPay: acc.netPay + stub.netPay,
    }),
    { grossPay: 0, totalDeductions: 0, netPay: 0 }
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => navigate('/payruns')} className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Pay Run {payRun.PayRunNumber}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Period: {new Date(payRun.PayPeriodStart).toLocaleDateString()} - {new Date(payRun.PayPeriodEnd).toLocaleDateString()} | Pay Date: {new Date(payRun.PayDate).toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          isDraft ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
          isProcessing ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' :
          isApproved ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
          'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300'
        }`}>
          {payRun.Status}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Gross Pay</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(hasCalculations ? totals.grossPay : payRun.TotalGrossPay)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
              <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Deductions</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(hasCalculations ? totals.totalDeductions : payRun.TotalDeductions)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Net Pay</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatCurrency(hasCalculations ? totals.netPay : payRun.TotalNetPay)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Employees</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {employees?.length || payRun.EmployeeCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCalculate}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Calculator className="w-4 h-4 mr-2" />
            Calculate Payroll
          </button>
          {hasCalculations && (
            <>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Saving...' : 'Save Calculations'}
              </button>
              {isProcessing && (
                <button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {approveMutation.isPending ? 'Approving...' : 'Approve Pay Run'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Employee Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pay Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Regular Hrs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">OT Hrs</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gross Pay</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Federal</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">State</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">SS/Med</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Pay</th>
                {isApproved && <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stub</th>}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {employees?.map(emp => {
                const hours = employeeHours[emp.Id] || { regularHours: 0, overtimeHours: 0 };
                const stub = calculatedStubs[emp.Id];
                const existingStub = existingStubs?.find(s => s.EmployeeId === emp.Id);

                return (
                  <tr key={emp.Id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{emp.FirstName} {emp.LastName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{emp.EmployeeNumber}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {emp.PayType}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {canEdit ? (
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={hours.regularHours}
                          onChange={(e) => updateHours(emp.Id, 'regularHours', parseFloat(e.target.value) || 0)}
                          className="w-20 text-right rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{existingStub?.RegularHours || hours.regularHours}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {canEdit ? (
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={hours.overtimeHours}
                          onChange={(e) => updateHours(emp.Id, 'overtimeHours', parseFloat(e.target.value) || 0)}
                          className="w-20 text-right rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
                          disabled={emp.PayType === 'Salary'}
                        />
                      ) : (
                        <span className="text-sm text-gray-900 dark:text-white">{existingStub?.OvertimeHours || hours.overtimeHours}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                      {stub ? formatCurrency(stub.grossPay) : existingStub ? formatCurrency(existingStub.GrossPay) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                      {stub ? formatCurrency(stub.federalWithholding) : existingStub ? formatCurrency(existingStub.FederalWithholding) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                      {stub ? formatCurrency(stub.stateWithholding) : existingStub ? formatCurrency(existingStub.StateWithholding) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-gray-500 dark:text-gray-400">
                      {stub ? formatCurrency(stub.socialSecurity + stub.medicare) : existingStub ? formatCurrency(existingStub.SocialSecurity + existingStub.Medicare) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-green-600 dark:text-green-400">
                      {stub ? formatCurrency(stub.netPay) : existingStub ? formatCurrency(existingStub.NetPay) : '-'}
                    </td>
                    {isApproved && existingStub && (
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <Link
                          to={`/paystubs/${existingStub.Id}`}
                          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 text-sm"
                        >
                          View
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
