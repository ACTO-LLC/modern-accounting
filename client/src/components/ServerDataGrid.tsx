import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridSortModel,
  GridFilterModel,
  GridRowParams,
  GridValidRowModel,
} from '@mui/x-data-grid';

import { graphql } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import useGridHeight from '../hooks/useGridHeight';
import useDataGridState from '../hooks/useDataGridState';

// DAB GraphQL filter operators
type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith';

// Map MUI filter operators to DAB GraphQL operators
const operatorMap: Record<string, FilterOperator> = {
  '=': 'eq',
  '!=': 'neq',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  'contains': 'contains',
  'startsWith': 'startsWith',
  'endsWith': 'endsWith',
  'equals': 'eq',
  'is': 'eq',
  'not': 'neq',
};

interface ServerDataGridProps<T extends GridValidRowModel> {
  // The GraphQL entity name (e.g., 'invoices', 'customers')
  entityName: string;
  // The fields to fetch from GraphQL
  queryFields: string;
  // Column definitions for the DataGrid
  columns: GridColDef[];
  // Optional row click handler - receives the row data and ID
  onRowClick?: (row: T) => void;
  // Optional edit path template (e.g., '/invoices/{id}/edit')
  editPath?: string;
  // Initial page size
  initialPageSize?: number;
  // Available page size options
  pageSizeOptions?: number[];
  // Optional custom row ID field (defaults to 'Id')
  getRowId?: (row: T) => string;
  // Optional additional filter to always apply
  baseFilter?: Record<string, unknown>;
  // Optional data transformation function
  transformData?: (data: T[]) => T[];
  // Optional custom actions column renderer
  renderActions?: (row: T) => React.ReactNode;
  // Optional header actions (buttons to show above grid)
  headerActions?: React.ReactNode;
  // Grid height
  height?: number | string;
  // Enable checkbox selection
  checkboxSelection?: boolean;
  // Disable row selection on click
  disableRowSelectionOnClick?: boolean;
  // Custom empty state message
  emptyMessage?: string;
  // Unique key for persisting grid state (sort, filter, page size) to localStorage
  gridKey?: string;
}

interface GraphQLResponse<T> {
  items: T[];
  hasNextPage: boolean;
  endCursor: string | null;
}

interface PaginationState {
  cursors: (string | null)[];
  currentPage: number;
}

