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
  const [importedTransactions, setImportedTransactions] = useState<Transaction[]>([]);
  const [importing, setImporting] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  
  const navigate = useNavigate();

  // Fetch accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await fetch('http://localhost:5000/api/accounts');
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
    if (!selectedFile || !sourceAccountId) {
      alert('Please select both a file and source account');
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
      alert(`Successfully imported ${result.count} transactions!\nFormat: ${result.format}\nTraining data: ${result.trainingDataCount} transactions`);
      navigate('/review');
    } catch (error) {
      console.error('Import error:', error);
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Import Transactions</h1>
        <p className="mt-2 text-sm text-gray-600">
          Upload bank or credit card CSV files with AI-powered categorization
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Step 1: Select Source Account</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as 'Bank' | 'CreditCard')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="Bank">Bank Account</option>
              <option value="CreditCard">Credit Card</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Source Account</label>
            <div className="flex space-x-2">
              <select
                value={sourceAccountId}
                onChange={(e) => setSourceAccountId(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Select account...</option>
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
            disabled={!selectedFile || !sourceAccountId || importing}
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
