import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export interface CurrencyLocaleOption {
  code: string;
  label: string;
  currency: string;
  example: string;
}

/**
 * Supported locale/currency combinations.
 * Each entry defines a locale code, display label, ISO 4217 currency code,
 * and an example of how $1234.56 would be formatted.
 */
export const CURRENCY_LOCALE_OPTIONS: CurrencyLocaleOption[] = [
  { code: 'en-US', label: 'English (US) - USD', currency: 'USD', example: '$1,234.56' },
  { code: 'en-GB', label: 'English (UK) - GBP', currency: 'GBP', example: '\u00a31,234.56' },
  { code: 'en-CA', label: 'English (Canada) - CAD', currency: 'CAD', example: 'CA$1,234.56' },
  { code: 'en-AU', label: 'English (Australia) - AUD', currency: 'AUD', example: 'A$1,234.56' },
  { code: 'de-DE', label: 'German (Germany) - EUR', currency: 'EUR', example: '1.234,56\u00a0\u20ac' },
  { code: 'fr-FR', label: 'French (France) - EUR', currency: 'EUR', example: '1\u202f234,56\u00a0\u20ac' },
  { code: 'ja-JP', label: 'Japanese (Japan) - JPY', currency: 'JPY', example: '\uffe51,235' },
  { code: 'zh-CN', label: 'Chinese (China) - CNY', currency: 'CNY', example: '\uffe51,234.56' },
  { code: 'pt-BR', label: 'Portuguese (Brazil) - BRL', currency: 'BRL', example: 'R$\u00a01.234,56' },
  { code: 'es-MX', label: 'Spanish (Mexico) - MXN', currency: 'MXN', example: '$1,234.56' },
  { code: 'en-IN', label: 'English (India) - INR', currency: 'INR', example: '\u20b91,234.56' },
];

const LOCALE_STORAGE_KEY = 'currency-locale';
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';

function getStoredLocale(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && CURRENCY_LOCALE_OPTIONS.some(opt => opt.code === stored)) {
      return stored;
    }
  }
  return DEFAULT_LOCALE;
}

function getCurrencyForLocale(localeCode: string): string {
  const option = CURRENCY_LOCALE_OPTIONS.find(opt => opt.code === localeCode);
  return option?.currency || DEFAULT_CURRENCY;
}

interface CurrencyContextType {
  locale: string;
  currency: string;
  setLocale: (locale: string) => void;
  formatCurrency: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(() => getStoredLocale());

  const currency = useMemo(() => getCurrencyForLocale(locale), [locale]);

  const formatter = useMemo(() => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'JPY' ? 0 : 2,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    });
  }, [locale, currency]);

  const formatCurrency = useCallback(
    (amount: number): string => {
      if (amount == null || isNaN(amount)) return formatter.format(0);
      return formatter.format(amount);
    },
    [formatter]
  );

  const setLocale = useCallback((newLocale: string) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }, []);

  const value = useMemo(
    () => ({ locale, currency, setLocale, formatCurrency }),
    [locale, currency, setLocale, formatCurrency]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Hook to access currency formatting from within React components.
 */
export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

/**
 * Standalone formatCurrency for use outside of React components.
 * Reads the locale from localStorage directly.
 * Prefer useCurrency().formatCurrency inside React components.
 */
export function formatCurrencyStandalone(amount: number): string {
  const locale = getStoredLocale();
  const currency = getCurrencyForLocale(locale);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount ?? 0);
}
