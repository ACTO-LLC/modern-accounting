import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import AddAccountModal from '../components/AddAccountModal';

interface Account {
  Id: string;
  Name: string;
  Type: string;
  AccountNumber?: string;
}

interface Transaction {
  Id?: string;
  TransactionDate: string;
  Amount: number;
  Description: string;
  OriginalCategory?: string;
  SuggestedCategory: string;
  SuggestedMemo: string;
  ConfidenceScore: number;
  Status: string;
}

export default function ImportTransactions() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [sourceType, setSourceType] = useState<'Bank' | 'CreditCard'>('Bank');
  const [, setImportedTransactions] = useState<Transaction[]>([]);
  const [importing, setImporting] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  
  const navigate = useNavigate();

  // Fetch accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await fetch('/api/accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      const data = await response.json();
      return data.value as Account[];
    }
  });

  const accounts = accountsData || [];
  const selectedAccount = accounts.find(a => a.Id === sourceAccountId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('sourceAccountId', sourceAccountId);
      formData.append('sourceType', sourceType);
      formData.append('sourceName', selectedAccount?.Name || '');

      const response = await fetch('http://localhost:7072/api/import-csv', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Import failed');
      }

      const result = await response.json();
      setImportedTransactions(result.transactions);
      const accountsMsg = result.sourceAccountsCreated || result.categoryAccountsCreated
        ? `\nAccounts created: ${result.sourceAccountsCreated || 0} source, ${result.categoryAccountsCreated || 0} category`
        : '';
      alert(`Successfully imported ${result.count} transactions!\nFormat: ${result.format}${accountsMsg}`);
      navigate('/review');
    } catch (error) {
      console.error('Import error:', error);
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleResetDb = async () => {
    if (!confirm('Are you sure you want to delete ALL transactions? This cannot be undone.')) return;
    
    try {
      const response = await fetch('http://localhost:7072/api/reset-db', {
        method: 'POST'
      });
      
      if (response.ok) {
        alert('Database reset successfully');
        setImportedTransactions([]);
      } else {
        alert('Failed to reset database');
      }
    } catch (err) {
      console.error('Reset error:', err);
      alert('Failed to reset database');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Import Transactions</h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload CSV files from your bank to import transactions
          </p>
        </div>
        <button
            onClick={handleResetDb}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
            Reset Database
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Step 1: Select Source Account</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="accountType" className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
            <select
              id="accountType"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as 'Bank' | 'CreditCard')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="Bank">Bank Account</option>
              <option value="CreditCard">Credit Card</option>
            </select>
          </div>

          <div>
            <label htmlFor="sourceAccount" className="block text-sm font-medium text-gray-700 mb-2">Source Account</label>
            <div className="flex space-x-2">
              <select
                id="sourceAccount"
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Auto-detect from CSV (QBSE, Capital One)</option>
                {accounts
                  .filter(acc => sourceType === 'Bank' ? acc.Type !== 'Credit Card' : acc.Type === 'Credit Card')
                  .map(acc => (
                    <option key={acc.Id} value={acc.Id}>
                      {acc.Name} {acc.AccountNumber ? `(${acc.AccountNumber})` : ''}
                    </option>
                  ))}
              </select>
              <button
                onClick={() => setIsAddAccountModalOpen(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                title="Add New Account"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Step 2: Upload CSV File</h2>
        
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Choose CSV File
          </label>
          {selectedFile && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: <span className="font-medium">{selectedFile.name}</span> ({(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <div className="mt-6">
          <button
            onClick={handleImport}
            disabled={!selectedFile || importing}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-300"
          >
            {importing ? 'Importing & Categorizing...' : 'Import & Categorize with AI'}
          </button>
        </div>
      </div>

      <AddAccountModal 
        isOpen={isAddAccountModalOpen} 
        onClose={() => setIsAddAccountModalOpen(false)} 
      />
    </div>
  );
}
