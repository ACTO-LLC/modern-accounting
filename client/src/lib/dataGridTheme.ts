import { createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';

/**
 * Shared MUI DataGrid theme that forces light mode.
 *
 * MUI auto-detects system `prefers-color-scheme: dark` and applies dark mode
 * colors (light text on light background), even when the app UI is in light mode.
 * Defining only `colorSchemes.light` prevents the automatic dark mode switch.
 */
const dataGridTheme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        text: {
          primary: '#111827',   // Tailwind gray-900
          secondary: '#374151', // Tailwind gray-700
        },
      },
    },
  },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: { color: '#111827' },
        cell: { color: '#111827' },
        columnHeaderTitle: { color: '#374151', fontWeight: 600 },
      },
    },
  },
});

export default dataGridTheme;
