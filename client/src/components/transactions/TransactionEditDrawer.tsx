import { useState, useEffect } from 'react';
import Drawer from '@mui/material/Drawer';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { X } from 'lucide-react';
import VendorSelector from '../VendorSelector';
import CustomerSelector from '../CustomerSelector';
import ClassSelector from '../ClassSelector';
import ProjectSelector from '../ProjectSelector';
import { formatDate } from '../../lib/dateUtils';
import type { BankTransaction } from '../../lib/api';

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

export interface TransactionEditFormData {
  accountId: string;
  memo: string;
  vendorId: string;
  customerId: string;
  classId: string;
  projectId: string;
  payee: string;
  isPersonal: boolean;
}

interface TransactionEditDrawerProps {
  transaction: BankTransaction | null;
  accounts: Account[];
  onSave: (id: string, data: TransactionEditFormData) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export default function TransactionEditDrawer({
  transaction,
  accounts,
  onSave,
  onClose,
  isSaving = false,
}: TransactionEditDrawerProps) {
  const [form, setForm] = useState<TransactionEditFormData>({
    accountId: '',
    memo: '',
    vendorId: '',
    customerId: '',
    classId: '',
    projectId: '',
    payee: '',
    isPersonal: false,
  });

  useEffect(() => {
    if (transaction) {
      setForm({
        accountId: transaction.SuggestedAccountId ?? '',
        memo: transaction.SuggestedMemo ?? '',
        vendorId: transaction.VendorId ?? '',
        customerId: transaction.CustomerId ?? '',
        classId: transaction.ClassId ?? '',
        projectId: transaction.ProjectId ?? '',
        payee: transaction.Payee ?? '',
        isPersonal: transaction.IsPersonal,
      });
    }
  }, [transaction]);

  const handleSave = () => {
    if (!transaction) return;
    onSave(transaction.Id, form);
  };

  const selectedAccount = accounts.find((a) => a.Id === form.accountId) ?? null;

  return (
    <Drawer
      anchor="right"
      open={!!transaction}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 420 } },
      }}
    >
      {transaction && (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Edit Transaction
            </h2>
            <IconButton onClick={onClose} size="small">
              <X className="w-5 h-5" />
            </IconButton>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Read-only context */}
            <div className="space-y-2 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Date</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {formatDate(transaction.TransactionDate)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Amount</span>
                <span
                  className={
                    transaction.Amount < 0
                      ? 'text-red-600 font-medium'
                      : 'text-green-600 font-medium'
                  }
                >
                  {transaction.Amount < 0 ? '-' : '+'}$
                  {Math.abs(transaction.Amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Description</span>
                <span className="text-gray-900 dark:text-gray-100 text-right max-w-[60%] truncate">
                  {transaction.Description}
                </span>
              </div>
              {transaction.Merchant && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Merchant</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {transaction.Merchant}
                  </span>
                </div>
              )}
              {transaction.SourceName && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Source</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {transaction.SourceName}
                  </span>
                </div>
              )}
            </div>

            {/* Account */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account
              </label>
              <Autocomplete
                options={accounts}
                getOptionLabel={(option: Account) => option.Name}
                value={selectedAccount}
                onChange={(_e, newValue: Account | null) => {
                  setForm((prev) => ({ ...prev, accountId: newValue?.Id ?? '' }));
                }}
                isOptionEqualToValue={(option: Account, val: Account) =>
                  option.Id === val.Id
                }
                size="small"
                renderInput={(params) => (
                  <TextField {...params} placeholder="Select account..." />
                )}
              />
            </div>

            {/* Memo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Memo
              </label>
              <TextField
                value={form.memo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, memo: e.target.value }))
                }
                placeholder="Add a memo..."
                size="small"
                fullWidth
                multiline
                minRows={2}
              />
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Vendor
              </label>
              <VendorSelector
                value={form.vendorId}
                onChange={(vendorId) =>
                  setForm((prev) => ({ ...prev, vendorId }))
                }
              />
            </div>

            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Customer
              </label>
              <CustomerSelector
                value={form.customerId}
                onChange={(customerId) =>
                  setForm((prev) => ({ ...prev, customerId }))
                }
              />
            </div>

            {/* Class */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Class
              </label>
              <ClassSelector
                value={form.classId}
                onChange={(classId) =>
                  setForm((prev) => ({ ...prev, classId }))
                }
              />
            </div>

            {/* Project */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Project
              </label>
              <ProjectSelector
                value={form.projectId}
                onChange={(projectId) =>
                  setForm((prev) => ({ ...prev, projectId }))
                }
              />
            </div>

            {/* Payee */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payee
              </label>
              <TextField
                value={form.payee}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, payee: e.target.value }))
                }
                placeholder="Payee name..."
                size="small"
                fullWidth
              />
            </div>

            {/* IsPersonal */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.isPersonal}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isPersonal: e.target.checked }))
                  }
                />
              }
              label="Personal Transaction"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <Button variant="outlined" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
