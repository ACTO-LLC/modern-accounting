import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import api from '../../lib/api';
import { DateRangePicker, ReportHeader, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import { formatDateLong } from '../../lib/dateUtils';

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  IssueDate: string;
  TotalAmount: number;
  Status: string;
}

interface CustomerSalesData {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalAmount: number;
  percentOfSales: number;
}

const COLORS = [
  '#4F46E5', // Indigo
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo light
];

export default function SalesByCustomer() {
  const navigate = useNavigate();
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading, error: invoicesError } = useQuery({
    queryKey: ['invoices-sales-report'],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>('/invoices');
      return response.data.value;
    },
  });

  const isLoading = invoicesLoading;
  const error = invoicesError;

  // Calculate sales by customer
  const salesData = useMemo(() => {
    if (!invoices) {
      return { customerSales: [] as CustomerSalesData[], totalSales: 0 };
    }

    // Parse dates
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    // Filter invoices by date range and exclude voided/cancelled
    const filteredInvoices = invoices.filter((inv) => {
      const issueDate = new Date(inv.IssueDate);
      return (
        issueDate >= start &&
        issueDate <= end &&
        inv.Status !== 'Voided' &&
        inv.Status !== 'Cancelled'
      );
    });

    // Group by customer
    const customerMap = new Map<string, { customerId: string; customerName: string; invoiceCount: number; totalAmount: number }>();

    filteredInvoices.forEach((inv) => {
      const existing = customerMap.get(inv.CustomerId);
      if (existing) {
        existing.invoiceCount += 1;
        existing.totalAmount += inv.TotalAmount || 0;
      } else {
        customerMap.set(inv.CustomerId, {
          customerId: inv.CustomerId,
          customerName: inv.CustomerName || 'Unknown Customer',
          invoiceCount: 1,
          totalAmount: inv.TotalAmount || 0,
        });
      }
    });

    // Calculate total sales
    const totalSales = Array.from(customerMap.values()).reduce((sum, c) => sum + c.totalAmount, 0);

    // Convert to array with percentages and sort by amount descending
    const customerSales: CustomerSalesData[] = Array.from(customerMap.values())
      .map((c) => ({
        ...c,
        percentOfSales: totalSales > 0 ? (c.totalAmount / totalSales) * 100 : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return { customerSales, totalSales };
  }, [invoices, startDate, endDate]);

  // Prepare chart data (top 10 customers)
  const chartData = useMemo(() => {
    return salesData.customerSales.slice(0, 10).map((c) => ({
      name: c.customerName.length > 20 ? c.customerName.substring(0, 17) + '...' : c.customerName,
      fullName: c.customerName,
      amount: c.totalAmount,
      percent: c.percentOfSales,
    }));
  }, [salesData.customerSales]);

  const columns: ReportColumn[] = [
    { key: 'customerName', header: 'Customer', align: 'left' },
    { key: 'invoiceCount', header: 'Invoices', align: 'right' },
    {
      key: 'totalAmount',
      header: 'Amount',
      align: 'right',
      format: (value) => formatCurrency(value || 0),
    },
    {
      key: 'percentOfSales',
      header: '% of Sales',
      align: 'right',
      format: (value) => `${(value || 0).toFixed(1)}%`,
    },
  ];

  const tableData: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = salesData.customerSales.map((c) => ({
      customerName: c.customerName,
      invoiceCount: c.invoiceCount,
      totalAmount: c.totalAmount,
      percentOfSales: c.percentOfSales,
      customerId: c.customerId,
    }));

    // Add total row
    if (rows.length > 0) {
      rows.push({
        customerName: 'TOTAL',
        invoiceCount: rows.reduce((sum, r) => sum + (r.invoiceCount || 0), 0),
        totalAmount: salesData.totalSales,
        percentOfSales: 100,
        isTotal: true,
      });
    }

    return rows;
  }, [salesData]);

  const handleExportCSV = () => {
    exportToCSV(`sales-by-customer-${startDate}-to-${endDate}`, columns, tableData);
  };

  const formatDateRange = () =>
    `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;

  const handleRowClick = (row: ReportRow) => {
    if (row.customerId && !row.isTotal) {
      // Navigate to customer invoices filtered view
      navigate(`/invoices?customer=${row.customerId}`);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
          <p className="font-medium text-gray-900">{data.fullName}</p>
          <p className="text-sm text-gray-600">{formatCurrency(data.amount)}</p>
          <p className="text-sm text-gray-500">{data.percent.toFixed(1)}% of sales</p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return (
      <div className="max-w-6xl mx-auto p-4">
        <p className="text-red-600 font-medium">Unable to load sales data.</p>
        <p className="text-gray-600 mt-2">{message}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 print:hidden">
        <Link
          to="/reports"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Reports
        </Link>
      </div>

      <ReportHeader
        title="Sales by Customer Summary"
        subtitle="Sales breakdown by customer for the selected period"
        dateRange={formatDateRange()}
        onExportCSV={handleExportCSV}
      />

      {/* Filters */}
      <div className="mb-6 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Chart Type:</label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as 'bar' | 'pie')}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="bar">Bar Chart</option>
              <option value="pie">Pie Chart</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-indigo-500" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Customers</p>
              <p className="text-2xl font-semibold text-gray-900">
                {salesData.customerSales.length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Total Sales</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(salesData.totalSales)}
            </p>
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Avg. per Customer</p>
            <p className="text-2xl font-semibold text-gray-900">
              {formatCurrency(
                salesData.customerSales.length > 0
                  ? salesData.totalSales / salesData.customerSales.length
                  : 0
              )}
            </p>
          </div>
        </div>
      </div>

      {salesData.customerSales.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-500">No sales found for the selected period.</p>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="bg-white shadow rounded-lg p-6 mb-6 print:hidden">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Top 10 Customers by Sales
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="amount" fill="#4F46E5">
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="amount"
                      nameKey="name"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 print:bg-white">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider print:px-2 print:py-1 ${
                        column.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tableData.map((row, rowIndex) => {
                  const rowClasses = row.isTotal
                    ? 'bg-gray-100 font-bold text-gray-900 border-t-2 border-gray-300'
                    : 'hover:bg-blue-50 cursor-pointer';

                  return (
                    <tr
                      key={row.customerId || `row-${rowIndex}`}
                      className={rowClasses}
                      onClick={() => handleRowClick(row)}
                      title={row.isTotal ? undefined : 'Click to view invoices for this customer'}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={`px-4 py-2 print:px-2 print:py-1 print:text-xs ${
                            column.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {column.format
                            ? column.format(row[column.key], row)
                            : row[column.key] ?? ''}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-6 text-center text-sm text-gray-500 print:mt-4 print:text-xs">
        <p>
          Generated on{' '}
          {formatDateLong(new Date())}
        </p>
      </div>
    </div>
  );
}
