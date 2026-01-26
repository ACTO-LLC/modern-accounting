import { useState, useEffect } from 'react';
import { Save, Package, Car, Warehouse, DollarSign, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useFeatureFlags, FeatureFlags } from '../contexts/FeatureFlagsContext';

interface FeatureOption {
  key: keyof FeatureFlags;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const featureOptions: FeatureOption[] = [
  {
    key: 'SalesReceiptsEnabled',
    name: 'Sales Receipts',
    description: 'Track cash sales and immediate payments. Useful for retail or point-of-sale transactions.',
    icon: <Package className="h-5 w-5" />,
  },
  {
    key: 'MileageTrackingEnabled',
    name: 'Mileage Tracking',
    description: 'Track vehicle mileage for business trips and calculate tax deductions.',
    icon: <Car className="h-5 w-5" />,
  },
  {
    key: 'InventoryManagementEnabled',
    name: 'Inventory Management',
    description: 'Track stock levels, reorder points, and inventory valuation for physical products.',
    icon: <Warehouse className="h-5 w-5" />,
  },
  {
    key: 'PayrollEnabled',
    name: 'Payroll',
    description: 'Run payroll for employees including tax withholdings, pay stubs, and W-2 forms.',
    icon: <DollarSign className="h-5 w-5" />,
  },
];

export default function FeatureVisibilitySettings() {
  const { featureFlags, isLoading, error, updateFeatureFlags } = useFeatureFlags();
  const [localFlags, setLocalFlags] = useState<FeatureFlags>(featureFlags);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync local state when featureFlags load
  useEffect(() => {
    setLocalFlags(featureFlags);
    setHasChanges(false);
  }, [featureFlags]);

  const handleToggle = (key: keyof FeatureFlags) => {
    const newFlags = { ...localFlags, [key]: !localFlags[key] };
    setLocalFlags(newFlags);
    setHasChanges(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await updateFeatureFlags(localFlags);
      setSaveMessage({ type: 'success', text: 'Feature settings saved successfully!' });
      setHasChanges(false);
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to save feature settings. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLocalFlags(featureFlags);
    setHasChanges(false);
    setSaveMessage(null);
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <span className="ml-2 text-gray-600 dark:text-gray-400">Loading feature settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Feature Visibility</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Enable or disable optional features based on your business needs. Disabled features will be hidden from the navigation menu and reports.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Unable to load settings</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {error}. Using default settings (all features enabled).
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {featureOptions.map((feature) => (
          <div
            key={feature.key}
            className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className={`p-2.5 rounded-lg ${localFlags[feature.key] ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'}`}>
              {feature.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{feature.name}</h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={localFlags[feature.key]}
                  onClick={() => handleToggle(feature.key)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    localFlags[feature.key] ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      localFlags[feature.key] ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div className={`mt-6 rounded-md p-4 ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <div className="flex items-center gap-2">
            {saveMessage.type === 'success' ? (
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
            <p className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
              {saveMessage.text}
            </p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-6 flex justify-end gap-3">
        {hasChanges && (
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Changes
            </>
          )}
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
        Note: Disabling a feature hides it from the interface but does not delete any existing data. You can re-enable features at any time.
      </p>
    </div>
  );
}
