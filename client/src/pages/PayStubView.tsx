import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import api from '../lib/api';
import { formatCurrency } from '../lib/payrollCalculations';
import { useCompanySettings } from '../contexts/CompanySettingsContext';

interface PayStub {
  Id: string;
  PayRunId: string;
  EmployeeId: string;
  EmployeeNumber: string;
  EmployeeName: string;
  PayRunNumber: string;
  PayPeriodStart: string;
  PayPeriodEnd: string;
  PayDate: string;
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
  YTDGrossPay: number;
  YTDFederalWithholding: number;
  YTDStateWithholding: number;
  YTDSocialSecurity: number;
  YTDMedicare: number;
  YTDNetPay: number;
  PaymentMethod: string;
  CheckNumber: string;
  Status: string;
}

export default function PayStubView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings: companySettings } = useCompanySettings();

  const { data: payStub, isLoading, error } = useQuery({
    queryKey: ['paystub', id],
    queryFn: async () => {
      const response = await api.get<{ value: PayStub[] }>(`/paystubs?$filter=Id eq ${id}`);
      return response.data.value[0];
    },
    enabled: !!id
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return <div className="p-4">Loading pay stub...</div>;
  }

  if (error || !payStub) {
    return <div className="p-4 text-red-600">Error loading pay stub</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Screen-only header */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="mr-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Pay Stub</h1>
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Printer className="w-4 h-4 mr-2" />
          Print
        </button>
      </div>

      {/* Pay Stub Content */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 print:shadow-none print:p-0">
        {/* Company Header */}
        <div className="border-b dark:border-gray-600 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              {companySettings.logoUrl ? (
                <img
                  src={companySettings.logoUrl}
                  alt={companySettings.name}
                  className="h-12 max-w-[180px] object-contain"
                />
              ) : (
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{companySettings.name || 'Company Name'}</h2>
              )}
              {companySettings.address && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{companySettings.address}</p>
              )}
            </div>
            <div className="text-right">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">EARNINGS STATEMENT</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pay Stub #{payStub.PayRunNumber}</p>
            </div>
          </div>
        </div>

        {/* Employee & Pay Period Info */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Employee</h4>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{payStub.EmployeeName}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Employee #: {payStub.EmployeeNumber}</p>
          </div>
          <div className="text-right">
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Pay Period</h4>
            <p className="text-sm text-gray-900 dark:text-white">
              {new Date(payStub.PayPeriodStart).toLocaleDateString()} - {new Date(payStub.PayPeriodEnd).toLocaleDateString()}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pay Date: <span className="font-medium text-gray-900 dark:text-white">{new Date(payStub.PayDate).toLocaleDateString()}</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Payment: {payStub.PaymentMethod === 'DirectDeposit' ? 'Direct Deposit' : `Check #${payStub.CheckNumber || 'N/A'}`}
            </p>
          </div>
        </div>

        {/* Earnings & Deductions */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          {/* Earnings */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 border-b dark:border-gray-600 pb-2">Earnings</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400">
                  <th className="text-left py-1">Description</th>
                  <th className="text-right py-1">Hours</th>
                  <th className="text-right py-1">Current</th>
                  <th className="text-right py-1">YTD</th>
                </tr>
              </thead>
              <tbody className="text-gray-900 dark:text-white">
                <tr>
                  <td className="py-1">Regular Pay</td>
                  <td className="text-right">{payStub.RegularHours.toFixed(2)}</td>
                  <td className="text-right">{formatCurrency(payStub.RegularPay)}</td>
                  <td className="text-right text-gray-500 dark:text-gray-400">-</td>
                </tr>
                {payStub.OvertimeHours > 0 && (
                  <tr>
                    <td className="py-1">Overtime Pay</td>
                    <td className="text-right">{payStub.OvertimeHours.toFixed(2)}</td>
                    <td className="text-right">{formatCurrency(payStub.OvertimePay)}</td>
                    <td className="text-right text-gray-500 dark:text-gray-400">-</td>
                  </tr>
                )}
                {payStub.OtherEarnings > 0 && (
                  <tr>
                    <td className="py-1">Other Earnings</td>
                    <td className="text-right">-</td>
                    <td className="text-right">{formatCurrency(payStub.OtherEarnings)}</td>
                    <td className="text-right text-gray-500 dark:text-gray-400">-</td>
                  </tr>
                )}
                <tr className="border-t dark:border-gray-600 font-semibold">
                  <td className="py-2">Gross Pay</td>
                  <td className="text-right">{(payStub.RegularHours + payStub.OvertimeHours).toFixed(2)}</td>
                  <td className="text-right">{formatCurrency(payStub.GrossPay)}</td>
                  <td className="text-right text-gray-500 dark:text-gray-400">{formatCurrency(payStub.YTDGrossPay)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Deductions */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 border-b dark:border-gray-600 pb-2">Deductions</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400">
                  <th className="text-left py-1">Description</th>
                  <th className="text-right py-1">Current</th>
                  <th className="text-right py-1">YTD</th>
                </tr>
              </thead>
              <tbody className="text-gray-900 dark:text-white">
                <tr>
                  <td className="py-1">Federal Income Tax</td>
                  <td className="text-right">{formatCurrency(payStub.FederalWithholding)}</td>
                  <td className="text-right text-gray-500 dark:text-gray-400">{formatCurrency(payStub.YTDFederalWithholding)}</td>
                </tr>
                {payStub.StateWithholding > 0 && (
                  <tr>
                    <td className="py-1">State Income Tax</td>
                    <td className="text-right">{formatCurrency(payStub.StateWithholding)}</td>
                    <td className="text-right text-gray-500 dark:text-gray-400">{formatCurrency(payStub.YTDStateWithholding)}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-1">Social Security</td>
                  <td className="text-right">{formatCurrency(payStub.SocialSecurity)}</td>
                  <td className="text-right text-gray-500 dark:text-gray-400">{formatCurrency(payStub.YTDSocialSecurity)}</td>
                </tr>
                <tr>
                  <td className="py-1">Medicare</td>
                  <td className="text-right">{formatCurrency(payStub.Medicare)}</td>
                  <td className="text-right text-gray-500 dark:text-gray-400">{formatCurrency(payStub.YTDMedicare)}</td>
                </tr>
                {payStub.OtherDeductions > 0 && (
                  <tr>
                    <td className="py-1">Other Deductions</td>
                    <td className="text-right">{formatCurrency(payStub.OtherDeductions)}</td>
                    <td className="text-right text-gray-500 dark:text-gray-400">-</td>
                  </tr>
                )}
                <tr className="border-t dark:border-gray-600 font-semibold">
                  <td className="py-2">Total Deductions</td>
                  <td className="text-right">{formatCurrency(payStub.TotalDeductions)}</td>
                  <td className="text-right text-gray-500 dark:text-gray-400">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Net Pay */}
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 text-center">
          <p className="text-sm text-green-600 dark:text-green-400 uppercase tracking-wider mb-1">Net Pay</p>
          <p className="text-4xl font-bold text-green-700 dark:text-green-300">{formatCurrency(payStub.NetPay)}</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-2">
            YTD Net Pay: {formatCurrency(payStub.YTDNetPay)}
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t dark:border-gray-600 text-center text-xs text-gray-400 dark:text-gray-500">
          <p>This is a pay stub from {companySettings.name || 'Company'}. Please retain for your records.</p>
          <p className="mt-1">Questions? Contact HR or Payroll Department.</p>
        </div>
      </div>
    </div>
  );
}
