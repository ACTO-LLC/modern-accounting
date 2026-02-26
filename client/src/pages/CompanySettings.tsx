import { useState, useRef, useEffect } from 'react';
import { Building2, Upload, Save, X, Sun, Moon, Monitor, Mail, AlertCircle, Zap, ClipboardCheck, HelpCircle } from 'lucide-react';
import { useCompanySettings, InvoicePostingMode } from '../contexts/CompanySettingsContext';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import EmailSettingsForm from '../components/EmailSettingsForm';
import OnboardingSettings from '../components/onboarding/OnboardingSettings';
import FeatureVisibilitySettings from '../components/FeatureVisibilitySettings';
import { validateEIN } from '../lib/taxForms';

export default function CompanySettings() {
  const { settings, updateSettings, isLoaded } = useCompanySettings();
  const { theme, setTheme } = useTheme();
  const [formData, setFormData] = useState(settings);
  const [logoPreview, setLogoPreview] = useState(settings.logoUrl);

  // Sync formData when settings load from DB (initial load is async)
  useEffect(() => {
    if (isLoaded) {
      setFormData(settings);
      setLogoPreview(settings.logoUrl);
    }
  }, [isLoaded, settings]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setSaveMessage({ type: 'error', text: 'Please select an image file' });
        return;
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setSaveMessage({ type: 'error', text: 'Image must be less than 2MB' });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setFormData(prev => ({ ...prev, logoUrl: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview('');
    setFormData(prev => ({ ...prev, logoUrl: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const themeOptions: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
  ];
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);

    try {
      await updateSettings(formData);
      setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Company Settings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure your company information for invoices and the app header.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Theme Section */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Appearance</h2>
          <div>
            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Theme</label>
            <div className="flex flex-wrap gap-3">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition-colors ${
                    theme === option.value
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Choose how the application appears. System will follow your device settings.
            </p>
          </div>
        </div>

        {/* Transaction Posting Mode Section */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transaction Posting Mode</h2>
            <div className="relative group">
              <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
              <div className="absolute left-0 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <p className="mb-2"><strong>Simple Mode</strong> (like QuickBooks): Invoices and bills immediately affect your accounting records when saved.</p>
                <p><strong>Advanced Mode</strong>: Documents stay as drafts until you explicitly post them, giving you more control over your books.</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Choose how invoices and bills affect your general ledger.
          </p>

          <div className="space-y-4">
            {/* Simple Mode Option */}
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                formData.invoicePostingMode === 'simple'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="invoicePostingMode"
                value="simple"
                checked={formData.invoicePostingMode === 'simple'}
                onChange={() => setFormData(prev => ({ ...prev, invoicePostingMode: 'simple' as InvoicePostingMode }))}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">Simple Mode</span>
                  <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">Recommended</span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Like QuickBooks Online. Invoices and bills immediately post to your general ledger when saved.
                  Perfect for small businesses that want straightforward accounting.
                </p>
                <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <li>- Invoices: Save = Post to AR & Revenue</li>
                  <li>- Bills: Save = Post to AP & Expense</li>
                  <li>- Corrections via credit memos or adjusting entries</li>
                </ul>
              </div>
            </label>

            {/* Advanced Mode Option */}
            <label
              className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                formData.invoicePostingMode === 'advanced'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="invoicePostingMode"
                value="advanced"
                checked={formData.invoicePostingMode === 'advanced'}
                onChange={() => setFormData(prev => ({ ...prev, invoicePostingMode: 'advanced' as InvoicePostingMode }))}
                className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-blue-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">Advanced Mode</span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  For businesses needing review steps. Documents remain as drafts until explicitly posted.
                  Ideal for approval workflows and accountant review.
                </p>
                <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <li>- Draft documents don't affect GL</li>
                  <li>- Edit freely before posting</li>
                  <li>- Supports approval workflows</li>
                </ul>
              </div>
            </label>
          </div>

          {formData.invoicePostingMode !== settings.invoicePostingMode && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <strong>Note:</strong> Changing this setting only affects new transactions.
                Existing documents will retain their current posting status.
              </p>
            </div>
          )}
        </div>

        {/* Invoice Numbering Section */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Invoice Numbering</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Configure the prefix used for auto-generated invoice numbers (e.g., INV-0001, ACME-0001).
          </p>

          <div className="max-w-sm">
            <label htmlFor="invoiceNumberPrefix" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
              Invoice Number Prefix
            </label>
            <input
              type="text"
              id="invoiceNumberPrefix"
              name="invoiceNumberPrefix"
              value={formData.invoiceNumberPrefix}
              onChange={handleChange}
              placeholder="INV-"
              maxLength={20}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              New invoices will be numbered as {formData.invoiceNumberPrefix || 'INV-'}0001, {formData.invoiceNumberPrefix || 'INV-'}0002, etc.
            </p>
          </div>
        </div>

        {/* Logo Section */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Company Logo</h2>

          <div className="flex items-start gap-6">
            {/* Logo Preview */}
            <div className="flex-shrink-0">
              {logoPreview ? (
                <div className="relative">
                  <img
                    src={logoPreview}
                    alt="Company logo"
                    className="h-20 max-w-[200px] object-contain border border-gray-200 rounded-lg p-2 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="h-20 w-40 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">
                  <Building2 className="h-8 w-8" />
                </div>
              )}
            </div>

            {/* Upload Button */}
            <div className="flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                Upload Logo
              </label>
              <p className="mt-2 text-xs text-gray-500">
                PNG, JPG, or GIF. Max 2MB. Recommended size: 200x50 pixels.
              </p>
            </div>
          </div>
        </div>

        {/* Company Information */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Company Information</h2>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="block text-sm font-semibold text-gray-600 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="address" className="block text-sm font-semibold text-gray-600 mb-2">
                Street Address
              </label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
              />
            </div>

            <div>
              <label htmlFor="city" className="block text-sm font-semibold text-gray-600 mb-2">
                City
              </label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="state" className="block text-sm font-semibold text-gray-600 mb-2">
                  State
                </label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
                />
              </div>
              <div>
                <label htmlFor="zip" className="block text-sm font-semibold text-gray-600 mb-2">
                  ZIP Code
                </label>
                <input
                  type="text"
                  id="zip"
                  name="zip"
                  value={formData.zip}
                  onChange={handleChange}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
                />
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-600 mb-2">
                Phone
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-600 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="website" className="block text-sm font-semibold text-gray-600 mb-2">
                Website
              </label>
              <input
                type="url"
                id="website"
                name="website"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5"
              />
            </div>
          </div>
        </div>

        {/* Tax Information */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Tax Information</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Required for generating W-2 and 1099 tax forms.
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="taxId" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                Employer ID (EIN)
              </label>
              <input
                type="text"
                id="taxId"
                name="taxId"
                value={formData.taxId || ''}
                onChange={handleChange}
                placeholder="XX-XXXXXXX"
                maxLength={10}
                className={`block w-full rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white ${
                  formData.taxId && !validateEIN(formData.taxId).valid
                    ? 'border-red-300 dark:border-red-600'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {formData.taxId && !validateEIN(formData.taxId).valid ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validateEIN(formData.taxId).error}
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Federal Employer Identification Number (9 digits)
                </p>
              )}
            </div>

            <div>
              <label htmlFor="stateEmployerId" className="block text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                State Employer ID
              </label>
              <input
                type="text"
                id="stateEmployerId"
                name="stateEmployerId"
                value={formData.stateEmployerId || ''}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                State-issued employer identification number for W-2 forms
              </p>
            </div>
          </div>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className={`rounded-md p-4 ${saveMessage.type === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
              {saveMessage.text}
            </p>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Email Settings Section */}
      <div className="mt-8 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
        <div className="flex items-center gap-2 mb-6">
          <Mail className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Settings</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Configure SMTP settings to send invoices directly to customers via email.
        </p>
        <EmailSettingsForm />
      </div>

      {/* Feature Visibility Section */}
      <div className="mt-8">
        <FeatureVisibilitySettings />
      </div>

      {/* Onboarding & Learning Section */}
      <div className="mt-8">
        <OnboardingSettings />
      </div>
    </div>
  );
}
