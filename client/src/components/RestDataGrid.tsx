import { useState, useEffect, useCallback } from 'react';
import {
  DataGrid,
  GridColDef,
  GridPaginationModel,
  GridSortModel,
  GridFilterModel,
  GridRowParams,
  GridValidRowModel,
} from '@mui/x-data-grid';
import { ThemeProvider } from '@mui/material/styles';
import dataGridTheme from '../lib/dataGridTheme';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface RestDataGridProps<T extends GridValidRowModel> {
  // The REST API endpoint (e.g., '/invoices', '/customers')
  endpoint: string;
  // Column definitions for the DataGrid
  columns: GridColDef[];
  // Optional row click handler
  onRowClick?: (row: T) => void;
  // Optional edit path template (e.g., '/invoices/{id}/edit')
  editPath?: string;
  // Initial page size
  initialPageSize?: number;
  // Available page size options
  pageSizeOptions?: number[];
  // Optional custom row ID field (defaults to 'Id')
  getRowId?: (row: T) => string;
  // Optional OData filter to always apply
  baseFilter?: string;
  // Optional data transformation function
  transformData?: (data: T[]) => T[];
  // Grid height
  height?: number | string;
  // Enable checkbox selection
  checkboxSelection?: boolean;
  // Disable row selection on click
  disableRowSelectionOnClick?: boolean;
  // Custom empty state message
  emptyMessage?: string;
  // Optional header actions
  headerActions?: React.ReactNode;
  // Refresh key to force reload
  refreshKey?: number;
}

export default function RestDataGrid<T extends GridValidRowModel>({
  endpoint,
  columns,
  onRowClick,
  editPath,
  initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  getRowId = (row) => (row as unknown as { Id: string }).Id,
  baseFilter,
  transformData,
  height = 600,
  checkboxSelection = false,
  disableRowSelectionOnClick = true,
  emptyMessage = 'No data found.',
  headerActions,
  refreshKey = 0,
}: RestDataGridProps<T>) {
  const navigate = useNavigate();

  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state (client-side)
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: initialPageSize,
  });

  // Sorting state (client-side)
  const [sortModel, setSortModel] = useState<GridSortModel>([]);

  // Filter state (client-side)
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });

  // Fetch data from REST API
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let url = endpoint;
      if (baseFilter) {
        url += `?$filter=${encodeURIComponent(baseFilter)}`;
      }

      const response = await api.get<{ value: T[] }>(url);
      let data = response.data.value || [];

      if (transformData) {
        data = transformData(data);
      }

      setRows(data);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, baseFilter, transformData]);

  // Fetch data on mount and when dependencies change
  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  // Handle row click
  const handleRowClick = useCallback((params: GridRowParams<T>) => {
    if (onRowClick) {
      onRowClick(params.row);
    } else if (editPath) {
      const path = editPath.replace('{id}', getRowId(params.row));
      navigate(path);
    }
  }, [onRowClick, editPath, getRowId, navigate]);

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
      <div style={{ height, width: '100%' }} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <ThemeProvider theme={dataGridTheme}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={getRowId}
            loading={loading}
            // Client-side pagination
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={pageSizeOptions}
            // Client-side sorting
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            // Client-side filtering
            filterModel={filterModel}
            onFilterModelChange={setFilterModel}
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
                backgroundColor: 'rgba(79, 70, 229, 0.04)',
                cursor: editPath || onRowClick ? 'pointer' : 'default',
              },
            }}
            localeText={{
              noRowsLabel: emptyMessage,
            }}
          />
        </ThemeProvider>
      </div>
    </div>
  );
}
