import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, ArrowUpDown, Play, Pause, Trash2, Pencil, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import api from '../lib/api';
import { useToast } from '../hooks/useToast';

interface BankRule {
  Id: string;
  Name: string;
  BankAccountId: string | null;
  MatchField: 'Description' | 'Amount' | 'Both';
  MatchType: 'Contains' | 'StartsWith' | 'Equals' | 'Regex';
  MatchValue: string;
  MinAmount: number | null;
  MaxAmount: number | null;
  TransactionType: 'Debit' | 'Credit' | null;
  AssignAccountId: string | null;
  AssignVendorId: string | null;
  AssignCustomerId: string | null;
  AssignClassId: string | null;
  AssignMemo: string | null;
  Priority: number;
  IsEnabled: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

interface Account {
  Id: string;
  Code: string;
  Name: string;
  Type: string;
}

interface Vendor {
  Id: string;
  Name: string;
}

interface Customer {
  Id: string;
  Name: string;
}

interface ClassItem {
  Id: string;
  Name: string;
}

interface BankRuleInput {
  Name: string;
  BankAccountId?: string | null;
  MatchField: 'Description' | 'Amount' | 'Both';
  MatchType: 'Contains' | 'StartsWith' | 'Equals' | 'Regex';
  MatchValue: string;
  MinAmount?: number | null;
  MaxAmount?: number | null;
  TransactionType?: 'Debit' | 'Credit' | null;
  AssignAccountId?: string | null;
  AssignVendorId?: string | null;
  AssignCustomerId?: string | null;
  AssignClassId?: string | null;
  AssignMemo?: string | null;
  Priority?: number;
  IsEnabled?: boolean;
}

interface BankTransaction {
  Id: string;
  Description: string;
  Amount: number;
  TransactionType: string | null;
}

interface ValidationErrors {
  name?: string;
  matchValue?: string;
  amountRange?: string;
  assignAccount?: string;
}

// Validation constants
const NAME_MAX_LENGTH = 100;
const MATCH_VALUE_MAX_LENGTH = 255;

export default function BankRules() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testResults, setTestResults] = useState<BankTransaction[]>([]);
  const [editingRule, setEditingRule] = useState<BankRule | null>(null);
  const [formData, setFormData] = useState<BankRuleInput>({
    Name: '',
    BankAccountId: null,
    MatchField: 'Description',
    MatchType: 'Contains',
    MatchValue: '',
    MinAmount: null,
    MaxAmount: null,
    TransactionType: null,
    AssignAccountId: null,
    AssignVendorId: null,
    AssignCustomerId: null,
    AssignClassId: null,
    AssignMemo: '',
    Priority: 0,
    IsEnabled: true,
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const { showToast } = useToast();

  const queryClient = useQueryClient();

  // Fetch bank rules
  const {
    data: bankRules,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['bankrules'],
    queryFn: async () => {
      const response = await api.get<{ value: BankRule[] }>('/bankrules?$orderby=Priority desc,Name');
      return response.data.value;
    },
  });

  // Fetch accounts for dropdowns
  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get<{ value: Account[] }>('/accounts?$orderby=Name');
      return response.data.value;
    },
  });

  // Fetch vendors for dropdown
  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const response = await api.get<{ value: Vendor[] }>('/vendors?$orderby=Name');
      return response.data.value;
    },
  });

  // Fetch customers for dropdown
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers?$orderby=Name');
      return response.data.value;
    },
  });

  // Fetch classes for dropdown
  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const response = await api.get<{ value: ClassItem[] }>('/classes?$orderby=Name');
      return response.data.value;
    },
  });

  // Fetch bank transactions for testing rules
  const { data: bankTransactions } = useQuery({
    queryKey: ['banktransactions-for-test'],
    queryFn: async () => {
      const response = await api.get<{ value: BankTransaction[] }>(
        '/banktransactions?$top=100&$orderby=TransactionDate desc'
      );
      return response.data.value;
    },
    enabled: showTestDialog,
  });

  const createMutation = useMutation({
    mutationFn: async (data: BankRuleInput) => {
      const response = await api.post('/bankrules', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankrules'] });
      showToast('Bank rule created successfully', 'success');
      resetForm();
    },
    onError: (error) => {
      console.error('Failed to create bank rule:', error);
      showToast('Failed to create bank rule', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BankRuleInput> }) => {
      const response = await api.patch(`/bankrules/Id/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankrules'] });
      showToast('Bank rule updated successfully', 'success');
      resetForm();
    },
    onError: (error) => {
      console.error('Failed to update bank rule:', error);
      showToast('Failed to update bank rule', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/bankrules/Id/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankrules'] });
      showToast('Bank rule deleted successfully', 'success');
    },
    onError: (error) => {
      console.error('Failed to delete bank rule:', error);
      showToast('Failed to delete bank rule', 'error');
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingRule(null);
    setFormData({
      Name: '',
      BankAccountId: null,
      MatchField: 'Description',
      MatchType: 'Contains',
      MatchValue: '',
      MinAmount: null,
      MaxAmount: null,
      TransactionType: null,
      AssignAccountId: null,
      AssignVendorId: null,
      AssignCustomerId: null,
      AssignClassId: null,
      AssignMemo: '',
      Priority: 0,
      IsEnabled: true,
    });
    setValidationErrors({});
  };

  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};
    const trimmedName = formData.Name.trim();

    // Check for empty name
    if (!trimmedName) {
      errors.name = 'Name is required';
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      errors.name = `Name must be ${NAME_MAX_LENGTH} characters or less`;
    } else {
      // Check for duplicate names
      const duplicate = bankRules?.find(
        (rule) =>
          rule.Name.toLowerCase() === trimmedName.toLowerCase() &&
          (!editingRule || rule.Id !== editingRule.Id)
      );
      if (duplicate) {
        errors.name = 'A rule with this name already exists';
      }
    }

    // Check for match value
    if (!formData.MatchValue.trim() && formData.MatchField !== 'Amount') {
      errors.matchValue = 'Match value is required for description matching';
    } else if (formData.MatchValue.length > MATCH_VALUE_MAX_LENGTH) {
      errors.matchValue = `Match value must be ${MATCH_VALUE_MAX_LENGTH} characters or less`;
    }

    // Check amount range for Amount/Both match fields
    if (formData.MatchField !== 'Description') {
      const minAmt = formData.MinAmount ?? null;
      const maxAmt = formData.MaxAmount ?? null;
      if (minAmt === null && maxAmt === null) {
        errors.amountRange = 'At least one amount boundary is required for amount matching';
      } else if (minAmt !== null && maxAmt !== null && minAmt > maxAmt) {
        errors.amountRange = 'Minimum amount cannot be greater than maximum amount';
      }
    }

    // Check that at least one assignment is made
    if (!formData.AssignAccountId && !formData.AssignVendorId && !formData.AssignCustomerId && !formData.AssignMemo) {
      errors.assignAccount = 'At least one assignment (account, vendor, customer, or memo) is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const submitData: BankRuleInput = {
      ...formData,
      Name: formData.Name.trim(),
      MatchValue: formData.MatchValue.trim(),
      AssignMemo: formData.AssignMemo?.trim() || null,
    };

    if (editingRule) {
      updateMutation.mutate({ id: editingRule.Id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (rule: BankRule) => {
    setEditingRule(rule);
    setFormData({
      Name: rule.Name,
      BankAccountId: rule.BankAccountId,
      MatchField: rule.MatchField,
      MatchType: rule.MatchType,
      MatchValue: rule.MatchValue,
      MinAmount: rule.MinAmount,
      MaxAmount: rule.MaxAmount,
      TransactionType: rule.TransactionType,
      AssignAccountId: rule.AssignAccountId,
      AssignVendorId: rule.AssignVendorId,
      AssignCustomerId: rule.AssignCustomerId,
      AssignClassId: rule.AssignClassId,
      AssignMemo: rule.AssignMemo || '',
      Priority: rule.Priority,
      IsEnabled: rule.IsEnabled,
    });
    setValidationErrors({});
    setShowForm(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the rule "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleEnabled = async (rule: BankRule) => {
    try {
      await api.patch(`/bankrules/Id/${rule.Id}`, { IsEnabled: !rule.IsEnabled });
      queryClient.invalidateQueries({ queryKey: ['bankrules'] });
      showToast(`Rule ${rule.IsEnabled ? 'disabled' : 'enabled'} successfully`, 'success');
    } catch (error) {
      console.error('Failed to toggle rule:', error);
      showToast('Failed to update rule', 'error');
    }
  };

  // Test rule against sample transactions
  const testRule = (ruleId: string) => {
    setShowTestDialog(true);

    const rule = bankRules?.find((r) => r.Id === ruleId);
    if (!rule || !bankTransactions) {
      setTestResults([]);
      return;
    }

    // Filter transactions that match the rule
    const matches = bankTransactions.filter((tx) => {
      // Check transaction type
      if (rule.TransactionType) {
        const txType = tx.Amount < 0 ? 'Debit' : 'Credit';
        if (rule.TransactionType !== txType) return false;
      }

      // Check amount range
      if (rule.MatchField === 'Amount' || rule.MatchField === 'Both') {
        const absAmount = Math.abs(tx.Amount);
        if (rule.MinAmount !== null && absAmount < rule.MinAmount) return false;
        if (rule.MaxAmount !== null && absAmount > rule.MaxAmount) return false;
      }

      // Check description match
      if (rule.MatchField === 'Description' || rule.MatchField === 'Both') {
        const description = tx.Description?.toLowerCase() || '';
        const matchValue = rule.MatchValue.toLowerCase();

        switch (rule.MatchType) {
          case 'Contains':
            if (!description.includes(matchValue)) return false;
            break;
          case 'StartsWith':
            if (!description.startsWith(matchValue)) return false;
            break;
          case 'Equals':
            if (description !== matchValue) return false;
            break;
          case 'Regex':
            try {
              const regex = new RegExp(rule.MatchValue, 'i');
              if (!regex.test(tx.Description || '')) return false;
            } catch {
              return false;
            }
            break;
        }
      }

      return true;
    });

    setTestResults(matches);
  };

  // Get display name for an account
  const getAccountName = (accountId: string | null) => {
    if (!accountId) return '-';
    const account = accounts?.find((a) => a.Id === accountId);
    return account ? `${account.Code} - ${account.Name}` : 'Unknown';
  };

  // Get display name for a vendor
  const getVendorName = (vendorId: string | null) => {
    if (!vendorId) return '-';
    const vendor = vendors?.find((v) => v.Id === vendorId);
    return vendor ? vendor.Name : 'Unknown';
  };

  // Get display name for a customer
  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return '-';
    const customer = customers?.find((c) => c.Id === customerId);
    return customer ? customer.Name : 'Unknown';
  };

  // Get display name for a class
  const getClassName = (classId: string | null) => {
    if (!classId) return '-';
    const cls = classes?.find((c) => c.Id === classId);
    return cls ? cls.Name : 'Unknown';
  };

  // Filter bank accounts (Type = Asset and Subtype = Bank)
  const bankAccounts = accounts?.filter(
    (a) => a.Type === 'Asset' && (a.Name.toLowerCase().includes('bank') || a.Name.toLowerCase().includes('checking') || a.Name.toLowerCase().includes('savings'))
  );

  // Filter expense/income accounts for assignment
  const expenseIncomeAccounts = accounts?.filter(
    (a) => a.Type === 'Expense' || a.Type === 'Revenue'
  );

  // Filter rules
  const filteredRules = bankRules?.filter((rule) => {
    const matchesSearch =
      searchTerm === '' ||
      rule.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rule.MatchValue?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'enabled' && rule.IsEnabled) ||
      (statusFilter === 'disabled' && !rule.IsEnabled);
    return matchesSearch && matchesStatus;
  });

  if (isLoading) return <div className="p-4">Loading bank rules...</div>;
  if (error) return <div className="p-4 text-red-600">Error loading bank rules</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Bank Rules</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Automatically categorize imported bank transactions based on configurable rules
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Rule
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 shadow sm:rounded-lg mb-6 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {editingRule ? 'Edit Bank Rule' : 'New Bank Rule'}
            </h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Rule Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  maxLength={NAME_MAX_LENGTH}
                  value={formData.Name}
                  onChange={(e) => {
                    setFormData({ ...formData, Name: e.target.value });
                    if (validationErrors.name) {
                      setValidationErrors({ ...validationErrors, name: undefined });
                    }
                  }}
                  placeholder="e.g., Office Supplies from Staples"
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-gray-100 ${
                    validationErrors.name
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-gray-300 focus:border-indigo-500 dark:border-gray-600'
                  }`}
                />
                {validationErrors.name && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
                )}
              </div>
              <div>
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Priority
                </label>
                <input
                  type="number"
                  id="priority"
                  value={formData.Priority}
                  onChange={(e) => setFormData({ ...formData, Priority: parseInt(e.target.value) || 0 })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Higher priority rules are checked first</p>
              </div>
              <div>
                <label htmlFor="bankAccount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Bank Account (optional)
                </label>
                <select
                  id="bankAccount"
                  value={formData.BankAccountId || ''}
                  onChange={(e) => setFormData({ ...formData, BankAccountId: e.target.value || null })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  <option value="">All accounts</option>
                  {bankAccounts?.map((account) => (
                    <option key={account.Id} value={account.Id}>
                      {account.Code} - {account.Name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave empty to apply to all bank accounts</p>
              </div>
            </div>

            {/* Match Conditions */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">Match Conditions</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <label htmlFor="matchField" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Match Field *
                  </label>
                  <select
                    id="matchField"
                    value={formData.MatchField}
                    onChange={(e) => setFormData({ ...formData, MatchField: e.target.value as 'Description' | 'Amount' | 'Both' })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="Description">Description</option>
                    <option value="Amount">Amount</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="matchType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Match Type *
                  </label>
                  <select
                    id="matchType"
                    value={formData.MatchType}
                    onChange={(e) => setFormData({ ...formData, MatchType: e.target.value as 'Contains' | 'StartsWith' | 'Equals' | 'Regex' })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    disabled={formData.MatchField === 'Amount'}
                  >
                    <option value="Contains">Contains</option>
                    <option value="StartsWith">Starts with</option>
                    <option value="Equals">Equals</option>
                    <option value="Regex">Regex</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="matchValue" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Match Value {formData.MatchField !== 'Amount' && '*'}
                  </label>
                  <input
                    type="text"
                    id="matchValue"
                    value={formData.MatchValue}
                    onChange={(e) => {
                      setFormData({ ...formData, MatchValue: e.target.value });
                      if (validationErrors.matchValue) {
                        setValidationErrors({ ...validationErrors, matchValue: undefined });
                      }
                    }}
                    placeholder={formData.MatchType === 'Regex' ? 'e.g., STAPLES.*STORE' : 'e.g., STAPLES'}
                    disabled={formData.MatchField === 'Amount'}
                    className={`mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-600 ${
                      validationErrors.matchValue
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-indigo-500 dark:border-gray-600'
                    }`}
                  />
                  {validationErrors.matchValue && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.matchValue}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-4">
                <div>
                  <label htmlFor="transactionType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Transaction Type
                  </label>
                  <select
                    id="transactionType"
                    value={formData.TransactionType || ''}
                    onChange={(e) => setFormData({ ...formData, TransactionType: (e.target.value as 'Debit' | 'Credit') || null })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">Any</option>
                    <option value="Debit">Debit (Money Out)</option>
                    <option value="Credit">Credit (Money In)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="minAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Min Amount
                  </label>
                  <input
                    type="number"
                    id="minAmount"
                    step="0.01"
                    value={formData.MinAmount ?? ''}
                    onChange={(e) => setFormData({ ...formData, MinAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="0.00"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label htmlFor="maxAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Max Amount
                  </label>
                  <input
                    type="number"
                    id="maxAmount"
                    step="0.01"
                    value={formData.MaxAmount ?? ''}
                    onChange={(e) => setFormData({ ...formData, MaxAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="No limit"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
              </div>
              {validationErrors.amountRange && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.amountRange}</p>
              )}
            </div>

            {/* Assignments */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="text-md font-medium text-gray-900 dark:text-gray-100 mb-4">Assign To</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="assignAccount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Expense/Income Account
                  </label>
                  <select
                    id="assignAccount"
                    value={formData.AssignAccountId || ''}
                    onChange={(e) => {
                      setFormData({ ...formData, AssignAccountId: e.target.value || null });
                      if (validationErrors.assignAccount) {
                        setValidationErrors({ ...validationErrors, assignAccount: undefined });
                      }
                    }}
                    className={`mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:text-gray-100 ${
                      validationErrors.assignAccount
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-300 focus:border-indigo-500 dark:border-gray-600'
                    }`}
                  >
                    <option value="">Select account...</option>
                    <optgroup label="Expenses">
                      {expenseIncomeAccounts?.filter((a) => a.Type === 'Expense').map((account) => (
                        <option key={account.Id} value={account.Id}>
                          {account.Code} - {account.Name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Revenue">
                      {expenseIncomeAccounts?.filter((a) => a.Type === 'Revenue').map((account) => (
                        <option key={account.Id} value={account.Id}>
                          {account.Code} - {account.Name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label htmlFor="assignVendor" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Vendor
                  </label>
                  <select
                    id="assignVendor"
                    value={formData.AssignVendorId || ''}
                    onChange={(e) => setFormData({ ...formData, AssignVendorId: e.target.value || null })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">Select vendor...</option>
                    {vendors?.map((vendor) => (
                      <option key={vendor.Id} value={vendor.Id}>
                        {vendor.Name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="assignCustomer" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Customer
                  </label>
                  <select
                    id="assignCustomer"
                    value={formData.AssignCustomerId || ''}
                    onChange={(e) => setFormData({ ...formData, AssignCustomerId: e.target.value || null })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">Select customer...</option>
                    {customers?.map((customer) => (
                      <option key={customer.Id} value={customer.Id}>
                        {customer.Name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="assignClass" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Class
                  </label>
                  <select
                    id="assignClass"
                    value={formData.AssignClassId || ''}
                    onChange={(e) => setFormData({ ...formData, AssignClassId: e.target.value || null })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="">Select class...</option>
                    {classes?.map((cls) => (
                      <option key={cls.Id} value={cls.Id}>
                        {cls.Name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="assignMemo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Memo
                  </label>
                  <input
                    type="text"
                    id="assignMemo"
                    value={formData.AssignMemo || ''}
                    onChange={(e) => setFormData({ ...formData, AssignMemo: e.target.value })}
                    placeholder="Optional memo to add to categorized transactions"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                </div>
              </div>
              {validationErrors.assignAccount && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.assignAccount}</p>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.IsEnabled}
                  onChange={(e) => setFormData({ ...formData, IsEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Rule is enabled</span>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingRule
                    ? 'Update Rule'
                    : 'Create Rule'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Test Dialog */}
      {showTestDialog && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Test Rule Results
              </h3>
              <button
                onClick={() => {
                  setShowTestDialog(false);
                  setTestResults([]);
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh]">
              {testResults.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  No matching transactions found in the last 100 transactions.
                </p>
              ) : (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Found {testResults.length} matching transaction{testResults.length !== 1 ? 's' : ''} in the last 100 transactions.
                  </p>
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          Description
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                          Type
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {testResults.map((tx) => (
                        <tr key={tx.Id}>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-md truncate">
                            {tx.Description}
                          </td>
                          <td className={`px-4 py-2 text-sm text-right font-mono ${tx.Amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            ${Math.abs(tx.Amount).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                            {tx.Amount < 0 ? 'Debit' : 'Credit'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="flex justify-end p-4 border-t dark:border-gray-700">
              <button
                onClick={() => {
                  setShowTestDialog(false);
                  setTestResults([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
          />
        </div>
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
        >
          <option value="all">All Status</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow overflow-x-auto sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3" />
                  Priority
                </div>
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Match Criteria
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Assigns To
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="relative px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {filteredRules?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  No bank rules found. Create your first rule to automatically categorize transactions.
                </td>
              </tr>
            ) : (
              filteredRules?.map((rule) => (
                <tr key={rule.Id} className={!rule.IsEnabled ? 'bg-gray-50 dark:bg-gray-900' : ''}>
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">
                    {rule.Priority}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{rule.Name}</div>
                    {rule.BankAccountId && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Account: {getAccountName(rule.BankAccountId)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-900 dark:text-gray-100">
                    <div className="flex flex-col gap-1">
                      {(rule.MatchField === 'Description' || rule.MatchField === 'Both') && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                          {rule.MatchType}: "{rule.MatchValue}"
                        </span>
                      )}
                      {(rule.MatchField === 'Amount' || rule.MatchField === 'Both') && (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                          Amount: {rule.MinAmount !== null ? `$${rule.MinAmount}` : '0'} - {rule.MaxAmount !== null ? `$${rule.MaxAmount}` : 'any'}
                        </span>
                      )}
                      {rule.TransactionType && (
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded ${
                          rule.TransactionType === 'Debit'
                            ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                            : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        }`}>
                          {rule.TransactionType === 'Debit' ? 'Debits only' : 'Credits only'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col gap-0.5">
                      {rule.AssignAccountId && (
                        <span title="Account">{getAccountName(rule.AssignAccountId)}</span>
                      )}
                      {rule.AssignVendorId && (
                        <span title="Vendor" className="text-xs">Vendor: {getVendorName(rule.AssignVendorId)}</span>
                      )}
                      {rule.AssignCustomerId && (
                        <span title="Customer" className="text-xs">Customer: {getCustomerName(rule.AssignCustomerId)}</span>
                      )}
                      {rule.AssignClassId && (
                        <span title="Class" className="text-xs">Class: {getClassName(rule.AssignClassId)}</span>
                      )}
                      {rule.AssignMemo && (
                        <span title="Memo" className="text-xs italic truncate max-w-xs">Memo: {rule.AssignMemo}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        rule.IsEnabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {rule.IsEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => testRule(rule.Id)}
                        title="Test rule"
                        className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <FlaskConical className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleEnabled(rule)}
                        title={rule.IsEnabled ? 'Disable rule' : 'Enable rule'}
                        className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {rule.IsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleEdit(rule)}
                        title="Edit rule"
                        className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.Id, rule.Name)}
                        title="Delete rule"
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <p>
          Bank rules are applied automatically when transactions are imported. Rules are processed in priority order (highest first).
          The first matching rule wins.
        </p>
      </div>
    </div>
  );
}
