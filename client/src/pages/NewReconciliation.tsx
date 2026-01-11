import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, AlertCircle, Building2 } from 'lucide-react';
import clsx from 'clsx';

interface Account {
  Id: string;
  Name: string;
  Type: string;
}

interface BankTransaction {
  Id: string;
  TransactionDate: string;
  Description: string;
  Amount: number;
  Status: string;
  SourceAccountId: string;
}

interface JournalEntryLine {
  Id: string;
  JournalEntryId: string;
  AccountId: string;
  Description: string;
  Debit: number;
  Credit: number;
  CreatedAt: string;
}

interface ReconciliationItem {
  Id: string;
  ReconciliationId: string;
  TransactionType: string;
  TransactionId: string;
  TransactionDate: string;
  Description: string;
  Amount: number;
  IsCleared: boolean;
  ClearedAt: string | null;
}

interface BankReconciliation {
  Id: string;
  BankAccountId: string;
  StatementDate: string;
  StatementEndingBalance: number;
  BeginningBalance: number;
  ClearedDeposits: number;
  ClearedPayments: number;
  Status: string;
}

const steps = [
  { id: 1, name: 'Select Account', description: 'Choose bank account to reconcile' },
  { id: 2, name: 'Statement Info', description: 'Enter statement details' },
  { id: 3, name: 'Reconcile', description: 'Clear transactions' },
];