export default function ServerDataGrid<T extends GridValidRowModel>({
  entityName,
  queryFields,
  columns,
  onRowClick,
  editPath,
  initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  getRowId = (row) => (row as unknown as { Id: string }).Id,
  baseFilter,
  transformData,
  renderActions,
  headerActions,
  height,
  checkboxSelection = false,
  disableRowSelectionOnClick = true,
  emptyMessage = 'No data found.',
  gridKey,
}: ServerDataGridProps<T>) {
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement>(null);
  const autoHeight = useGridHeight(gridRef);
  const resolvedHeight = height ?? autoHeight;

  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);

  // Persisted grid state (sort, filter, page size) when gridKey is provided
  const persistedState = useDataGridState({
    gridKey: gridKey || '__server-no-persist__',
    defaultPaginationModel: { page: 0, pageSize: initialPageSize },
  });

  // Pagination state with cursor tracking
  // For server-side pagination, we only persist pageSize (not page number, since cursors are ephemeral)
  const [paginationModel, setPaginationModelRaw] = useState<GridPaginationModel>({
    page: 0,
    pageSize: gridKey ? persistedState.paginationModel.pageSize : initialPageSize,
  });
  const setPaginationModel = useCallback((modelOrUpdater: GridPaginationModel | ((prev: GridPaginationModel) => GridPaginationModel)) => {
    setPaginationModelRaw((prev) => {
      const newModel = typeof modelOrUpdater === 'function' ? modelOrUpdater(prev) : modelOrUpdater;
      if (gridKey) {
        // Only persist pageSize for server-side grids (page depends on cursors)
        persistedState.onPaginationModelChange({ page: 0, pageSize: newModel.pageSize });
      }
      return newModel;
    });
  }, [gridKey, persistedState]);
  const [paginationState, setPaginationState] = useState<PaginationState>({
    cursors: [null], // First page has no cursor
    currentPage: 0,
  });
  const [, setHasNextPage] = useState(false);

  // Sorting state - use persisted if gridKey provided
  const [localSortModel, setLocalSortModel] = useState<GridSortModel>([]);
  const sortModel = gridKey ? persistedState.sortModel : localSortModel;
  const setSortModel = gridKey ? persistedState.onSortModelChange : setLocalSortModel;

  // Filter state - use persisted if gridKey provided
  const [localFilterModel, setLocalFilterModel] = useState<GridFilterModel>({ items: [] });
  const filterModel = gridKey ? persistedState.filterModel : localFilterModel;
  const setFilterModel = gridKey ? persistedState.onFilterModelChange : setLocalFilterModel;

  // Build the GraphQL orderBy parameter
  const buildOrderBy = useCallback((sort: GridSortModel): string | null => {
    if (sort.length === 0) return null;

    const { field, sort: direction } = sort[0];
    return `{ ${field}: ${direction?.toUpperCase() || 'ASC'} }`;
  }, []);

  // Build the GraphQL filter parameter
  const buildFilter = useCallback((filter: GridFilterModel, base?: Record<string, unknown>): string | null => {
    const filterParts: string[] = [];

    // Add base filter if provided
    if (base) {
      Object.entries(base).forEach(([field, condition]) => {
        if (typeof condition === 'object' && condition !== null) {
          Object.entries(condition as Record<string, unknown>).forEach(([op, value]) => {
            const formattedValue = typeof value === 'string' ? `"${value}"` : value;
            filterParts.push(`${field}: { ${op}: ${formattedValue} }`);
          });
        }
      });
    }

    // Add user filters
    filter.items.forEach((item) => {
      if (item.value !== undefined && item.value !== null && item.value !== '') {
        const field = item.field;
        const operator = operatorMap[item.operator] || 'contains';
        const value = typeof item.value === 'string' ? `"${item.value}"` : item.value;
        filterParts.push(`${field}: { ${operator}: ${value} }`);
      }
    });

    if (filterParts.length === 0) return null;
    return `{ ${filterParts.join(', ')} }`;
  }, []);

  // Fetch data from GraphQL
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query parameters
      const params: string[] = [];
      params.push(`first: ${paginationModel.pageSize}`);

      // Get cursor for current page
      const cursor = paginationState.cursors[paginationModel.page];
      if (cursor) {
        params.push(`after: "${cursor}"`);
      }

      const orderBy = buildOrderBy(sortModel);
      if (orderBy) {
        params.push(`orderBy: ${orderBy}`);
      }

      const filter = buildFilter(filterModel, baseFilter);
      if (filter) {
        params.push(`filter: ${filter}`);
      }

      const query = `
        query {
          ${entityName}(${params.join(', ')}) {
            items { ${queryFields} }
            hasNextPage
            endCursor
          }
        }
      `;

      const response = await graphql<Record<string, GraphQLResponse<T>>>(query);
      const data = response[entityName];

      if (data) {
        let items = data.items || [];
        if (transformData) {
          items = transformData(items);
        }
        setRows(items);
        setHasNextPage(data.hasNextPage);

        // Store the endCursor for the next page
        if (data.endCursor && paginationModel.page >= paginationState.cursors.length - 1) {
          setPaginationState((prev) => ({
            ...prev,
            cursors: [...prev.cursors, data.endCursor],
          }));
        }

        // Estimate total rows for pagination display
        // Since DAB doesn't return total count, we estimate based on hasNextPage
        const estimatedTotal = data.hasNextPage
          ? (paginationModel.page + 2) * paginationModel.pageSize
          : (paginationModel.page * paginationModel.pageSize) + items.length;
        setTotalRows(estimatedTotal);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setRows([]);
      setTotalRows(0);
    } finally {
      setLoading(false);
    }
  }, [
    entityName,
    queryFields,
    paginationModel,
    paginationState.cursors,
    sortModel,
    filterModel,
    baseFilter,
    buildOrderBy,
    buildFilter,
    transformData,
  ]);

  // Fetch data when dependencies change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle pagination changes
  const handlePaginationModelChange = useCallback((newModel: GridPaginationModel) => {
    // If page size changed, reset to first page
    if (newModel.pageSize !== paginationModel.pageSize) {
      setPaginationState({ cursors: [null], currentPage: 0 });
      setPaginationModel({ ...newModel, page: 0 });
    } else {
      setPaginationModel(newModel);
    }
  }, [paginationModel.pageSize, setPaginationModel]);

  // Handle sort changes
  const handleSortModelChange = useCallback((newSortModel: GridSortModel) => {
    // Reset pagination when sorting changes
    setPaginationState({ cursors: [null], currentPage: 0 });
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setSortModel(newSortModel);
  }, [setSortModel, setPaginationModel]);

  // Handle filter changes
  const handleFilterModelChange = useCallback((newFilterModel: GridFilterModel) => {
    // Reset pagination when filters change
    setPaginationState({ cursors: [null], currentPage: 0 });
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setFilterModel(newFilterModel);
  }, [setFilterModel, setPaginationModel]);

  // Handle row click
  const handleRowClick = useCallback((params: GridRowParams<T>) => {
    if (onRowClick) {
      onRowClick(params.row);
    } else if (editPath) {
      const path = editPath.replace('{id}', getRowId(params.row));
      navigate(path);
    }
  }, [onRowClick, editPath, getRowId, navigate]);

  // Add actions column if renderActions is provided
  const columnsWithActions: GridColDef[] = renderActions
    ? [
        ...columns,
        {
          field: 'actions',
          headerName: 'Actions',
          width: 150,
          sortable: false,
          filterable: false,
          renderCell: (params) => renderActions(params.row as T),
        },
      ]
    : columns;

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-4">
        <p className="text-red-600 dark:text-red-400">Error loading data: {error}</p>
        <button
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {headerActions && (
        <div className="mb-4 flex justify-end">
          {headerActions}
        </div>
      )}
      <div ref={gridRef} style={{ height: resolvedHeight, width: '100%' }} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <DataGrid
          rows={rows}
          columns={columnsWithActions}
          getRowId={getRowId}
          loading={loading}
          // Pagination
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={pageSizeOptions}
          rowCount={totalRows}
          // Sorting
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={handleSortModelChange}
          // Filtering
          filterMode="server"
          filterModel={filterModel}
          onFilterModelChange={handleFilterModelChange}
          // Row interaction
          onRowClick={handleRowClick}
          checkboxSelection={checkboxSelection}
          disableRowSelectionOnClick={disableRowSelectionOnClick}
          // Styling
          sx={{
            '& .MuiDataGrid-main': {
              overflow: 'auto',
            },
            '& .MuiDataGrid-virtualScroller': {
              overflow: 'auto !important',
            },
            '& .MuiDataGrid-row:hover': {
              cursor: editPath || onRowClick ? 'pointer' : 'default',
            },
          }}
          localeText={{
            noRowsLabel: emptyMessage,
          }}
        />
      </div>
    </div>
  );
}
