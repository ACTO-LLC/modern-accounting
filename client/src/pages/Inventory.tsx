import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Box, AlertTriangle, TrendingDown, ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';

// Security: Validation utilities for input sanitization
const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a valid GUID format
 */
function isValidGuid(value: string): boolean {
  return GUID_REGEX.test(value);
}

/**
 * Escapes single quotes in strings for safe use in OData filters
 */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Validates and formats a GUID for use in OData filters
 * @throws Error if the value is not a valid GUID
 */
function formatGuidForOData(value: string): string {
  if (!isValidGuid(value)) {
    throw new Error('Invalid GUID format');
  }
  return value;
}

// Constants for validation
const MAX_ADJUSTMENT_QUANTITY = 999999999;
const MIN_ADJUSTMENT_QUANTITY = -999999999;

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  Description: string | null;
  SalesPrice: number | null;
  PurchaseCost: number | null;
  QuantityOnHand: number | null;
  ReorderPoint: number | null;
  InventoryValuationMethod: string | null;
  Status: 'Active' | 'Inactive';
}

interface InventoryTransaction {
  Id: string;
  ProductId: string;
  LocationId: string | null;
  TransactionDate: string;
  TransactionType: 'Purchase' | 'Sale' | 'Adjustment' | 'Transfer';
  Quantity: number;
  UnitCost: number | null;
  TotalCost: number | null;
  ReferenceType: string | null;
  ReferenceId: string | null;
  Notes: string | null;
  CreatedAt: string;
}

interface InventoryLocation {
  Id: string;
  Name: string;
  Code: string | null;
  Description: string | null;
  Address: string | null;
  IsDefault: boolean;
  Status: 'Active' | 'Inactive';
}

type ViewMode = 'inventory' | 'transactions' | 'locations';
type StockFilter = 'All' | 'LowStock' | 'OutOfStock' | 'InStock';

