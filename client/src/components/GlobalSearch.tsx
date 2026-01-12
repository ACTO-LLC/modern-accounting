import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, Truck, Receipt, Package, X, Command, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import clsx from 'clsx';

// Search result types
interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerName?: string;
  TotalAmount: number;
  Status: string;
}

interface Customer {
  Id: string;
  Name: string;
  Email: string | null;
}

interface Vendor {
  Id: string;
  Name: string;
}

interface Bill {
  Id: string;
  BillNumber: string;
  VendorName?: string;
  TotalAmount: number;
  Status: string;
}

interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: string;
}

interface SearchResult {
  id: string;
  type: 'invoice' | 'customer' | 'vendor' | 'bill' | 'product';
  title: string;
  subtitle: string;
  path: string;
}

interface GroupedResults {
  invoices: SearchResult[];
  customers: SearchResult[];
  vendors: SearchResult[];
  bills: SearchResult[];
  products: SearchResult[];
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Escape single quotes in OData string values by doubling them
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

// Build OData contains filter for a field
// Note: DAB doesn't support tolower(), so search is case-sensitive
function buildContainsFilter(field: string, term: string): string {
  const escapedTerm = escapeODataString(term);
  return `contains(${field}, '${escapedTerm}')`;
}

export default function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedResults>({
    invoices: [],
    customers: [],
    vendors: [],
    bills: [],
    products: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebounce(query, 300);

  // Flatten results for keyboard navigation
  const flatResults = useMemo(() => {
    return [
      ...results.invoices,
      ...results.customers,
      ...results.vendors,
      ...results.bills,
      ...results.products,
    ];
  }, [results]);

  // Open/close handlers
  const openSearch = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setResults({ invoices: [], customers: [], vendors: [], bills: [], products: [] });
    setSelectedIndex(0);
    setError(null);
  }, []);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults({ invoices: [], customers: [], vendors: [], bills: [], products: [] });
    setSelectedIndex(0);
    setError(null);
  }, []);

  // Keyboard shortcut handler (Ctrl+K / Cmd+K)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        if (isOpen) {
          closeSearch();
        } else {
          openSearch();
        }
      }

      if (event.key === 'Escape' && isOpen) {
        closeSearch();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openSearch, closeSearch]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Search function
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults({ invoices: [], customers: [], vendors: [], bills: [], products: [] });
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    const searchTerm = searchQuery.trim();

    try {
      // Build OData filter queries for server-side filtering
      // Note: DAB doesn't support nested property filters (customer/Name), so we only filter on direct fields
      const invoiceFilter = buildContainsFilter('InvoiceNumber', searchTerm);
      const customerFilter = `${buildContainsFilter('Name', searchTerm)} or ${buildContainsFilter('Email', searchTerm)}`;
      const vendorFilter = buildContainsFilter('Name', searchTerm);
      const billFilter = buildContainsFilter('BillNumber', searchTerm);
      const productFilter = `${buildContainsFilter('Name', searchTerm)} or ${buildContainsFilter('SKU', searchTerm)}`;
      // Fetch filtered data in parallel with $top=5 to limit results
      const [invoicesRes, customersRes, vendorsRes, billsRes, productsRes] = await Promise.all([
        api.get<{ value: Invoice[] }>(`/invoices?$expand=customer&$filter=${encodeURIComponent(invoiceFilter)}&$top=5`).catch(() => ({ data: { value: [] } })),
        api.get<{ value: Customer[] }>(`/customers?$filter=${encodeURIComponent(customerFilter)}&$top=5`).catch(() => ({ data: { value: [] } })),
        api.get<{ value: Vendor[] }>(`/vendors?$filter=${encodeURIComponent(vendorFilter)}&$top=5`).catch(() => ({ data: { value: [] } })),
        api.get<{ value: Bill[] }>(`/bills?$expand=vendor&$filter=${encodeURIComponent(billFilter)}&$top=5`).catch(() => ({ data: { value: [] } })),
        api.get<{ value: ProductService[] }>(`/productsservices?$filter=${encodeURIComponent(productFilter)}&$top=5`).catch(() => ({ data: { value: [] } })),
      ]);

      // Map invoices to search results
      const invoiceResults: SearchResult[] = (invoicesRes.data.value || [])
        .map((inv: any) => ({
          id: inv.Id,
          type: 'invoice' as const,
          title: `Invoice ${inv.InvoiceNumber}`,
          subtitle: inv.customer?.Name || inv.CustomerName || `$${inv.TotalAmount?.toFixed(2) || '0.00'}`,
          path: `/invoices/${inv.Id}/edit`,
        }));

      // Map customers to search results
      const customerResults: SearchResult[] = (customersRes.data.value || [])
        .map((cust: Customer) => ({
          id: cust.Id,
          type: 'customer' as const,
          title: cust.Name,
          subtitle: cust.Email || 'No email',
          path: `/customers/${cust.Id}/edit`,
        }));

      // Map vendors to search results
      const vendorResults: SearchResult[] = (vendorsRes.data.value || [])
        .map((vendor: Vendor) => ({
          id: vendor.Id,
          type: 'vendor' as const,
          title: vendor.Name,
          subtitle: 'Vendor',
          path: `/vendors/${vendor.Id}/edit`,
        }));

      // Map bills to search results
      const billResults: SearchResult[] = (billsRes.data.value || [])
        .map((bill: any) => ({
          id: bill.Id,
          type: 'bill' as const,
          title: `Bill ${bill.BillNumber || 'N/A'}`,
          subtitle: bill.vendor?.Name || bill.VendorName || `$${bill.TotalAmount?.toFixed(2) || '0.00'}`,
          path: `/bills/${bill.Id}/edit`,
        }));

      // Map products/services to search results
      const productResults: SearchResult[] = (productsRes.data.value || [])
        .map((prod: ProductService) => ({
          id: prod.Id,
          type: 'product' as const,
          title: prod.Name,
          subtitle: prod.SKU ? `SKU: ${prod.SKU}` : prod.Type,
          path: `/products-services/${prod.Id}/edit`,
        }));

      setResults({
        invoices: invoiceResults,
        customers: customerResults,
        vendors: vendorResults,
        bills: billResults,
        products: productResults,
      });
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to search. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Perform search when debounced query changes
  useEffect(() => {
    performSearch(debouncedQuery);
  }, [debouncedQuery, performSearch]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((prev) =>
        prev < flatResults.length - 1 ? prev + 1 : prev
      );
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (event.key === 'Enter' && flatResults[selectedIndex]) {
      event.preventDefault();
      navigate(flatResults[selectedIndex].path);
      closeSearch();
    }
  }, [flatResults, selectedIndex, navigate, closeSearch]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && flatResults.length > 0) {
      const selectedElement = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, flatResults.length]);

  // Handle result click
  const handleResultClick = useCallback((result: SearchResult) => {
    navigate(result.path);
    closeSearch();
  }, [navigate, closeSearch]);

  // Get icon for result type
  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'invoice':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'customer':
        return <Users className="h-4 w-4 text-green-500" />;
      case 'vendor':
        return <Truck className="h-4 w-4 text-orange-500" />;
      case 'bill':
        return <Receipt className="h-4 w-4 text-purple-500" />;
      case 'product':
        return <Package className="h-4 w-4 text-indigo-500" />;
      default:
        return <Search className="h-4 w-4 text-gray-500" />;
    }
  };

  // Get section title for result type
  const getSectionTitle = (type: SearchResult['type']) => {
    switch (type) {
      case 'invoice':
        return 'Invoices';
      case 'customer':
        return 'Customers';
      case 'vendor':
        return 'Vendors';
      case 'bill':
        return 'Bills';
      case 'product':
        return 'Products & Services';
      default:
        return '';
    }
  };

  // Calculate global index for a result
  const getGlobalIndex = (type: SearchResult['type'], localIndex: number): number => {
    let offset = 0;
    const order: (keyof GroupedResults)[] = ['invoices', 'customers', 'vendors', 'bills', 'products'];

    for (const key of order) {
      if (key === `${type}s` || (type === 'product' && key === 'products')) {
        return offset + localIndex;
      }
      offset += results[key].length;
    }
    return offset + localIndex;
  };

  const hasResults = flatResults.length > 0;
  const hasQuery = query.trim().length > 0;

  if (!isOpen) {
    return (
      <button
        onClick={openSearch}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        aria-label="Open search"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-gray-400 bg-white rounded border border-gray-200">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={closeSearch}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
        <div
          className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Global search"
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
            <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search invoices, customers, vendors, bills, products..."
              className="flex-1 text-base text-gray-900 placeholder-gray-400 bg-transparent border-none outline-none"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={closeSearch}
              className="px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded hover:bg-gray-200"
            >
              ESC
            </button>
          </div>

          {/* Aria live region for screen readers */}
          <div aria-live="polite" className="sr-only">
            {isLoading && 'Searching...'}
            {!isLoading && hasQuery && !hasResults && !error && `No results found for ${query}`}
            {!isLoading && hasResults && `Found ${flatResults.length} results`}
            {error && error}
          </div>

          {/* Results */}
          <div
            ref={resultsRef}
            className="max-h-[60vh] overflow-y-auto"
          >
            {isLoading && (
              <div className="px-4 py-8 text-center text-gray-500">
                <div className="inline-block h-5 w-5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
                <p className="mt-2 text-sm">Searching...</p>
              </div>
            )}

            {!isLoading && error && (
              <div className="px-4 py-8 text-center text-red-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                <p className="text-sm">{error}</p>
                <button
                  onClick={() => performSearch(debouncedQuery)}
                  className="mt-3 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !error && hasQuery && !hasResults && (
              <div className="px-4 py-8 text-center text-gray-500">
                <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No results found for "{query}"</p>
                <p className="text-xs text-gray-400 mt-1">Try searching for invoice numbers, customer names, or product SKUs</p>
              </div>
            )}

            {!isLoading && !error && !hasQuery && (
              <div className="px-4 py-8 text-center text-gray-500">
                <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">Start typing to search</p>
                <p className="text-xs text-gray-400 mt-1">Search across invoices, customers, vendors, bills, and products</p>
              </div>
            )}

            {!isLoading && !error && hasResults && (
              <div className="py-2">
                {/* Invoices */}
                {results.invoices.length > 0 && (
                  <ResultSection
                    title={getSectionTitle('invoice')}
                    results={results.invoices}
                    selectedIndex={selectedIndex}
                    getGlobalIndex={(i) => getGlobalIndex('invoice', i)}
                    getIcon={() => getIcon('invoice')}
                    onResultClick={handleResultClick}
                  />
                )}

                {/* Customers */}
                {results.customers.length > 0 && (
                  <ResultSection
                    title={getSectionTitle('customer')}
                    results={results.customers}
                    selectedIndex={selectedIndex}
                    getGlobalIndex={(i) => getGlobalIndex('customer', i)}
                    getIcon={() => getIcon('customer')}
                    onResultClick={handleResultClick}
                  />
                )}

                {/* Vendors */}
                {results.vendors.length > 0 && (
                  <ResultSection
                    title={getSectionTitle('vendor')}
                    results={results.vendors}
                    selectedIndex={selectedIndex}
                    getGlobalIndex={(i) => getGlobalIndex('vendor', i)}
                    getIcon={() => getIcon('vendor')}
                    onResultClick={handleResultClick}
                  />
                )}

                {/* Bills */}
                {results.bills.length > 0 && (
                  <ResultSection
                    title={getSectionTitle('bill')}
                    results={results.bills}
                    selectedIndex={selectedIndex}
                    getGlobalIndex={(i) => getGlobalIndex('bill', i)}
                    getIcon={() => getIcon('bill')}
                    onResultClick={handleResultClick}
                  />
                )}

                {/* Products & Services */}
                {results.products.length > 0 && (
                  <ResultSection
                    title={getSectionTitle('product')}
                    results={results.products}
                    selectedIndex={selectedIndex}
                    getGlobalIndex={(i) => getGlobalIndex('product', i)}
                    getIcon={() => getIcon('product')}
                    onResultClick={handleResultClick}
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">↓</kbd>
                <span>to navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">Enter</kbd>
                <span>to select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200">Esc</kbd>
                <span>to close</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Result section component
interface ResultSectionProps {
  title: string;
  results: SearchResult[];
  selectedIndex: number;
  getGlobalIndex: (localIndex: number) => number;
  getIcon: () => React.ReactNode;
  onResultClick: (result: SearchResult) => void;
}

function ResultSection({
  title,
  results,
  selectedIndex,
  getGlobalIndex,
  getIcon,
  onResultClick
}: ResultSectionProps) {
  return (
    <div className="mb-2">
      <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {title}
      </div>
      {results.map((result, index) => {
        const globalIndex = getGlobalIndex(index);
        const isSelected = globalIndex === selectedIndex;

        return (
          <button
            key={result.id}
            data-index={globalIndex}
            onClick={() => onResultClick(result)}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
              isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
            )}
          >
            <div className="flex-shrink-0">
              {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={clsx(
                'text-sm font-medium truncate',
                isSelected ? 'text-indigo-700' : 'text-gray-900'
              )}>
                {result.title}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {result.subtitle}
              </div>
            </div>
            {isSelected && (
              <div className="flex-shrink-0 text-xs text-indigo-600">
                Enter to open
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
