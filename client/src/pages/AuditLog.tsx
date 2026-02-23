import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  FileText,
  Edit,
  Trash2,
  Eye,
  LogIn,
  LogOut,
  Upload,
  Settings,
  X,
  Info
} from 'lucide-react';
import { GridColDef, GridRowParams } from '@mui/x-data-grid';
import { DataGrid, GridPaginationModel } from '@mui/x-data-grid';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';
import useGridHeight from '../hooks/useGridHeight';

// Audit Log entry interface
interface AuditLogEntry {
  Id: number;
  Timestamp: string;
  UserId: string | null;
  UserName: string | null;
  UserEmail: string | null;
  Action: 'Create' | 'Update' | 'Delete' | 'View' | 'Login' | 'Logout' | 'Export' | 'Import' | 'System';
  EntityType: string;
  EntityId: string | null;
  EntityDescription: string | null;
  OldValues: string | null;
  NewValues: string | null;
  Changes: string | null;
  IpAddress: string | null;
  UserAgent: string | null;
  SessionId: string | null;
  TenantId: string | null;
  RequestId: string | null;
  Source: string | null;
}

// Action icon mapping
const actionIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Create: FileText,
  Update: Edit,
  Delete: Trash2,
  View: Eye,
  Login: LogIn,
  Logout: LogOut,
  Export: Download,
  Import: Upload,
  System: Settings,
};

// Action color mapping
const actionColors: Record<string, string> = {
  Create: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  Update: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  Delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  View: 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
  Login: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  Logout: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  Export: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Import: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  System: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
};

// Entity type options
const entityTypes = [
  'All Types',
  'Account',
  'Bill',
  'Customer',
  'Database',
  'Employee',
  'Estimate',
  'Expense',
  'Invoice',
  'JournalEntry',
  'Payment',
  'Project',
  'Report',
  'Session',
  'Vendor',
];