export default function Inventory() {
  const [viewMode, setViewMode] = useState<ViewMode>('inventory');
  const [stockFilter, setStockFilter] = useState<StockFilter>('All');
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductService | null>(null);
  const [adjustmentQuantity, setAdjustmentQuantity] = useState<number>(0);
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch inventory items (only Type = 'Inventory')
  const { data: inventoryItems, isLoading: loadingInventory, error: inventoryError } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const response = await api.get<{ value: ProductService[] }>('/productsservices?$filter=Type eq \'Inventory\'');
      return response.data.value;
    }
  });

  // Fetch inventory transactions
  const { data: transactions, isLoading: loadingTransactions } = useQuery({
    queryKey: ['inventorytransactions'],
    queryFn: async () => {
      const response = await api.get<{ value: InventoryTransaction[] }>('/inventorytransactions?$orderby=TransactionDate desc');
      return response.data.value;
    },
    enabled: viewMode === 'transactions'
  });

  // Fetch inventory locations
  const { data: locations, isLoading: loadingLocations } = useQuery({
    queryKey: ['inventorylocations'],
    queryFn: async () => {
      const response = await api.get<{ value: InventoryLocation[] }>('/inventorylocations');
      return response.data.value;
    },
    enabled: viewMode === 'locations'
  });

  // Create adjustment mutation
  const createAdjustment = useMutation({
    mutationFn: async (data: { productId: string; quantity: number; notes: string }) => {
      // Security: Validate GUID format to prevent injection attacks
      if (!isValidGuid(data.productId)) {
        throw new Error('Invalid product ID format');
      }

      // Validate quantity is a finite number within reasonable bounds
      if (!Number.isFinite(data.quantity)) {
        throw new Error('Quantity must be a valid number');
      }
      if (data.quantity < MIN_ADJUSTMENT_QUANTITY || data.quantity > MAX_ADJUSTMENT_QUANTITY) {
        throw new Error(`Quantity must be between ${MIN_ADJUSTMENT_QUANTITY.toLocaleString()} and ${MAX_ADJUSTMENT_QUANTITY.toLocaleString()}`);
      }

      // Check for negative inventory result
      const product = inventoryItems?.find(p => p.Id === data.productId);
      if (product) {
        const newQuantity = (product.QuantityOnHand || 0) + data.quantity;
        if (newQuantity < 0) {
          throw new Error(`Adjustment would result in negative inventory (${newQuantity.toLocaleString()}). Current quantity: ${(product.QuantityOnHand || 0).toLocaleString()}`);
        }
      }

      // Security: Escape notes to prevent injection in any downstream systems
      const sanitizedNotes = data.notes ? escapeODataString(data.notes) : '';

      // Create inventory transaction with validated GUID
      const validatedProductId = formatGuidForOData(data.productId);
      await api.post('/inventorytransactions', {
        ProductId: validatedProductId,
        TransactionDate: new Date().toISOString().split('T')[0],
        TransactionType: 'Adjustment',
        Quantity: data.quantity,
        Notes: sanitizedNotes,
        ReferenceType: 'Adjustment'
      });

      // Update product quantity with validated GUID
      if (product) {
        const newQuantity = (product.QuantityOnHand || 0) + data.quantity;
        await api.patch(`/productsservices/Id/${validatedProductId}`, {
          QuantityOnHand: newQuantity
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventorytransactions'] });
      setShowAdjustmentModal(false);
      setSelectedProduct(null);
      setAdjustmentQuantity(0);
      setAdjustmentNotes('');
      setAdjustmentError(null);
      setValidationError(null);
    },
    onError: (error: Error) => {
      setAdjustmentError(error.message || 'An error occurred while saving the adjustment. Please try again.');
    }
  });

  // Filter inventory items based on stock levels
  const filteredItems = inventoryItems?.filter(item => {
    if (stockFilter === 'All') return true;
    const qty = item.QuantityOnHand || 0;
    const reorderPoint = item.ReorderPoint || 0;

    switch (stockFilter) {
      case 'OutOfStock':
        return qty <= 0;
      case 'LowStock':
        return qty > 0 && qty <= reorderPoint;
      case 'InStock':
        return qty > reorderPoint;
      default:
        return true;
    }
  });

  // Calculate inventory stats
  const stats = {
    totalItems: inventoryItems?.length || 0,
    lowStockItems: inventoryItems?.filter(i => {
      const qty = i.QuantityOnHand || 0;
      const reorderPoint = i.ReorderPoint || 0;
      return qty > 0 && qty <= reorderPoint;
    }).length || 0,
    outOfStockItems: inventoryItems?.filter(i => (i.QuantityOnHand || 0) <= 0).length || 0,
    totalValue: inventoryItems?.reduce((sum, item) => {
      return sum + ((item.QuantityOnHand || 0) * (item.PurchaseCost || 0));
    }, 0) || 0
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatNumber = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US').format(value);
  };

  const getStockStatusBadge = (item: ProductService) => {
    const qty = item.QuantityOnHand || 0;
    const reorderPoint = item.ReorderPoint || 0;

    if (qty <= 0) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Out of Stock</span>;
    }
    if (qty <= reorderPoint) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Low Stock</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">In Stock</span>;
  };

  const getTransactionTypeIcon = (type: string) => {
    switch (type) {
      case 'Purchase':
        return <ArrowUpCircle className="w-4 h-4 text-green-500" />;
      case 'Sale':
        return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
      case 'Adjustment':
        return <RefreshCw className="w-4 h-4 text-blue-500" />;
      default:
        return <Box className="w-4 h-4 text-gray-500" />;
    }
  };

  const openAdjustmentModal = (product: ProductService) => {
    setSelectedProduct(product);
    setAdjustmentQuantity(0);
    setAdjustmentNotes('');
    setAdjustmentError(null);
    setValidationError(null);
    setShowAdjustmentModal(true);
  };

  const handleAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setAdjustmentError(null);

    // Client-side validation
    if (!selectedProduct) {
      setValidationError('No product selected');
      return;
    }

    if (adjustmentQuantity === 0) {
      setValidationError('Adjustment quantity cannot be zero');
      return;
    }

    // Validate that quantity is a valid number
    if (!Number.isFinite(adjustmentQuantity)) {
      setValidationError('Please enter a valid number');
      return;
    }

    // Check bounds
    if (adjustmentQuantity < MIN_ADJUSTMENT_QUANTITY || adjustmentQuantity > MAX_ADJUSTMENT_QUANTITY) {
      setValidationError(`Quantity must be between ${MIN_ADJUSTMENT_QUANTITY.toLocaleString()} and ${MAX_ADJUSTMENT_QUANTITY.toLocaleString()}`);
      return;
    }

    // Check for negative inventory result
    const newQuantity = (selectedProduct.QuantityOnHand || 0) + adjustmentQuantity;
    if (newQuantity < 0) {
      setValidationError(`Cannot reduce inventory below zero. Maximum reduction: ${(selectedProduct.QuantityOnHand || 0).toLocaleString()}`);
      return;
    }

    createAdjustment.mutate({
      productId: selectedProduct.Id,
      quantity: adjustmentQuantity,
      notes: adjustmentNotes
    });
  };

  if (loadingInventory && viewMode === 'inventory') {
    return <div className="p-4">Loading inventory...</div>;
  }

  if (inventoryError && viewMode === 'inventory') {
    return <div className="p-4 text-red-600">Error loading inventory</div>;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Inventory Management</h1>
        <Link
          to="/products-services/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Inventory Item
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <Box className="w-8 h-8 text-indigo-500 mr-3" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Items</p>
              <p className="text-2xl font-semibold">{stats.totalItems}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <TrendingDown className="w-8 h-8 text-yellow-500 mr-3" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Low Stock</p>
              <p className="text-2xl font-semibold">{stats.lowStockItems}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mr-3" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Out of Stock</p>
              <p className="text-2xl font-semibold">{stats.outOfStockItems}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center">
            <Box className="w-8 h-8 text-green-500 mr-3" />
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Value</p>
              <p className="text-2xl font-semibold">{formatCurrency(stats.totalValue)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg mb-4">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex" aria-label="Tabs">
            <button
              onClick={() => setViewMode('inventory')}
              className={`w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                viewMode === 'inventory'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Inventory Items
            </button>
            <button
              onClick={() => setViewMode('transactions')}
              className={`w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                viewMode === 'transactions'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Transactions
            </button>
            <button
              onClick={() => setViewMode('locations')}
              className={`w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                viewMode === 'locations'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Locations
            </button>
          </nav>
        </div>
      </div>

      {/* Inventory Items View */}
      {viewMode === 'inventory' && (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <label htmlFor="stockFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Stock Status
                </label>
                <select
                  id="stockFilter"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as StockFilter)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="All">All Items</option>
                  <option value="InStock">In Stock</option>
                  <option value="LowStock">Low Stock</option>
                  <option value="OutOfStock">Out of Stock</option>
                </select>
              </div>
              <div className="flex items-end">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {filteredItems?.length || 0} of {inventoryItems?.length || 0} items
                </span>
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto sm:rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    On Hand
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Reorder Point
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unit Cost
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredItems?.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No inventory items found.{' '}
                      <Link to="/products-services/new" className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 ml-1">
                        Add your first inventory item.
                      </Link>
                    </td>
                  </tr>
                ) : (
                  filteredItems?.map((item) => {
                    const value = (item.QuantityOnHand || 0) * (item.PurchaseCost || 0);
                    return (
                      <tr key={item.Id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Box className="w-4 h-4 text-green-500 mr-2" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.Name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {item.SKU || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 text-right">
                          {formatNumber(item.QuantityOnHand)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-right">
                          {formatNumber(item.ReorderPoint)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 text-right">
                          {formatCurrency(item.PurchaseCost)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 text-right">
                          {formatCurrency(value)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {getStockStatusBadge(item)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => openAdjustmentModal(item)}
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300 mr-4"
                          >
                            Adjust
                          </button>
                          <Link
                            to={`/products-services/${item.Id}/edit`}
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Transactions View */}
      {viewMode === 'transactions' && (
        <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto sm:rounded-lg">
          {loadingTransactions ? (
            <div className="p-4">Loading transactions...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Unit Cost
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {transactions?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No inventory transactions found.
                    </td>
                  </tr>
                ) : (
                  transactions?.map((tx) => (
                    <tr key={tx.Id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(tx.TransactionDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getTransactionTypeIcon(tx.TransactionType)}
                          <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">{tx.TransactionType}</span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${tx.Quantity >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.Quantity >= 0 ? '+' : ''}{formatNumber(tx.Quantity)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 text-right">
                        {formatCurrency(tx.UnitCost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 text-right">
                        {formatCurrency(tx.TotalCost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {tx.ReferenceType || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                        {tx.Notes || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Locations View */}
      {viewMode === 'locations' && (
        <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto sm:rounded-lg">
          {loadingLocations ? (
            <div className="p-4">Loading locations...</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Address
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Default
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {locations?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      No inventory locations found. Locations can be used to track inventory across multiple warehouses or stores.
                    </td>
                  </tr>
                ) : (
                  locations?.map((loc) => (
                    <tr key={loc.Id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {loc.Name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {loc.Code || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                        {loc.Address || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {loc.IsDefault && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
                            Default
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          loc.Status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {loc.Status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjustmentModal && selectedProduct && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              Adjust Inventory: {selectedProduct.Name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Current quantity on hand: {formatNumber(selectedProduct.QuantityOnHand)}
            </p>

            {/* Error Messages */}
            {(validationError || adjustmentError) && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-700 dark:text-red-400">
                  {validationError || adjustmentError}
                </p>
              </div>
            )}

            <form onSubmit={handleAdjustmentSubmit}>
              <div className="mb-4">
                <label htmlFor="adjustmentQty" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Quantity Adjustment
                </label>
                <input
                  type="number"
                  id="adjustmentQty"
                  value={adjustmentQuantity}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    setAdjustmentQuantity(Number.isFinite(value) ? value : 0);
                    setValidationError(null);
                  }}
                  className={`w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-gray-100 ${
                    validationError ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Enter positive or negative number"
                  step="0.0001"
                  min={MIN_ADJUSTMENT_QUANTITY}
                  max={MAX_ADJUSTMENT_QUANTITY}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Use positive numbers to add, negative to subtract
                </p>
              </div>
              <div className="mb-4">
                <label htmlFor="adjustmentNotes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  id="adjustmentNotes"
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  placeholder="Reason for adjustment (e.g., shrinkage, damage, count correction)"
                  maxLength={500}
                />
              </div>
              {adjustmentQuantity !== 0 && (
                <p className={`text-sm mb-4 ${
                  (selectedProduct.QuantityOnHand || 0) + adjustmentQuantity < 0
                    ? 'text-red-600 dark:text-red-400 font-medium'
                    : 'text-gray-600 dark:text-gray-400'
                }`}>
                  New quantity will be: {formatNumber((selectedProduct.QuantityOnHand || 0) + adjustmentQuantity)}
                  {(selectedProduct.QuantityOnHand || 0) + adjustmentQuantity < 0 && ' (invalid - cannot be negative)'}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustmentQuantity === 0 || createAdjustment.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createAdjustment.isPending ? 'Saving...' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
