import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, Loader2, RefreshCw } from 'lucide-react';
import api from '../lib/api';

interface Vendor {
  Id: string;
  Name: string;
  Email: string | null;
}

export interface VendorSelectorProps {
  value: string;
  onChange: (vendorId: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export default function VendorSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
}: VendorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Fetch vendors
  const { data: vendors, isLoading, isError, refetch } = useQuery({
    queryKey: ['vendors'],
    queryFn: async (): Promise<Vendor[]> => {
      const response = await api.get("/vendors?$filter=Status eq 'Active'&$orderby=Name");
      return response.data.value;
    }
  });

  // Find selected vendor
  const selectedVendor = useMemo(() => {
    return vendors?.find((v) => v.Id === value);
  }, [vendors, value]);

  // Filter vendors based on search term
  const filteredVendors = useMemo(() => {
    if (!vendors) return [];
    if (!searchTerm) return vendors;

    const lowerSearch = searchTerm.toLowerCase();
    return vendors.filter(
      (vendor) =>
        vendor.Name.toLowerCase().includes(lowerSearch) ||
        (vendor.Email && vendor.Email.toLowerCase().includes(lowerSearch))
    );
  }, [vendors, searchTerm]);

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

  const handleSelect = (vendorId: string) => {
    onChange(vendorId);
    setIsOpen(false);
    setSearchTerm('');
    setFocusedIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
      setFocusedIndex(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev < filteredVendors.length - 1 ? prev + 1 : prev;
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
    } else if (event.key === 'Enter' && focusedIndex >= 0 && focusedIndex < filteredVendors.length) {
      event.preventDefault();
      handleSelect(filteredVendors[focusedIndex].Id);
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
        aria-controls="vendor-listbox"
        aria-required={required}
        className={`
          w-full flex items-center justify-between
          mt-1 rounded-md border shadow-sm
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
          sm:text-sm p-2 text-left
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer hover:bg-gray-50'}
          ${error ? 'border-red-300' : 'border-gray-300'}
        `}
      >
        <span className={selectedVendor ? 'text-gray-900' : 'text-gray-500'}>
          {isLoading ? (
            <span className="flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading vendors...
            </span>
          ) : isError ? (
            <span className="flex items-center text-red-600">
              Error loading vendors
            </span>
          ) : selectedVendor ? (
            <span>
              {selectedVendor.Name}
              {selectedVendor.Email && (
                <span className="text-gray-500 ml-2">({selectedVendor.Email})</span>
              )}
            </span>
          ) : (
            'Select a vendor...'
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          id="vendor-listbox"
          role="listbox"
          aria-label="Vendor selection"
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
                placeholder="Search vendors..."
                aria-label="Search vendors"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Vendor list */}
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-gray-500 flex items-center justify-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </div>
            ) : isError ? (
              <div className="px-4 py-3 text-center">
                <p className="text-sm text-red-600 mb-2">Error loading vendors</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </button>
              </div>
            ) : filteredVendors.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {searchTerm ? 'No vendors found' : 'No vendors available'}
              </div>
            ) : (
              filteredVendors.map((vendor, index) => (
                <button
                  key={vendor.Id}
                  ref={(el) => (listItemsRef.current[index] = el)}
                  type="button"
                  role="option"
                  aria-selected={vendor.Id === value}
                  onClick={() => handleSelect(vendor.Id)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={`
                    w-full px-4 py-2 text-left text-sm text-gray-900 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none
                    ${vendor.Id === value ? 'bg-indigo-100 text-indigo-900' : ''}
                    ${focusedIndex === index ? 'bg-indigo-50' : ''}
                  `}
                >
                  <div className="font-medium">{vendor.Name}</div>
                  {vendor.Email && (
                    <div className="text-xs text-gray-500">{vendor.Email}</div>
                  )}
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
