import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Building2, Upload, Save, X, Sun, Moon, Monitor, Mail, AlertCircle, Zap, ClipboardCheck,
  HelpCircle, Search, ChevronDown, ChevronRight, Palette, DollarSign, Hash, Clock,
  BookOpen, Calculator, ToggleLeft, GraduationCap, Image,
} from 'lucide-react';
import { useCompanySettings, InvoicePostingMode } from '../contexts/CompanySettingsContext';
import { useTheme, ThemePreference } from '../contexts/ThemeContext';
import { useCurrency, CURRENCY_LOCALE_OPTIONS } from '../contexts/CurrencyContext';
import { useQuery } from '@tanstack/react-query';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import EmailSettingsForm from '../components/EmailSettingsForm';
import OnboardingSettings from '../components/onboarding/OnboardingSettings';
import FeatureVisibilitySettings from '../components/FeatureVisibilitySettings';
import AccountDefaultsSettings from '../components/AccountDefaultsSettings';
import { validateEIN } from '../lib/taxForms';
import api from '../lib/api';

interface Term {
  Id: string;
  Name: string;
  DueDays: number;
}

// ---------------------------------------------------------------------------
// Section metadata for sidebar navigation, search, and collapsible sections
// ---------------------------------------------------------------------------
interface SectionMeta {
  id: string;
  label: string;
  group: string;
  icon: React.ElementType;
  keywords: string[];
}

const SECTIONS: SectionMeta[] = [
  { id: 'appearance', label: 'Appearance', group: 'General', icon: Palette, keywords: ['theme', 'dark', 'light', 'mode'] },
  { id: 'currency', label: 'Currency Format', group: 'General', icon: DollarSign, keywords: ['locale', 'format', 'money'] },
  { id: 'posting-mode', label: 'Transaction Posting', group: 'Invoicing', icon: Zap, keywords: ['posting', 'simple', 'advanced', 'journal', 'draft'] },
  { id: 'invoice-numbering', label: 'Invoice Numbering', group: 'Invoicing', icon: Hash, keywords: ['prefix', 'number', 'auto'] },
  { id: 'payment-terms', label: 'Payment Terms', group: 'Invoicing', icon: Clock, keywords: ['terms', 'due', 'net', 'default'] },
  { id: 'account-defaults', label: 'Account Defaults', group: 'Invoicing', icon: BookOpen, keywords: ['AR', 'AP', 'revenue', 'receivable', 'payable', 'default account'] },
  { id: 'company-logo', label: 'Company Logo', group: 'Company', icon: Image, keywords: ['logo', 'image', 'upload', 'brand'] },
  { id: 'company-info', label: 'Company Information', group: 'Company', icon: Building2, keywords: ['name', 'address', 'phone', 'email', 'website'] },
  { id: 'tax-info', label: 'Tax Information', group: 'Company', icon: Calculator, keywords: ['EIN', 'tax', 'employer', 'W-2', '1099'] },
  { id: 'email', label: 'Email Settings', group: 'Communication', icon: Mail, keywords: ['smtp', 'email', 'send', 'graph', 'outlook'] },
  { id: 'features', label: 'Feature Visibility', group: 'Administration', icon: ToggleLeft, keywords: ['features', 'enable', 'disable', 'visibility', 'mileage', 'payroll', 'inventory'] },
  { id: 'onboarding', label: 'Onboarding', group: 'Administration', icon: GraduationCap, keywords: ['onboarding', 'learning', 'tutorial', 'getting started'] },
];

const GROUPS = ['General', 'Invoicing', 'Company', 'Communication', 'Administration'];

