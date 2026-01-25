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
 * Nominatim API response structure
 */
interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

/**
 * Map of US state names to state codes
 */
const STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
  'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
  'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
  'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
  'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
  'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
  'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
};

/**
 * Convert state name to 2-letter code
 */
function getStateCode(stateName: string | undefined): string {
  if (!stateName) return '';
  const normalized = stateName.toLowerCase().trim();
  // Check if already a 2-letter code
  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }
  return STATE_NAME_TO_CODE[normalized] || '';
}

/**
 * Parse Nominatim result into AddressSuggestion
 */
function parseNominatimResult(result: NominatimResult): AddressSuggestion | null {
  const addr = result.address;

  // Only process US addresses
  if (addr.country_code?.toLowerCase() !== 'us') {
    return null;
  }

  // Get city from various possible fields
  const city = addr.city || addr.town || addr.village || addr.municipality || '';

  // Build street address
  let street = '';
  if (addr.house_number && addr.road) {
    street = `${addr.house_number} ${addr.road}`;
  } else if (addr.road) {
    street = addr.road;
  }

  // Get state code
  const state = getStateCode(addr.state);

  return {
    displayName: result.display_name,
    street,
    city,
    state,
    postalCode: addr.postcode || '',
    houseNumber: addr.house_number,
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
 * Hook for US address autocomplete using OpenStreetMap Nominatim API.
 *
 * Note: Nominatim has usage limits (1 request/second max).
 * This hook implements debouncing and caching to respect those limits.
 *
 * @see https://nominatim.org/release-docs/latest/api/Search/
 */
export function useAddressAutocomplete(
  options: UseAddressAutocompleteOptions = {}
): UseAddressAutocompleteReturn {
  const {
    debounceMs = 400,
    minChars = 5,
    maxResults = 5,
  } = options;

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSearchRef = useRef<string>('');

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
      lastSearchRef.current = query;
      setIsLoading(true);
      setError(null);

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // Nominatim API - search for US addresses
        const params = new URLSearchParams({
          q: query,
          format: 'json',
          addressdetails: '1',
          countrycodes: 'us',
          limit: String(maxResults),
        });

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          {
            signal: abortControllerRef.current.signal,
            headers: {
              // Nominatim requires a User-Agent
              'User-Agent': 'ModernAccounting/1.0',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }

        const results: NominatimResult[] = await response.json();

        // Parse and filter results
        const parsed = results
          .map(parseNominatimResult)
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
  }, [debounceMs, minChars, maxResults]);

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
