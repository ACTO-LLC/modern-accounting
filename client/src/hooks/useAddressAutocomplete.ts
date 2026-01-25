import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Address suggestion from autocomplete API
 */
export interface AddressSuggestion {
  /** Full formatted address */
  displayName: string;
  /** Street address line */
  street: string;
  /** City name */
  city: string;
  /** State code (2-letter) */
  state: string;
  /** ZIP/Postal code */
  postalCode: string;
  /** House number (if available) */
  houseNumber?: string;
}

/**
 * Geoapify API response structure
 * @see https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
 */
interface GeoapifyResult {
  properties: {
    formatted: string;
    address_line1?: string;
    address_line2?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    state?: string;
    state_code?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

interface GeoapifyResponse {
  results: GeoapifyResult[];
}

/**
 * Parse Geoapify result into AddressSuggestion
 */
function parseGeoapifyResult(result: GeoapifyResult): AddressSuggestion | null {
  const props = result.properties;

  // Only process US addresses
  if (props.country_code?.toLowerCase() !== 'us') {
    return null;
  }

  // Get city from various possible fields
  const city = props.city || props.town || props.village || props.suburb || '';

  // Build street address
  let street = '';
  if (props.housenumber && props.street) {
    street = `${props.housenumber} ${props.street}`;
  } else if (props.street) {
    street = props.street;
  } else if (props.address_line1) {
    street = props.address_line1;
  }

  // Get state code (Geoapify provides state_code directly)
  const state = props.state_code?.toUpperCase() || '';

  return {
    displayName: props.formatted || '',
    street,
    city,
    state,
    postalCode: props.postcode || '',
    houseNumber: props.housenumber,
  };
}

/**
 * Simple in-memory cache for address lookups
 */
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  suggestions: AddressSuggestion[];
  timestamp: number;
}

const cacheWithTTL = new Map<string, CacheEntry>();

function getCached(query: string): AddressSuggestion[] | null {
  const entry = cacheWithTTL.get(query.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cacheWithTTL.delete(query.toLowerCase());
    return null;
  }
  return entry.suggestions;
}

function setCache(query: string, suggestions: AddressSuggestion[]): void {
  // Evict oldest entries if cache is full
  if (cacheWithTTL.size >= CACHE_MAX_SIZE) {
    const oldestKey = cacheWithTTL.keys().next().value;
    if (oldestKey) cacheWithTTL.delete(oldestKey);
  }
  cacheWithTTL.set(query.toLowerCase(), {
    suggestions,
    timestamp: Date.now(),
  });
}

interface UseAddressAutocompleteOptions {
  /** Debounce delay in milliseconds (default: 400) */
  debounceMs?: number;
  /** Minimum characters before searching (default: 5) */
  minChars?: number;
  /** Maximum number of suggestions (default: 5) */
  maxResults?: number;
}

interface UseAddressAutocompleteReturn {
  /** List of address suggestions */
  suggestions: AddressSuggestion[];
  /** Whether a search is in progress */
  isLoading: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Search for addresses matching the query */
  search: (query: string) => void;
  /** Clear suggestions and error */
  clear: () => void;
}

/**
 * Hook for US address autocomplete using Geoapify API.
 *
 * Requires VITE_GEOAPIFY_API_KEY environment variable.
 * Free tier: 3,000 requests/day.
 *
 * @see https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
 */
export function useAddressAutocomplete(
  options: UseAddressAutocompleteOptions = {}
): UseAddressAutocompleteReturn {
  const {
    debounceMs = 300,
    minChars = 5,
    maxResults = 5,
  } = options;

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<string>('');

  // Get API key from environment (free tier: 3,000 requests/day)
  // Register at https://myprojects.geoapify.com/ to get a key
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;

  const clear = useCallback(() => {
    setSuggestions([]);
    setError(null);
    setIsLoading(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const search = useCallback((query: string) => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Clear previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Check minimum length
    if (!query || query.length < minChars) {
      setSuggestions([]);
      setError(null);
      return;
    }

    // Avoid duplicate searches
    if (query === lastSearchRef.current) {
      return;
    }

    // Check cache first
    const cached = getCached(query);
    if (cached) {
      setSuggestions(cached);
      setIsLoading(false);
      return;
    }

    // Set loading state after a short delay to avoid flicker
    debounceTimerRef.current = setTimeout(async () => {
      // Check if API key is configured
      if (!apiKey) {
        console.warn('Geoapify API key not configured. Set VITE_GEOAPIFY_API_KEY environment variable.');
        setError('Address lookup not configured. Please enter address manually.');
        setIsLoading(false);
        return;
      }

      lastSearchRef.current = query;
      setIsLoading(true);
      setError(null);

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // Geoapify Autocomplete API - search for US addresses
        const params = new URLSearchParams({
          text: query,
          format: 'json',
          filter: 'countrycode:us',
          limit: String(maxResults),
          apiKey: apiKey,
        });

        const response = await fetch(
          `https://api.geoapify.com/v1/geocode/autocomplete?${params}`,
          {
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }

        const data: GeoapifyResponse = await response.json();

        // Parse and filter results
        const parsed = (data.results || [])
          .map(parseGeoapifyResult)
          .filter((s): s is AddressSuggestion => s !== null && s.street !== '');

        // Cache the results
        setCache(query, parsed);
        setSuggestions(parsed);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Request was cancelled, ignore
          return;
        }
        console.error('Address autocomplete error:', err);
        setError('Unable to search addresses. Please enter manually.');
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);
  }, [debounceMs, minChars, maxResults, apiKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    search,
    clear,
  };
}
