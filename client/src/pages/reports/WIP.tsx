import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Briefcase, AlertTriangle } from 'lucide-react';
import api from '../../lib/api';
import ReportHeader from '../../components/reports/ReportHeader';
import { formatCurrencyStandalone } from '../../contexts/CurrencyContext';
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

interface WipRow {
  ProjectId: string;
  ProjectName: string;
  CustomerId: string | null;
  CustomerName: string | null;
  Status: 'Active' | 'Completed' | 'OnHold';
  ContractAmount: number | null;
  EstimatedCost: number | null;
  CostToDate: number;
  PercentComplete: number | null;
  EarnedRevenue: number | null;
  BilledToDate: number;
  OverUnder: number | null;
}

interface Customer {
  Id: string;
  Name: string;
}

type StatusFilter = 'Active' | 'Completed' | 'OnHold' | 'All';

export default function WIP() {
  const [customerId, setCustomerId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active');
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

  const { data: rows = [], isLoading, error } = useQuery<WipRow[]>({
    queryKey: ['wip', customerId, statusFilter],
    enabled: jobCostingEnabled,
    queryFn: async () => {
      const filters: string[] = [];
      if (customerId !== 'all') {
        filters.push(`CustomerId eq ${formatGuidForOData(customerId, 'CustomerId')}`);
      }
      if (statusFilter !== 'All') {
        filters.push(`Status eq '${statusFilter}'`);
      }
      const qs = filters.length > 0
        ? `?$filter=${encodeURIComponent(filters.join(' and '))}&$orderby=ProjectName`
        : '?$orderby=ProjectName';
      const response = await api.get<{ value: WipRow[] }>(`/wip${qs}`);
      return response.data.value;
    },
  });

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.contract += r.ContractAmount ?? 0;
        acc.estimatedCost += r.EstimatedCost ?? 0;
        acc.cost += r.CostToDate;
        acc.earned += r.EarnedRevenue ?? 0;
        acc.billed += r.BilledToDate;
        acc.overUnder += r.OverUnder ?? 0;
        return acc;
      },
      { contract: 0, estimatedCost: 0, cost: 0, earned: 0, billed: 0, overUnder: 0 },
    );
  }, [rows]);

  const exportCsv = () => {
    const headers = [
      'Project',
      'Customer',
      'Status',
      'Contract',
      'Estimated Cost',
      'Cost to Date',
      '% Complete',
      'Earned Revenue',
      'Billed to Date',
      'Over/(Under) Billing',
    ];
    type Cell = { v: string; numeric?: boolean };
    const num = (n: number): Cell => ({ v: n.toFixed(2), numeric: true });
    const text = (s: string): Cell => ({ v: s });

    const body: Cell[][] = rows.map((r) => [
      text(r.ProjectName),
      text(r.CustomerName ?? ''),
      text(r.Status),
      r.ContractAmount != null ? num(r.ContractAmount) : text(''),
      r.EstimatedCost != null ? num(r.EstimatedCost) : text(''),
      num(r.CostToDate),
      r.PercentComplete != null ? num(r.PercentComplete) : text(''),
      r.EarnedRevenue != null ? num(r.EarnedRevenue) : text(''),
      num(r.BilledToDate),
      r.OverUnder != null ? num(r.OverUnder) : text(''),
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
    a.download = `wip-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!jobCostingEnabled) {
    return (
      <div className="max-w-3xl mx-auto">
        <ReportHeader title="Work in Progress" subtitle="Earned vs. billed revenue per job" />
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
        title="Work in Progress"
        subtitle="Earned vs. billed revenue per job (cost-to-cost method)"
      />

      {/* Accountant review banner */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">Pending accountant review.</p>
          <p className="mt-1">
            Percent-complete accounting touches revenue recognition. This report uses the cost-to-cost method
            and is reporting-only — it does not write GL entries. The numbers should be reviewed with your
            accountant before being relied on for financial reporting.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label htmlFor="wip-customer-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Customer
            </label>
            <select
              id="wip-customer-select"
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
            <label htmlFor="wip-status-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <select
              id="wip-status-select"
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
          Loading WIP…
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
          Couldn't load WIP report. {error instanceof Error ? error.message : ''}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          No projects match the current filters.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Project</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contract</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Est. Cost</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cost to Date</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">% Complete</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Earned</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Billed</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Over/(Under)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map((r) => (
                <tr key={r.ProjectId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100">{r.ProjectName}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{r.CustomerName ?? '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{r.Status}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {r.ContractAmount != null ? formatCurrencyStandalone(r.ContractAmount) : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {r.EstimatedCost != null ? formatCurrencyStandalone(r.EstimatedCost) : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(r.CostToDate)}
                  </td>
                  <td className={`px-4 py-2 text-sm text-right ${
                    r.PercentComplete != null && r.PercentComplete > 100
                      ? 'text-red-600 dark:text-red-400 font-semibold'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {r.PercentComplete != null ? `${r.PercentComplete.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {r.EarnedRevenue != null ? formatCurrencyStandalone(r.EarnedRevenue) : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(r.BilledToDate)}
                  </td>
                  <td className={`px-4 py-2 text-sm text-right font-medium ${
                    r.OverUnder == null
                      ? 'text-gray-400'
                      : r.OverUnder > 0
                        ? 'text-amber-700 dark:text-amber-400'  // over-billed (liability)
                        : r.OverUnder < 0
                          ? 'text-blue-700 dark:text-blue-400'   // under-billed (asset)
                          : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {r.OverUnder != null ? formatCurrencyStandalone(r.OverUnder) : '—'}
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
                  {formatCurrencyStandalone(totals.estimatedCost)}
                </td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.cost)}
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-400">—</td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.earned)}
                </td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.billed)}
                </td>
                <td className={`px-4 py-2 text-sm text-right font-semibold ${
                  totals.overUnder > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : totals.overUnder < 0
                      ? 'text-blue-700 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {formatCurrencyStandalone(totals.overUnder)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
