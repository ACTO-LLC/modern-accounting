import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle, AlertCircle, ArrowRight, RefreshCw, Plus } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';

interface Account {
  Id: string;
  Name: string;
  Type: string;
  AccountNumber: string | null;
}

interface ParsedTransaction {
  transactionDate: string;
  postDate?: string;
  description: string;
  amount: number;
  transactionType?: string;
  checkNumber?: string;
  referenceNumber?: string;
  bankTransactionId?: string;
}

interface ImportPreview {
  fileName: string;
  fileType: string;
  transactions: ParsedTransaction[];
  duplicateCount: number;
}

type ImportStep = 'select-account' | 'upload' | 'preview' | 'importing' | 'complete';

export default function BankImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [step, setStep] = useState<ImportStep>('select-account');
  const [bankAccountId, setBankAccountId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    importId: string;
    count: number;
    matchedCount: number;
  } | null>(null);

  // Fetch bank accounts (Asset type)
  const { data: bankAccounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async (): Promise<Account[]> => {
      const response = await api.get("/accounts?$filter=Type eq 'Asset' and Status eq 'Active'&$orderby=Name");
      return response.data.value;
    }
  });

  // Parse file mutation
  const parseFileMutation = useMutation({
    mutationFn: async (file: File): Promise<ImportPreview> => {
      const text = await file.text();
      const lines = text.trim().split('\n');

      // Detect file type based on content
      let fileType = 'CSV';
      if (text.includes('<?OFX') || text.includes('<OFX>')) {
        fileType = 'OFX';
      } else if (text.includes('<?xml') && text.includes('SIGNONMSGSRSV1')) {
        fileType = 'QFX';
      }

      const transactions: ParsedTransaction[] = [];

      if (fileType === 'CSV') {
        // Parse CSV
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length < 2) continue;

          const row: Record<string, string> = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx]?.replace(/"/g, '').trim() || '';
          });

          // Map common column names
          const transaction: ParsedTransaction = {
            transactionDate: row.date || row.transactiondate || row['transaction date'] || row.posted || '',
            postDate: row.postdate || row['post date'] || undefined,
            description: row.description || row.memo || row.payee || row.name || '',
            amount: parseAmount(row.amount || row.debit || row.credit || '0'),
            transactionType: row.type || row['transaction type'] || undefined,
            checkNumber: row.checknumber || row['check number'] || row.check || undefined,
            referenceNumber: row.reference || row.referencenumber || row['reference number'] || undefined,
          };

          // Handle separate debit/credit columns
          if (row.debit && !row.amount) {
            transaction.amount = -Math.abs(parseAmount(row.debit));
          }
          if (row.credit && !row.amount) {
            transaction.amount = Math.abs(parseAmount(row.credit));
          }

          if (transaction.transactionDate && transaction.description) {
            transactions.push(transaction);
          }
        }
      } else if (fileType === 'OFX' || fileType === 'QFX') {
        // Basic OFX/QFX parsing
        const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
        let match;

        while ((match = stmtTrnRegex.exec(text)) !== null) {
          const trn = match[1];

          const getTag = (tag: string) => {
            const tagMatch = trn.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
            return tagMatch ? tagMatch[1].trim() : '';
          };

          const dateStr = getTag('DTPOSTED');
          let transactionDate = '';
          if (dateStr.length >= 8) {
            transactionDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
          }

          transactions.push({
            transactionDate,
            description: getTag('NAME') || getTag('MEMO'),
            amount: parseFloat(getTag('TRNAMT') || '0'),
            transactionType: getTag('TRNTYPE'),
            checkNumber: getTag('CHECKNUM') || undefined,
            referenceNumber: getTag('REFNUM') || undefined,
            bankTransactionId: getTag('FITID') || undefined,
          });
        }
      }

      // Check for duplicates
      const existingIds = await checkDuplicates(transactions, bankAccountId);
      const duplicateCount = existingIds.length;

      return {
        fileName: file.name,
        fileType,
        transactions: transactions.filter(t => !existingIds.includes(t.bankTransactionId || '')),
        duplicateCount
      };
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep('preview');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  });

  // Import transactions mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!preview || !bankAccountId) throw new Error('No data to import');

      setStep('importing');

      // Create import record
      const importResponse = await api.post('/banktransactionimports_write', {
        BankAccountId: bankAccountId,
        FileName: preview.fileName,
        FileType: preview.fileType,
        TransactionCount: preview.transactions.length,
        Status: 'Processing',
        ImportedBy: 'User' // Would be actual user in production
      });

      const importId = importResponse.data.value?.[0]?.Id || importResponse.data.Id;

      // Get bank account info
      const accountResponse = await api.get(`/accounts/Id/${bankAccountId}`);
      const account = accountResponse.data;

      // Create transactions
      for (const txn of preview.transactions) {
        await api.post('/banktransactions', {
          SourceType: 'Bank',
          SourceName: account.Name,
          SourceAccountId: bankAccountId,
          TransactionDate: txn.transactionDate,
          PostDate: txn.postDate || null,
          Description: txn.description,
          Amount: txn.amount,
          TransactionType: txn.transactionType || (txn.amount >= 0 ? 'Deposit' : 'Withdrawal'),
          CheckNumber: txn.checkNumber || null,
          ReferenceNumber: txn.referenceNumber || null,
          BankTransactionId: txn.bankTransactionId || null,
          ImportId: importId,
          Status: 'Pending'
        });
      }

      // Run auto-matching for deposits
      const matchedCount = await runAutoMatching(importId);

      // Update import record
      await api.patch(`/banktransactionimports_write/Id/${importId}`, {
        Status: 'Completed',
        MatchedCount: matchedCount
      });

      return { importId, count: preview.transactions.length, matchedCount };
    },
    onSuccess: (result) => {
      setImportResult(result);
      setStep('complete');
      queryClient.invalidateQueries({ queryKey: ['bank-imports'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('preview');
    }
  });

  // Helper functions
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const parseAmount = (str: string): number => {
    const cleaned = str.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const checkDuplicates = async (transactions: ParsedTransaction[], accountId: string): Promise<string[]> => {
    const ids = transactions
      .filter(t => t.bankTransactionId)
      .map(t => t.bankTransactionId as string);

    if (ids.length === 0) return [];

    try {
      const response = await api.get(
        `/banktransactions?$filter=SourceAccountId eq ${accountId} and BankTransactionId ne null&$select=BankTransactionId`
      );
      const existing = response.data.value?.map((t: { BankTransactionId: string }) => t.BankTransactionId) || [];
      return ids.filter(id => existing.includes(id));
    } catch {
      return [];
    }
  };

  const runAutoMatching = async (importId: string): Promise<number> => {
    // Get all deposit transactions from this import
    const txnResponse = await api.get(
      `/banktransactions?$filter=ImportId eq ${importId} and Amount gt 0`
    );
    const deposits = txnResponse.data.value || [];

    // Get unpaid invoices
    const invoiceResponse = await api.get(
      "/invoices?$filter=Status ne 'Paid' and Status ne 'Draft'&$orderby=DueDate"
    );
    const invoices = invoiceResponse.data.value || [];

    let matchedCount = 0;

    for (const deposit of deposits) {
      const matches = findMatches(deposit, invoices);

      // Create match records for top matches
      for (const match of matches.slice(0, 3)) {
        try {
          await api.post('/banktransactionmatches_write', {
            BankTransactionId: deposit.Id,
            InvoiceId: match.invoice.Id,
            SuggestedAmount: match.suggestedAmount,
            Confidence: match.confidence,
            MatchReason: match.reason,
            Status: 'Suggested'
          });
        } catch (e) {
          // Ignore duplicate match errors
          console.warn('Match already exists or error:', e);
        }
      }

      if (matches.length > 0 && matches[0].confidence === 'High') {
        matchedCount++;
      }
    }

    return matchedCount;
  };

  interface MatchResult {
    invoice: {
      Id: string;
      InvoiceNumber: string;
      CustomerName: string;
      BalanceDue: number;
      TotalAmount: number;
    };
    suggestedAmount: number;
    confidence: 'High' | 'Medium' | 'Low';
    reason: string;
  }

  const findMatches = (deposit: { Amount: number; Description: string }, invoices: Array<{
    Id: string;
    InvoiceNumber: string;
    CustomerName: string;
    BalanceDue: number;
    TotalAmount: number;
    AmountPaid: number;
  }>): MatchResult[] => {
    const matches: MatchResult[] = [];
    const amount = deposit.Amount;
    const desc = deposit.Description.toLowerCase();

    for (const invoice of invoices) {
      const balanceDue = invoice.TotalAmount - (invoice.AmountPaid || 0);
      if (balanceDue <= 0) continue;

      let confidence: 'High' | 'Medium' | 'Low' = 'Low';
      let reason = '';

      // Exact amount match
      if (Math.abs(amount - balanceDue) < 0.01) {
        confidence = 'High';
        reason = 'Exact amount match';
      } else if (Math.abs(amount - invoice.TotalAmount) < 0.01) {
        confidence = 'High';
        reason = 'Matches invoice total';
      }

      // Customer name in description
      if (invoice.CustomerName && desc.includes(invoice.CustomerName.toLowerCase())) {
        if (confidence === 'High') {
          reason += ' + Customer name in description';
        } else {
          confidence = 'Medium';
          reason = 'Customer name found in description';
        }
      }

      // Invoice number in description
      if (invoice.InvoiceNumber && desc.includes(invoice.InvoiceNumber.toLowerCase())) {
        confidence = 'High';
        reason = reason ? reason + ' + Invoice number in description' : 'Invoice number found in description';
      }

      // Partial amount (deposit covers part of balance)
      if (confidence === 'Low' && amount > 0 && amount < balanceDue * 1.1) {
        confidence = 'Low';
        reason = 'Possible partial payment';
      }

      if (reason) {
        matches.push({
          invoice: {
            Id: invoice.Id,
            InvoiceNumber: invoice.InvoiceNumber,
            CustomerName: invoice.CustomerName,
            BalanceDue: balanceDue,
            TotalAmount: invoice.TotalAmount
          },
          suggestedAmount: Math.min(amount, balanceDue),
          confidence,
          reason
        });
      }
    }

    // Sort by confidence (High first)
    return matches.sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      return order[a.confidence] - order[b.confidence];
    });
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }, []);

  const handleParseFile = () => {
    if (selectedFile) {
      parseFileMutation.mutate(selectedFile);
    }
  };

  const handleImport = () => {
    importMutation.mutate();
  };

  const handleStartOver = () => {
    setStep('select-account');
    setBankAccountId('');
    setSelectedFile(null);
    setPreview(null);
    setError(null);
    setImportResult(null);
  };

  const selectedAccount = bankAccounts?.find(a => a.Id === bankAccountId);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Import Bank Transactions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Import transactions from CSV, OFX, QFX, or QBO files and automatically match deposits to unpaid invoices.
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {['Select Account', 'Upload File', 'Preview', 'Complete'].map((label, idx) => {
            const stepMap: Record<number, ImportStep[]> = {
              0: ['select-account'],
              1: ['upload'],
              2: ['preview', 'importing'],
              3: ['complete']
            };
            const isActive = stepMap[idx].includes(step);
            const isComplete = idx < ['select-account', 'upload', 'preview', 'complete'].indexOf(step);

            return (
              <div key={label} className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  isComplete ? 'bg-green-500 text-white' :
                  isActive ? 'bg-indigo-600 text-white' :
                  'bg-gray-200 text-gray-600'
                }`}>
                  {isComplete ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                </div>
                <span className={`ml-2 text-sm ${isActive ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                  {label}
                </span>
                {idx < 3 && <ArrowRight className="mx-4 w-5 h-5 text-gray-300" />}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Step 1: Select Account */}
      {step === 'select-account' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Select Bank Account</h2>
          <p className="text-sm text-gray-600 mb-4">
            Choose the bank account that the transactions will be imported into.
          </p>

          {loadingAccounts ? (
            <div className="text-gray-500">Loading accounts...</div>
          ) : (
            <div className="space-y-4">
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 border p-2"
              >
                <option value="">Select a bank account...</option>
                {bankAccounts?.map(account => (
                  <option key={account.Id} value={account.Id}>
                    {account.Name} {account.AccountNumber ? `(${account.AccountNumber})` : ''}
                  </option>
                ))}
              </select>

              <div className="flex justify-end">
                <button
                  onClick={() => setStep('upload')}
                  disabled={!bankAccountId}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight className="ml-2 w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Upload File */}
      {step === 'upload' && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Bank Account:</span> {selectedAccount?.Name}
              {selectedAccount?.AccountNumber && ` (${selectedAccount.AccountNumber})`}
            </p>
          </div>

          <h2 className="text-lg font-medium text-gray-900 mb-4">Upload Transaction File</h2>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".csv,.ofx,.qfx,.qbo"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer"
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-indigo-600 hover:text-indigo-500">
                  Click to upload
                </span> or drag and drop
              </p>
              <p className="mt-1 text-xs text-gray-500">
                CSV, OFX, QFX, or QBO files
              </p>
            </label>

            {selectedFile && (
              <div className="mt-4 flex items-center justify-center text-sm text-gray-700">
                <FileText className="w-5 h-5 mr-2 text-gray-500" />
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep('select-account')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleParseFile}
              disabled={!selectedFile || parseFileMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {parseFileMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  Preview Transactions
                  <ArrowRight className="ml-2 w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && preview && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="mb-4 flex justify-between items-start">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Preview Transactions</h2>
              <p className="text-sm text-gray-600">
                {preview.transactions.length} transactions found in {preview.fileName}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500">File Type:</span>
              <span className="ml-1 text-sm font-medium text-gray-900">{preview.fileType}</span>
            </div>
          </div>

          {preview.duplicateCount > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <span className="font-medium">{preview.duplicateCount} duplicate transactions</span> were detected and will be skipped.
              </p>
            </div>
          )}

          {preview.transactions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No new transactions to import.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.transactions.slice(0, 50).map((txn, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatDate(txn.transactionDate)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                        {txn.description}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${
                        txn.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {txn.amount >= 0 ? '+' : ''}${txn.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {txn.transactionType || (txn.amount >= 0 ? 'Deposit' : 'Withdrawal')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.transactions.length > 50 && (
                <p className="text-center py-2 text-sm text-gray-500">
                  Showing first 50 of {preview.transactions.length} transactions
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => {
                setStep('upload');
                setPreview(null);
              }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={preview.transactions.length === 0 || importMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4 mr-2" />
              Import {preview.transactions.length} Transactions
            </button>
          </div>
        </div>
      )}

      {/* Step 3b: Importing */}
      {step === 'importing' && (
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <RefreshCw className="mx-auto h-12 w-12 text-indigo-600 animate-spin" />
          <h2 className="mt-4 text-lg font-medium text-gray-900">Importing Transactions...</h2>
          <p className="mt-2 text-sm text-gray-600">
            Please wait while we import your transactions and run auto-matching.
          </p>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && importResult && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h2 className="mt-4 text-lg font-medium text-gray-900">Import Complete!</h2>
            <p className="mt-2 text-sm text-gray-600">
              Successfully imported {importResult.count} transactions.
            </p>
            {importResult.matchedCount > 0 && (
              <p className="mt-1 text-sm text-indigo-600">
                {importResult.matchedCount} deposits matched to unpaid invoices.
              </p>
            )}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => navigate('/bank-import/matches')}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Review Matches
              <ArrowRight className="ml-2 w-4 h-4" />
            </button>
            <button
              onClick={handleStartOver}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Import More
            </button>
            <button
              onClick={() => navigate('/transactions')}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              View All Transactions
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