// Action options
const actionOptions = [
  'All Actions',
  'Create',
  'Update',
  'Delete',
  'View',
  'Login',
  'Logout',
  'Export',
  'Import',
  'System',
];

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return formatDate(timestamp) + ' ' + date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Parse JSON safely
function parseJSON(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Detail component for modal view
function AuditDetailRow({ entry }: { entry: AuditLogEntry }) {
  const oldValues = parseJSON(entry.OldValues);
  const newValues = parseJSON(entry.NewValues);
  const changes = parseJSON(entry.Changes);

  const hasRequestInfo = entry.IpAddress || entry.Source || entry.SessionId || entry.RequestId;
  const hasChanges = changes && Object.keys(changes).length > 0;
  const hasOldValues = oldValues && Object.keys(oldValues).length > 0 && !hasChanges;
  const hasNewValues = newValues && Object.keys(newValues).length > 0 && !hasChanges;

  if (!hasRequestInfo && !hasChanges && !hasOldValues && !hasNewValues) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
        No additional details available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Request Info */}
      {hasRequestInfo && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Request Information</h4>
          <dl className="text-sm space-y-1">
            {entry.IpAddress && (
              <div className="flex">
                <dt className="w-24 text-gray-500 dark:text-gray-400">IP Address:</dt>
                <dd className="text-gray-900 dark:text-gray-100">{entry.IpAddress}</dd>
              </div>
            )}
            {entry.Source && (
              <div className="flex">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Source:</dt>
                <dd className="text-gray-900 dark:text-gray-100">{entry.Source}</dd>
              </div>
            )}
            {entry.SessionId && (
              <div className="flex">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Session ID:</dt>
                <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">
                  {entry.SessionId}
                </dd>
              </div>
            )}
            {entry.RequestId && (
              <div className="flex">
                <dt className="w-24 text-gray-500 dark:text-gray-400">Request ID:</dt>
                <dd className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">
                  {entry.RequestId}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Changes Summary */}
      {hasChanges && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Changes</h4>
          <div className="space-y-2">
            {Object.entries(changes).map(([field, change]) => {
              const changeObj = change as { old?: unknown; new?: unknown };
              return (
                <div key={field} className="text-sm border-l-2 border-indigo-400 pl-3">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{field}</span>
                  <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded text-xs">
                      {String(changeObj.old ?? '(empty)')}
                    </span>
                    <span className="text-gray-400 hidden sm:inline">→</span>
                    <span className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded text-xs">
                      {String(changeObj.new ?? '(empty)')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Old Values */}
      {hasOldValues && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Previous Values</h4>
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto max-h-48 text-gray-800 dark:text-gray-200">
            {JSON.stringify(oldValues, null, 2)}
          </pre>
        </div>
      )}

      {/* New Values */}
      {hasNewValues && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Values</h4>
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto max-h-48 text-gray-800 dark:text-gray-200">
            {JSON.stringify(newValues, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AuditLog() {
  const gridRef = useRef<HTMLDivElement>(null);
  const gridHeight = useGridHeight(gridRef);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('All Actions');
  const [entityTypeFilter, setEntityTypeFilter] = useState('All Types');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | '7days' | '30days' | 'custom'>('30days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  // Selected entry for detail panel
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Pagination
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });

  // Fetch audit log entries
  const { data: auditLogData, isLoading, error } = useQuery({
    queryKey: ['auditlog'],
    queryFn: async () => {
      const response = await api.get<{ value: AuditLogEntry[] }>('/auditlog?$orderby=Timestamp desc');
      return response.data.value || [];
    },
  });

  // Apply filters client-side
  const filteredData = useMemo(() => {
    if (!auditLogData) return [];

    return auditLogData.filter((entry) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          entry.UserName?.toLowerCase().includes(query) ||
          entry.UserEmail?.toLowerCase().includes(query) ||
          entry.EntityDescription?.toLowerCase().includes(query) ||
          entry.EntityId?.toLowerCase().includes(query) ||
          entry.EntityType.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Action filter
      if (actionFilter !== 'All Actions' && entry.Action !== actionFilter) {
        return false;
      }

      // Entity type filter
      if (entityTypeFilter !== 'All Types' && entry.EntityType !== entityTypeFilter) {
        return false;
      }

      // Date range filter
      const entryDate = new Date(entry.Timestamp);
      const now = new Date();

      if (dateRangeFilter === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (entryDate < today) return false;
      } else if (dateRangeFilter === '7days') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (entryDate < weekAgo) return false;
      } else if (dateRangeFilter === '30days') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (entryDate < monthAgo) return false;
      } else if (dateRangeFilter === 'custom') {
        if (startDate && entryDate < new Date(startDate)) return false;
        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (entryDate > endOfDay) return false;
        }
      }

      return true;
    });
  }, [auditLogData, searchQuery, actionFilter, entityTypeFilter, dateRangeFilter, startDate, endDate]);

  // Export to CSV
  const handleExport = () => {
    if (!filteredData.length) return;

    const headers = [
      'Timestamp',
      'User',
      'Email',
      'Action',
      'Entity Type',
      'Entity ID',
      'Description',
      'IP Address',
      'Source',
    ];

    const csvContent = [
      headers.join(','),
      ...filteredData.map((entry) =>
        [
          `"${new Date(entry.Timestamp).toISOString()}"`,
          `"${entry.UserName || ''}"`,
          `"${entry.UserEmail || ''}"`,
          `"${entry.Action}"`,
          `"${entry.EntityType}"`,
          `"${entry.EntityId || ''}"`,
          `"${entry.EntityDescription?.replace(/"/g, '""') || ''}"`,
          `"${entry.IpAddress || ''}"`,
          `"${entry.Source || ''}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle row click to show details
  const handleRowClick = (params: GridRowParams<AuditLogEntry>) => {
    const hasDetails = params.row.OldValues || params.row.NewValues || params.row.Changes || params.row.IpAddress;
    if (hasDetails) {
      setSelectedEntry(params.row);
    }
  };

  // DataGrid columns
  const columns: GridColDef[] = [
    {
      field: 'details',
      headerName: '',
      width: 40,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const hasDetails = params.row.OldValues || params.row.NewValues || params.row.Changes || params.row.IpAddress;
        if (!hasDetails) return null;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedEntry(params.row as AuditLogEntry);
            }}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="View details"
          >
            <Info className="w-4 h-4 text-gray-500" />
          </button>
        );
      },
    },
    {
      field: 'Timestamp',
      headerName: 'When',
      width: 150,
      renderCell: (params) => (
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span title={new Date(params.value).toLocaleString()}>
            {formatTimestamp(params.value)}
          </span>
        </div>
      ),
    },
    {
      field: 'UserName',
      headerName: 'User',
      width: 150,
      renderCell: (params) => (
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {params.row.UserName || 'System'}
            </div>
            {params.row.UserEmail && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {params.row.UserEmail}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      field: 'Action',
      headerName: 'Action',
      width: 120,
      renderCell: (params) => {
        const Icon = actionIcons[params.value] || FileText;
        const colorClass = actionColors[params.value] || actionColors.View;
        return (
          <span className={`px-2 py-1 inline-flex items-center gap-1 text-xs font-medium rounded-full ${colorClass}`}>
            <Icon className="w-3 h-3" />
            {params.value}
          </span>
        );
      },
    },
    {
      field: 'EntityType',
      headerName: 'Entity Type',
      width: 120,
      renderCell: (params) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">{params.value}</span>
      ),
    },
    {
      field: 'EntityDescription',
      headerName: 'Description',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <div className="truncate" title={params.value || params.row.EntityId}>
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {params.value || params.row.EntityId || '-'}
          </span>
        </div>
      ),
    },
    {
      field: 'Source',
      headerName: 'Source',
      width: 80,
      renderCell: (params) => (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {params.value || '-'}
        </span>
      ),
    },
  ];

  if (error) {
    return (
      <div>
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-4">
          <p className="text-red-600 dark:text-red-400">
            Error loading audit log: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Audit Log
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Track all changes to transactions and records for compliance and troubleshooting.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={!filteredData.length}
          className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md shadow-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-6">
        <div
          className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between cursor-pointer"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
            {(searchQuery || actionFilter !== 'All Actions' || entityTypeFilter !== 'All Types' || dateRangeFilter !== 'all') && (
              <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 rounded-full">
                Active
              </span>
            )}
          </div>
          {showFilters ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {showFilters && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by user, entity..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Action Filter */}
              <div>
                <label htmlFor="action-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Action
                </label>
                <select
                  id="action-filter"
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  {actionOptions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </div>

              {/* Entity Type Filter */}
              <div>
                <label htmlFor="entity-type-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Entity Type
                </label>
                <select
                  id="entity-type-filter"
                  value={entityTypeFilter}
                  onChange={(e) => setEntityTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  {entityTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range Filter */}
              <div>
                <label htmlFor="date-range-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date Range
                </label>
                <select
                  id="date-range-filter"
                  value={dateRangeFilter}
                  onChange={(e) => setDateRangeFilter(e.target.value as typeof dateRangeFilter)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
            </div>

            {/* Custom date range inputs */}
            {dateRangeFilter === 'custom' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
              </div>
            )}

            {/* Results count */}
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing {filteredData.length.toLocaleString()} of {auditLogData?.length.toLocaleString() || 0} entries
            </div>
          </div>
        )}
      </div>

      {/* Data Grid */}
      <div ref={gridRef} className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden" style={{ height: gridHeight }}>
        <DataGrid
          rows={filteredData}
          columns={columns}
          loading={isLoading}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 25, 50, 100]}
          disableRowSelectionOnClick
          getRowId={(row) => row.Id}
          sx={{
            border: 0,
          }}
          localeText={{
            noRowsLabel: 'No audit log entries found.',
          }}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Compliance Notice */}
      <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
        Audit log entries cannot be modified or deleted. This ensures compliance with SOX and other regulatory requirements.
      </div>

      {/* Detail Panel Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="audit-detail-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div
              className="fixed inset-0 bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-75 transition-opacity"
              aria-hidden="true"
              onClick={() => setSelectedEntry(null)}
            />

            {/* Modal panel */}
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h3 id="audit-detail-title" className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Audit Log Details
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedEntry.EntityDescription || selectedEntry.EntityType}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                {/* Summary */}
                <div className="mb-4 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">When</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">
                      {new Date(selectedEntry.Timestamp).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">User</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">
                      {selectedEntry.UserName || 'System'}
                      {selectedEntry.UserEmail && (
                        <span className="text-gray-500 dark:text-gray-400 ml-1">({selectedEntry.UserEmail})</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Action</dt>
                    <dd>
                      <span className={`px-2 py-0.5 inline-flex items-center gap-1 text-xs font-medium rounded-full ${actionColors[selectedEntry.Action] || actionColors.View}`}>
                        {selectedEntry.Action}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">Entity</dt>
                    <dd className="text-sm text-gray-900 dark:text-gray-100">
                      {selectedEntry.EntityType}
                      {selectedEntry.EntityId && (
                        <span className="text-gray-500 dark:text-gray-400 ml-1">({selectedEntry.EntityId})</span>
                      )}
                    </dd>
                  </div>
                </div>

                {/* Detailed info */}
                <AuditDetailRow entry={selectedEntry} />
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
