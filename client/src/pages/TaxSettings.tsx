import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, Save, TestTube, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import api from '../lib/api';

interface TaxSettingsData {
  id?: string;
  calculationMethod: 'manual' | 'zip_api' | 'paid_api';
  paidApiProvider: 'avalara' | 'taxjar' | null;
  avalaraAccountId: string | null;
  avalaraCompanyCode: string | null;
  avalaraEnvironment: 'sandbox' | 'production';
  fallbackTaxRateId: string | null;
  cacheDurationMinutes: number;
  hasApiCredentials: boolean;
}

interface TaxRate {
  Id: string;
  Name: string;
  Rate: number;
  TaxType: string;
}

export default function TaxSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<TaxSettingsData>({
    calculationMethod: 'manual',
    paidApiProvider: null,
    avalaraAccountId: null,
    avalaraCompanyCode: null,
    avalaraEnvironment: 'sandbox',
    fallbackTaxRateId: null,
    cacheDurationMinutes: 60,
    hasApiCredentials: false
  });
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load settings and tax rates on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [settingsRes, taxRatesRes] = await Promise.all([
          api.get('/tax/settings'),
          api.get('/taxrates?$filter=TaxType eq \'Sales\' and IsActive eq true')
        ]);
        setSettings(settingsRes.data);
        setTaxRates(taxRatesRes.data.value || []);
      } catch (error) {
        console.error('Failed to load tax settings:', error);
        setMessage({ type: 'error', text: 'Failed to load settings' });
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleMethodChange = (method: TaxSettingsData['calculationMethod']) => {
    setSettings(prev => ({ ...prev, calculationMethod: method }));
    setTestResult(null);
  };

  const handleProviderChange = (provider: 'avalara' | 'taxjar') => {
    setSettings(prev => ({ ...prev, paidApiProvider: provider }));
    setApiKey('');
    setApiSecret('');
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!settings.paidApiProvider) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const payload: Record<string, string> = {
        provider: settings.paidApiProvider,
        apiKey: apiKey || '',
        environment: settings.avalaraEnvironment
      };

      if (settings.paidApiProvider === 'avalara') {
        payload.accountId = settings.avalaraAccountId || '';
      }

      const response = await api.post('/tax/test-connection', payload);
      setTestResult(response.data);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Connection test failed';
      setTestResult({ success: false, message: errMsg });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      const payload: Record<string, unknown> = {
        calculationMethod: settings.calculationMethod,
        paidApiProvider: settings.paidApiProvider,
        avalaraAccountId: settings.avalaraAccountId,
        avalaraCompanyCode: settings.avalaraCompanyCode,
        avalaraEnvironment: settings.avalaraEnvironment,
        fallbackTaxRateId: settings.fallbackTaxRateId,
        cacheDurationMinutes: settings.cacheDurationMinutes
      };

      // Only include credentials if they were entered
      if (apiKey) {
        payload.apiKey = apiKey;
      }
      if (apiSecret) {
        payload.apiSecret = apiSecret;
      }

      await api.put('/tax/settings', payload);
      setMessage({ type: 'success', text: 'Tax settings saved successfully!' });

      // Clear credential fields after save
      setApiKey('');
      setApiSecret('');

      // Refresh settings to get updated hasApiCredentials
      const settingsRes = await api.get('/tax/settings');
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Failed to save tax settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back Navigation */}
      <button
        onClick={() => navigate('/tax-rates')}
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Tax Rates
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Calculator className="h-8 w-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Tax Calculation Settings</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Configure how sales tax rates are determined for invoices.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Calculation Method Selection */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Calculation Method</h2>

          <div className="space-y-4">
            {/* Manual Option */}
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                settings.calculationMethod === 'manual'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="calculationMethod"
                value="manual"
                checked={settings.calculationMethod === 'manual'}
                onChange={() => handleMethodChange('manual')}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <span className="font-semibold text-gray-900 dark:text-white">Manual Selection</span>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Select tax rates manually for each invoice from your configured tax rates.
                  Best for businesses with simple tax requirements.
                </p>
              </div>
            </label>

            {/* ZIP-based API Option */}
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                settings.calculationMethod === 'zip_api'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="calculationMethod"
                value="zip_api"
                checked={settings.calculationMethod === 'zip_api'}
                onChange={() => handleMethodChange('zip_api')}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">ZIP-based API (Free)</span>
                  <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                    No API Key Required
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Automatically lookup tax rates based on customer ZIP code using Avalara's free TaxRates API.
                  Rate-limited to 100 requests per hour.
                </p>
                <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <li>- ZIP-level accuracy (city/county may vary)</li>
                  <li>- Cached results for performance</li>
                  <li>- Falls back to manual rate if limit exceeded</li>
                </ul>
              </div>
            </label>

            {/* Paid API Option */}
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                settings.calculationMethod === 'paid_api'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="calculationMethod"
                value="paid_api"
                checked={settings.calculationMethod === 'paid_api'}
                onChange={() => handleMethodChange('paid_api')}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">Paid Tax API</span>
                  <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full">
                    Street-level Accuracy
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Use Avalara AvaTax or TaxJar for precise, jurisdiction-level tax calculations.
                  Requires a paid subscription with the provider.
                </p>
                <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <li>- Street-level accuracy</li>
                  <li>- Handles complex tax scenarios</li>
                  <li>- Real-time rate updates</li>
                </ul>
              </div>
            </label>
          </div>
        </div>

        {/* Paid API Configuration */}
        {settings.calculationMethod === 'paid_api' && (
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">API Configuration</h2>

            {/* Provider Selection */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">
                Tax Provider
              </label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => handleProviderChange('avalara')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    settings.paidApiProvider === 'avalara'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  Avalara AvaTax
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderChange('taxjar')}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    settings.paidApiProvider === 'taxjar'
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  TaxJar
                </button>
              </div>
            </div>

            {/* Avalara-specific fields */}
            {settings.paidApiProvider === 'avalara' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="avalaraAccountId" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                      Account ID
                    </label>
                    <input
                      type="text"
                      id="avalaraAccountId"
                      value={settings.avalaraAccountId || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, avalaraAccountId: e.target.value }))}
                      placeholder="Enter your Avalara Account ID"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="avalaraCompanyCode" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                      Company Code
                    </label>
                    <input
                      type="text"
                      id="avalaraCompanyCode"
                      value={settings.avalaraCompanyCode || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, avalaraCompanyCode: e.target.value }))}
                      placeholder="Your company code in Avalara"
                      className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="avalaraEnvironment" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                    Environment
                  </label>
                  <select
                    id="avalaraEnvironment"
                    value={settings.avalaraEnvironment}
                    onChange={(e) => setSettings(prev => ({ ...prev, avalaraEnvironment: e.target.value as 'sandbox' | 'production' }))}
                    className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="sandbox">Sandbox (Testing)</option>
                    <option value="production">Production</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                    License Key {settings.hasApiCredentials && <span className="text-green-600 text-xs">(Configured)</span>}
                  </label>
                  <input
                    type="password"
                    id="apiKey"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={settings.hasApiCredentials ? 'Enter new key to replace existing' : 'Enter your Avalara License Key'}
                    className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* TaxJar-specific fields */}
            {settings.paidApiProvider === 'taxjar' && (
              <div>
                <label htmlFor="taxjarApiKey" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                  API Token {settings.hasApiCredentials && <span className="text-green-600 text-xs">(Configured)</span>}
                </label>
                <input
                  type="password"
                  id="taxjarApiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings.hasApiCredentials ? 'Enter new token to replace existing' : 'Enter your TaxJar API Token'}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
                />
              </div>
            )}

            {/* Test Connection Button */}
            {settings.paidApiProvider && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || (!apiKey && !settings.hasApiCredentials)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4" />
                  )}
                  Test Connection
                </button>

                {testResult && (
                  <div className={`mt-3 p-3 rounded-md ${
                    testResult.success
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-red-50 dark:bg-red-900/20'
                  }`}>
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className={`text-sm ${
                        testResult.success
                          ? 'text-green-700 dark:text-green-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}>
                        {testResult.message}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fallback Rate Configuration */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Fallback Tax Rate</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Used when API lookup fails or rate limit is exceeded. Also used as default for manual selection.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="fallbackTaxRateId" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                Default Tax Rate
              </label>
              <select
                id="fallbackTaxRateId"
                value={settings.fallbackTaxRateId || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, fallbackTaxRateId: e.target.value || null }))}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
              >
                <option value="">None (require selection)</option>
                {taxRates.map(rate => (
                  <option key={rate.Id} value={rate.Id}>
                    {rate.Name} ({(rate.Rate * 100).toFixed(2)}%)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cacheDurationMinutes" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                Cache Duration (minutes)
              </label>
              <input
                type="number"
                id="cacheDurationMinutes"
                value={settings.cacheDurationMinutes}
                onChange={(e) => setSettings(prev => ({ ...prev, cacheDurationMinutes: parseInt(e.target.value) || 60 }))}
                min={1}
                max={1440}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                How long to cache API results (1-1440 minutes)
              </p>
            </div>
          </div>
        </div>

        {/* Save Message */}
        {message && (
          <div className={`rounded-md p-4 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20'
              : 'bg-red-50 dark:bg-red-900/20'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500" />
              )}
              <p className={`text-sm font-medium ${
                message.type === 'success'
                  ? 'text-green-800 dark:text-green-400'
                  : 'text-red-800 dark:text-red-400'
              }`}>
                {message.text}
              </p>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
