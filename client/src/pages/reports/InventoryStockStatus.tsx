import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../../lib/api';
import ReportHeader from '../../components/reports/ReportHeader';

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  QuantityOnHand: number | null;
  ReorderPoint: number | null;
  Status: 'Active' | 'Inactive';
}

interface InventoryLocation {
  Id: string;
  Name: string;
  Code: string | null;
  Status: 'Active' | 'Inactive';
}

type StockStatus = 'OK' | 'LOW' | 'OUT' | 'OVERSOLD';
type StatusFilter = 'all' | 'ok' | 'low' | 'out' | 'oversold';

function getStockStatus(qtyOnHand: number, reorderPoint: number): StockStatus {
  if (qtyOnHand < 0) return 'OVERSOLD';
  if (qtyOnHand === 0) return 'OUT';
  if (qtyOnHand <= reorderPoint) return 'LOW';
  return 'OK';
}

function getStatusBadge(status: StockStatus) {
  switch (status) {
    case 'OK':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          OK
        </span>
      );
    case 'LOW':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          LOW STOCK
        </span>
      );
    case 'OUT':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          OUT OF STOCK
        </span>
      );
    case 'OVERSOLD':
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          OVERSOLD
        </span>
      );
  }
}

export default function InventoryStockStatus() {
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  // Fetch inventory items
  const { data: inventoryItems, isLoading } = useQuery({
    queryKey: ['inventory-stock-status', asOfDate],
    queryFn: async () => {
      const response = await api.get<{ value: ProductService[] }>(
        "/productsservices?$filter=Type eq 'Inventory'&$orderby=Name"
      );
      return response.data.value;
    },
  });

  // Fetch locations for filter
  const { data: locations } = useQuery({
    queryKey: ['inventory-locations'],
    queryFn: async () => {
      const response = await api.get<{ value: InventoryLocation[] }>(
        "/inventorylocations?$filter=Status eq 'Active'"
      );
      return response.data.value;
    },
  });

  const formatNumber = (value: number | null) => {
    if (value === null || value === undefined) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  };

  // Process items with status
  const itemsWithStatus = inventoryItems?.map((item) => {
    const onHand = item.QuantityOnHand || 0;
    const reorderPoint = item.ReorderPoint || 0;
    // In a real system, committed qty would come from open orders
    const committed = 0; // Placeholder - would calculate from open sales orders
    const available = onHand - committed;
    const status = getStockStatus(available, reorderPoint);
    return { ...item, onHand, committed, available, reorderPoint, status };
  }) || [];

  // Apply filters
  const filteredItems = itemsWithStatus.filter((item) => {
    if (showLowStockOnly && item.status === 'OK') return false;
    if (statusFilter !== 'all' && item.status.toLowerCase() !== statusFilter) return false;
    return true;
  });

  // Calculate summary stats
  const stats = {
    total: itemsWithStatus.length,
    ok: itemsWithStatus.filter((i) => i.status === 'OK').length,
    low: itemsWithStatus.filter((i) => i.status === 'LOW').length,
    out: itemsWithStatus.filter((i) => i.status === 'OUT').length,
    oversold: itemsWithStatus.filter((i) => i.status === 'OVERSOLD').length,
  };

  const handleExportCSV = () => {
    if (!filteredItems || filteredItems.length === 0) return;

    const headers = ['Product', 'SKU', 'On Hand', 'Committed', 'Available', 'Reorder Point', 'Status'];
    const rows = filteredItems.map((item) => [
      item.Name,
      item.SKU || '',
      item.onHand.toString(),
      item.committed.toString(),
      item.available.toString(),
      item.reorderPoint.toString(),
      item.status,
    ]);

    const csvContent = [
      `Inventory Stock Status by Item`,
      `As of ${asOfDate}`,
      '',
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-stock-status-${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <ReportHeader
        title="Inventory Stock Status"
        subtitle={`As of ${new Date(asOfDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
        onExportCSV={handleExportCSV}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 print:hidden">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Total Items</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
        </div>
        <button
          onClick={() => setStatusFilter('ok')}
          className={`bg-white rounded-lg shadow p-4 text-left hover:ring-2 hover:ring-green-500 ${statusFilter === 'ok' ? 'ring-2 ring-green-500' : ''}`}
        >
          <p className="text-sm text-gray-500">OK</p>
          <p className="text-2xl font-semibold text-green-600">{stats.ok}</p>
        </button>
        <button
          onClick={() => setStatusFilter('low')}
          className={`bg-white rounded-lg shadow p-4 text-left hover:ring-2 hover:ring-yellow-500 ${statusFilter === 'low' ? 'ring-2 ring-yellow-500' : ''}`}
        >
          <p className="text-sm text-gray-500">Low Stock</p>
          <p className="text-2xl font-semibold text-yellow-600">{stats.low}</p>
        </button>
        <button
          onClick={() => setStatusFilter('out')}
          className={`bg-white rounded-lg shadow p-4 text-left hover:ring-2 hover:ring-red-500 ${statusFilter === 'out' ? 'ring-2 ring-red-500' : ''}`}
        >
          <p className="text-sm text-gray-500">Out of Stock</p>
          <p className="text-2xl font-semibold text-red-600">{stats.out}</p>
        </button>
        <button
          onClick={() => setStatusFilter('oversold')}
          className={`bg-white rounded-lg shadow p-4 text-left hover:ring-2 hover:ring-purple-500 ${statusFilter === 'oversold' ? 'ring-2 ring-purple-500' : ''}`}
        >
          <p className="text-sm text-gray-500">Oversold</p>
          <p className="text-2xl font-semibold text-purple-600">{stats.oversold}</p>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6 print:hidden">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              As of Date
            </label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
          </div>

          {locations && locations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              >
                <option value="all">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.Id} value={loc.Id}>
                    {loc.Name} {loc.Code ? `(${loc.Code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="all">All Statuses</option>
              <option value="ok">OK</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
              <option value="oversold">Oversold</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              id="lowStockOnly"
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(e) => setShowLowStockOnly(e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="lowStockOnly" className="ml-2 block text-sm text-gray-900">
              Show alerts only
            </label>
          </div>

          {statusFilter !== 'all' && (
            <button
              onClick={() => setStatusFilter('all')}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      {/* Low Stock Alerts */}
      {(stats.low > 0 || stats.out > 0 || stats.oversold > 0) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
            <span className="font-medium text-yellow-800">Stock Alerts:</span>
            <span className="ml-2 text-yellow-700">
              {stats.low > 0 && `${stats.low} low stock`}
              {stats.low > 0 && (stats.out > 0 || stats.oversold > 0) && ', '}
              {stats.out > 0 && `${stats.out} out of stock`}
              {stats.out > 0 && stats.oversold > 0 && ', '}
              {stats.oversold > 0 && `${stats.oversold} oversold`}
            </span>
          </div>
        </div>
      )}

      {/* Report Content */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : filteredItems && filteredItems.length > 0 ? (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  On Hand
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Committed
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Available
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reorder Pt
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => (
                <tr key={item.Id} className={item.status !== 'OK' ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="flex items-center">
                        <Package className="w-4 h-4 text-indigo-500 mr-2" />
                        <span className="text-sm font-medium text-gray-900">{item.Name}</span>
                      </div>
                      {item.SKU && (
                        <span className="text-xs text-gray-500 ml-6">{item.SKU}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(item.onHand)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {formatNumber(item.committed)}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                    item.available < 0 ? 'text-red-600' : item.available <= item.reorderPoint ? 'text-yellow-600' : 'text-gray-900'
                  }`}>
                    {formatNumber(item.available)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {formatNumber(item.reorderPoint)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {getStatusBadge(item.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-500">
            {statusFilter !== 'all'
              ? `No items with "${statusFilter.toUpperCase()}" status found.`
              : 'No inventory items found.'}
          </p>
        </div>
      )}
    </div>
  );
}
