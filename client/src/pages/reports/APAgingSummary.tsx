import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import { formatDateLong, formatDateTime } from '../../lib/dateUtils';

interface Vendor {
  Id: string;
  Name: string;
}
interface Bill {
  Id: string;
  BillNumber: string;
  VendorId: string;
  BillDate: string;
  DueDate: string;
  TotalAmount: number;
  Status: string;
}
interface AgingBucket {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

function createEmptyBucket(): AgingBucket {
  return {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
    total: 0,
  };
}

/**
 * Applies a bill amount to the appropriate aging bucket based on days past due.
 * @param aging - The aging bucket to update
 * @param daysPastDue - Number of days past the due date
 * @param amount - Amount to add to the bucket
 */
function applyAmountToAgingBucket(
  aging: AgingBucket,
  daysPastDue: number,
  amount: number
): void {
  if (daysPastDue <= 0) {
    aging.current += amount;
  } else if (daysPastDue <= 30) {
    aging.days1to30 += amount;
  } else if (daysPastDue <= 60) {
    aging.days31to60 += amount;
  } else if (daysPastDue <= 90) {
    aging.days61to90 += amount;
  } else {
    aging.days90plus += amount;
  }

  aging.total += amount;
}

export default function APAgingSummary() {
  const {
    data: vendors,
    isLoading: loadingVendors,
    error: vendorsError,
  } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const r = await fetch('/api/vendors');
      if (!r.ok) {
        throw new Error('Failed to load vendors');
      }
      const d = await r.json();
      return d.value as Vendor[];
    },
  });

  const {
    data: bills,
    isLoading: loadingBills,
    error: billsError,
  } = useQuery({
    queryKey: ['bills'],
    queryFn: async () => {
      const r = await fetch('/api/bills');
      if (!r.ok) {
        throw new Error('Failed to load bills');
      }
      const d = await r.json();
      return d.value as Bill[];
    },
  });

  const reportData = useMemo(() => {
    if (!vendors || !bills) {
      return { vendorAging: [], totals: createEmptyBucket() };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const outstandingBills = bills.filter(
      (bill) =>
        bill.Status !== 'Paid' && bill.Status !== 'Cancelled' && bill.Status !== 'Voided'
    );

    const vendorMap = new Map(vendors.map((v) => [v.Id, v]));
    const vendorAging = new Map<
      string,
      { vendor: Vendor; aging: AgingBucket }
    >();

    outstandingBills.forEach((bill) => {
      const vendor = vendorMap.get(bill.VendorId);
      if (!vendor) return;

      // Parse due date explicitly to avoid timezone issues
      const [year, month, day] = bill.DueDate.split('T')[0].split('-').map(Number);
      const dueDate = new Date(year, month - 1, day);

      const daysPastDue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      let existing = vendorAging.get(bill.VendorId);
      if (!existing) {
        existing = { vendor, aging: createEmptyBucket() };
        vendorAging.set(bill.VendorId, existing);
      }

      applyAmountToAgingBucket(existing.aging, daysPastDue, bill.TotalAmount);
    });

    const result = Array.from(vendorAging.values())
      .filter((item) => item.aging.total > 0)
      .sort((a, b) => a.vendor.Name.localeCompare(b.vendor.Name));

    const totals = createEmptyBucket();
    result.forEach(({ aging }) => {
      totals.current += aging.current;
      totals.days1to30 += aging.days1to30;
      totals.days31to60 += aging.days31to60;
      totals.days61to90 += aging.days61to90;
      totals.days90plus += aging.days90plus;
      totals.total += aging.total;
    });

    return { vendorAging: result, totals };
  }, [vendors, bills]);

  const columns: ReportColumn[] = [
    { key: 'vendor', header: 'Vendor', align: 'left' },
    {
      key: 'current',
      header: 'Current',
      align: 'right',
      format: (value) => (value ? formatCurrency(value) : '-'),
    },
    {
      key: 'days1to30',
      header: '1-30 Days',
      align: 'right',
      format: (value) => (value ? formatCurrency(value) : '-'),
    },
    {
      key: 'days31to60',
      header: '31-60 Days',
      align: 'right',
      format: (value) => (value ? formatCurrency(value) : '-'),
    },
    {
      key: 'days61to90',
      header: '61-90 Days',
      align: 'right',
      format: (value) => (value ? formatCurrency(value) : '-'),
    },
    {
      key: 'days90plus',
      header: '90+ Days',
      align: 'right',
      format: (value) => (value ? formatCurrency(value) : '-'),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      format: (value) => formatCurrency(value),
    },
  ];

  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = reportData.vendorAging.map(({ vendor, aging }) => ({
      vendor: vendor.Name,
      current: aging.current || undefined,
      days1to30: aging.days1to30 || undefined,
      days31to60: aging.days31to60 || undefined,
      days61to90: aging.days61to90 || undefined,
      days90plus: aging.days90plus || undefined,
      total: aging.total,
    }));

    rows.push({
      vendor: 'Total',
      current: reportData.totals.current || undefined,
      days1to30: reportData.totals.days1to30 || undefined,
      days31to60: reportData.totals.days31to60 || undefined,
      days61to90: reportData.totals.days61to90 || undefined,
      days90plus: reportData.totals.days90plus || undefined,
      total: reportData.totals.total,
      isTotal: true,
    });

    return rows;
  }, [reportData]);

  const handleExportCSV = () => {
    const today = new Date().toISOString().split('T')[0];
    exportToCSV(`ap-aging-summary-${today}`, columns, tableData);
  };

  if (loadingVendors || loadingBills) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="p-4">Loading AP Aging data...</div>
      </div>
    );
  }

  const error = vendorsError || billsError;
  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading the report.';
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load AP aging data.</p>
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
      <ReportHeader
        title="Accounts Payable Aging Summary"
        subtitle="Outstanding bills by age"
        dateRange={`As of ${formatDateLong(new Date())}`}
        onExportCSV={handleExportCSV}
      />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6 print:hidden">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500 uppercase">Current</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatCurrency(reportData.totals.current)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500 uppercase">1-30 Days</div>
          <div className="text-lg font-semibold text-yellow-600">
            {formatCurrency(reportData.totals.days1to30)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500 uppercase">31-60 Days</div>
          <div className="text-lg font-semibold text-orange-600">
            {formatCurrency(reportData.totals.days31to60)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500 uppercase">61-90 Days</div>
          <div className="text-lg font-semibold text-red-500">
            {formatCurrency(reportData.totals.days61to90)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-xs text-gray-500 uppercase">90+ Days</div>
          <div className="text-lg font-semibold text-red-700">
            {formatCurrency(reportData.totals.days90plus)}
          </div>
        </div>
        <div className="bg-indigo-50 rounded-lg shadow p-4">
          <div className="text-xs text-indigo-600 uppercase font-medium">Total AP</div>
          <div className="text-lg font-bold text-indigo-700">
            {formatCurrency(reportData.totals.total)}
          </div>
        </div>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {reportData.vendorAging.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No outstanding bills found.</p>
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
    </div>
  );
}
