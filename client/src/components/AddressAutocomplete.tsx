import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useAddressAutocomplete, AddressSuggestion } from '../hooks/useAddressAutocomplete';
import { Loader2, MapPin } from 'lucide-react';

export interface AddressAutocompleteRef {
  focus: () => void;
}

interface AddressAutocompleteProps {
  /** Input field id */
  id: string;
  /** Input name */
  name?: string;
  /** Current value */
  value?: string;
  /** Called when value changes */
  onChange?: (value: string) => void;
  /** Called when user selects an address from suggestions */
  onAddressSelect?: (suggestion: AddressSuggestion) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Input className */
  className?: string;
  /** Label text (optional) */
  label?: string;
  /** Label className */
  labelClassName?: string;
  /** Whether field is required */
  required?: boolean;
  /** Hint text shown after label */
  hint?: string;
  /** Error message */
  error?: string;
  /** Whether autocomplete is disabled */
  disabled?: boolean;
}

/**
 * Standalone address autocomplete input component.
 * Use this when you need address autocomplete without the full AddressFields component.
 */
const AddressAutocomplete = forwardRef<AddressAutocompleteRef, AddressAutocompleteProps>(
  (
    {
      id,
      name,
      value,
      onChange,
      onAddressSelect,
      placeholder = '123 Main St',
      className = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2",
      label,
      labelClassName = "block text-sm font-medium text-gray-700 dark:text-gray-300",
      required = false,
      hint = '(type to search)',
      error,
      disabled = false,
    },
    ref
  ) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [localValue, setLocalValue] = useState(value || '');
    const { suggestions, isLoading, error: searchError, search, clear } = useAddressAutocomplete();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Sync local value with external value
    useEffect(() => {
      if (value !== undefined && value !== localValue) {
        setLocalValue(value);
      }
    }, [value]);

    // Expose focus method
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      onChange?.(newValue);
      search(newValue);
      setShowSuggestions(true);
      setHighlightedIndex(-1);
    };

    // Handle suggestion selection
    const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
      setLocalValue(suggestion.street);
      onChange?.(suggestion.street);
      onAddressSelect?.(suggestion);
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

    return (
      <div ref={containerRef} className="relative">
        {label && (
          <label htmlFor={id} className={labelClassName}>
            {label} {required && '*'}
            {hint && (
              <span className="ml-2 text-xs text-gray-500 font-normal">
                {hint}
              </span>
            )}
          </label>
        )}
        <div className="relative">
          <input
            ref={inputRef}
            id={id}
            name={name}
            type="text"
            value={localValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            disabled={disabled}
            className={className}
            role="combobox"
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-haspopup="listbox"
            aria-controls={`${id}-suggestions`}
            aria-autocomplete="list"
          />
          {/* Loading indicator */}
          {isLoading && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          )}
        </div>

        {/* Error display */}
        {searchError && (
          <p className="mt-1 text-sm text-amber-600">{searchError}</p>
        )}
        {error && (
          <p className="mt-1 text-sm text-red-600">{error}</p>
        )}

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <ul
            id={`${id}-suggestions`}
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
    );
  }
);

AddressAutocomplete.displayName = 'AddressAutocomplete';

export default AddressAutocomplete;
export type { AddressSuggestion };
