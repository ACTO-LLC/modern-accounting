import { Printer, Download } from 'lucide-react';

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  dateRange?: string;
  onExportCSV?: () => void;
}

export default function ReportHeader({
  title,
  subtitle,
  dateRange,
  onExportCSV,
}: ReportHeaderProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 print:text-xl">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500 print:text-xs">{subtitle}</p>
          )}
          {dateRange && (
            <p className="mt-1 text-sm font-medium text-gray-700 print:text-xs">
              {dateRange}
            </p>
          )}
        </div>
        <div className="flex gap-2 print:hidden">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          {onExportCSV && (
            <button
              onClick={onExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
