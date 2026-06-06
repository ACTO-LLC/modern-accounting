import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Briefcase } from 'lucide-react';
import api from '../../lib/api';
import ReportHeader from '../../components/reports/ReportHeader';
import { formatCurrencyStandalone } from '../../contexts/CurrencyContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';

/**
 * Prevent CSV formula injection: values starting with =, +, -, or @ are
 * coerced to text by prefixing a single quote. Matches the sanitizer in
 * components/reports/ReportTable.tsx.
 */
function sanitizeCsv(value: string): string {
  const trimmed = String(value).trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') ||
      trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${trimmed}`;
  }
  return trimmed;
}

interface JobProfitabilityRow {
  ProjectId: string;
  ProjectName: string;
  CustomerId: string | null;
  CustomerName: string | null;
  Status: 'Active' | 'Completed' | 'OnHold';
  StartDate: string | null;
  EndDate: string | null;
  ContractAmount: number | null;
  BudgetedAmount: number | null;
  EstimatedCost: number | null;
  RevenueToDate: number;
  CostToDate: number;
  CommittedCost: number;
  GrossMargin: number;
  GrossMarginPct: number | null;
}

type StatusFilter = 'Active' | 'Completed' | 'OnHold' | 'All';

interface Customer {
  Id: string;
  Name: string;
}

export default function JobProfitability() {
  const [customerId, setCustomerId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active');
  const [includeCommitted, setIncludeCommitted] = useState(false);
  const { isFeatureEnabled } = useFeatureFlags();
  const jobCostingEnabled = isFeatureEnabled('job_costing');

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-min'],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers?$select=Id,Name&$orderby=Name');
      return response.data.value;
    },
    enabled: jobCostingEnabled,
  });

  const { data: rows = [], isLoading, error } = useQuery<JobProfitabilityRow[]>({
    queryKey: ['job-profitability', customerId, statusFilter],
    enabled: jobCostingEnabled,
    queryFn: async () => {
      const filters: string[] = [];
      if (customerId !== 'all') {
        filters.push(`CustomerId eq ${customerId}`);
      }
      if (statusFilter !== 'All') {
        filters.push(`Status eq '${statusFilter}'`);
      }
      const qs = filters.length > 0
        ? `?$filter=${encodeURIComponent(filters.join(' and '))}&$orderby=ProjectName`
        : '?$orderby=ProjectName';
      const response = await api.get<{ value: JobProfitabilityRow[] }>(`/jobprofitability${qs}`);
      return response.data.value;
    },
  });

  // Apply the "include committed" toggle to derive an effective cost per row.
  const effectiveRows = useMemo(
    () =>
      rows.map((r) => {
        const cost = r.CostToDate + (includeCommitted ? r.CommittedCost : 0);
        const margin = r.RevenueToDate - cost;
        const pct = r.RevenueToDate > 0 ? (margin / r.RevenueToDate) * 100 : null;
        return { ...r, _effectiveCost: cost, _effectiveMargin: margin, _effectiveMarginPct: pct };
      }),
    [rows, includeCommitted],
  );

  const totals = useMemo(() => {
    return effectiveRows.reduce(
      (acc, r) => {
        acc.contract += r.ContractAmount ?? 0;
        acc.revenue += r.RevenueToDate;
        acc.cost += r._effectiveCost;
        acc.margin += r._effectiveMargin;
        return acc;
      },
      { contract: 0, revenue: 0, cost: 0, margin: 0 },
    );
  }, [effectiveRows]);
  const totalsPct = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : null;

  const exportCsv = () => {
    const headers = [
      'Project',
      'Customer',
      'Status',
      'Contract Amount',
      'Revenue to Date',
      includeCommitted ? 'Cost to Date (incl. Committed)' : 'Cost to Date',
      'Gross Margin',
      'Gross Margin %',
    ];
    const body = effectiveRows.map((r) => [
      r.ProjectName,
      r.CustomerName ?? '',
      r.Status,
      (r.ContractAmount ?? 0).toFixed(2),
      r.RevenueToDate.toFixed(2),
      r._effectiveCost.toFixed(2),
      r._effectiveMargin.toFixed(2),
      r._effectiveMarginPct != null ? r._effectiveMarginPct.toFixed(2) : '',
    ]);
    const csv = [
      headers.join(','),
      ...body.map((row) =>
        row.map((cell) => `"${sanitizeCsv(String(cell)).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-profitability-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    // Delay revocation so the download isn't truncated in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Hard guard: the route is reachable by direct URL even when the flag is off
  // (Reports.tsx already hides the link). Render an explicit disabled state so
  // no data is fetched or displayed.
  if (!jobCostingEnabled) {
    return (
      <div className="max-w-3xl mx-auto">
        <ReportHeader
          title="Job Profitability"
          subtitle="Revenue, cost, and gross margin per job"
        />
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
        title="Job Profitability"
        subtitle="Revenue, cost, and gross margin per job"
      />

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer</label>
            <select
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

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="Active">Active</option>
              <option value="Completed">Completed</option>
              <option value="OnHold">On Hold</option>
              <option value="All">All</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              id="include-committed"
              type="checkbox"
              checked={includeCommitted}
              onChange={(e) => setIncludeCommitted(e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="include-committed" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Include committed costs (open POs)
            </label>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={effectiveRows.length === 0}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          Loading job profitability…
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
          Couldn't load job profitability. {error instanceof Error ? error.message : ''}
        </div>
      ) : effectiveRows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          No projects match the current filters.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Project</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contract</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Cost{includeCommitted ? ' (incl. committed)' : ''}
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GM $</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">GM %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {effectiveRows.map((r) => (
                <tr key={r.ProjectId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 font-medium">{r.ProjectName}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{r.CustomerName ?? '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{r.Status}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {r.ContractAmount != null ? formatCurrencyStandalone(r.ContractAmount) : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(r.RevenueToDate)}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(r._effectiveCost)}
                  </td>
                  <td className={`px-4 py-2 text-sm text-right font-medium ${
                    r._effectiveMargin < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {formatCurrencyStandalone(r._effectiveMargin)}
                  </td>
                  <td className={`px-4 py-2 text-sm text-right ${
                    r._effectiveMarginPct != null && r._effectiveMarginPct < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {r._effectiveMarginPct != null ? `${r._effectiveMarginPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Total</td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.contract)}
                </td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.revenue)}
                </td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.cost)}
                </td>
                <td className={`px-4 py-2 text-sm text-right font-semibold ${
                  totals.margin < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
                }`}>
                  {formatCurrencyStandalone(totals.margin)}
                </td>
                <td className={`px-4 py-2 text-sm text-right font-semibold ${
                  totalsPct != null && totalsPct < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {totalsPct != null ? `${totalsPct.toFixed(1)}%` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
