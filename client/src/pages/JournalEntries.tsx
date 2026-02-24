import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridSortModel,
  GridFilterModel,
  GridRowParams,
} from '@mui/x-data-grid';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';
import useGridHeight from '../hooks/useGridHeight';

interface JournalEntry {
  Id: string;
  Reference: string;
  TransactionDate: string;
  Description: string;
  Status: string;
  CreatedAt: string;
}

// Map MUI filter operators to OData filter operators
const muiToODataOperator: Record<string, string> = {
  contains: 'contains',
  equals: 'eq',
  '=': 'eq',
  '!=': 'ne',
  '>': 'gt',
  '>=': 'ge',
  '<': 'lt',
  '<=': 'le',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  is: 'eq',
  not: 'ne',
};

const statusColors: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  Posted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  Void: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function buildODataFilter(filterModel: GridFilterModel): string | null {
  const parts: string[] = [];

  for (const item of filterModel.items) {
    if (item.value === undefined || item.value === null || item.value === '') {
      continue;
    }

    const field = item.field;
    const operator = muiToODataOperator[item.operator] || 'contains';
    const value = item.value;

    if (operator === 'contains' || operator === 'startsWith' || operator === 'endsWith') {
      parts.push(`${operator}(${field}, '${value}')`);
    } else {
      // For string fields, wrap value in quotes
      const isNumeric = !isNaN(Number(value));
      const formattedValue = isNumeric ? value : `'${value}'`;
      parts.push(`${field} ${operator} ${formattedValue}`);
    }
  }

  if (parts.length === 0) return null;
  return parts.join(' and ');
}

function buildODataOrderBy(sortModel: GridSortModel): string | null {
  if (sortModel.length === 0) return null;
  const { field, sort } = sortModel[0];
  return `${field} ${sort || 'asc'}`;
}

export default function JournalEntries() {
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement>(null);
  const autoHeight = useGridHeight(gridRef);

  const [rows, setRows] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);

  // Pagination state
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  });

  // Sorting state
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // Filter state
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  // Fetch data from REST API with OData server-side parameters
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: string[] = [];

      // Server-side pagination
      params.push(`$top=${paginationModel.pageSize}`);
      params.push(`$skip=${paginationModel.page * paginationModel.pageSize}`);
      params.push('$count=true');

      // Server-side sorting
      const orderBy = buildODataOrderBy(sortModel);
      if (orderBy) {
        params.push(`$orderby=${orderBy}`);
      }

      // Server-side filtering
      const filter = buildODataFilter(filterModel);
      if (filter) {
        params.push(`$filter=${filter}`);
      }

      const url = `/journalentries?${params.join('&')}`;
      const response = await api.get<{ value: JournalEntry[]; '@odata.count'?: number }>(url);
      const data = response.data.value || [];
      const count = response.data['@odata.count'] ?? 0;

      setRows(data);
      setTotalRows(count);
    } catch (err) {
      console.error('Error fetching journal entries:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch journal entries');
      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }, [paginationModel, sortModel, filterModel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle pagination changes
  const handlePaginationModelChange = useCallback((newModel: GridPaginationModel) => {
    setPaginationModel(newModel);
  }, []);

  // Handle sort changes - reset to first page
  const handleSortModelChange = useCallback((newSortModel: GridSortModel) => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setSortModel(newSortModel);
  }, []);

  // Handle filter changes - reset to first page
  const handleFilterModelChange = useCallback((newFilterModel: GridFilterModel) => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setFilterModel(newFilterModel);
  }, []);

  // Handle row click - navigate to edit
  const handleRowClick = useCallback((params: GridRowParams<JournalEntry>) => {
    navigate(`/journal-entries/${params.row.Id}/edit`);
  }, [navigate]);

  const columns: GridColDef[] = [
    { field: 'Reference', headerName: 'Entry #', width: 130, filterable: true },
    {
      field: 'TransactionDate',
      headerName: 'Date',
      width: 130,
      filterable: true,
      renderCell: (params) => formatDate(params.value),
    },
    { field: 'Description', headerName: 'Description', width: 300, filterable: true },
    {
      field: 'Status',
      headerName: 'Status',
      width: 120,
      filterable: true,
      renderCell: (params) => (
        <span
          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[params.value] || 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}`}
        >
          {params.value}
        </span>
      ),
    },
    {
      field: 'CreatedAt',
      headerName: 'Created',
      width: 130,
      filterable: true,
      renderCell: (params) => formatDate(params.value),
    },
  ];

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">General Ledger</h1>
          <Link
            to="/journal-entries/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Entry
          </Link>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-4">
          <p className="text-red-600 dark:text-red-400">Error loading data: {error}</p>
          <button
            onClick={fetchData}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">General Ledger</h1>
        <Link
          to="/journal-entries/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Entry
        </Link>
      </div>

      <div
        ref={gridRef}
        style={{ height: autoHeight, width: '100%' }}
        className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto"
      >
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.Id}
          loading={loading}
          // Server-side pagination
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[10, 25, 50, 100]}
          rowCount={totalRows}
          // Server-side sorting
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={handleSortModelChange}
          // Server-side filtering
          filterMode="server"
          filterModel={filterModel}
          onFilterModelChange={handleFilterModelChange}
          // Row interaction
          onRowClick={handleRowClick}
          disableRowSelectionOnClick
          // Styling
          sx={{
            '& .MuiDataGrid-main': {
              overflow: 'auto',
            },
            '& .MuiDataGrid-virtualScroller': {
              overflow: 'auto !important',
            },
            '& .MuiDataGrid-row:hover': {
              cursor: 'pointer',
            },
          }}
          localeText={{
            noRowsLabel: 'No journal entries found.',
          }}
        />
      </div>
    </div>
  );
}
