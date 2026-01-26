import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, FileText, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import {
  Form1099NECData,
  AnnualVendorPayments,
  formatEIN,
  is1099Required,
  getAvailableTaxYears,
} from '../lib/taxForms';
import { formatCurrency } from '../lib/payrollCalculations';

interface Vendor {
  Id: string;
  Name: string;
  Email: string;
  Phone: string;
  AddressLine1: string;
  City: string;
  State: string;
  PostalCode: string;
  TaxId: string;
  Is1099Vendor: boolean;
  Status: string;
}

interface BillPayment {
  Id: string;
  VendorId: string;
  PaymentDate: string;
  TotalAmount: number;
}

export default function Form1099NEC() {
  const [searchParams] = useSearchParams();
  const yearParam = searchParams.get('year');
  const [selectedYear, setSelectedYear] = useState<number>(
    yearParam ? parseInt(yearParam) : new Date().getFullYear() - 1
  );
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const { settings: companySettings } = useCompanySettings();
  const availableYears = getAvailableTaxYears();

  // Fetch all 1099 vendors
  const { data: vendors, isLoading: vendorsLoading } = useQuery({
    queryKey: ['vendors', '1099'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors?$filter=Is1099Vendor eq true');
      return response.data.value;
    },
  });

  // Fetch bill payments for the selected year
  const { data: billPayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['billpayments', 'year', selectedYear],
    queryFn: async () => {
      // OData date filter: DAB requires datetime format (with T00:00:00Z) for DATE columns
      const startDate = `${selectedYear}-01-01T00:00:00Z`;
      const endDate = `${selectedYear}-12-31T23:59:59Z`;
      const response = await api.get<{ value: BillPayment[] }>(
        `/billpayments?$filter=PaymentDate ge ${startDate} and PaymentDate le ${endDate}`
      );
      return response.data.value;
    },
  });

  // Calculate annual payments per vendor
  // Note: BillPayments has VendorId directly, no need to join through Bills
  const vendorPayments = useMemo(() => {
    if (!billPayments || !vendors) return new Map<string, AnnualVendorPayments>();

    // Create a set of 1099 vendor IDs for quick lookup
    const vendor1099Ids = new Set(vendors.map((v) => v.Id));

    // Calculate total payments per vendor
    const payments = new Map<string, AnnualVendorPayments>();

    billPayments.forEach((payment) => {
      const vendorId = payment.VendorId;
      if (!vendorId || !vendor1099Ids.has(vendorId)) return;

      const vendor = vendors.find((v) => v.Id === vendorId);
      if (!vendor) return;

      const existing = payments.get(vendorId);
      if (existing) {
        existing.totalPayments += payment.TotalAmount;
      } else {
        payments.set(vendorId, {
          vendorId,
          vendorName: vendor.Name,
          taxYear: selectedYear,
          totalPayments: payment.TotalAmount,
          is1099Vendor: vendor.Is1099Vendor,
          taxId: vendor.TaxId || '',
        });
      }
    });

    return payments;
  }, [billPayments, vendors, selectedYear]);

  // Filter to vendors requiring 1099 ($600+ payments)
  const vendorsRequiring1099 = useMemo(() => {
    return Array.from(vendorPayments.values()).filter((vp) =>
      is1099Required(vp.totalPayments)
    );
  }, [vendorPayments]);

  // Generate 1099-NEC data for selected vendor
  const selected1099Data = useMemo((): Form1099NECData | null => {
    if (!selectedVendorId || !vendors) return null;

    const vendor = vendors.find((v) => v.Id === selectedVendorId);
    const payments = vendorPayments.get(selectedVendorId);

    if (!vendor || !payments) return null;

    return {
      taxYear: selectedYear,
      corrected: false,
      payerName: companySettings.name || 'Company Name',
      payerAddress: companySettings.address || '',
      payerCity: companySettings.city || '',
      payerState: companySettings.state || '',
      payerZip: companySettings.zip || '',
      payerTIN: companySettings.taxId || '00-0000000',
      payerPhone: companySettings.phone || '',
      recipientTIN: vendor.TaxId || '',
      recipientTINType: vendor.TaxId?.length === 11 ? 'EIN' : 'SSN',
      recipientName: vendor.Name,
      recipientAddress: vendor.AddressLine1 || '',
      recipientCity: vendor.City || '',
      recipientState: vendor.State || '',
      recipientZip: vendor.PostalCode || '',
      accountNumber: '',
      box1NonemployeeCompensation: payments.totalPayments,
      box2DirectSalesIndicator: false,
      box4FederalTaxWithheld: 0,
      stateInfo: [],
      vendorId: vendor.Id,
      generatedAt: new Date().toISOString(),
    };
  }, [selectedVendorId, vendors, vendorPayments, selectedYear, companySettings]);

  const handlePrint = () => {
    window.print();
  };

  const isLoading = vendorsLoading || paymentsLoading;

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-gray-600 dark:text-gray-400">Loading 1099-NEC data...</p>
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
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">1099-NEC Forms</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nonemployee Compensation for Tax Year {selectedYear}
            </p>
          </div>
        </div>
        {selectedVendorId && (
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print 1099-NEC
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
                setSelectedVendorId(null);
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
              Select Contractor
            </label>
            <select
              value={selectedVendorId || ''}
              onChange={(e) => setSelectedVendorId(e.target.value || null)}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-gray-700 dark:text-white"
            >
              <option value="">-- Select a contractor --</option>
              {vendorsRequiring1099.map((vp) => (
                <option key={vp.vendorId} value={vp.vendorId}>
                  {vp.vendorName} ({formatCurrency(vp.totalPayments)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {!selectedVendorId && (
        <div className="mb-6 print:hidden">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Summary for {selectedYear}
            </h2>
            {vendorsRequiring1099.length === 0 ? (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-5 w-5" />
                <span>No contractors requiring 1099-NEC for {selectedYear} (payments must be $600+)</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">1099-NEC Required</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {vendorsRequiring1099.length}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total Payments</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(
                      vendorsRequiring1099.reduce((sum, vp) => sum + vp.totalPayments, 0)
                    )}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Threshold</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">$600+</p>
                </div>
              </div>
            )}
          </div>

          {/* Vendor List */}
          {vendorsRequiring1099.length > 0 && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Contractor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Tax ID
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Total Payments
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {vendorsRequiring1099.map((vp) => {
                    const hasTaxId = !!vp.taxId;
                    return (
                      <tr key={vp.vendorId}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {vp.vendorName}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {vp.taxId ? formatEIN(vp.taxId) : (
                            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4" />
                              Missing
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900 dark:text-white">
                          {formatCurrency(vp.totalPayments)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {hasTaxId ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              Missing TIN
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => setSelectedVendorId(vp.vendorId)}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            View 1099
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Warning for vendors with payments under $600 */}
          {vendors && vendors.length > vendorsRequiring1099.length && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="text-sm text-blue-700 dark:text-blue-300">
                  <p className="font-medium">Additional 1099 Vendors</p>
                  <p>
                    {vendors.length - vendorsRequiring1099.length} additional vendor(s) are marked as 1099 vendors
                    but have payments under $600 for {selectedYear}. No 1099-NEC is required.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1099-NEC Form Preview */}
      {selectedVendorId && selected1099Data && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 print:shadow-none print:p-0">
          {/* Print Header */}
          <div className="hidden print:block text-center mb-4">
            <h2 className="text-xl font-bold">Form 1099-NEC</h2>
            <p className="text-sm">Nonemployee Compensation - Tax Year {selectedYear}</p>
          </div>

          {/* Warning if missing Tax ID */}
          {!selected1099Data.recipientTIN && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 print:hidden">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">Warning: Recipient Tax ID is missing</span>
              </div>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                Please update the vendor record with their SSN or EIN before filing.
              </p>
            </div>
          )}

          {/* 1099-NEC Form Layout */}
          <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-2 border-b border-gray-300 dark:border-gray-600">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Form 1099-NEC
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedYear}
                </span>
              </div>
            </div>

            {/* Payer Information */}
            <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
              <div className="border-r border-gray-300 dark:border-gray-600 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">
                  Payer's Name, Address, and Telephone Number
                </div>
                <div className="text-sm text-gray-900 dark:text-white">
                  <p className="font-medium">{selected1099Data.payerName}</p>
                  {selected1099Data.payerAddress && <p>{selected1099Data.payerAddress}</p>}
                  <p>
                    {selected1099Data.payerCity}
                    {selected1099Data.payerState && `, ${selected1099Data.payerState}`}
                    {selected1099Data.payerZip && ` ${selected1099Data.payerZip}`}
                  </p>
                  {selected1099Data.payerPhone && <p>{selected1099Data.payerPhone}</p>}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">
                  Payer's TIN
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatEIN(selected1099Data.payerTIN)}
                </div>
              </div>
            </div>

            {/* Recipient Information */}
            <div className="grid grid-cols-2 border-b border-gray-300 dark:border-gray-600">
              <div className="border-r border-gray-300 dark:border-gray-600 p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">
                  Recipient's TIN
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {selected1099Data.recipientTIN ? formatEIN(selected1099Data.recipientTIN) : (
                    <span className="text-amber-600 dark:text-amber-400">Missing</span>
                  )}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">
                  Account Number (optional)
                </div>
                <div className="text-sm text-gray-900 dark:text-white">
                  {selected1099Data.accountNumber || '-'}
                </div>
              </div>
            </div>

            {/* Recipient Name and Address */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase">
                Recipient's Name and Address
              </div>
              <div className="text-sm text-gray-900 dark:text-white">
                <p className="font-medium">{selected1099Data.recipientName}</p>
                {selected1099Data.recipientAddress && <p>{selected1099Data.recipientAddress}</p>}
                <p>
                  {selected1099Data.recipientCity}
                  {selected1099Data.recipientState && `, ${selected1099Data.recipientState}`}
                  {selected1099Data.recipientZip && ` ${selected1099Data.recipientZip}`}
                </p>
              </div>
            </div>

            {/* Amount Boxes */}
            <div className="grid grid-cols-2">
              <div className="border-r border-gray-300 dark:border-gray-600 p-4 bg-green-50 dark:bg-green-900/20">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  1 Nonemployee compensation
                </div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {formatCurrency(selected1099Data.box1NonemployeeCompensation)}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  4 Federal income tax withheld
                </div>
                <div className="text-lg font-medium text-gray-900 dark:text-white">
                  {formatCurrency(selected1099Data.box4FederalTaxWithheld)}
                </div>
              </div>
            </div>

            {/* Checkbox */}
            <div className="border-t border-gray-300 dark:border-gray-600 p-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={selected1099Data.box2DirectSalesIndicator}
                  disabled
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                />
                2 Direct sales of $5,000 or more of consumer products
              </label>
            </div>
          </div>

          {/* Status Banner */}
          <div className="mt-4 flex items-center gap-2 text-green-600 dark:text-green-400 print:hidden">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm">1099-NEC generated successfully. Print for recipient records.</span>
          </div>

          {/* Back Button (print hidden) */}
          <div className="mt-6 print:hidden">
            <button
              onClick={() => setSelectedVendorId(null)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Contractor List
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
