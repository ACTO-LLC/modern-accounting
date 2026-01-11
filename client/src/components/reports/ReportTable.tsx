import type { ReactNode } from 'react';

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
}

interface ReportTableProps {
  columns: ReportColumn[];
  data: ReportRow[];
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

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
      classes.push('bg-gray-50 font-semibold text-gray-900');
    } else if (row.isTotal) {
      classes.push('bg-gray-100 font-bold text-gray-900 border-t-2 border-gray-300');
    } else if (row.isSubtotal) {
      classes.push('font-semibold text-gray-800 border-t border-gray-200');
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

    if (column.className) {
      classes.push(column.className);
    }
    return classes.join(' ');
  };

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 print:bg-white">
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider print:px-2 print:py-1 ${getAlignment(
                column.align
              )}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row, rowIndex) => (
          <tr key={rowIndex} className={getRowClasses(row)}>
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
