import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, Loader2, RefreshCw, Wrench, Box, Package } from 'lucide-react';
import Fuse from 'fuse.js';
import api from '../lib/api';

export interface ProductService {
  Id: string;
  Name: string;
  SKU: string | null;
  Type: 'Inventory' | 'NonInventory' | 'Service';
  Description: string | null;
  SalesPrice: number | null;
  PurchaseCost: number | null;
  Category: string | null;
  Taxable: boolean;
  Status: 'Active' | 'Inactive';
}

export interface ProductServiceSelectorProps {
  value: string;
  onChange: (productServiceId: string, productService?: ProductService) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  placeholder?: string;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export default function ProductServiceSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
  placeholder = 'Select product/service...',
}: ProductServiceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Fetch products/services - only active ones
  const { data: productsServices, isLoading, isError, refetch } = useQuery({
    queryKey: ['productsservices-active'],
    queryFn: async (): Promise<ProductService[]> => {
      const response = await api.get('/productsservices?$filter=Status eq \'Active\'&$orderby=Name');
      return response.data.value;
    },
  });

  // Find selected product/service
  const selectedProductService = useMemo(() => {
    return productsServices?.find((ps) => ps.Id === value);
  }, [productsServices, value]);

  // Configure Fuse.js for fuzzy search
  const fuse = useMemo(() => {
    if (!productsServices) return null;
    return new Fuse(productsServices, {
      keys: [
        { name: 'Name', weight: 0.5 },      // Name matches weighted highest
        { name: 'SKU', weight: 0.3 },       // SKU matches weighted medium
        { name: 'Category', weight: 0.2 },  // Category matches weighted lower
      ],
      threshold: 0.4,        // 0 = exact match, 1 = match anything (0.4 is a good balance)
      ignoreLocation: true,  // Match anywhere in string
      includeScore: true,    // Include match score for debugging
    });
  }, [productsServices]);

  // Filter products/services based on search term using fuzzy search
  const filteredProductsServices = useMemo(() => {
    if (!productsServices) return [];
    if (!searchTerm) return productsServices;
    if (!fuse) return productsServices;

    const results = fuse.search(searchTerm);
    return results.map(result => result.item);
  }, [productsServices, searchTerm, fuse]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset focused index when filtered list changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchTerm]);

  const handleSelect = (productService: ProductService) => {
    onChange(productService.Id, productService);
    setIsOpen(false);
    setSearchTerm('');
    setFocusedIndex(-1);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('', undefined);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
      setFocusedIndex(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev < filteredProductsServices.length - 1 ? prev + 1 : prev;
        if (next < listItemsRef.current.length) {
          listItemsRef.current[next]?.scrollIntoView({ block: 'nearest' });
        }
        return next;
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : -1;
        if (next === -1) {
          inputRef.current?.focus();
        } else if (next >= 0 && next < listItemsRef.current.length) {
          listItemsRef.current[next]?.scrollIntoView({ block: 'nearest' });
        }
        return next;
      });
    } else if (event.key === 'Enter' && focusedIndex >= 0 && focusedIndex < filteredProductsServices.length) {
      event.preventDefault();
      handleSelect(filteredProductsServices[focusedIndex]);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'Service':
        return <Wrench className="w-4 h-4 text-blue-500" />;
      case 'Inventory':
        return <Box className="w-4 h-4 text-green-500" />;
      default:
        return <Package className="w-4 h-4 text-orange-500" />;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="product-service-listbox"
        aria-required={required}
        className={`
          w-full flex items-center justify-between
          rounded-md border shadow-sm
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
          sm:text-sm p-2 text-left
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer hover:bg-gray-50'}
          ${error ? 'border-red-300' : 'border-gray-300'}
        `}
      >
        <span className={selectedProductService ? 'text-gray-900 flex items-center flex-1' : 'text-gray-500'}>
          {isLoading ? (
            <span className="flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading...
            </span>
          ) : isError ? (
            <span className="flex items-center text-red-600">
              Error loading products
            </span>
          ) : selectedProductService ? (
            <span className="flex items-center justify-between w-full">
              <span className="flex items-center">
                {getTypeIcon(selectedProductService.Type)}
                <span className="ml-2">{selectedProductService.Name}</span>
                {selectedProductService.SKU && (
                  <span className="text-gray-500 ml-2 text-xs">({selectedProductService.SKU})</span>
                )}
              </span>
              {selectedProductService.SalesPrice !== null && (
                <span className="text-gray-500 text-xs">{formatCurrency(selectedProductService.SalesPrice)}</span>
              )}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <div className="flex items-center">
          {selectedProductService && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="mr-1 text-gray-400 hover:text-gray-600 p-0.5"
              aria-label="Clear selection"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          id="product-service-listbox"
          role="listbox"
          aria-label="Product/Service selection"
          className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="p-2 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, SKU, or category..."
                aria-label="Search products and services"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Product/Service list */}
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-gray-500 flex items-center justify-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </div>
            ) : isError ? (
              <div className="px-4 py-3 text-center">
                <p className="text-sm text-red-600 mb-2">Error loading products/services</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </button>
              </div>
            ) : filteredProductsServices.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {searchTerm ? 'No products/services found' : 'No active products/services available'}
              </div>
            ) : (
              filteredProductsServices.map((ps, index) => (
                <button
                  key={ps.Id}
                  ref={(el) => (listItemsRef.current[index] = el)}
                  type="button"
                  role="option"
                  aria-selected={ps.Id === value}
                  onClick={() => handleSelect(ps)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={`
                    w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none
                    ${ps.Id === value ? 'bg-indigo-100 text-indigo-900' : ''}
                    ${focusedIndex === index ? 'bg-indigo-50' : ''}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      {getTypeIcon(ps.Type)}
                      <div className="ml-2">
                        <div className="font-medium">{ps.Name}</div>
                        {ps.SKU && (
                          <div className="text-xs text-gray-500">SKU: {ps.SKU}</div>
                        )}
                      </div>
                    </div>
                    {ps.SalesPrice !== null && (
                      <span className="text-sm text-gray-600">{formatCurrency(ps.SalesPrice)}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
