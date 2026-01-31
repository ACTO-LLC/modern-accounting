import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../lib/api';

export type InvoicePostingMode = 'simple' | 'advanced';

export interface CompanySettings {
  id?: string; // Database ID for updates
  name: string;
  logoUrl: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  taxId: string; // EIN (Employer Identification Number)
  stateEmployerId: string; // State employer ID for W-2 forms
  // Invoice/Bill Posting Mode:
  // - 'simple': QBO-like behavior - documents post to GL immediately on save
  // - 'advanced': Draft documents don't create journal entries until explicitly posted
  invoicePostingMode: InvoicePostingMode;
}

const defaultSettings: CompanySettings = {
  name: 'My Company',
  logoUrl: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  email: '',
  website: '',
  taxId: '',
  stateEmployerId: '',
  invoicePostingMode: 'simple', // Default to QBO-like simple mode
};

interface CompanySettingsContextType {
  settings: CompanySettings;
  updateSettings: (settings: Partial<CompanySettings>) => Promise<void>;
  isLoaded: boolean;
  isSaving: boolean;
  error: string | null;
}

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'company-settings';

// Map database record to local settings
function mapDbToSettings(dbRecord: Record<string, unknown>): CompanySettings {
  // Parse Settings JSON for extra fields
  let extraSettings: Record<string, unknown> = {};
  if (dbRecord.Settings && typeof dbRecord.Settings === 'string') {
    try {
      extraSettings = JSON.parse(dbRecord.Settings);
    } catch {
      // Ignore parse errors
    }
  }

  return {
    id: dbRecord.Id as string,
    name: (dbRecord.Name as string) || defaultSettings.name,
    logoUrl: (dbRecord.LogoUrl as string) || '',
    address: (dbRecord.Address as string) || '',
    city: (dbRecord.City as string) || '',
    state: (dbRecord.State as string) || '',
    zip: (dbRecord.ZipCode as string) || '',
    phone: (dbRecord.Phone as string) || '',
    email: (dbRecord.Email as string) || '',
    website: (dbRecord.Website as string) || '',
    taxId: (dbRecord.TaxId as string) || '',
    stateEmployerId: (extraSettings.stateEmployerId as string) || '',
    invoicePostingMode: (extraSettings.invoicePostingMode as InvoicePostingMode) || 'simple',
  };
}

// Map local settings to database record
function mapSettingsToDb(settings: CompanySettings): Record<string, unknown> {
  // Store extra fields in Settings JSON
  const extraSettings = JSON.stringify({
    stateEmployerId: settings.stateEmployerId,
    invoicePostingMode: settings.invoicePostingMode,
  });

  return {
    Name: settings.name,
    LogoUrl: settings.logoUrl || null,
    Address: settings.address || null,
    City: settings.city || null,
    State: settings.state || null,
    ZipCode: settings.zip || null,
    Phone: settings.phone || null,
    Email: settings.email || null,
    Website: settings.website || null,
    TaxId: settings.taxId || null,
    Settings: extraSettings,
    UpdatedAt: new Date().toISOString(),
  };
}

export function CompanySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings from database on mount, fall back to localStorage
  useEffect(() => {
    async function loadSettings() {
      try {
        // Try to fetch from database first
        const response = await api.get('/companies?$orderby=CreatedAt desc&$first=1');
        const companies = response.data?.value || [];

        if (companies.length > 0) {
          const dbSettings = mapDbToSettings(companies[0]);
          setSettings(dbSettings);
          // Also update localStorage cache
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbSettings));
          console.log('[CompanySettings] Loaded from database:', dbSettings.name);
        } else {
          // No company in database, try localStorage
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            setSettings({ ...defaultSettings, ...parsed });
            console.log('[CompanySettings] Loaded from localStorage');
          }
        }
      } catch (err) {
        console.warn('[CompanySettings] Failed to load from database, using localStorage:', err);
        // Fall back to localStorage
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            setSettings({ ...defaultSettings, ...parsed });
          }
        } catch (localErr) {
          console.error('[CompanySettings] Failed to load from localStorage:', localErr);
        }
      }
      setIsLoaded(true);
    }

    loadSettings();
  }, []);

  // Save settings to database and localStorage
  const updateSettings = async (newSettings: Partial<CompanySettings>) => {
    setIsSaving(true);
    setError(null);

    const updated = { ...settings, ...newSettings };

    try {
      // Always update localStorage immediately for responsiveness
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setSettings(updated);

      // Save to database
      const dbData = mapSettingsToDb(updated);

      if (updated.id) {
        // Update existing company
        await api.patch(`/companies/Id/${updated.id}`, dbData);
        console.log('[CompanySettings] Updated in database');
      } else {
        // Create new company
        const response = await api.post('/companies', {
          ...dbData,
          IsActive: true,
          OnboardingStatus: 'Completed',
        });
        const created = response.data?.value?.[0];
        if (created?.Id) {
          updated.id = created.Id;
          setSettings(updated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          console.log('[CompanySettings] Created in database:', created.Id);
        }
      }
    } catch (err) {
      console.error('[CompanySettings] Failed to save to database:', err);
      setError('Failed to save settings to server. Changes saved locally.');
      // Settings are already in localStorage, so the UI will still work
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <CompanySettingsContext.Provider value={{ settings, updateSettings, isLoaded, isSaving, error }}>
      {children}
    </CompanySettingsContext.Provider>
  );
}

export function useCompanySettings() {
  const context = useContext(CompanySettingsContext);
  if (context === undefined) {
    throw new Error('useCompanySettings must be used within a CompanySettingsProvider');
  }
  return context;
}