const COLLAPSED_STORAGE_KEY = 'company-settings-collapsed';

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveCollapsed(set: Set<string>) {
  localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...set]));
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------
function SettingsSection({
  id,
  label,
  icon: Icon,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  icon: React.ElementType;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center gap-3 px-8 py-5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex-1">{label}</h2>
          {collapsed ? (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
        {!collapsed && <div className="px-8 pb-8">{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CompanySettings() {
  const { settings, updateSettings, isLoaded } = useCompanySettings();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, formatCurrency } = useCurrency();
  const [formData, setFormData] = useState(settings);

  const { data: terms } = useQuery({
    queryKey: ['terms-active'],
    queryFn: async (): Promise<Term[]> => {
      const response = await api.get('/terms?$filter=IsActive eq true&$orderby=DueDays asc');
      return response.data.value;
    },
  });
  const [logoPreview, setLogoPreview] = useState(settings.logoUrl);

  useEffect(() => {
    if (isLoaded) {
      setFormData(settings);
      setLogoPreview(settings.logoUrl);
    }
  }, [isLoaded, settings]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search
  const [search, setSearch] = useState('');

  // Collapsible state
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  // Active section (for sidebar highlight)
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  // Position sidebar fixed in viewport.
  // CSS sticky doesn't work because Layout.tsx has overflow-hidden on a parent div.
  const sidebarRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anchor = anchorRef.current;
    const sidebar = sidebarRef.current;
    if (!anchor || !sidebar) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      sidebar.style.left = `${rect.left}px`;
      sidebar.style.width = `${rect.width}px`;
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // IntersectionObserver to track which section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );

    for (const section of SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  // Filter sections by search
  const filteredSections = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [search]);

  const filteredIds = useMemo(() => new Set(filteredSections.map((s) => s.id)), [filteredSections]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  };

  // Form helpers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setSaveMessage({ type: 'error', text: 'Please select an image file' });
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setSaveMessage({ type: 'error', text: 'Image must be less than 2MB' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setLogoPreview(base64);
        setFormData((prev) => ({ ...prev, logoUrl: base64 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview('');
    setFormData((prev) => ({ ...prev, logoUrl: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const scrollToSection = (id: string) => {
    // Expand if collapsed
    setCollapsed((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        saveCollapsed(next);
        return next;
      }
      return prev;
    });
    // Small delay to let the section expand before scrolling
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  // ---------------------------------------------------------------------------
  // Render section content (the actual settings forms)
  // ---------------------------------------------------------------------------
  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case 'appearance':
        return (
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
        );

      case 'currency':
        return (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Choose how currency values are displayed. This setting is saved per-user in your browser.
            </p>
            <div className="max-w-sm">
              <TextField
                select
                label="Locale / Currency"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                fullWidth
                size="small"
                helperText={`Preview: ${formatCurrency(1234.56)}`}
              >
                {CURRENCY_LOCALE_OPTIONS.map((option) => (
                  <MenuItem key={option.code} value={option.code}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </div>
          </div>
        );

      case 'posting-mode':
        return (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose how invoices and bills affect your general ledger.
              </p>
              <div className="relative group">
                <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                <div className="absolute left-0 bottom-full mb-2 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <p className="mb-2"><strong>Simple Mode</strong> (like QuickBooks): Invoices and bills immediately affect your accounting records when saved.</p>
                  <p><strong>Advanced Mode</strong>: Documents stay as drafts until you explicitly post them.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 mt-4">
              <label className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                formData.invoicePostingMode === 'simple'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}>
                <input type="radio" name="invoicePostingMode" value="simple"
                  checked={formData.invoicePostingMode === 'simple'}
                  onChange={() => setFormData((p) => ({ ...p, invoicePostingMode: 'simple' as InvoicePostingMode }))}
                  className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">Simple Mode</span>
                    <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">Recommended</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Like QuickBooks Online. Documents post to GL immediately when saved.</p>
                </div>
              </label>
              <label className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                formData.invoicePostingMode === 'advanced'
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}>
                <input type="radio" name="invoicePostingMode" value="advanced"
                  checked={formData.invoicePostingMode === 'advanced'}
                  onChange={() => setFormData((p) => ({ ...p, invoicePostingMode: 'advanced' as InvoicePostingMode }))}
                  className="mt-1 h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-blue-500" />
                    <span className="font-semibold text-gray-900 dark:text-white">Advanced Mode</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Documents remain as drafts until explicitly posted. Ideal for approval workflows.</p>
                </div>
              </label>
            </div>
            {formData.invoicePostingMode !== settings.invoicePostingMode && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <strong>Note:</strong> Changing this setting only affects new transactions.
                </p>
              </div>
            )}
          </div>
        );

      case 'invoice-numbering':
        return (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Configure the prefix used for auto-generated invoice numbers.
            </p>
            <div className="max-w-sm">
              <TextField
                label="Invoice Number Prefix"
                name="invoiceNumberPrefix"
                value={formData.invoiceNumberPrefix}
                onChange={(e) => setFormData((p) => ({ ...p, invoiceNumberPrefix: e.target.value }))}
                placeholder="INV-"
                size="small"
                fullWidth
                inputProps={{ maxLength: 20 }}
                helperText={`Preview: ${formData.invoiceNumberPrefix || 'INV-'}0001`}
              />
            </div>
          </div>
        );

      case 'payment-terms':
        return (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Set the default payment terms for new invoices. Can be overridden per customer or invoice.
            </p>
            <div className="max-w-sm">
              <TextField
                select
                label="Default Terms"
                value={formData.defaultTermId || ''}
                onChange={(e) => setFormData((p) => ({ ...p, defaultTermId: e.target.value }))}
                fullWidth
                size="small"
                helperText="Applied when creating new invoices"
              >
                <MenuItem value="">None</MenuItem>
                {terms?.map((term) => (
                  <MenuItem key={term.Id} value={term.Id}>
                    {term.Name} ({term.DueDays === 0 ? 'Immediate' : `${term.DueDays} days`})
                  </MenuItem>
                ))}
              </TextField>
            </div>
          </div>
        );

      case 'account-defaults':
        return <AccountDefaultsSettings />;

      case 'company-logo':
        return (
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              {logoPreview ? (
                <div className="relative">
                  <img src={logoPreview} alt="Company logo" className="h-20 max-w-[200px] object-contain border border-gray-200 rounded-lg p-2 bg-white" />
                  <button type="button" onClick={handleRemoveLogo} className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="h-20 w-40 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">
                  <Building2 className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
              <label htmlFor="logo-upload" className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                <Upload className="h-4 w-4" />
                Upload Logo
              </label>
              <p className="mt-2 text-xs text-gray-500">PNG, JPG, or GIF. Max 2MB. Recommended: 200x50px.</p>
            </div>
          </div>
        );

      case 'company-info':
        return (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="Company Name" name="name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} required fullWidth size="small" />
            </div>
            <div className="sm:col-span-2">
              <TextField label="Street Address" name="address" value={formData.address} onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} fullWidth size="small" />
            </div>
            <TextField label="City" name="city" value={formData.city} onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))} fullWidth size="small" />
            <div className="grid grid-cols-2 gap-4">
              <TextField label="State" name="state" value={formData.state} onChange={(e) => setFormData((p) => ({ ...p, state: e.target.value }))} fullWidth size="small" />
              <TextField label="ZIP Code" name="zip" value={formData.zip} onChange={(e) => setFormData((p) => ({ ...p, zip: e.target.value }))} fullWidth size="small" />
            </div>
            <TextField label="Phone" name="phone" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} fullWidth size="small" />
            <TextField label="Email" name="email" type="email" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} fullWidth size="small" />
            <div className="sm:col-span-2">
              <TextField label="Website" name="website" value={formData.website} onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))} placeholder="https://" fullWidth size="small" />
            </div>
          </div>
        );

      case 'tax-info':
        return (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Required for generating W-2 and 1099 tax forms.
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <TextField
                  label="Employer ID (EIN)"
                  name="taxId"
                  value={formData.taxId || ''}
                  onChange={handleChange}
                  placeholder="XX-XXXXXXX"
                  size="small"
                  fullWidth
                  inputProps={{ maxLength: 10 }}
                  error={!!(formData.taxId && !validateEIN(formData.taxId).valid)}
                  helperText={
                    formData.taxId && !validateEIN(formData.taxId).valid
                      ? validateEIN(formData.taxId).error
                      : 'Federal Employer Identification Number (9 digits)'
                  }
                />
              </div>
              <div>
                <TextField
                  label="State Employer ID"
                  name="stateEmployerId"
                  value={formData.stateEmployerId || ''}
                  onChange={handleChange}
                  size="small"
                  fullWidth
                  helperText="State-issued employer ID for W-2 forms"
                />
              </div>
            </div>
          </div>
        );

      case 'email':
        return (
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Settings</h2>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Configure SMTP settings to send invoices directly to customers via email.
            </p>
            <EmailSettingsForm />
          </div>
        );

      case 'features':
        return <FeatureVisibilitySettings />;

      case 'onboarding':
        return <OnboardingSettings />;

      default:
        return null;
    }
  };

  // Self-managed sections render their own card wrapper and save button
  const SELF_MANAGED_IDS = new Set(['email', 'features', 'onboarding']);

  return (
    <div className="max-w-7xl mx-auto lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
      {/* Sidebar */}
      {/* Invisible spacer reserves the grid column width */}
      <div ref={anchorRef} className="hidden lg:block w-64" aria-hidden="true" />
      {/* Fixed sidebar stays visible while <main> scrolls */}
      <aside ref={sidebarRef} className="hidden lg:block fixed top-16 bottom-4 overflow-y-auto">
        <div className="space-y-1 py-2">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {GROUPS.map((group) => {
            const groupSections = filteredSections.filter((s) => s.group === group);
            if (groupSections.length === 0) return null;
            return (
              <div key={group} className="mb-3">
                <p className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group}
                </p>
                {groupSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id && !search;
                  return (
                    <button
                      key={section.id}
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {section.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Company Settings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure your company information, preferences, and integrations.
          </p>
        </div>

        {/* Mobile search */}
        <div className="lg:hidden mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="space-y-6">
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {SECTIONS.filter((s) => !SELF_MANAGED_IDS.has(s.id)).map((section) => {
                if (!filteredIds.has(section.id)) return null;
                return (
                  <SettingsSection
                    key={section.id}
                    id={section.id}
                    label={section.label}
                    icon={section.icon}
                    collapsed={collapsed.has(section.id)}
                    onToggle={() => toggleCollapse(section.id)}
                  >
                    {renderSectionContent(section.id)}
                  </SettingsSection>
                );
              })}
            </div>

            {/* Save message + button for form-managed sections */}
            {saveMessage && (
              <div className={`mt-6 rounded-md p-4 ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                <div className="flex items-center gap-2">
                  {saveMessage.type === 'success' ? (
                    <AlertCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <p className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                    {saveMessage.text}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
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

          {/* Self-managed sections (have their own forms/save buttons) */}
          {SECTIONS.filter((s) => SELF_MANAGED_IDS.has(s.id)).map((section) => {
            if (!filteredIds.has(section.id)) return null;
            return (
              <div key={section.id} id={section.id} className="scroll-mt-24">
                {renderSectionContent(section.id)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
