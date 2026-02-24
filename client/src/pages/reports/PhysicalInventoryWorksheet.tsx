import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Package, FileSpreadsheet } from 'lucide-react';
import api from '../../lib/api';
import ReportHeader from '../../components/reports/ReportHeader';
import { formatDateLong, formatDateShort } from '../../lib/dateUtils';

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  QuantityOnHand: number | null;
  Status: 'Active' | 'Inactive';
}

interface InventoryLocation {
  Id: string;
  Name: string;
  Code: string | null;
  Status: 'Active' | 'Inactive';
}

export default function PhysicalInventoryWorksheet() {
  const [asOfDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [showSystemQty, setShowSystemQty] = useState(true);

  // Fetch inventory items
  const { data: inventoryItems, isLoading, error } = useQuery({
    queryKey: ['physical-inventory-worksheet', asOfDate, locationFilter],
    queryFn: async () => {
      const response = await api.get<{ value: ProductService[] }>(
        "/productsservices?$filter=Type eq 'Inventory' and Status eq 'Active'&$orderby=Name"
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

  // Filter items by location (placeholder - would need LocationId on items)
  const filteredItems = inventoryItems || [];

  const handleExportExcel = () => {
    if (!filteredItems || filteredItems.length === 0) return;

    // Create CSV with columns formatted for easy Excel use
    const headers = showSystemQty
      ? ['Product', 'SKU', 'Location', 'System Qty', 'Physical Count', 'Variance', 'Notes']
      : ['Product', 'SKU', 'Location', 'Physical Count', 'Notes'];

    const rows = filteredItems.map((item) => {
      if (showSystemQty) {
        return [
          item.Name,
          item.SKU || '',
          '', // Location - to be filled in
          (item.QuantityOnHand || 0).toString(),
          '', // Physical Count - to be filled in
          '', // Variance - calculated
          '', // Notes
        ];
      }
      return [
        item.Name,
        item.SKU || '',
        '', // Location
        '', // Physical Count
        '', // Notes
      ];
    });

    const csvContent = [
      `Physical Inventory Worksheet`,
      `Date: ${asOfDate}`,
      `Location: ${locationFilter === 'all' ? 'All Locations' : locations?.find(l => l.Id === locationFilter)?.Name || ''}`,
      `Counted By: _______________________`,
      ``,
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `physical-inventory-worksheet-${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <ReportHeader
        title="Physical Inventory Worksheet"
        subtitle={`Prepared ${formatDateLong(asOfDate)}`}
      />

      {/* Export and Options */}
      <div className="bg-white shadow rounded-lg p-4 mb-6 print:hidden">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div className="flex flex-wrap gap-4 items-end">
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

            <div className="flex items-center">
              <input
                id="showSystemQty"
                type="checkbox"
                checked={showSystemQty}
                onChange={(e) => setShowSystemQty(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
              />
              <label htmlFor="showSystemQty" className="ml-2 block text-sm text-gray-900">
                Show system quantities
              </label>
            </div>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={!inventoryItems || inventoryItems.length === 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export to Excel
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-6">
        <div className="border-b-2 border-gray-800 pb-4 mb-4">
          <h1 className="text-xl font-bold">Physical Inventory Worksheet</h1>
          <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
            <div>Date: {formatDateShort(asOfDate)}</div>
            <div>Location: ___________________</div>
            <div>Counted By: ___________________</div>
            <div>Verified By: ___________________</div>
          </div>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider print:text-[10px]">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider print:text-[10px]">
                  SKU
                </th>
                {showSystemQty && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider print:text-[10px]">
                    System Qty
                  </th>
                )}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider print:text-[10px] w-32">
                  Physical Count
                </th>
                {showSystemQty && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider print:text-[10px] w-24">
                    Variance
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider print:text-[10px] w-48">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.map((item, index) => (
                <tr key={item.Id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Package className="w-4 h-4 text-indigo-500 mr-2 print:hidden" />
                      <span className="text-sm font-medium text-gray-900">{item.Name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.SKU || '-'}
                  </td>
                  {showSystemQty && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(item.QuantityOnHand)}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="border-b border-gray-300 w-20 ml-auto h-6 print:border-black"></div>
                  </td>
                  {showSystemQty && (
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="border-b border-gray-300 w-16 ml-auto h-6 print:border-black"></div>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="border-b border-gray-300 w-full h-6 print:border-black"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Print Footer */}
          <div className="hidden print:block p-6 border-t">
            <div className="grid grid-cols-3 gap-8 text-sm">
              <div>
                <p className="mb-8">Total Items Counted: ___________</p>
                <p>Signature: ___________________</p>
              </div>
              <div>
                <p className="mb-8">Total Variances: ___________</p>
                <p>Date: ___________________</p>
              </div>
              <div>
                <p className="mb-8">Notes:</p>
                <div className="border-b border-gray-400 h-12"></div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-2 text-gray-500">No active inventory items found.</p>
          <p className="text-sm text-gray-400">Add inventory items in Products & Services to create a worksheet.</p>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 print:hidden">
        <h3 className="font-medium text-blue-900 mb-2">Instructions for Physical Inventory Count</h3>
        <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
          <li>Print this worksheet or export to Excel for use in the warehouse</li>
          <li>Count each item and record the physical quantity in the "Physical Count" column</li>
          <li>Calculate the variance (Physical Count - System Qty) for each item</li>
          <li>Note any damaged, missing, or mislabeled items</li>
          <li>Submit completed worksheet for inventory adjustments</li>
        </ol>
      </div>
    </div>
  );
}
