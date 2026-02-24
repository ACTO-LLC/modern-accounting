import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DateRangePicker, ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import api from '../../lib/api';
import { formatDateShort, formatDateLong, formatDateTime } from '../../lib/dateUtils';

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
  GrossPay: number;
  FederalWithholding: number;
  StateWithholding: number;
  SocialSecurity: number;
  Medicare: number;
  TotalDeductions: number;
  NetPay: number;
  PayDate: string;
}

export default function PayrollSummary() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'payrun' | 'employee'>('payrun');

  // Fetch pay runs
  const { data: payRuns, isLoading: payRunsLoading, error: payRunsError } = useQuery({
    queryKey: ['payruns', 'report'],
    queryFn: async () => {
      const response = await api.get<{ value: PayRun[] }>(`/payruns?$orderby=PayDate desc`);
      return response.data.value;
    }
  });

  // Fetch pay stubs
  const { data: payStubs, isLoading: payStubsLoading, error: payStubsError } = useQuery({
    queryKey: ['paystubs', 'report'],
    queryFn: async () => {
      const response = await api.get<{ value: PayStub[] }>(`/paystubs`);
      return response.data.value;
    }
  });

  const isLoading = payRunsLoading || payStubsLoading;
  const error = payRunsError || payStubsError;

  const reportData = useMemo(() => {
    if (!payRuns || !payStubs) {
      return {
        filteredPayRuns: [],
        employeeTotals: new Map<string, { name: string; gross: number; deductions: number; net: number }>(),
        totals: { gross: 0, federal: 0, state: 0, ss: 0, medicare: 0, deductions: 0, net: 0 },
      };
    }

    // Parse dates
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    // Filter pay runs by date and status (only include processed/approved/paid)
    const filteredPayRuns = payRuns.filter((pr) => {
      const payDate = new Date(pr.PayDate);
      return payDate >= start && payDate <= end && ['Processing', 'Approved', 'Paid'].includes(pr.Status);
    });

    const payRunIds = new Set(filteredPayRuns.map(pr => pr.Id));

    // Filter pay stubs to those in filtered pay runs
    const filteredStubs = payStubs.filter(stub => payRunIds.has(stub.PayRunId));

    // Calculate totals
    const totals = filteredStubs.reduce((acc, stub) => ({
      gross: acc.gross + stub.GrossPay,
      federal: acc.federal + stub.FederalWithholding,
      state: acc.state + stub.StateWithholding,
      ss: acc.ss + stub.SocialSecurity,
      medicare: acc.medicare + stub.Medicare,
      deductions: acc.deductions + stub.TotalDeductions,
      net: acc.net + stub.NetPay,
    }), { gross: 0, federal: 0, state: 0, ss: 0, medicare: 0, deductions: 0, net: 0 });

    // Calculate employee totals
    const employeeTotals = new Map<string, { name: string; gross: number; deductions: number; net: number }>();
    filteredStubs.forEach(stub => {
      const existing = employeeTotals.get(stub.EmployeeId);
      if (existing) {
        existing.gross += stub.GrossPay;
        existing.deductions += stub.TotalDeductions;
        existing.net += stub.NetPay;
      } else {
        employeeTotals.set(stub.EmployeeId, {
          name: stub.EmployeeName,
          gross: stub.GrossPay,
          deductions: stub.TotalDeductions,
          net: stub.NetPay,
        });
      }
    });

    return { filteredPayRuns, employeeTotals, totals };
  }, [payRuns, payStubs, startDate, endDate]);

  const columns: ReportColumn[] = viewMode === 'payrun'
    ? [
        { key: 'payRunNumber', header: 'Pay Run', align: 'left' },
        { key: 'payPeriod', header: 'Pay Period', align: 'left' },
        { key: 'payDate', header: 'Pay Date', align: 'left' },
        { key: 'employees', header: 'Employees', align: 'right' },
        { key: 'gross', header: 'Gross Pay', align: 'right', format: (value) => value !== undefined ? formatCurrency(value) : '' },
        { key: 'deductions', header: 'Deductions', align: 'right', format: (value) => value !== undefined ? formatCurrency(value) : '' },
        { key: 'net', header: 'Net Pay', align: 'right', format: (value) => value !== undefined ? formatCurrency(value) : '' },
      ]
    : [
        { key: 'name', header: 'Employee', align: 'left' },
        { key: 'gross', header: 'Gross Pay', align: 'right', format: (value) => value !== undefined ? formatCurrency(value) : '' },
        { key: 'deductions', header: 'Deductions', align: 'right', format: (value) => value !== undefined ? formatCurrency(value) : '' },
        { key: 'net', header: 'Net Pay', align: 'right', format: (value) => value !== undefined ? formatCurrency(value) : '' },
      ];

  const tableData: ReportRow[] = useMemo(() => {
    if (viewMode === 'payrun') {
      const rows: ReportRow[] = reportData.filteredPayRuns.map(pr => ({
        payRunNumber: pr.PayRunNumber,
        payPeriod: `${formatDateShort(pr.PayPeriodStart)} - ${formatDateShort(pr.PayPeriodEnd)}`,
        payDate: formatDateShort(pr.PayDate),
        employees: pr.EmployeeCount,
        gross: pr.TotalGrossPay,
        deductions: pr.TotalDeductions,
        net: pr.TotalNetPay,
      }));

      if (rows.length > 0) {
        rows.push({
          payRunNumber: 'Total',
          payPeriod: '',
          payDate: '',
          employees: rows.reduce((sum, r) => sum + (r.employees as number || 0), 0),
          gross: reportData.totals.gross,
          deductions: reportData.totals.deductions,
          net: reportData.totals.net,
          isTotal: true,
        });
      }

      return rows;
    } else {
      const rows: ReportRow[] = Array.from(reportData.employeeTotals.entries())
        .sort(([, a], [, b]) => a.name.localeCompare(b.name))
        .map(([, emp]) => ({
          name: emp.name,
          gross: emp.gross,
          deductions: emp.deductions,
          net: emp.net,
        }));

      if (rows.length > 0) {
        rows.push({
          name: 'Total',
          gross: reportData.totals.gross,
          deductions: reportData.totals.deductions,
          net: reportData.totals.net,
          isTotal: true,
        });
      }

      return rows;
    }
  }, [reportData, viewMode]);

  const handleExportCSV = () =>
    exportToCSV(`payroll-summary-${startDate}-to-${endDate}`, columns, tableData);

  const formatDateRange = () =>
    `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;

  if (isLoading) {
    return <div className="max-w-5xl mx-auto p-4">Loading payroll summary report...</div>;
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading the report.';
    return (
      <div className="max-w-5xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load payroll summary data.</p>
        <p className="text-gray-600 mt-2">{message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-4 print:hidden">
        <Link
          to="/reports"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Reports
        </Link>
      </div>
      <ReportHeader
        title="Payroll Summary Report"
        subtitle={viewMode === 'payrun' ? 'By Pay Run' : 'By Employee'}
        dateRange={formatDateRange()}
        onExportCSV={handleExportCSV}
      />

      {/* Filters */}
      <div className="mb-6 space-y-4">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <div className="flex items-center gap-4 print:hidden">
          <span className="text-sm text-gray-700 dark:text-gray-300">View by:</span>
          <div className="flex rounded-md shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('payrun')}
              className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                viewMode === 'payrun'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Pay Run
            </button>
            <button
              type="button"
              onClick={() => setViewMode('employee')}
              className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-b border-r ${
                viewMode === 'employee'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              Employee
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 print:hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Gross Pay</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">{formatCurrency(reportData.totals.gross)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Federal Tax</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">{formatCurrency(reportData.totals.federal)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total FICA (SS + Med)</p>
          <p className="text-xl font-semibold text-gray-900 dark:text-white">{formatCurrency(reportData.totals.ss + reportData.totals.medicare)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Net Pay</p>
          <p className="text-xl font-semibold text-green-600 dark:text-green-400">{formatCurrency(reportData.totals.net)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        {tableData.length > 0 ? (
          <ReportTable columns={columns} data={tableData} />
        ) : (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No payroll data found for the selected date range.
          </div>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs">
        <p>
          Generated on{' '}
          {formatDateTime(new Date())}
        </p>
      </div>
    </div>
  );
}
