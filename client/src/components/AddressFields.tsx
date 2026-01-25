import { useState, useRef, useEffect } from 'react';
import { UseFormRegister, FieldErrors, UseFormSetValue } from 'react-hook-form';
import { useAddressAutocomplete, AddressSuggestion } from '../hooks/useAddressAutocomplete';
import { Loader2, MapPin } from 'lucide-react';

// US States for dropdown
export const US_STATES = [
  { code: '', name: 'Select State' },
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

// Common address field names that forms will use
export interface AddressFieldValues {
  AddressLine1?: string | null;
  AddressLine2?: string | null;
  City?: string | null;
  State?: string | null;
  PostalCode?: string | null;
  Country?: string | null;
}

interface AddressFieldsProps<T extends AddressFieldValues> {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
  /** setValue function from react-hook-form (required for autocomplete) */
  setValue?: UseFormSetValue<T>;
  /** Enable address autocomplete (default: true if setValue provided) */
  enableAutocomplete?: boolean;
  /** Show AddressLine2 field (default: true) */
  showLine2?: boolean;
  /** Show Country field (default: false) */
  showCountry?: boolean;
  /** Whether fields are required (default: false) */
  required?: boolean;
  /** Custom class for inputs */
  inputClassName?: string;
  /** Custom class for labels */
  labelClassName?: string;
}

export default function AddressFields<T extends AddressFieldValues>({
  register,
  errors,
  setValue,
  enableAutocomplete = true,
  showLine2 = true,
  showCountry = false,
  required = false,
  inputClassName = "mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-white",
  labelClassName = "block text-sm font-medium text-gray-700 dark:text-gray-300",
}: AddressFieldsProps<T>) {
  const getError = (field: keyof AddressFieldValues): string | undefined => {
    // Cast errors to any to avoid TypeScript index signature issues
    const fieldErrors = errors as Record<string, { message?: string } | undefined>;
    return fieldErrors[field]?.message;
  };

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const { suggestions, isLoading, error, search, clear } = useAddressAutocomplete();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Determine if autocomplete is enabled
  const autocompleteEnabled = enableAutocomplete && setValue;

  // Handle input change for autocomplete
  const handleAddressInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (autocompleteEnabled) {
      const value = e.target.value;
      search(value);
      setShowSuggestions(true);
      setHighlightedIndex(-1);
    }
  };

  // Handle suggestion selection
  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    if (!setValue) return;

    // Fill in all address fields - cast to any to handle generic type constraints
    const setField = setValue as (name: string, value: string, options?: { shouldDirty: boolean }) => void;
    setField('AddressLine1', suggestion.street, { shouldDirty: true });
    setField('City', suggestion.city, { shouldDirty: true });
    setField('State', suggestion.state, { shouldDirty: true });
    setField('PostalCode', suggestion.postalCode, { shouldDirty: true });

    // Clear autocomplete state
    setShowSuggestions(false);
    clear();
    setHighlightedIndex(-1);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectSuggestion(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Register the AddressLine1 input and merge refs
  const addressLine1Registration = register('AddressLine1' as any);

  return (
    <div className="space-y-4">
      {/* Address Line 1 with autocomplete */}
      <div ref={containerRef} className="relative">
        <label htmlFor="AddressLine1" className={labelClassName}>
          Street Address {required && '*'}
          {autocompleteEnabled && (
            <span className="ml-2 text-xs text-gray-500 font-normal">
              (type to search)
            </span>
          )}
        </label>
        <div className="relative">
          <input
            id="AddressLine1"
            type="text"
            {...addressLine1Registration}
            ref={(e) => {
              addressLine1Registration.ref(e);
              inputRef.current = e;
            }}
            onChange={(e) => {
              addressLine1Registration.onChange(e);
              handleAddressInput(e);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            placeholder="123 Main St"
            autoComplete="off"
            className={inputClassName}
            role={autocompleteEnabled ? 'combobox' : undefined}
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-haspopup={autocompleteEnabled ? 'listbox' : undefined}
            aria-controls={autocompleteEnabled ? 'address-suggestions' : undefined}
            aria-autocomplete={autocompleteEnabled ? 'list' : undefined}
          />
          {/* Loading indicator */}
          {isLoading && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <p className="mt-1 text-sm text-amber-600">{error}</p>
        )}
        {getError('AddressLine1') && (
          <p className="mt-1 text-sm text-red-600">{getError('AddressLine1')}</p>
        )}

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            id="address-suggestions"
            role="listbox"
            className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={`${suggestion.street}-${suggestion.postalCode}-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                className={`
                  px-4 py-3 cursor-pointer flex items-start gap-3
                  ${index === highlightedIndex
                    ? 'bg-indigo-50 dark:bg-indigo-900/50'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }
                  ${index > 0 ? 'border-t border-gray-100 dark:border-gray-700' : ''}
                `}
                onClick={() => handleSelectSuggestion(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <MapPin className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {suggestion.street}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {suggestion.city}, {suggestion.state} {suggestion.postalCode}
                  </div>
                </div>
              </li>
            ))}
            {/* Attribution - required by Nominatim */}
            <li className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              Address data by OpenStreetMap
            </li>
          </ul>
        )}
      </div>

      {/* Address Line 2 (optional) */}
      {showLine2 && (
        <div>
          <label htmlFor="AddressLine2" className={labelClassName}>
            Address Line 2
          </label>
          <input
            id="AddressLine2"
            type="text"
            {...register('AddressLine2' as any)}
            placeholder="Apt, Suite, Unit, etc."
            className={inputClassName}
          />
          {getError('AddressLine2') && (
            <p className="mt-1 text-sm text-red-600">{getError('AddressLine2')}</p>
          )}
        </div>
      )}

      {/* City, State, Postal Code row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="City" className={labelClassName}>
            City {required && '*'}
          </label>
          <input
            id="City"
            type="text"
            {...register('City' as any)}
            className={inputClassName}
          />
          {getError('City') && (
            <p className="mt-1 text-sm text-red-600">{getError('City')}</p>
          )}
        </div>

        <div>
          <label htmlFor="State" className={labelClassName}>
            State {required && '*'}
          </label>
          <select
            id="State"
            {...register('State' as any)}
            className={inputClassName}
          >
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          {getError('State') && (
            <p className="mt-1 text-sm text-red-600">{getError('State')}</p>
          )}
        </div>

        <div>
          <label htmlFor="PostalCode" className={labelClassName}>
            ZIP Code {required && '*'}
          </label>
          <input
            id="PostalCode"
            type="text"
            {...register('PostalCode' as any)}
            placeholder="12345"
            maxLength={10}
            className={inputClassName}
          />
          {getError('PostalCode') && (
            <p className="mt-1 text-sm text-red-600">{getError('PostalCode')}</p>
          )}
        </div>
      </div>

      {/* Country (optional) */}
      {showCountry && (
        <div>
          <label htmlFor="Country" className={labelClassName}>
            Country
          </label>
          <input
            id="Country"
            type="text"
            {...register('Country' as any)}
            defaultValue="US"
            className={inputClassName}
          />
          {getError('Country') && (
            <p className="mt-1 text-sm text-red-600">{getError('Country')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Formats address fields into a single-line string for display.
 * @param address Object containing address fields
 * @returns Formatted address string or empty string if no address data
 */
export function formatAddress(address: Partial<AddressFieldValues>): string {
  const parts: string[] = [];

  if (address.AddressLine1) {
    parts.push(address.AddressLine1);
  }
  if (address.AddressLine2) {
    parts.push(address.AddressLine2);
  }

  const cityStateZip: string[] = [];
  if (address.City) {
    cityStateZip.push(address.City);
  }
  if (address.State) {
    cityStateZip.push(address.State);
  }
  if (address.PostalCode) {
    // Add postal code after state with a space, not comma
    if (address.State) {
      cityStateZip[cityStateZip.length - 1] += ' ' + address.PostalCode;
    } else {
      cityStateZip.push(address.PostalCode);
    }
  }

  if (cityStateZip.length > 0) {
    parts.push(cityStateZip.join(', '));
  }

  if (address.Country && address.Country !== 'US') {
    parts.push(address.Country);
  }

  return parts.join(', ');
}
