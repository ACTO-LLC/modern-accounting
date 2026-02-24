import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DateRangePicker, ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import api from '../../lib/api';
import { formatDateLong, formatDateTime } from '../../lib/dateUtils';

interface TaxRate {
  Id: string;
  Name: string;
  Rate: number;
  IsActive: boolean;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  IssueDate: string;
  TaxRateId: string | null;
  TaxRateName: string | null;
  TaxRate: number | null;
  Subtotal: number;
  TaxAmount: number;
  TotalAmount: number;
  Status: string;
}

interface TaxSummary {
  taxRateId: string | null;
  taxRateName: string;
  rate: number;
  taxableAmount: number;
  taxCollected: number;
  invoiceCount: number;
}

// Get default date range (current month)
function getDefaultDateRange() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export default function SalesTaxLiability() {
  const defaultRange = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);

  const {
    data: invoices,
    isLoading: loadingInvoices,
    error: invoicesError,
  } = useQuery({
    queryKey: ['invoices-for-tax', startDate, endDate],
    queryFn: async () => {
      // Filter invoices by issue date within range and exclude Cancelled/Voided
      const filter = `IssueDate ge ${startDate} and IssueDate le ${endDate} and Status ne 'Cancelled' and Status ne 'Voided'`;
      const response = await api.get<{ value: Invoice[] }>(`/invoices?$filter=${encodeURIComponent(filter)}&$orderby=IssueDate`);
      return response.data.value;
    },
  });

  const {
    data: taxRates,
    isLoading: loadingTaxRates,
    error: taxRatesError,
  } = useQuery({
    queryKey: ['taxrates-all'],
    queryFn: async () => {
      const response = await api.get<{ value: TaxRate[] }>('/taxrates');
      return response.data.value;
    },
  });

  const reportData = useMemo(() => {
    if (!invoices || !taxRates) {
      return { summaries: [], totals: { taxableAmount: 0, taxCollected: 0, invoiceCount: 0 } };
    }

    // Group invoices by tax rate
    const taxSummaryMap = new Map<string | null, TaxSummary>();

    // Initialize with all active tax rates (so they show even if 0 invoices)
    taxRates.forEach(tr => {
      if (tr.IsActive) {
        taxSummaryMap.set(tr.Id, {
          taxRateId: tr.Id,
          taxRateName: tr.Name,
          rate: tr.Rate,
          taxableAmount: 0,
          taxCollected: 0,
          invoiceCount: 0,
        });
      }
    });

    // Add "No Tax" category
    taxSummaryMap.set(null, {
      taxRateId: null,
      taxRateName: 'No Tax',
      rate: 0,
      taxableAmount: 0,
      taxCollected: 0,
      invoiceCount: 0,
    });

    // Aggregate invoice data
    invoices.forEach(invoice => {
      const taxRateId = invoice.TaxRateId;
      let summary = taxSummaryMap.get(taxRateId);

      // If tax rate not in map (e.g., inactive rate), create entry
      if (!summary) {
        const taxRate = taxRates.find(tr => tr.Id === taxRateId);
        summary = {
          taxRateId,
          taxRateName: invoice.TaxRateName || taxRate?.Name || 'Unknown Tax Rate',
          rate: invoice.TaxRate || taxRate?.Rate || 0,
          taxableAmount: 0,
          taxCollected: 0,
          invoiceCount: 0,
        };
        taxSummaryMap.set(taxRateId, summary);
      }

      summary.taxableAmount += invoice.Subtotal || 0;
      summary.taxCollected += invoice.TaxAmount || 0;
      summary.invoiceCount += 1;
    });

    // Convert to array and filter out empty categories
    const summaries = Array.from(taxSummaryMap.values())
      .filter(s => s.invoiceCount > 0 || s.taxCollected > 0)
      .sort((a, b) => {
        // Put "No Tax" at the end
        if (a.taxRateId === null) return 1;
        if (b.taxRateId === null) return -1;
        return a.taxRateName.localeCompare(b.taxRateName);
      });

    // Calculate totals
    const totals = summaries.reduce(
      (acc, s) => ({
        taxableAmount: acc.taxableAmount + s.taxableAmount,
        taxCollected: acc.taxCollected + s.taxCollected,
        invoiceCount: acc.invoiceCount + s.invoiceCount,
      }),
      { taxableAmount: 0, taxCollected: 0, invoiceCount: 0 }
    );

    return { summaries, totals };
  }, [invoices, taxRates]);

  const columns: ReportColumn[] = [
    { key: 'taxRate', header: 'Tax Rate', align: 'left' },
    { key: 'rate', header: 'Rate %', align: 'right', format: (value) => value ? `${(value * 100).toFixed(2)}%` : '-' },
    { key: 'invoiceCount', header: 'Invoices', align: 'right' },
    { key: 'taxableAmount', header: 'Taxable Sales', align: 'right', format: (value) => formatCurrency(value || 0) },
    { key: 'taxCollected', header: 'Tax Collected', align: 'right', format: (value) => formatCurrency(value || 0) },
  ];

  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = reportData.summaries.map((summary) => ({
      taxRate: summary.taxRateName,
      rate: summary.rate,
      invoiceCount: summary.invoiceCount,
      taxableAmount: summary.taxableAmount,
      taxCollected: summary.taxCollected,
    }));

    // Add totals row
    if (rows.length > 0) {
      rows.push({
        taxRate: 'Total',
        rate: null,
        invoiceCount: reportData.totals.invoiceCount,
        taxableAmount: reportData.totals.taxableAmount,
        taxCollected: reportData.totals.taxCollected,
        isTotal: true,
      });
    }

    return rows;
  }, [reportData]);

  const handleExportCSV = () => {
    const filename = `sales-tax-liability-${startDate}-to-${endDate}`;
    exportToCSV(filename, columns, tableData);
  };

  const formatDateRange = () => {
    return `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;
  };

  if (loadingInvoices || loadingTaxRates) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="p-4">Loading sales tax data...</div>
      </div>
    );
  }

  const error = invoicesError || taxRatesError;
  if (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred while loading the report.';
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load sales tax data.</p>
        <p className="text-gray-600 mt-2">{message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 print:hidden">
        <Link
          to="/reports"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Reports
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 print:hidden">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      <ReportHeader
        title="Sales Tax Liability"
        subtitle="Tax collected on invoices by tax rate"
        dateRange={formatDateRange()}
        onExportCSV={handleExportCSV}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print:hidden">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500 uppercase">Total Taxable Sales</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(reportData.totals.taxableAmount)}
          </div>
        </div>
        <div className="bg-indigo-50 rounded-lg shadow p-4">
          <div className="text-xs text-indigo-600 uppercase font-medium">Tax Collected</div>
          <div className="text-lg font-bold text-indigo-700">
            {formatCurrency(reportData.totals.taxCollected)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500 uppercase">Total Invoices</div>
          <div className="text-lg font-semibold text-gray-900">
            {reportData.totals.invoiceCount}
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {reportData.summaries.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No invoices found for the selected period.</p>
            <p className="mt-2 text-sm">Try selecting a different date range.</p>
          </div>
        ) : (
          <ReportTable columns={columns} data={tableData} />
        )}
      </div>

      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs">
        <p>
          Generated on{' '}
          {formatDateTime(new Date())}
        </p>
      </div>

      {/* Additional Information */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4 print:hidden">
        <h3 className="text-sm font-medium text-gray-700 mb-2">About This Report</h3>
        <ul className="text-sm text-gray-500 space-y-1">
          <li>Shows sales tax collected on invoices during the selected period</li>
          <li>Excludes cancelled and voided invoices</li>
          <li>Group by tax rate applied to each invoice</li>
          <li>Use this report to help prepare your sales tax filings</li>
        </ul>
      </div>
    </div>
  );
}
