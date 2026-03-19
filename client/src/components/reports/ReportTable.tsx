import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

export interface ReportColumn {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  format?: (value: any, row: any) => ReactNode;
}

export interface ReportRow {
  [key: string]: any;
  isHeader?: boolean;
  isTotal?: boolean;
  isSubtotal?: boolean;
  indent?: number;
  /** When set, the row becomes clickable and navigates to this URL */
  href?: string;
}

interface ReportTableProps {
  columns: ReportColumn[];
  data: ReportRow[];
}

export { formatCurrencyStandalone as formatCurrency } from '../../contexts/CurrencyContext';

/**
 * Sanitizes a cell value to prevent CSV formula injection.
 * If a value starts with =, +, -, or @, it's prefixed with a single quote
 * to prevent spreadsheet applications from interpreting it as a formula.
 */
function sanitizeCSVValue(value: string): string {
  const trimmed = String(value).trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || 
      trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${trimmed}`;
  }
  return trimmed;
}

export function exportToCSV(filename: string, columns: ReportColumn[], data: ReportRow[]) {
  const headers = columns.map((col) => col.header);
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = row[col.key];
      if (value === undefined || value === null) return '';
      if (typeof value === 'number') return value.toString();
      const sanitized = sanitizeCSVValue(String(value));
      return `"${sanitized.replace(/"/g, '""')}"`;
    })
  );

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  // Delay revocation to ensure download completes
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export default function ReportTable({ columns, data }: ReportTableProps) {
  const navigate = useNavigate();

  const getAlignment = (align?: 'left' | 'right' | 'center') => {
    switch (align) {
      case 'right':
        return 'text-right';
      case 'center':
        return 'text-center';
      default:
        return 'text-left';
    }
  };

  const getRowClasses = (row: ReportRow) => {
    const classes: string[] = [];
    if (row.isHeader) {
      classes.push('bg-gray-50 dark:bg-gray-800 font-semibold text-gray-900 dark:text-gray-100');
    } else if (row.isTotal) {
      classes.push('bg-gray-100 dark:bg-gray-700 font-bold text-gray-900 dark:text-gray-100 border-t-2 border-gray-300 dark:border-gray-500');
    } else if (row.isSubtotal) {
      classes.push('font-semibold text-gray-800 dark:text-gray-200 border-t border-gray-200 dark:border-gray-600');
    }
    if (row.href) {
      classes.push('cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors');
    }
    return classes.join(' ');
  };

  const getCellClasses = (row: ReportRow, column: ReportColumn) => {
    const classes: string[] = [
      'px-4 py-2 print:px-2 print:py-1 print:text-xs',
      getAlignment(column.align),
    ];

    // Use explicit Tailwind classes for indentation to work with JIT compiler
    if (row.indent && column.key === columns[0].key) {
      const indentClasses = ['pl-8', 'pl-12', 'pl-16', 'pl-20', 'pl-24'];
      const indentLevel = Math.max(1, row.indent);
      const index = Math.min(indentLevel - 1, indentClasses.length - 1);
      classes.push(indentClasses[index]);
    }

    if (row.href && column.key === columns[0].key) {
      classes.push('text-indigo-600 dark:text-indigo-400 underline decoration-dotted underline-offset-2');
    }

    if (column.className) {
      classes.push(column.className);
    }
    return classes.join(' ');
  };

  const handleRowClick = (row: ReportRow) => {
    if (row.href) {
      navigate(row.href);
    }
  };

  return (
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-800 print:bg-white">
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider print:px-2 print:py-1 ${getAlignment(
                column.align
              )}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
        {data.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            className={getRowClasses(row)}
            onClick={() => handleRowClick(row)}
            data-testid={row.href ? 'drilldown-row' : undefined}
          >
            {columns.map((column) => (
              <td key={column.key} className={getCellClasses(row, column)}>
                {column.format
                  ? column.format(row[column.key], row)
                  : row[column.key] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
