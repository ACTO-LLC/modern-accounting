import { useState, useCallback } from 'react';
import type {
  GridSortModel,
  GridFilterModel,
  GridPaginationModel,
} from '@mui/x-data-grid';

const STORAGE_PREFIX = 'datagrid-state:';

interface PersistedState {
  sortModel?: GridSortModel;
  filterModel?: GridFilterModel;
  paginationModel?: GridPaginationModel;
}

function loadState(key: string): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {};
  }
}

function saveState(key: string, state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

interface UseDataGridStateOptions {
  /** Unique key identifying this grid (e.g., "invoices-grid") */
  gridKey: string;
  /** Default sort model if nothing is persisted */
  defaultSortModel?: GridSortModel;
  /** Default filter model if nothing is persisted */
  defaultFilterModel?: GridFilterModel;
  /** Default pagination model if nothing is persisted */
  defaultPaginationModel?: GridPaginationModel;
}

interface UseDataGridStateReturn {
  sortModel: GridSortModel;
  filterModel: GridFilterModel;
  paginationModel: GridPaginationModel;
  onSortModelChange: (model: GridSortModel) => void;
  onFilterModelChange: (model: GridFilterModel) => void;
  onPaginationModelChange: (model: GridPaginationModel) => void;
}

/**
 * Custom hook that persists MUI DataGrid sort, filter, and pagination state
 * to localStorage. Each grid is independently keyed.
 *
 * Usage:
 *   const gridState = useDataGridState({ gridKey: 'invoices-grid' });
 *   <DataGrid
 *     sortModel={gridState.sortModel}
 *     onSortModelChange={gridState.onSortModelChange}
 *     filterModel={gridState.filterModel}
 *     onFilterModelChange={gridState.onFilterModelChange}
 *     paginationModel={gridState.paginationModel}
 *     onPaginationModelChange={gridState.onPaginationModelChange}
 *   />
 */
export default function useDataGridState({
  gridKey,
  defaultSortModel = [],
  defaultFilterModel = { items: [] },
  defaultPaginationModel = { page: 0, pageSize: 25 },
}: UseDataGridStateOptions): UseDataGridStateReturn {
  // Load persisted state once on mount (useState initializer runs once)
  const [persisted] = useState<PersistedState>(() => loadState(gridKey));

  const [sortModel, setSortModel] = useState<GridSortModel>(
    persisted.sortModel ?? defaultSortModel,
  );
  const [filterModel, setFilterModel] = useState<GridFilterModel>(
    persisted.filterModel ?? defaultFilterModel,
  );
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>(
    persisted.paginationModel ?? defaultPaginationModel,
  );

  const onSortModelChange = useCallback(
    (model: GridSortModel) => {
      setSortModel(model);
      const current = loadState(gridKey);
      saveState(gridKey, { ...current, sortModel: model });
    },
    [gridKey],
  );

  const onFilterModelChange = useCallback(
    (model: GridFilterModel) => {
      setFilterModel(model);
      const current = loadState(gridKey);
      saveState(gridKey, { ...current, filterModel: model });
    },
    [gridKey],
  );

  const onPaginationModelChange = useCallback(
    (model: GridPaginationModel) => {
      setPaginationModel(model);
      const current = loadState(gridKey);
      saveState(gridKey, { ...current, paginationModel: model });
    },
    [gridKey],
  );

  return {
    sortModel,
    filterModel,
    paginationModel,
    onSortModelChange,
    onFilterModelChange,
    onPaginationModelChange,
  };
}
