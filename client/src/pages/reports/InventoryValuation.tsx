import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import api from '../../lib/api';
import ReportHeader from '../../components/reports/ReportHeader';
import { formatDateLong } from '../../lib/dateUtils';
import { useCurrency } from '../../contexts/CurrencyContext';

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  QuantityOnHand: number | null;
  PurchaseCost: number | null;
  InventoryValuationMethod: string | null;
  Status: 'Active' | 'Inactive';
}

interface InventoryLocation {
  Id: string;
  Name: string;
  Code: string | null;
  Status: 'Active' | 'Inactive';
}

export default function InventoryValuation() {
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [locationFilter, setLocationFilter] = useState<string>('all');

  // Fetch inventory items
  const { data: inventoryItems, isLoading, error } = useQuery({
    queryKey: ['inventory-valuation', asOfDate, locationFilter],
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

  const { formatCurrency: formatCurrencyBase } = useCurrency();
  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return formatCurrencyBase(0);
    return formatCurrencyBase(value);
  };

  const formatNumber = (value: number | null) => {
    if (value === null || value === undefined) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  };

  // Filter items by location (Note: location filtering would require inventory-location relationship in the database)
  // For now, we filter client-side if we had location data on items. This is a placeholder for proper implementation.
  const filteredItems = inventoryItems || [];

  // Calculate totals based on filtered items
  const totalQuantity = filteredItems.reduce((sum, item) => sum + (item.QuantityOnHand || 0), 0);
  const totalValue = filteredItems.reduce((sum, item) => {
    return sum + ((item.QuantityOnHand || 0) * (item.PurchaseCost || 0));
  }, 0);

  const handleExportCSV = () => {
    if (!filteredItems || filteredItems.length === 0) return;

    const headers = ['Product', 'SKU', 'Qty on Hand', 'Avg Cost', 'Asset Value', 'Valuation Method'];
    const rows = filteredItems.map((item) => {
      const value = (item.QuantityOnHand || 0) * (item.PurchaseCost || 0);
      return [
        item.Name,
        item.SKU || '',
        (item.QuantityOnHand || 0).toString(),
        (item.PurchaseCost || 0).toFixed(2),
        value.toFixed(2),
        item.InventoryValuationMethod || 'AverageCost',
      ];
    });

    // Add totals row
    rows.push(['TOTAL', '', totalQuantity.toString(), '', totalValue.toFixed(2), '']);

    const csvContent = [
      `Inventory Valuation Summary`,
      `As of ${asOfDate}`,
      '',
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-valuation-${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <ReportHeader
        title="Inventory Valuation Summary"
        subtitle={`As of ${formatDateLong(asOfDate)}`}
        onExportCSV={handleExportCSV}
      />

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
        </div>
      </div>

      {/* Report Content */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <p className="text-red-800 font-medium">Error loading inventory data</p>
          <p className="text-red-600 text-sm mt-1">{error instanceof Error ? error.message : 'An unexpected error occurred'}</p>
        </div>
      ) : isLoading ? (
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qty on Hand
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Cost
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Asset Value
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const value = (item.QuantityOnHand || 0) * (item.PurchaseCost || 0);
                return (
                  <tr key={item.Id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Package className="w-4 h-4 text-indigo-500 mr-2" />
                        <span className="text-sm font-medium text-gray-900">{item.Name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.SKU || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(item.QuantityOnHand)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatCurrency(item.PurchaseCost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-indigo-50">
              <tr>
                <td colSpan={2} className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-indigo-900">
                  TOTAL
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-indigo-900 text-right">
                  {formatNumber(totalQuantity)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-900 text-right">
                  -
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-lg font-bold text-indigo-900 text-right">
                  {formatCurrency(totalValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-500">No inventory items found.</p>
          <p className="text-sm text-gray-400">Add inventory items in Products & Services to see valuation data.</p>
        </div>
      )}
    </div>
  );
}
