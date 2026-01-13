import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CompanySettings {
  name: string;
  logoUrl: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
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
};

interface CompanySettingsContextType {
  settings: CompanySettings;
  updateSettings: (settings: Partial<CompanySettings>) => void;
  isLoaded: boolean;
}

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

const STORAGE_KEY = 'company-settings';

export function CompanySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load company settings:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save settings to localStorage whenever they change
  const updateSettings = (newSettings: Partial<CompanySettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save company settings:', error);
      }
      return updated;
    });
  };

  return (
    <CompanySettingsContext.Provider value={{ settings, updateSettings, isLoaded }}>
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
