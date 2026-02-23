import { createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';

/**
 * Shared MUI theme that syncs with Tailwind's dark mode.
 *
 * Uses `colorSchemeSelector: '.dark'` so MUI switches schemes based on the
 * `.dark` class on <html> — the same selector Tailwind uses. This keeps both
 * systems in sync regardless of whether the user picked light/dark/system.
 */
const appTheme = createTheme({
  cssVariables: { colorSchemeSelector: '.dark' },
  colorSchemes: {
    light: {
      palette: {
        text: {
          primary: '#111827',   // Tailwind gray-900
          secondary: '#374151', // Tailwind gray-700
        },
        divider: '#e5e7eb',     // Tailwind gray-200
        background: {
          default: '#ffffff',
          paper: '#f9fafb',     // Tailwind gray-50 (header bg)
        },
      },
    },
    dark: {
      palette: {
        text: {
          primary: '#f3f4f6',   // Tailwind gray-100
          secondary: '#d1d5db', // Tailwind gray-300
        },
        divider: '#374151',     // Tailwind gray-700
        background: {
          default: '#1f2937',   // Tailwind gray-800
          paper: '#1f2937',
        },
      },
    },
  },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          '--DataGrid-containerBackground': 'var(--mui-palette-background-default)',
          border: '1px solid var(--mui-palette-divider)',
          color: 'var(--mui-palette-text-primary)',
          '& .MuiDataGrid-columnHeaderTitle': {
            fontWeight: 600,
          },
          '& .MuiDataGrid-cell:focus': {
            outline: 'none',
          },
          '& .MuiDataGrid-cell': {
            borderColor: 'var(--mui-palette-divider)',
          },
          '& .MuiDataGrid-columnHeaders': {
            borderColor: 'var(--mui-palette-divider)',
          },
          '& .MuiDataGrid-footerContainer': {
            borderColor: 'var(--mui-palette-divider)',
          },
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'var(--mui-palette-action-hover)',
          },
        },
        columnHeaders: {
          '--DataGrid-containerBackground': 'var(--mui-palette-background-default)',
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: { color: 'var(--mui-palette-text-secondary)' },
        selectLabel: { color: 'var(--mui-palette-text-secondary)' },
        displayedRows: { color: 'var(--mui-palette-text-secondary)' },
        select: { color: 'var(--mui-palette-text-primary)' },
        selectIcon: { color: 'var(--mui-palette-text-secondary)' },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: 'var(--mui-palette-text-secondary)',
          '&.Mui-disabled': {
            color: 'var(--mui-palette-action-disabled)',
          },
        },
      },
    },
  },
});

export default appTheme;
