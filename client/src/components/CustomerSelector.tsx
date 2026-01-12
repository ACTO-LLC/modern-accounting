import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, Loader2 } from 'lucide-react';
import api, { Customer } from '../lib/api';

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
  required: _required = false,
  disabled = false,
  error,
  className = '',
}: CustomerSelectorProps) {
  // _required is available for future use (e.g., accessibility attributes)
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch customers
  const { data: customers, isLoading, isError } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers');
      return response.data.value;
    },
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

  const handleSelect = (customerId: string) => {
    onChange(customerId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
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
            'Error loading customers'
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
            ) : filteredCustomers.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                {searchTerm ? 'No customers found' : 'No customers available'}
              </div>
            ) : (
              filteredCustomers.map((customer) => (
                <button
                  key={customer.Id}
                  type="button"
                  onClick={() => handleSelect(customer.Id)}
                  className={`
                    w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none
                    ${customer.Id === value ? 'bg-indigo-100 text-indigo-900' : 'text-gray-900'}
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
