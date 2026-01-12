import { useState, useCallback, useEffect } from 'react';
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
}

interface GraphQLResponse<T> {
  items: T[];
  hasNextPage: boolean;
  endCursor: string | null;
}

interface PaginationState {
  cursors: (string | null)[];
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
  height = 600,
  checkboxSelection = false,
  disableRowSelectionOnClick = true,
  emptyMessage = 'No data found.',
}: ServerDataGridProps<T>) {
  const navigate = useNavigate();

  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);

  // Pagination state with cursor tracking
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: initialPageSize,
  });
  const [paginationState, setPaginationState] = useState<PaginationState>({
    cursors: [null], // First page has no cursor
  });

  // Sorting state
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // Filter state
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  // Sanitize GraphQL identifiers to prevent malformed queries
  const sanitizeGraphQLIdentifier = useCallback((value: string): string | null => {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : null;
  }, []);

  // Escape string values for GraphQL
  const escapeGraphQLString = useCallback((value: string): string => {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  }, []);

  // Build the GraphQL orderBy parameter
  const buildOrderBy = useCallback((sort: GridSortModel): string | null => {
    if (sort.length === 0) return null;

    const { field, sort: direction } = sort[0];
    const safeField = sanitizeGraphQLIdentifier(String(field));
    if (!safeField) {
      console.warn(`Invalid field name for orderBy: ${field}`);
      return null;
    }

    const upperDirection = (direction || 'asc').toString().toUpperCase();
    const safeDirection = upperDirection === 'ASC' || upperDirection === 'DESC' ? upperDirection : 'ASC';

    return `{ ${safeField}: ${safeDirection} }`;
  }, [sanitizeGraphQLIdentifier]);

  // Build the GraphQL filter parameter
  const buildFilter = useCallback((filter: GridFilterModel, base?: Record<string, unknown>): string | null => {
    const filterParts: string[] = [];

    // Add base filter if provided
    if (base) {
      Object.entries(base).forEach(([field, condition]) => {
        const safeField = sanitizeGraphQLIdentifier(field);
        if (!safeField) {
          console.warn(`Invalid field name in base filter: ${field}`);
          return;
        }
        if (typeof condition === 'object' && condition !== null) {
          Object.entries(condition as Record<string, unknown>).forEach(([op, value]) => {
            const safeOp = sanitizeGraphQLIdentifier(op);
            if (!safeOp) {
              console.warn(`Invalid operator in base filter: ${op}`);
              return;
            }
            const formattedValue = typeof value === 'string' ? `"${escapeGraphQLString(value)}"` : value;
            filterParts.push(`${safeField}: { ${safeOp}: ${formattedValue} }`);
          });
        }
      });
    }

    // Add user filters
    filter.items.forEach((item) => {
      if (item.value !== undefined && item.value !== null && item.value !== '') {
        const safeField = sanitizeGraphQLIdentifier(String(item.field));
        if (!safeField) {
          console.warn(`Invalid field name in filter: ${item.field}`);
          return;
        }
        const operator = operatorMap[item.operator] || 'contains';
        const value = typeof item.value === 'string' ? `"${escapeGraphQLString(item.value)}"` : item.value;
        filterParts.push(`${safeField}: { ${operator}: ${value} }`);
      }
    });

    if (filterParts.length === 0) return null;
    return `{ ${filterParts.join(', ')} }`;
  }, [sanitizeGraphQLIdentifier, escapeGraphQLString]);

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

        // Store the endCursor for the next page
        if (data.endCursor && paginationModel.page >= paginationState.cursors.length - 1) {
          setPaginationState({
            cursors: [...paginationState.cursors, data.endCursor],
          });
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
      setPaginationState({ cursors: [null] });
      setPaginationModel({ ...newModel, page: 0 });
    } else {
      setPaginationModel(newModel);
    }
  }, [paginationModel.pageSize]);

  // Handle sort changes
  const handleSortModelChange = useCallback((newSortModel: GridSortModel) => {
    // Reset pagination when sorting changes
    setPaginationState({ cursors: [null] });
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setSortModel(newSortModel);
  }, []);

  // Handle filter changes
  const handleFilterModelChange = useCallback((newFilterModel: GridFilterModel) => {
    // Reset pagination when filters change
    setPaginationState({ cursors: [null] });
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setFilterModel(newFilterModel);
  }, []);

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
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-600">Error loading data: {error}</p>
        <button
          onClick={fetchData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
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
      <div style={{ height, width: '100%' }} className="bg-white rounded-lg shadow">
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
            border: 'none',
            '& .MuiDataGrid-cell:focus': {
              outline: 'none',
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: 'rgba(79, 70, 229, 0.04)',
              cursor: editPath || onRowClick ? 'pointer' : 'default',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
            },
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid #e5e7eb',
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
