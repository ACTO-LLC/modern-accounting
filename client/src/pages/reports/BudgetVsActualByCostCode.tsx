import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Briefcase } from 'lucide-react';
import api from '../../lib/api';
import ReportHeader from '../../components/reports/ReportHeader';
import { formatCurrencyStandalone } from '../../contexts/CurrencyContext';
import { useFeatureFlags } from '../../contexts/FeatureFlagsContext';
import { formatGuidForOData } from '../../lib/validation';

/**
 * Prevent CSV formula injection — matches the sanitizer in
 * components/reports/ReportTable.tsx and JobProfitability.tsx.
 */
function sanitizeCsv(value: string): string {
  const trimmed = String(value).trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') ||
      trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${trimmed}`;
  }
  return trimmed;
}

interface BudgetRow {
  RowId: string;
  ProjectId: string;
  CostCodeId: string | null;
  Code: string;
  Description: string;
  SortOrder: number;
  IsUncodedBucket: boolean;
  Budget: number;
  BudgetedHours: number;
  Actual: number;
  Committed: number;
}

interface Project {
  Id: string;
  Name: string;
}

export default function BudgetVsActualByCostCode() {
  const [projectId, setProjectId] = useState<string>('');
  const [includeCommitted, setIncludeCommitted] = useState(true);
  const { isFeatureEnabled } = useFeatureFlags();
  const jobCostingEnabled = isFeatureEnabled('job_costing');

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-active-min'],
    enabled: jobCostingEnabled,
    queryFn: async () => {
      const response = await api.get<{ value: Project[] }>(
        '/projects?$select=Id,Name&$filter=' + encodeURIComponent("Status eq 'Active'") + '&$orderby=Name',
      );
      return response.data.value;
    },
  });

  const { data: rows = [], isLoading, error } = useQuery<BudgetRow[]>({
    queryKey: ['budget-vs-actual', projectId],
    enabled: jobCostingEnabled && !!projectId,
    queryFn: async () => {
      const filter = `ProjectId eq ${formatGuidForOData(projectId, 'ProjectId')}`;
      const response = await api.get<{ value: BudgetRow[] }>(
        `/budgetvsactualbycostcode?$filter=${encodeURIComponent(filter)}&$orderby=SortOrder,Code`,
      );
      return response.data.value;
    },
  });

  // Variance and % used both fold in committed when the toggle is on.
  const computed = useMemo(
    () =>
      rows.map((r) => {
        const effectiveActual = r.Actual + (includeCommitted ? r.Committed : 0);
        const variance = r.Budget - effectiveActual;
        const pctUsed = r.Budget !== 0 ? (effectiveActual / r.Budget) * 100 : null;
        return { ...r, _effectiveActual: effectiveActual, _variance: variance, _pctUsed: pctUsed };
      }),
    [rows, includeCommitted],
  );

  const totals = useMemo(() => {
    return computed.reduce(
      (acc, r) => {
        acc.budget += r.Budget;
        acc.committed += r.Committed;
        acc.actual += r.Actual;
        acc.effective += r._effectiveActual;
        acc.variance += r._variance;
        return acc;
      },
      { budget: 0, committed: 0, actual: 0, effective: 0, variance: 0 },
    );
  }, [computed]);
  const totalsPctUsed = totals.budget !== 0 ? (totals.effective / totals.budget) * 100 : null;

  const exportCsv = () => {
    // Header + body have to stay in lock-step. When the toggle is off we omit
    // both the Committed column and the redundant Total column (which would
    // just equal Actual). When it's on, we show Actual and Total side by side.
    const headers = [
      'Code',
      'Description',
      'Budget',
      ...(includeCommitted ? ['Committed'] : []),
      'Actual',
      ...(includeCommitted ? ['Total (Actual + Committed)'] : []),
      'Variance',
      '% Used',
    ];
    type Cell = { v: string; numeric?: boolean };
    const num = (n: number): Cell => ({ v: n.toFixed(2), numeric: true });
    const text = (s: string): Cell => ({ v: s });

    const body: Cell[][] = computed.map((r) => [
      text(r.Code),
      text(r.Description),
      num(r.Budget),
      ...(includeCommitted ? [num(r.Committed)] : []),
      num(r.Actual),
      ...(includeCommitted ? [num(r._effectiveActual)] : []),
      num(r._variance),
      r._pctUsed != null ? num(r._pctUsed) : text(''),
    ]);
    const csv = [
      headers.join(','),
      ...body.map((row) =>
        row.map((cell) => (cell.numeric ? cell.v : `"${sanitizeCsv(cell.v).replace(/"/g, '""')}"`)).join(','),
      ),
    ].join('\n');
    const projectName = projects.find((p) => p.Id === projectId)?.Name ?? '';
    // Conservative filename slug: collapse anything that isn't alphanumeric to
    // a single hyphen, strip leading/trailing hyphens, fall back to "project"
    // if the result is empty. Guards against /, \, :, ?, etc. that break
    // filenames across OSes/browsers.
    const slug =
      projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-vs-actual-${slug}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!jobCostingEnabled) {
    return (
      <div className="max-w-3xl mx-auto">
        <ReportHeader
          title="Budget vs. Actual by Cost Code"
          subtitle="Per-job budget performance broken down by line item"
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
        title="Budget vs. Actual by Cost Code"
        subtitle="Per-job budget performance broken down by line item"
      />

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[260px]">
            <label htmlFor="bva-job-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Job <span className="text-red-500">*</span>
            </label>
            <select
              id="bva-job-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select a job…</option>
              {projects.map((p) => (
                <option key={p.Id} value={p.Id}>{p.Name}</option>
              ))}
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
              Include committed (open POs)
            </label>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={computed.length === 0}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Body */}
      {!projectId ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          Select a job above to see its budget breakdown.
        </div>
      ) : isLoading ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          Loading budget vs. actual…
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
          Couldn't load the report. {error instanceof Error ? error.message : ''}
        </div>
      ) : computed.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
          This job has no cost codes set up and no costs posted yet.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Code</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Budget</th>
                {includeCommitted && (
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Committed</th>
                )}
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actual</th>
                {includeCommitted && (
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total</th>
                )}
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Variance</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">% Used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {computed.map((r) => (
                <tr
                  key={r.RowId}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${r.IsUncodedBucket ? 'italic text-gray-500 dark:text-gray-400' : ''}`}
                >
                  <td className="px-4 py-2 text-sm font-mono text-gray-900 dark:text-gray-100">{r.Code}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{r.Description}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {r.IsUncodedBucket ? '—' : formatCurrencyStandalone(r.Budget)}
                  </td>
                  {includeCommitted && (
                    <td className="px-4 py-2 text-sm text-right text-gray-700 dark:text-gray-300">
                      {formatCurrencyStandalone(r.Committed)}
                    </td>
                  )}
                  <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(r.Actual)}
                  </td>
                  {includeCommitted && (
                    <td className="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatCurrencyStandalone(r._effectiveActual)}
                    </td>
                  )}
                  <td className={`px-4 py-2 text-sm text-right font-medium ${
                    r._variance < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'
                  }`}>
                    {formatCurrencyStandalone(r._variance)}
                  </td>
                  <td className={`px-4 py-2 text-sm text-right ${
                    r._pctUsed != null && r._pctUsed > 100 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {r._pctUsed != null ? `${r._pctUsed.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Total</td>
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.budget)}
                </td>
                {includeCommitted && (
                  <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(totals.committed)}
                  </td>
                )}
                <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                  {formatCurrencyStandalone(totals.actual)}
                </td>
                {includeCommitted && (
                  <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrencyStandalone(totals.effective)}
                  </td>
                )}
                <td className={`px-4 py-2 text-sm text-right font-semibold ${
                  totals.variance < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-700 dark:text-green-400'
                }`}>
                  {formatCurrencyStandalone(totals.variance)}
                </td>
                <td className={`px-4 py-2 text-sm text-right font-semibold ${
                  totalsPctUsed != null && totalsPctUsed > 100 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {totalsPctUsed != null ? `${totalsPctUsed.toFixed(1)}%` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