export default function NewReconciliation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [statementDate, setStatementDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statementEndingBalance, setStatementEndingBalance] = useState<number>(0);
  const [beginningBalance, setBeginningBalance] = useState<number>(0);
  const [clearedItems, setClearedItems] = useState<Set<string>>(new Set());
  const [reconciliationId, setReconciliationId] = useState<string | null>(id || null);

  // Fetch bank accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await fetch('http://localhost:5000/api/accounts?$filter=Type eq \'Asset\'');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return (await response.json()).value as Account[];
    }
  });

  // Fetch existing reconciliation if editing
  const { data: existingReconciliation } = useQuery({
    queryKey: ['reconciliation', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await fetch(`http://localhost:5000/api/bankreconciliations/Id/${id}`);
      if (!response.ok) throw new Error('Failed to fetch reconciliation');
      return await response.json() as BankReconciliation;
    },
    enabled: !!id
  });

  // Fetch existing cleared items if editing
  const { data: existingItems } = useQuery({
    queryKey: ['reconciliation-items', id],
    queryFn: async () => {
      if (!id) return [];
      const response = await fetch(`http://localhost:5000/api/reconciliationitems?$filter=ReconciliationId eq '${id}'`);
      if (!response.ok) throw new Error('Failed to fetch items');
      return (await response.json()).value as ReconciliationItem[];
    },
    enabled: !!id
  });

  // Load existing data when editing
  useEffect(() => {
    if (existingReconciliation) {
      setSelectedAccountId(existingReconciliation.BankAccountId);
      setStatementDate(existingReconciliation.StatementDate.split('T')[0]);
      setStatementEndingBalance(existingReconciliation.StatementEndingBalance);
      setBeginningBalance(existingReconciliation.BeginningBalance);
      setCurrentStep(3);
    }
  }, [existingReconciliation]);

  useEffect(() => {
    if (existingItems) {
      const cleared = new Set(existingItems.filter(i => i.IsCleared).map(i => `${i.TransactionType}-${i.TransactionId}`));
      setClearedItems(cleared);
    }
  }, [existingItems]);

  // Fetch bank transactions for the selected account
  const { data: transactionsData } = useQuery({
    queryKey: ['bank-transactions', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const response = await fetch(`http://localhost:5000/api/banktransactions?$filter=SourceAccountId eq '${selectedAccountId}' and Status eq 'Approved'&$orderby=TransactionDate`);
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return (await response.json()).value as BankTransaction[];
    },
    enabled: !!selectedAccountId
  });

  // Fetch journal entry lines for the selected account
  const { data: journalLinesData } = useQuery({
    queryKey: ['journal-lines', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const response = await fetch(`http://localhost:5000/api/journalentrylines?$filter=AccountId eq '${selectedAccountId}'&$orderby=CreatedAt`);
      if (!response.ok) throw new Error('Failed to fetch journal lines');
      return (await response.json()).value as JournalEntryLine[];
    },
    enabled: !!selectedAccountId
  });

  const bankAccounts = accountsData?.filter(a => a.Name.toLowerCase().includes('bank') || a.Name.toLowerCase().includes('checking') || a.Name.toLowerCase().includes('savings')) || [];
  const transactions = transactionsData || [];
  const journalLines = journalLinesData || [];

  // Combine transactions for reconciliation
  const allItems = [
    ...transactions.map(t => ({
      id: `bank-${t.Id}`,
      type: 'BankTransaction',
      transactionId: t.Id,
      date: t.TransactionDate,
      description: t.Description,
      amount: t.Amount
    })),
    ...journalLines.map(jl => ({
      id: `journal-${jl.Id}`,
      type: 'JournalEntry',
      transactionId: jl.Id,
      date: jl.CreatedAt, // Use CreatedAt timestamp for date instead of Id GUID
      description: jl.Description || 'Journal Entry',
      amount: jl.Debit > 0 ? jl.Debit : -jl.Credit
    }))
  ];

  // Calculate cleared totals
  const clearedDeposits = allItems
    .filter(item => clearedItems.has(item.id) && item.amount > 0)
    .reduce((sum, item) => sum + item.amount, 0);

  const clearedPayments = allItems
    .filter(item => clearedItems.has(item.id) && item.amount < 0)
    .reduce((sum, item) => sum + Math.abs(item.amount), 0);

  const clearedBalance = beginningBalance + clearedDeposits - clearedPayments;
  const difference = statementEndingBalance - clearedBalance;
  const isBalanced = Math.abs(difference) < 0.01;

  // Create reconciliation mutation
  const createReconciliation = useMutation({
    mutationFn: async () => {
      const response = await fetch('http://localhost:5000/api/bankreconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BankAccountId: selectedAccountId,
          StatementDate: statementDate,
          StatementEndingBalance: statementEndingBalance,
          BeginningBalance: beginningBalance,
          ClearedDeposits: 0,
          ClearedPayments: 0,
          Status: 'InProgress'
        })
      });
      if (!response.ok) throw new Error('Failed to create reconciliation');
      return await response.json();
    },
    onSuccess: (data) => {
      setReconciliationId(data.Id);
      setCurrentStep(3);
    }
  });

  // Update reconciliation mutation
  const updateReconciliation = useMutation({
    mutationFn: async () => {
      if (!reconciliationId) return;
      const response = await fetch(`http://localhost:5000/api/bankreconciliations/Id/${reconciliationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ClearedDeposits: clearedDeposits,
          ClearedPayments: clearedPayments,
          Status: isBalanced ? 'Completed' : 'InProgress',
          CompletedAt: isBalanced ? new Date().toISOString() : null
        })
      });
      if (!response.ok) throw new Error('Failed to update reconciliation');
      return await response.json();
    }
  });

  // Save cleared item mutation
  const saveClearedItem = useMutation({
    mutationFn: async ({ item, isCleared }: { item: typeof allItems[0], isCleared: boolean }) => {
      if (!reconciliationId) return;

      // Check if item already exists
      const existingResponse = await fetch(
        `http://localhost:5000/api/reconciliationitems?$filter=ReconciliationId eq '${reconciliationId}' and TransactionId eq '${item.transactionId}'`
      );
      if (!existingResponse.ok) {
        throw new Error('Failed to fetch existing reconciliation items');
      }
      const existing = (await existingResponse.json()).value as ReconciliationItem[];

      if (existing.length > 0) {
        // Update existing
        const updateResponse = await fetch(`http://localhost:5000/api/reconciliationitems/Id/${existing[0].Id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            IsCleared: isCleared,
            ClearedAt: isCleared ? new Date().toISOString() : null
          })
        });
        if (!updateResponse.ok) {
          throw new Error('Failed to update reconciliation item');
        }
      } else {
        // Create new
        const createResponse = await fetch('http://localhost:5000/api/reconciliationitems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ReconciliationId: reconciliationId,
            TransactionType: item.type,
            TransactionId: item.transactionId,
            TransactionDate: item.date,
            Description: item.description,
            Amount: item.amount,
            IsCleared: isCleared,
            ClearedAt: isCleared ? new Date().toISOString() : null
          })
        });
        if (!createResponse.ok) {
          throw new Error('Failed to create reconciliation item');
        }
      }
    }
  });

  const toggleCleared = (item: typeof allItems[0]) => {
    const newCleared = new Set(clearedItems);
    const isCleared = !clearedItems.has(item.id);

    if (isCleared) {
      newCleared.add(item.id);
    } else {
      newCleared.delete(item.id);
    }
    setClearedItems(newCleared);

    if (reconciliationId) {
      saveClearedItem.mutate({ item, isCleared });
    }
  };

  const handleComplete = async () => {
    if (!isBalanced) return;
    await updateReconciliation.mutateAsync();
    queryClient.invalidateQueries({ queryKey: ['bank-reconciliations'] });
    navigate('/reconciliations');
  };

  const handleNext = () => {
    if (currentStep === 2) {
      createReconciliation.mutate();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/reconciliations')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back to Reconciliations
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditing ? 'Continue Reconciliation' : 'New Bank Reconciliation'}
        </h1>
      </div>

      {/* Steps */}
      <nav className="mb-8">
        <ol className="flex items-center">
          {steps.map((step, index) => (
            <li key={step.id} className={clsx('relative', index !== steps.length - 1 && 'pr-8 sm:pr-20 flex-1')}>
              <div className="flex items-center">
                <div
                  className={clsx(
                    'relative z-10 w-8 h-8 flex items-center justify-center rounded-full',
                    currentStep > step.id ? 'bg-indigo-600' : currentStep === step.id ? 'bg-indigo-600' : 'bg-gray-200'
                  )}
                >
                  {currentStep > step.id ? (
                    <Check className="w-5 h-5 text-white" />
                  ) : (
                    <span className={clsx('text-sm font-medium', currentStep === step.id ? 'text-white' : 'text-gray-500')}>
                      {step.id}
                    </span>
                  )}
                </div>
                {index !== steps.length - 1 && (
                  <div className={clsx('hidden sm:block absolute top-4 w-full h-0.5', currentStep > step.id ? 'bg-indigo-600' : 'bg-gray-200')} />
                )}
              </div>
              <div className="mt-2">
                <span className={clsx('text-sm font-medium', currentStep >= step.id ? 'text-indigo-600' : 'text-gray-500')}>
                  {step.name}
                </span>
                <p className="text-xs text-gray-500">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="bg-white shadow rounded-lg p-6">
        {/* Step 1: Select Account */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Select Bank Account</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bankAccounts.map((account) => (
                <button
                  key={account.Id}
                  onClick={() => setSelectedAccountId(account.Id)}
                  className={clsx(
                    'p-4 border-2 rounded-lg text-left transition-colors',
                    selectedAccountId === account.Id
                      ? 'border-indigo-600 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <Building2 className={clsx('h-8 w-8 mb-2', selectedAccountId === account.Id ? 'text-indigo-600' : 'text-gray-400')} />
                  <h3 className="font-medium text-gray-900">{account.Name}</h3>
                  <p className="text-sm text-gray-500">{account.Type}</p>
                </button>
              ))}
            </div>
            {bankAccounts.length === 0 && (
              <p className="text-gray-500 text-center py-8">No bank accounts found. Please create a bank account first.</p>
            )}
          </div>
        )}

        {/* Step 2: Statement Info */}
        {currentStep === 2 && (
          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-4">Enter Statement Information</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statement Date</label>
                <input
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statement Ending Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={statementEndingBalance}
                  onChange={(e) => setStatementEndingBalance(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beginning Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={beginningBalance}
                  onChange={(e) => setBeginningBalance(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">This should match your previous statement ending balance</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Reconcile */}
        {currentStep === 3 && (
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Reconcile Transactions</h2>
                <p className="text-sm text-gray-500">Check off transactions that appear on your bank statement</p>
              </div>
              <div className={clsx('p-4 rounded-lg', isBalanced ? 'bg-green-50' : 'bg-yellow-50')}>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between gap-8">
                    <span className="text-gray-600">Statement Balance:</span>
                    <span className="font-medium">{formatCurrency(statementEndingBalance)}</span>
                  </div>
                  <div className="flex justify-between gap-8">
                    <span className="text-gray-600">Beginning Balance:</span>
                    <span className="font-medium">{formatCurrency(beginningBalance)}</span>
                  </div>
                  <div className="flex justify-between gap-8">
                    <span className="text-green-600">+ Cleared Deposits:</span>
                    <span className="font-medium text-green-600">{formatCurrency(clearedDeposits)}</span>
                  </div>
                  <div className="flex justify-between gap-8">
                    <span className="text-red-600">- Cleared Payments:</span>
                    <span className="font-medium text-red-600">{formatCurrency(clearedPayments)}</span>
                  </div>
                  <div className="border-t pt-1 flex justify-between gap-8">
                    <span className="text-gray-600">Cleared Balance:</span>
                    <span className="font-medium">{formatCurrency(clearedBalance)}</span>
                  </div>
                  <div className={clsx('flex justify-between gap-8 font-bold', isBalanced ? 'text-green-600' : 'text-yellow-600')}>
                    <span>Difference:</span>
                    <span>{formatCurrency(difference)}</span>
                  </div>
                </div>
                {isBalanced ? (
                  <div className="mt-2 flex items-center text-green-600 text-sm">
                    <Check className="h-4 w-4 mr-1" />
                    Balanced!
                  </div>
                ) : (
                  <div className="mt-2 flex items-center text-yellow-600 text-sm">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    Not balanced
                  </div>
                )}
              </div>
            </div>

            {/* Transactions List */}
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cleared</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No transactions found for this account
                      </td>
                    </tr>
                  ) : (
                    allItems.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => toggleCleared(item)}
                        className={clsx('cursor-pointer hover:bg-gray-50', clearedItems.has(item.id) && 'bg-green-50')}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={clearedItems.has(item.id)}
                            onChange={(e) => { e.stopPropagation(); toggleCleared(item); }}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item.description}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {item.type}
                        </td>
                        <td className={clsx('px-4 py-3 text-sm text-right font-medium', item.amount >= 0 ? 'text-green-600' : 'text-red-600')}>
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => setCurrentStep(prev => prev - 1)}
          disabled={currentStep === 1}
          className={clsx(
            'inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md',
            currentStep === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
          )}
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back
        </button>

        {currentStep < 3 ? (
          <button
            onClick={handleNext}
            disabled={(currentStep === 1 && !selectedAccountId) || (currentStep === 2 && !statementDate)}
            className={clsx(
              'inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600',
              (currentStep === 1 && !selectedAccountId) || (currentStep === 2 && !statementDate)
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-indigo-700'
            )}
          >
            Next
            <ArrowRight className="h-5 w-5 ml-2" />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={!isBalanced}
            className={clsx(
              'inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white',
              isBalanced ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'
            )}
          >
            <Check className="h-5 w-5 mr-2" />
            Complete Reconciliation
          </button>
        )}
      </div>
    </div>
  );
}
