import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
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
import { formatDateLong, formatDateTime } from '../../lib/dateUtils';

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  IssueDate: string;
  TotalAmount: number;
  Status: string;
}

interface InvoiceLine {
  Id: string;
  InvoiceId: string;
  ProductServiceId: string | null;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount: number;
}

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: string;
  Category: string | null;
}

interface ProductSalesData {
  productId: string | null;
  productName: string;
  sku: string | null;
  category: string | null;
  quantitySold: number;
  totalAmount: number;
  percentOfSales: number;
}

const COLORS = [
  '#10B981', // Emerald
  '#4F46E5', // Indigo
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo light
];

export default function SalesByProduct() {
  const navigate = useNavigate();
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading, error: invoicesError } = useQuery({
    queryKey: ['invoices-sales-by-product'],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>('/invoices');
      return response.data.value;
    },
  });

  // Fetch invoice lines
  const { data: invoiceLines, isLoading: linesLoading } = useQuery({
    queryKey: ['invoice-lines-sales-by-product'],
    queryFn: async () => {
      const response = await api.get<{ value: InvoiceLine[] }>('/invoicelines');
      return response.data.value;
    },
  });

  // Fetch products/services for names
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products-sales-report'],
    queryFn: async () => {
      const response = await api.get<{ value: ProductService[] }>('/productsservices');
      return response.data.value;
    },
  });

  const isLoading = invoicesLoading || linesLoading || productsLoading;
  const error = invoicesError;

  // Get unique categories
  const categories = useMemo(() => {
    if (!products) return [];
    const cats = new Set(products.filter((p) => p.Category).map((p) => p.Category as string));
    return Array.from(cats).sort();
  }, [products]);

  // Calculate sales by product
  const salesData = useMemo(() => {
    if (!invoices || !invoiceLines) {
      return { productSales: [] as ProductSalesData[], totalSales: 0 };
    }

    // Create invoice map for date filtering
    const invoiceMap = new Map(invoices.map((inv) => [inv.Id, inv]));

    // Create product map for names
    const productMap = new Map(products?.map((p) => [p.Id, p]) || []);

    // Parse dates
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    // Filter and aggregate lines
    const productSalesMap = new Map<string, ProductSalesData>();

    invoiceLines.forEach((line) => {
      const invoice = invoiceMap.get(line.InvoiceId);
      if (!invoice) return;

      // Check date range and status
      const issueDate = new Date(invoice.IssueDate);
      if (
        issueDate < start ||
        issueDate > end ||
        invoice.Status === 'Voided' ||
        invoice.Status === 'Cancelled'
      ) {
        return;
      }

      // Get product info
      const product = line.ProductServiceId ? productMap.get(line.ProductServiceId) : null;
      const productKey = line.ProductServiceId || 'no-product';
      const productName = product?.Name || line.Description || 'Uncategorized';
      const category = product?.Category || null;

      // Apply category filter
      if (categoryFilter !== 'all') {
        if (category !== categoryFilter) return;
      }

      const existing = productSalesMap.get(productKey);
      const lineAmount = line.Amount || line.Quantity * line.UnitPrice;

      if (existing) {
        existing.quantitySold += line.Quantity || 0;
        existing.totalAmount += lineAmount;
      } else {
        productSalesMap.set(productKey, {
          productId: line.ProductServiceId,
          productName,
          sku: product?.SKU || null,
          category,
          quantitySold: line.Quantity || 0,
          totalAmount: lineAmount,
          percentOfSales: 0,
        });
      }
    });

    // Calculate total sales
    const totalSales = Array.from(productSalesMap.values()).reduce(
      (sum, p) => sum + p.totalAmount,
      0
    );

    // Convert to array with percentages and sort by amount descending
    const productSales: ProductSalesData[] = Array.from(productSalesMap.values())
      .map((p) => ({
        ...p,
        percentOfSales: totalSales > 0 ? (p.totalAmount / totalSales) * 100 : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return { productSales, totalSales };
  }, [invoices, invoiceLines, products, startDate, endDate, categoryFilter]);

  // Prepare chart data (top 10 products)
  const chartData = useMemo(() => {
    return salesData.productSales.slice(0, 10).map((p) => ({
      name: p.productName.length > 20 ? p.productName.substring(0, 17) + '...' : p.productName,
      fullName: p.productName,
      amount: p.totalAmount,
      percent: p.percentOfSales,
      quantity: p.quantitySold,
    }));
  }, [salesData.productSales]);

  const columns: ReportColumn[] = [
    { key: 'productName', header: 'Product/Service', align: 'left' },
    { key: 'sku', header: 'SKU', align: 'left' },
    { key: 'category', header: 'Category', align: 'left' },
    {
      key: 'quantitySold',
      header: 'Qty Sold',
      align: 'right',
      format: (value) => (value || 0).toLocaleString(),
    },
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
    const rows: ReportRow[] = salesData.productSales.map((p) => ({
      productName: p.productName,
      sku: p.sku || '-',
      category: p.category || '-',
      quantitySold: p.quantitySold,
      totalAmount: p.totalAmount,
      percentOfSales: p.percentOfSales,
      productId: p.productId,
    }));

    // Add total row
    if (rows.length > 0) {
      rows.push({
        productName: 'TOTAL',
        sku: '',
        category: '',
        quantitySold: rows.reduce((sum, r) => sum + (r.quantitySold || 0), 0),
        totalAmount: salesData.totalSales,
        percentOfSales: 100,
        isTotal: true,
      });
    }

    return rows;
  }, [salesData]);

  const handleExportCSV = () => {
    exportToCSV(`sales-by-product-${startDate}-to-${endDate}`, columns, tableData);
  };

  const formatDateRange = () =>
    `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;

  const handleRowClick = (row: ReportRow) => {
    if (row.productId && !row.isTotal) {
      // Navigate to product detail page
      navigate(`/products-services/${row.productId}/edit`);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border border-gray-200">
          <p className="font-medium text-gray-900">{data.fullName}</p>
          <p className="text-sm text-gray-600">{formatCurrency(data.amount)}</p>
          <p className="text-sm text-gray-500">
            {data.quantity.toLocaleString()} units ({data.percent.toFixed(1)}%)
          </p>
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
        title="Sales by Product/Service Summary"
        subtitle="Sales breakdown by product and service for the selected period"
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
            <label className="text-sm font-medium text-gray-700">Category:</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
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
              <Package className="h-8 w-8 text-emerald-500" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Products/Services</p>
              <p className="text-2xl font-semibold text-gray-900">
                {salesData.productSales.length}
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
            <p className="text-sm font-medium text-gray-500">Total Units Sold</p>
            <p className="text-2xl font-semibold text-gray-900">
              {salesData.productSales
                .reduce((sum, p) => sum + p.quantitySold, 0)
                .toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {salesData.productSales.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-500">No sales found for the selected period.</p>
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="bg-white shadow rounded-lg p-6 mb-6 print:hidden">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Top 10 Products/Services by Sales
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'bar' ? (
                  <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                    />
                    <YAxis type="category" dataKey="name" width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="amount" fill="#10B981">
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
                    : row.productId
                    ? 'hover:bg-blue-50 cursor-pointer'
                    : '';

                  return (
                    <tr
                      key={row.productId || `row-${rowIndex}`}
                      className={rowClasses}
                      onClick={() => handleRowClick(row)}
                      title={
                        row.isTotal
                          ? undefined
                          : row.productId
                          ? 'Click to view product details'
                          : undefined
                      }
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
          {formatDateTime(new Date())}
        </p>
      </div>
    </div>
  );
}
