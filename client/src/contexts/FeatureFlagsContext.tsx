import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import api from '../lib/api';
import axios, { AxiosError } from 'axios';
import { useCompanySettings } from './CompanySettingsContext';
import { formatGuidForOData } from '../lib/validation';

// Helper to extract error message from axios error
function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
    return axiosErr.response?.data?.error?.message || axiosErr.message || 'An error occurred';
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unknown error occurred';
}

// Feature flag keys that map to navigation items
export type FeatureKey = 'sales_receipts' | 'mileage' | 'inventory' | 'payroll';

export interface FeatureFlags {
  SalesReceiptsEnabled: boolean;
  MileageTrackingEnabled: boolean;
  InventoryManagementEnabled: boolean;
  PayrollEnabled: boolean;
}

interface FeatureFlagsRecord extends FeatureFlags {
  Id: string;
  CompanyId: string;
  CreatedAt: string;
  UpdatedAt: string;
  UpdatedBy: string | null;
}

// Default values - all features enabled for backward compatibility
const defaultFeatureFlags: FeatureFlags = {
  SalesReceiptsEnabled: true,
  MileageTrackingEnabled: true,
  InventoryManagementEnabled: true,
  PayrollEnabled: true,
};

interface FeatureFlagsContextType {
  featureFlags: FeatureFlags;
  isLoading: boolean;
  error: string | null;
  isFeatureEnabled: (featureKey: FeatureKey) => boolean;
  updateFeatureFlags: (flags: Partial<FeatureFlags>) => Promise<void>;
  refreshFeatureFlags: () => Promise<void>;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

// Map feature keys used in navigation to database column names
const featureKeyMap: Record<FeatureKey, keyof FeatureFlags> = {
  'sales_receipts': 'SalesReceiptsEnabled',
  'mileage': 'MileageTrackingEnabled',
  'inventory': 'InventoryManagementEnabled',
  'payroll': 'PayrollEnabled',
};

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { settings: companySettings, isLoaded: companyLoaded } = useCompanySettings();
  const companyId = companySettings.id;

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(defaultFeatureFlags);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatureFlags = useCallback(async () => {
    if (!companyId) {
      // No company exists yet — use defaults (all enabled)
      setRecordId(null);
      setFeatureFlags(defaultFeatureFlags);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch existing feature flags for the actual company
      const validatedCompanyId = formatGuidForOData(companyId, 'CompanyId');
      const response = await api.get(`/companyfeatureflags?$filter=CompanyId eq ${validatedCompanyId}`);
      const records = response.data?.value || [];

      if (records.length > 0) {
        const record: FeatureFlagsRecord = records[0];
        setRecordId(record.Id);
        setFeatureFlags({
          SalesReceiptsEnabled: record.SalesReceiptsEnabled,
          MileageTrackingEnabled: record.MileageTrackingEnabled,
          InventoryManagementEnabled: record.InventoryManagementEnabled,
          PayrollEnabled: record.PayrollEnabled,
        });
      } else {
        // No record exists - use defaults (all enabled)
        // We'll create the record when user first saves
        setRecordId(null);
        setFeatureFlags(defaultFeatureFlags);
      }
    } catch (err) {
      console.error('Failed to fetch feature flags:', err);
      setError(getErrorMessage(err));
      // On error, default to all features enabled
      setFeatureFlags(defaultFeatureFlags);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  // Re-fetch when company ID becomes available or changes
  useEffect(() => {
    if (companyLoaded) {
      fetchFeatureFlags();
    }
  }, [companyLoaded, fetchFeatureFlags]);

  const isFeatureEnabled = useCallback((featureKey: FeatureKey): boolean => {
    const flagKey = featureKeyMap[featureKey];
    return flagKey ? featureFlags[flagKey] : true;
  }, [featureFlags]);

  const updateFeatureFlags = useCallback(async (flags: Partial<FeatureFlags>) => {
    if (!companyId) {
      throw new Error('Cannot save feature flags: no company exists yet. Please set up your company first.');
    }

    try {
      setError(null);
      const updatedFlags = { ...featureFlags, ...flags };

      if (recordId) {
        // Update existing record
        await api.patch(`/companyfeatureflags/Id/${recordId}`, {
          ...flags,
          UpdatedAt: new Date().toISOString(),
        });
      } else {
        // Create new record using the actual company ID
        const response = await api.post('/companyfeatureflags', {
          CompanyId: companyId,
          ...updatedFlags,
        });
        const newRecord = response.data?.value?.[0] || response.data;
        if (newRecord?.Id) {
          setRecordId(newRecord.Id);
        }
      }

      setFeatureFlags(updatedFlags);
    } catch (err) {
      console.error('Failed to update feature flags:', err);
      setError(getErrorMessage(err));
      throw err;
    }
  }, [featureFlags, recordId, companyId]);

  const refreshFeatureFlags = useCallback(async () => {
    await fetchFeatureFlags();
  }, [fetchFeatureFlags]);

  return (
    <FeatureFlagsContext.Provider
      value={{
        featureFlags,
        isLoading,
        error,
        isFeatureEnabled,
        updateFeatureFlags,
        refreshFeatureFlags,
      }}
    >
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (context === undefined) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider');
  }
  return context;
}
