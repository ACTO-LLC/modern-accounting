import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../lib/api';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import {
  W2FormData,
  AnnualPayrollTotals,
  generateW2ControlNumber,
  maskSSN,
  formatEIN,
  getSocialSecurityWageBase,
  getAvailableTaxYears,
} from '../lib/taxForms';
import { formatCurrency } from '../lib/payrollCalculations';

interface Employee {
  Id: string;
  EmployeeNumber: string;
  FirstName: string;
  LastName: string;
  SSNLast4: string;
  Address: string;
  City: string;
  State: string;
  ZipCode: string;
  HireDate: string;
  TerminationDate: string | null;
  Status: string;
}

interface PayStub {
  Id: string;
  EmployeeId: string;
  PayDate: string;
  GrossPay: number;
  FederalWithholding: number;
  StateWithholding: number;
  SocialSecurity: number;
  Medicare: number;
}

export default function W2Forms() {
  const [searchParams] = useSearchParams();
  const yearParam = searchParams.get('year');
  const [selectedYear, setSelectedYear] = useState<number>(
    yearParam ? parseInt(yearParam) : new Date().getFullYear() - 1
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const { settings: companySettings } = useCompanySettings();
  const availableYears = getAvailableTaxYears();

  // Fetch all active employees
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ['employees', 'active'],
    queryFn: async () => {
      const response = await api.get<{ value: Employee[] }>('/employees');
      return response.data.value;
    },
  });

  // Fetch pay stubs for the selected year
  const { data: payStubs, isLoading: payStubsLoading } = useQuery({
    queryKey: ['paystubs', 'year', selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      const response = await api.get<{ value: PayStub[] }>(
        `/paystubs?$filter=PayDate ge '${startDate}' and PayDate le '${endDate}'`
      );
      return response.data.value;
    },
  });

  // Calculate annual totals per employee
  const annualTotals = useMemo(() => {
    if (!payStubs || !employees) return new Map<string, AnnualPayrollTotals>();

    const totals = new Map<string, AnnualPayrollTotals>();
    const ssWageBase = getSocialSecurityWageBase(selectedYear);

    employees.forEach((emp) => {
      const empStubs = payStubs.filter((ps) => ps.EmployeeId === emp.Id);

      if (empStubs.length > 0) {
        const totalGross = empStubs.reduce((sum, ps) => sum + ps.GrossPay, 0);
        const totalFederal = empStubs.reduce((sum, ps) => sum + ps.FederalWithholding, 0);
        const totalState = empStubs.reduce((sum, ps) => sum + ps.StateWithholding, 0);
        const totalSS = empStubs.reduce((sum, ps) => sum + ps.SocialSecurity, 0);
        const totalMedicare = empStubs.reduce((sum, ps) => sum + ps.Medicare, 0);

        totals.set(emp.Id, {
          employeeId: emp.Id,
          taxYear: selectedYear,
          totalGrossPay: totalGross,
          totalFederalWithholding: totalFederal,
          totalStateWithholding: totalState,
          totalSocialSecurityWages: Math.min(totalGross, ssWageBase),
          totalSocialSecurityTax: totalSS,
          totalMedicareWages: totalGross,
          totalMedicareTax: totalMedicare,
          totalLocalWithholding: 0,
          stateCode: emp.State || '',
          payStubCount: empStubs.length,
        });
      }
    });

    return totals;
  }, [payStubs, employees, selectedYear]);

  // Generate W-2 data for selected employee
  const selectedW2Data = useMemo((): W2FormData | null => {
    if (!selectedEmployeeId || !employees) return null;

    const employee = employees.find((e) => e.Id === selectedEmployeeId);
    const totals = annualTotals.get(selectedEmployeeId);

    if (!employee || !totals) return null;

    return {
      taxYear: selectedYear,
      controlNumber: generateW2ControlNumber(employee.EmployeeNumber, selectedYear),
      employerEIN: companySettings.taxId || '00-0000000',
      employerName: companySettings.name || 'Company Name',
      employerAddress: companySettings.address || '',
      employerCity: companySettings.city || '',
      employerState: companySettings.state || '',
      employerZip: companySettings.zip || '',
      employeeSSN: maskSSN(employee.SSNLast4 || '0000'),
      employeeSSNLast4: employee.SSNLast4 || '0000',
      employeeFirstName: employee.FirstName,
      employeeLastName: employee.LastName,
      employeeAddress: employee.Address || '',
      employeeCity: employee.City || '',
      employeeState: employee.State || '',
      employeeZip: employee.ZipCode || '',
      box1WagesTips: totals.totalGrossPay,
      box2FederalTax: totals.totalFederalWithholding,
      box3SocialSecurityWages: totals.totalSocialSecurityWages,
      box4SocialSecurityTax: totals.totalSocialSecurityTax,
      box5MedicareWages: totals.totalMedicareWages,
      box6MedicareTax: totals.totalMedicareTax,
      box7SocialSecurityTips: 0,
      box8AllocatedTips: 0,
      box10DependentCareBenefits: 0,
      box11NonqualifiedPlans: 0,
      box12Codes: [],
      box13Statutory: false,
      box13RetirementPlan: false,
      box13ThirdPartySickPay: false,
      stateInfo: totals.totalStateWithholding > 0
        ? [{
            state: totals.stateCode,
            stateEIN: companySettings.stateEmployerId || '',
            stateWages: totals.totalGrossPay,
            stateTax: totals.totalStateWithholding,
          }]
        : [],
      localInfo: [],
      employeeId: employee.Id,
      generatedAt: new Date().toISOString(),
    };
  }, [selectedEmployeeId, employees, annualTotals, selectedYear, companySettings]);

  const handlePrint = () => {
    window.print();
  };

  const isLoading = employeesLoading || payStubsLoading;

  // Filter employees who have pay stubs for the selected year
  const employeesWithPaystubs = useMemo(() => {
    if (!employees) return [];
    return employees.filter((emp) => annualTotals.has(emp.Id));
  }, [employees, annualTotals]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-gray-600 dark:text-gray-400">Loading W-2 data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center">
          <Link
            to="/tax-forms"
            className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">W-2 Forms</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Wage and Tax Statement for Tax Year {selectedYear}
            </p>
          </div>
        </div>
        {selectedEmployeeId && (
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print W-2
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tax Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(Number(e.target.value));
                setSelectedEmployeeId(null);
              }}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Select Employee
            </label>
            <select
              value={selectedEmployeeId || ''}
              onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
            >
              <option value="">-- Select an employee --</option>
              {employeesWithPaystubs.map((emp) => (
                <option key={emp.Id} value={emp.Id}>
                  {emp.FirstName} {emp.LastName} ({emp.EmployeeNumber})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {!selectedEmployeeId && (
        <div className="mb-6 print:hidden">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Summary for {selectedYear}
            </h2>
            {employeesWithPaystubs.length === 0 ? (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-5 w-5" />
                <span>No payroll data found for {selectedYear}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Employees with W-2</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {employeesWithPaystubs.length}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Wages</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(
                      Array.from(annualTotals.values()).reduce(
                        (sum, t) => sum + t.totalGrossPay,
                        0
                      )
                    )}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Federal Tax</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(
                      Array.from(annualTotals.values()).reduce(
                        (sum, t) => sum + t.totalFederalWithholding,
                        0
                      )
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Employee List */}
          {employeesWithPaystubs.length > 0 && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Wages
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Federal Tax
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      State Tax
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {employeesWithPaystubs.map((emp) => {
                    const totals = annualTotals.get(emp.Id);
                    return (
                      <tr key={emp.Id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {emp.FirstName} {emp.LastName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {emp.EmployeeNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                          {formatCurrency(totals?.totalGrossPay || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                          {formatCurrency(totals?.totalFederalWithholding || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 dark:text-white">
                          {formatCurrency(totals?.totalStateWithholding || 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => setSelectedEmployeeId(emp.Id)}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            View W-2
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* W-2 Form Preview */}
      {selectedEmployeeId && selectedW2Data && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 print:shadow-none print:p-0">
          {/* Print Header */}
          <div className="hidden print:block text-center mb-4">
            <h2 className="text-xl font-bold">Form W-2 Wage and Tax Statement</h2>
            <p className="text-sm">Tax Year {selectedYear}</p>
          </div>

          {/* W-2 Form Layout */}
          <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            {/* Top Section - Employer/Employee Info */}
            <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
              {/* Left Column - Employer */}
              <div className="border-r border-gray-300 dark:border-gray-600 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  b Employer identification number (EIN)
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  {formatEIN(selectedW2Data.employerEIN)}
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  c Employer's name, address, and ZIP code
                </div>
                <div className="text-sm text-gray-900 dark:text-white">
                  <p className="font-medium">{selectedW2Data.employerName}</p>
                  {selectedW2Data.employerAddress && <p>{selectedW2Data.employerAddress}</p>}
                  <p>
                    {selectedW2Data.employerCity}
                    {selectedW2Data.employerState && `, ${selectedW2Data.employerState}`}
                    {selectedW2Data.employerZip && ` ${selectedW2Data.employerZip}`}
                  </p>
                </div>
              </div>

              {/* Right Column - Control Number & Wages */}
              <div className="p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  d Control number
                </div>
                <div className="text-sm font-mono text-gray-900 dark:text-white mb-3">
                  {selectedW2Data.controlNumber}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      1 Wages, tips, other comp.
                    </div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box1WagesTips)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      2 Federal income tax withheld
                    </div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box2FederalTax)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Employee Info */}
            <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
              <div className="border-r border-gray-300 dark:border-gray-600 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  a Employee's social security number
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  {selectedW2Data.employeeSSN}
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  e Employee's first name and initial / Last name
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedW2Data.employeeFirstName} {selectedW2Data.employeeLastName}
                </div>
              </div>

              {/* SS and Medicare Wages */}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      3 Social security wages
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box3SocialSecurityWages)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      4 Social security tax withheld
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box4SocialSecurityTax)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      5 Medicare wages and tips
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box5MedicareWages)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      6 Medicare tax withheld
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box6MedicareTax)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Employee Address */}
            <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
              <div className="border-r border-gray-300 dark:border-gray-600 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  f Employee's address and ZIP code
                </div>
                <div className="text-sm text-gray-900 dark:text-white">
                  {selectedW2Data.employeeAddress && <p>{selectedW2Data.employeeAddress}</p>}
                  <p>
                    {selectedW2Data.employeeCity}
                    {selectedW2Data.employeeState && `, ${selectedW2Data.employeeState}`}
                    {selectedW2Data.employeeZip && ` ${selectedW2Data.employeeZip}`}
                  </p>
                </div>
              </div>

              {/* Additional boxes */}
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      7 Social security tips
                    </div>
                    <div className="text-sm text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box7SocialSecurityTips)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      8 Allocated tips
                    </div>
                    <div className="text-sm text-gray-900 dark:text-white">
                      {formatCurrency(selectedW2Data.box8AllocatedTips)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* State and Local Section */}
            {selectedW2Data.stateInfo.length > 0 && (
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium uppercase">
                  State and Local Information
                </div>
                <div className="grid grid-cols-5 gap-4 text-sm">
                  {selectedW2Data.stateInfo.map((state, idx) => (
                    <>
                      <div key={`state-${idx}`}>
                        <div className="text-xs text-gray-500 dark:text-gray-400">15 State</div>
                        <div className="font-medium text-gray-900 dark:text-white">{state.state}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Employer's state ID</div>
                        <div className="text-gray-900 dark:text-white">{state.stateEIN || 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">16 State wages</div>
                        <div className="text-gray-900 dark:text-white">{formatCurrency(state.stateWages)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">17 State income tax</div>
                        <div className="text-gray-900 dark:text-white">{formatCurrency(state.stateTax)}</div>
                      </div>
                      <div></div>
                    </>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Status Banner */}
          <div className="mt-4 flex items-center gap-2 text-green-600 dark:text-green-400 print:hidden">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm">W-2 generated successfully. Print for employee records.</span>
          </div>

          {/* Back Button (print hidden) */}
          <div className="mt-6 print:hidden">
            <button
              onClick={() => setSelectedEmployeeId(null)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Employee List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
