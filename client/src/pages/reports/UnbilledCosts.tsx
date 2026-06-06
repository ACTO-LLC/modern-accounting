import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Briefcase, ChevronRight, ChevronDown } from 'lucide-react';
import api from '../../lib/api';
import ReportHeader from '../../components/reports/ReportHeader';
import { formatCurrencyStandalone } from '../../contexts/CurrencyContext';
import { formatDate } from '../../lib/dateUtils';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { formatGuidForOData } from '../../lib/validation';

function sanitizeCsv(value: string): string {
  const trimmed = String(value).trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') ||
      trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${trimmed}`;
  }
  return trimmed;
}

interface UnbilledRow {
  RowId: string;
  ProjectId: string;
  ProjectName: string;
  CustomerId: string | null;
  CustomerName: string | null;
  CostCodeId: string | null;
  CostCode: string | null;
  SourceType: 'TimeEntry' | 'BillLine' | 'Expense';
  SourceId: string;
  PostingDate: string;
  Amount: number;
  Description: string | null;
}

interface Customer {
  Id: string;
  Name: string;
}

const sourceLabel: Record<UnbilledRow['SourceType'], string> = {
  TimeEntry: 'Time',
  BillLine: 'Bill',
  Expense: 'Expense',
};

export default function UnbilledCosts() {
  const [customerId, setCustomerId] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { isFeatureEnabled } = useFeatureFlags();
  const jobCostingEnabled = isFeatureEnabled('job_costing');

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-min'],
    enabled: jobCostingEnabled,
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers?$select=Id,Name&$orderby=Name');
      return response.data.value;
    },
  });

  const { data: rows = [], isLoading, error } = useQuery<UnbilledRow[]>({
    queryKey: ['unbilled-costs', customerId],
    enabled: jobCostingEnabled,
    queryFn: async () => {
      const qs = customerId !== 'all'
        ? `?$filter=${encodeURIComponent(`CustomerId eq ${formatGuidForOData(customerId, 'CustomerId')}`)}&$orderby=PostingDate desc`
        : '?$orderby=PostingDate desc';
      const response = await api.get<{ value: UnbilledRow[] }>(`/unbilledcosts${qs}`);
      return response.data.value;
    },
  });

  // Group rows by project for the expandable rendering.
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { projectName: string; customerName: string | null; rows: UnbilledRow[]; total: number }
    >();
    for (const r of rows) {
      const g = map.get(r.ProjectId);
      if (g) {
        g.rows.push(r);
        g.total += r.Amount;
      } else {
        map.set(r.ProjectId, {
          projectName: r.ProjectName,
          customerName: r.CustomerName,
          rows: [r],
          total: r.Amount,
        });
      }
    }
    return Array.from(map.entries())
      .map(([projectId, g]) => ({ projectId, ...g }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [rows]);

  const grandTotal = useMemo(() => rows.reduce((sum, r) => sum + r.Amount, 0), [rows]);

  const toggle = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const exportCsv = () => {
    const headers = [
      'Project',
      'Customer',
      'Cost Code',
      'Source',
      'Date',
      'Description',
      'Amount',
    ];
    type Cell = { v: string; numeric?: boolean };
    const num = (n: number): Cell => ({ v: n.toFixed(2), numeric: true });
    const text = (s: string): Cell => ({ v: s });

    const body: Cell[][] = rows.map((r) => [
      text(r.ProjectName),
      text(r.CustomerName ?? ''),
      text(r.CostCode ?? ''),
      text(sourceLabel[r.SourceType]),
      text(formatDate(r.PostingDate)),
      text(r.Description ?? ''),
      num(r.Amount),
    ]);
    const csv = [
      headers.join(','),
      ...body.map((row) =>
        row.map((cell) => (cell.numeric ? cell.v : `"${sanitizeCsv(cell.v).replace(/"/g, '""')}"`)).join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unbilled-costs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!jobCostingEnabled) {
    return (
      <div className="max-w-3xl mx-auto">
        <ReportHeader title="Unbilled Costs" subtitle="Billable costs posted to jobs but not yet invoiced" />
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-10 text-center">
          <Briefcase className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500 mb-3" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Job Costing is disabled
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Enable the Job Costing feature in admin settings to see this report.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <ReportHeader
        title="Unbilled Costs"
        subtitle="Billable costs posted to jobs but not yet invoiced"
      />

      {/* MVP limitations banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4 mb-6 text-sm text-blue-800 dark:text-blue-300">
        <p className="font-medium">MVP scope</p>
        <p className="mt-1">
          Time entries use full billable + InvoiceLineId tracking. Bill lines and expenses don't yet have
          an invoice linkage column, so they always appear here until they're hidden manually. Bulk "create
          invoice from selected" is deferred to a follow-up.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="unbilled-customer-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Customer
            </label>
            <select
              id="unbilled-customer-select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="all">All Customers</option>
              {customers.map((c) => (
                <option key={c.Id} value={c.Id}>{c.Name}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          Loading unbilled costs…
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
          Couldn't load report. {error instanceof Error ? error.message : ''}
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          No unbilled costs match the current filters. 🎉
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-2 py-2 w-10"></th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Project / Source</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer / Cost Code</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {grouped.map((g) => {
                const isOpen = expanded.has(g.projectId);
                return (
                  <>
                    <tr
                      key={g.projectId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer bg-gray-25 dark:bg-gray-800"
                      onClick={() => toggle(g.projectId)}
                    >
                      <td className="px-2 py-2">
                        {isOpen
                          ? <ChevronDown className="w-4 h-4 text-gray-500" />
                          : <ChevronRight className="w-4 h-4 text-gray-500" />}
                      </td>
                      <td className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {g.projectName}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{g.customerName ?? '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{g.rows.length} {g.rows.length === 1 ? 'item' : 'items'}</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrencyStandalone(g.total)}
                      </td>
                    </tr>
                    {isOpen && g.rows.map((r) => (
                      <tr key={r.RowId} className="bg-gray-50 dark:bg-gray-900/40">
                        <td className="px-2 py-2"></td>
                        <td className="px-4 py-2 pl-10 text-sm text-gray-700 dark:text-gray-300">
                          {sourceLabel[r.SourceType]}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 font-mono">
                          {r.CostCode ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                          {formatDate(r.PostingDate)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                          {r.Description ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                          {formatCurrencyStandalone(r.Amount)}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <td className="px-2 py-2"></td>
                <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Total unbilled
                </td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
