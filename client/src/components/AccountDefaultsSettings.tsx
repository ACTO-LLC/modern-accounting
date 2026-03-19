import { useState, useEffect, useCallback } from 'react';
import { Save, AlertCircle, Check, Loader2 } from 'lucide-react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import api from '../lib/api';
import { clearAccountDefaultsCache } from '../lib/autoPostingService';

interface AccountDefault {
  Id: string;
  AccountType: string;
  AccountId: string;
  Description: string | null;
}

interface Account {
  Id: string;
  Name: string;
  Code: string;
  Type: string;
}

const ACCOUNT_DEFAULT_TYPES = [
  {
    key: 'AccountsReceivable',
    label: 'Accounts Receivable (AR)',
    description: 'Default account for tracking customer balances on invoices.',
    accountFilter: (a: Account) => a.Type === 'Accounts Receivable',
  },
  {
    key: 'AccountsPayable',
    label: 'Accounts Payable (AP)',
    description: 'Default account for tracking vendor balances on bills.',
    accountFilter: (a: Account) => a.Type === 'Accounts Payable',
  },
  {
    key: 'DefaultRevenue',
    label: 'Default Revenue',
    description: 'Default income account used when posting invoices.',
    accountFilter: (a: Account) => a.Type === 'Revenue' || a.Type === 'Income',
  },
  {
    key: 'SalesTaxPayable',
    label: 'Sales Tax Payable',
    description: 'Liability account for collected sales tax.',
    accountFilter: (a: Account) => a.Type === 'Other Current Liabilities' || a.Type === 'Current Liabilities',
  },
];

export default function AccountDefaultsSettings() {
  const [defaults, setDefaults] = useState<AccountDefault[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [localSelections, setLocalSelections] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [defaultsRes, accountsRes] = await Promise.all([
        api.get<{ value: AccountDefault[] }>('/accountdefaults'),
        api.get<{ value: Account[] }>('/accounts?$filter=IsActive eq true'),
      ]);

      const fetchedDefaults = defaultsRes.data.value || [];
      setDefaults(fetchedDefaults);
      setAccounts(accountsRes.data.value || []);

      // Build initial selections from existing defaults
      const selections: Record<string, string> = {};
      for (const d of fetchedDefaults) {
        selections[d.AccountType] = d.AccountId;
      }
      setLocalSelections(selections);
    } catch (err) {
      console.error('Failed to load account defaults:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleChange = (accountType: string, accountId: string | null) => {
    setLocalSelections(prev => {
      const next = { ...prev };
      if (accountId) {
        next[accountType] = accountId;
      } else {
        delete next[accountType];
      }
      return next;
    });
    setHasChanges(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      for (const type of ACCOUNT_DEFAULT_TYPES) {
        const existing = defaults.find(d => d.AccountType === type.key);
        const selectedAccountId = localSelections[type.key];

        if (selectedAccountId && existing) {
          // Update existing
          if (existing.AccountId !== selectedAccountId) {
            await api.patch(`/accountdefaults/Id/${existing.Id}`, {
              AccountId: selectedAccountId,
            });
          }
        } else if (selectedAccountId && !existing) {
          // Create new
          await api.post('/accountdefaults', {
            AccountType: type.key,
            AccountId: selectedAccountId,
            Description: type.label,
            IsActive: true,
          });
        } else if (!selectedAccountId && existing) {
          // Clear — update to null isn't ideal; delete the record
          await api.delete(`/accountdefaults/Id/${existing.Id}`);
        }
      }

      clearAccountDefaultsCache();
      setSaveMessage({ type: 'success', text: 'Account defaults saved successfully!' });
      setHasChanges(false);
      // Reload to get fresh IDs
      await loadData();
    } catch (err) {
      console.error('Failed to save account defaults:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save account defaults. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading account defaults...</span>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Set the default accounts used for automatic journal entry posting. These are used when invoices and bills are saved in Simple mode.
      </p>

      <div className="space-y-4">
        {ACCOUNT_DEFAULT_TYPES.map((type) => {
          const filteredAccounts = accounts.filter(type.accountFilter);
          const selectedAccount = accounts.find(a => a.Id === localSelections[type.key]) || null;

          return (
            <div key={type.key}>
              <Autocomplete
                options={filteredAccounts}
                value={selectedAccount}
                onChange={(_, newValue) => handleChange(type.key, newValue?.Id || null)}
                getOptionLabel={(opt) => `${opt.Code} - ${opt.Name}`}
                isOptionEqualToValue={(opt, val) => opt.Id === val.Id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={type.label}
                    helperText={type.description}
                    size="small"
                  />
                )}
                size="small"
              />
            </div>
          );
        })}
      </div>

      {saveMessage && (
        <div className={`mt-4 rounded-md p-3 ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <div className="flex items-center gap-2">
            {saveMessage.type === 'success' ? (
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <p className={`text-sm font-medium ${saveMessage.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
              {saveMessage.text}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
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
              Save Defaults
            </>
          )}
        </button>
      </div>
    </div>
  );
}
