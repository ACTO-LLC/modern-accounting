import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, Loader2, RefreshCw } from 'lucide-react';
import { customersApi, Customer } from '../lib/api';

export interface CustomerSelectorProps {
  value: string;
  onChange: (customerId: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export default function CustomerSelector({
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  className = '',
}: CustomerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Fetch customers
  const { data: customers, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: customersApi.getAll,
  });

  // Find selected customer
  const selectedCustomer = useMemo(() => {
    return customers?.find((c) => c.Id === value);
  }, [customers, value]);

  // Filter customers based on search term
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!searchTerm) return customers;

    const lowerSearch = searchTerm.toLowerCase();
    return customers.filter(
      (customer) =>
        customer.Name.toLowerCase().includes(lowerSearch) ||
        (customer.Email && customer.Email.toLowerCase().includes(lowerSearch))
    );
  }, [customers, searchTerm]);

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

  const handleSelect = (customerId: string) => {
    onChange(customerId);
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
        const next = prev < filteredCustomers.length - 1 ? prev + 1 : prev;
        listItemsRef.current[next]?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : -1;
        if (next === -1) {
          inputRef.current?.focus();
        } else {
          listItemsRef.current[next]?.scrollIntoView({ block: 'nearest' });
        }
        return next;
      });
    } else if (event.key === 'Enter' && focusedIndex >= 0) {
      event.preventDefault();
      handleSelect(filteredCustomers[focusedIndex].Id);
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
        aria-controls="customer-listbox"
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
        <span className={selectedCustomer ? 'text-gray-900' : 'text-gray-500'}>
          {isLoading ? (
            <span className="flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading customers...
            </span>
          ) : isError ? (
            <span className="flex items-center text-red-600">
              Error loading customers
            </span>
          ) : selectedCustomer ? (
            <span>
              {selectedCustomer.Name}
              {selectedCustomer.Email && (
                <span className="text-gray-500 ml-2">({selectedCustomer.Email})</span>
              )}
            </span>
          ) : (
            'Select a customer...'
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          id="customer-listbox"
          role="listbox"
          aria-label="Customer selection"
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
                placeholder="Search customers..."
                aria-label="Search customers"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Customer list */}
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-gray-500 flex items-center justify-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </div>
            ) : isError ? (
              <div className="px-4 py-3 text-center">
                <p className="text-sm text-red-600 mb-2">Error loading customers</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </button>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {searchTerm ? 'No customers found' : 'No customers available'}
              </div>
            ) : (
              filteredCustomers.map((customer, index) => (
                <button
                  key={customer.Id}
                  ref={(el) => (listItemsRef.current[index] = el)}
                  type="button"
                  role="option"
                  aria-selected={customer.Id === value}
                  onClick={() => handleSelect(customer.Id)}
                  onMouseEnter={() => setFocusedIndex(index)}
                  className={`
                    w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none
                    ${customer.Id === value ? 'bg-indigo-100 text-indigo-900' : ''}
                    ${focusedIndex === index ? 'bg-indigo-50' : 'text-gray-900'}
                  `}
                >
                  <div className="font-medium">{customer.Name}</div>
                  {customer.Email && (
                    <div className="text-xs text-gray-500">{customer.Email}</div>
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
