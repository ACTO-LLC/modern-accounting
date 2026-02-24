import { GridColDef } from '@mui/x-data-grid';
import { formatDateTime } from './dateUtils';

/**
 * Returns standard CreatedAt and UpdatedAt column definitions for DataGrids.
 * These columns are sortable and formatted using formatDateTime.
 * Use these at the end of the column list (before any 'actions' column).
 */
export function getTimestampColumns(): GridColDef[] {
  return [
    {
      field: 'CreatedAt',
      headerName: 'Created',
      width: 170,
      filterable: true,
      renderCell: (params) => formatDateTime(params.value),
    },
    {
      field: 'UpdatedAt',
      headerName: 'Updated',
      width: 170,
      filterable: true,
      renderCell: (params) => formatDateTime(params.value),
    },
  ];
}
