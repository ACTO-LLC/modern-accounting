import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ReportHeader, ReportTable, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';

interface Customer { Id: string; Name: string; }
interface Invoice { Id: string; InvoiceNumber: string; CustomerId: string; IssueDate: string; DueDate: string; TotalAmount: number; Status: string; }
interface AgingBucket { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number; total: number; }

function createEmptyBucket(): AgingBucket { return { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, total: 0 }; }

export default function ARAgingSummary() {
  const { data: customers, isLoading: loadingCustomers } = useQuery({ queryKey: ['customers'], queryFn: async () => { const r = await fetch('/api/customers'); const d = await r.json(); return d.value as Customer[]; } });
  const { data: invoices, isLoading: loadingInvoices } = useQuery({ queryKey: ['invoices'], queryFn: async () => { const r = await fetch('/api/invoices'); const d = await r.json(); return d.value as Invoice[]; } });

  const reportData = useMemo(() => {
    if (!customers || !invoices) return { customerAging: [], totals: createEmptyBucket() };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const outstandingInvoices = invoices.filter(inv => inv.Status !== 'Paid' && inv.Status !== 'Cancelled' && inv.Status !== 'Voided');
    const customerMap = new Map(customers.map(c => [c.Id, c]));
    const customerAging = new Map<string, { customer: Customer; aging: AgingBucket }>();
    outstandingInvoices.forEach(invoice => { const customer = customerMap.get(invoice.CustomerId); if (!customer) return; const dueDate = new Date(invoice.DueDate); const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)); let existing = customerAging.get(invoice.CustomerId); if (!existing) { existing = { customer, aging: createEmptyBucket() }; customerAging.set(invoice.CustomerId, existing); } const amount = invoice.TotalAmount; if (daysPastDue <= 0) existing.aging.current += amount; else if (daysPastDue <= 30) existing.aging.days1to30 += amount; else if (daysPastDue <= 60) existing.aging.days31to60 += amount; else if (daysPastDue <= 90) existing.aging.days61to90 += amount; else existing.aging.days90plus += amount; existing.aging.total += amount; });
    const result = Array.from(customerAging.values()).filter(item => item.aging.total > 0).sort((a, b) => a.customer.Name.localeCompare(b.customer.Name));
    const totals = createEmptyBucket(); result.forEach(({ aging }) => { totals.current += aging.current; totals.days1to30 += aging.days1to30; totals.days31to60 += aging.days31to60; totals.days61to90 += aging.days61to90; totals.days90plus += aging.days90plus; totals.total += aging.total; });
    return { customerAging: result, totals };
  }, [customers, invoices]);

  const columns: ReportColumn[] = [{ key: 'customer', header: 'Customer', align: 'left' }, { key: 'current', header: 'Current', align: 'right', format: (value) => value ? formatCurrency(value) : '-' }, { key: 'days1to30', header: '1-30 Days', align: 'right', format: (value) => value ? formatCurrency(value) : '-' }, { key: 'days31to60', header: '31-60 Days', align: 'right', format: (value) => value ? formatCurrency(value) : '-' }, { key: 'days61to90', header: '61-90 Days', align: 'right', format: (value) => value ? formatCurrency(value) : '-' }, { key: 'days90plus', header: '90+ Days', align: 'right', format: (value) => value ? formatCurrency(value) : '-' }, { key: 'total', header: 'Total', align: 'right', format: (value) => formatCurrency(value) }];
  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = reportData.customerAging.map(({ customer, aging }) => ({ customer: customer.Name, current: aging.current || undefined, days1to30: aging.days1to30 || undefined, days31to60: aging.days31to60 || undefined, days61to90: aging.days61to90 || undefined, days90plus: aging.days90plus || undefined, total: aging.total }));
    rows.push({ customer: 'Total', current: reportData.totals.current || undefined, days1to30: reportData.totals.days1to30 || undefined, days31to60: reportData.totals.days31to60 || undefined, days61to90: reportData.totals.days61to90 || undefined, days90plus: reportData.totals.days90plus || undefined, total: reportData.totals.total, isTotal: true });
    return rows;
  }, [reportData]);

  const handleExportCSV = () => { const today = new Date().toISOString().split('T')[0]; exportToCSV(`ar-aging-summary-${today}`, columns, tableData); };
  if (loadingCustomers || loadingInvoices) return <div className="max-w-6xl mx-auto"><div className="p-4">Loading AR Aging data...</div></div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 print:hidden"><Link to="/reports" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="h-4 w-4 mr-1" />Back to Reports</Link></div>
      <ReportHeader title="Accounts Receivable Aging Summary" subtitle="Outstanding invoices by age" dateRange={`As of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`} onExportCSV={handleExportCSV} />
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6 print:hidden">
        <div className="bg-white rounded-lg shadow p-4"><div className="text-xs text-gray-500 uppercase">Current</div><div className="text-lg font-semibold text-gray-900">{formatCurrency(reportData.totals.current)}</div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="text-xs text-gray-500 uppercase">1-30 Days</div><div className="text-lg font-semibold text-yellow-600">{formatCurrency(reportData.totals.days1to30)}</div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="text-xs text-gray-500 uppercase">31-60 Days</div><div className="text-lg font-semibold text-orange-600">{formatCurrency(reportData.totals.days31to60)}</div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="text-xs text-gray-500 uppercase">61-90 Days</div><div className="text-lg font-semibold text-red-500">{formatCurrency(reportData.totals.days61to90)}</div></div>
        <div className="bg-white rounded-lg shadow p-4"><div className="text-xs text-gray-500 uppercase">90+ Days</div><div className="text-lg font-semibold text-red-700">{formatCurrency(reportData.totals.days90plus)}</div></div>
        <div className="bg-indigo-50 rounded-lg shadow p-4"><div className="text-xs text-indigo-600 uppercase font-medium">Total AR</div><div className="text-lg font-bold text-indigo-700">{formatCurrency(reportData.totals.total)}</div></div>
      </div>
      <div className="bg-white shadow rounded-lg overflow-hidden">{reportData.customerAging.length === 0 ? <div className="p-8 text-center text-gray-500"><p>No outstanding invoices found.</p></div> : <ReportTable columns={columns} data={tableData} />}</div>
      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs"><p>Generated on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>
    </div>
  );
}
