import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';

interface CustomerDeposit {
  Id: string;
  DepositNumber: string;
  CustomerId: string;
  CustomerName: string;
  DepositDate: string;
  Amount: number;
  AmountApplied: number;
  BalanceRemaining: number;
  Status: string;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  TotalAmount: number;
  AmountPaid: number;
  Status: string;
  DueDate: string;
}

interface ApplicationLine {
  InvoiceId: string;
  InvoiceNumber: string;
  InvoiceTotalAmount: number;
  InvoiceBalanceDue: number;
  AmountToApply: number;
}

export default function ApplyDeposit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicationLine[]>([]);
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().split('T')[0]);
  const [memo, setMemo] = useState('');

  // Fetch the deposit
  const { data: deposit, isLoading: isLoadingDeposit } = useQuery({
    queryKey: ['customerdeposit', id],
    queryFn: async (): Promise<CustomerDeposit | null> => {
      if (!id) return null;
      const response = await api.get<{ value: CustomerDeposit[] }>(`/customerdeposits?$filter=Id eq ${id}`);
      return response.data.value[0] || null;
    },
    enabled: !!id,
  });

  // Fetch unpaid invoices for the same customer
  const { data: unpaidInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices-unpaid', deposit?.CustomerId],
    queryFn: async (): Promise<Invoice[]> => {
      if (!deposit?.CustomerId) return [];
      const response = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=CustomerId eq ${deposit.CustomerId} and Status ne 'Paid' and Status ne 'Draft'&$orderby=DueDate`
      );
      return response.data.value;
    },
    enabled: !!deposit?.CustomerId,
  });

  // Calculate totals
  const totalToApply = useMemo(() => {
    return applications.reduce((sum, app) => sum + (app.AmountToApply || 0), 0);
  }, [applications]);

  const remainingBalance = useMemo(() => {
    if (!deposit) return 0;
    return deposit.BalanceRemaining - totalToApply;
  }, [deposit, totalToApply]);

  // Get invoices that haven't been added yet
  const availableInvoices = useMemo(() => {
    const appliedInvoiceIds = new Set(applications.map(a => a.InvoiceId));
    return unpaidInvoices?.filter(inv => !appliedInvoiceIds.has(inv.Id)) || [];
  }, [unpaidInvoices, applications]);

  const handleAddInvoice = (invoice: Invoice) => {
    const balanceDue = invoice.TotalAmount - (invoice.AmountPaid || 0);
    const maxApplicable = Math.min(balanceDue, remainingBalance);

    setApplications(prev => [...prev, {
      InvoiceId: invoice.Id,
      InvoiceNumber: invoice.InvoiceNumber,
      InvoiceTotalAmount: invoice.TotalAmount,
      InvoiceBalanceDue: balanceDue,
      AmountToApply: maxApplicable,
    }]);
  };

  const handleRemoveApplication = (index: number) => {
    setApplications(prev => prev.filter((_, i) => i !== index));
  };

  const handleAmountChange = (index: number, amount: number) => {
    setApplications(prev => prev.map((app, i) => {
      if (i === index) {
        return { ...app, AmountToApply: Math.min(amount, app.InvoiceBalanceDue) };
      }
      return app;
    }));
  };

  // Fetch deposit details including account IDs
  const { data: depositDetails } = useQuery({
    queryKey: ['customerdeposit-details', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await api.get<{ value: any[] }>(`/customerdeposits_write?$filter=Id eq ${id}`);
      return response.data.value[0] || null;
    },
    enabled: !!id,
  });

  // Fetch Accounts Receivable account
  const { data: arAccount } = useQuery({
    queryKey: ['ar-account'],
    queryFn: async () => {
      const response = await api.get<{ value: any[] }>(
        `/accounts?$filter=Type eq 'Asset' and (contains(Name,'Accounts Receivable') or contains(Name,'A/R'))&$top=1`
      );
      return response.data.value[0] || null;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!deposit || applications.length === 0) {
        throw new Error('No applications to process');
      }

      // Get the liability account (Unearned Revenue) from deposit details
      const liabilityAccountId = depositDetails?.LiabilityAccountId;
      const accountsReceivableId = arAccount?.Id;

      if (!liabilityAccountId || !accountsReceivableId) {
        console.warn('Missing account IDs for journal entry - skipping journal entry creation');
      }

      // Create a single journal entry for all applications
      let journalEntryId: string | null = null;
      if (liabilityAccountId && accountsReceivableId && totalToApply > 0) {
        // Create journal entry header
        const jeResponse = await api.post('/journalentries', {
          Reference: `DEP-APPLY-${deposit.DepositNumber}`,
          TransactionDate: applicationDate,
          Description: `Apply deposit ${deposit.DepositNumber} to invoices`,
          Status: 'Posted',
          CreatedBy: 'system',
        });
        journalEntryId = jeResponse.data.Id || jeResponse.data.value?.[0]?.Id;

        if (journalEntryId) {
          // Debit Unearned Revenue (reduce liability)
          await api.post('/journalentrylines', {
            JournalEntryId: journalEntryId,
            AccountId: liabilityAccountId,
            Description: `Apply deposit ${deposit.DepositNumber}`,
            Debit: totalToApply,
            Credit: 0,
          });

          // Credit Accounts Receivable (reduce AR)
          await api.post('/journalentrylines', {
            JournalEntryId: journalEntryId,
            AccountId: accountsReceivableId,
            Description: `Apply deposit ${deposit.DepositNumber}`,
            Debit: 0,
            Credit: totalToApply,
          });
        }
      }

      // Create deposit applications and update invoice amounts
      for (const app of applications) {
        // Create the deposit application
        await api.post('/depositapplications_write', {
          CustomerDepositId: deposit.Id,
          InvoiceId: app.InvoiceId,
          AmountApplied: app.AmountToApply,
          ApplicationDate: applicationDate,
          JournalEntryId: journalEntryId,
          Memo: memo || null,
        });

        // Update the invoice's AmountPaid
        const invoiceResponse = await api.get<{ value: { Id: string; AmountPaid: number; TotalAmount: number }[] }>(
          `/invoices?$filter=Id eq ${app.InvoiceId}`
        );
        const invoice = invoiceResponse.data.value[0];

        if (invoice) {
          const newAmountPaid = (invoice.AmountPaid || 0) + app.AmountToApply;
          const newStatus = newAmountPaid >= invoice.TotalAmount ? 'Paid' : 'Partial';

          await api.patch(`/invoices_write/Id/${app.InvoiceId}`, {
            AmountPaid: newAmountPaid,
            Status: newStatus,
          });
        }
      }

      // Update the deposit's AmountApplied and Status
      const newAmountApplied = deposit.AmountApplied + totalToApply;
      const newStatus = newAmountApplied >= deposit.Amount ? 'Applied' : 'PartiallyApplied';

      await api.patch(`/customerdeposits_write/Id/${deposit.Id}`, {
        AmountApplied: newAmountApplied,
        Status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerdeposits'] });
      queryClient.invalidateQueries({ queryKey: ['depositapplications'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/customer-deposits');
    },
    onError: (error) => {
      console.error('Failed to apply deposit:', error);
      setErrorMessage('Failed to apply deposit. Please try again.');
    },
  });

  if (isLoadingDeposit) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-8">Loading deposit...</div>
      </div>
    );
  }

  if (!deposit) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Deposit not found</p>
        </div>
      </div>
    );
  }

  if (deposit.Status === 'Applied' || deposit.Status === 'Refunded') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-yellow-700">
            This deposit has already been fully applied or refunded and cannot receive additional applications.
          </p>
          <button
            onClick={() => navigate('/customer-deposits')}
            className="mt-4 text-indigo-600 hover:text-indigo-800"
          >
            Return to Deposits
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center">
        <button onClick={() => navigate(-1)} className="mr-4 text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">Apply Deposit to Invoices</h1>
      </div>

      {errorMessage && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4 flex justify-between items-center">
          <p className="text-red-600">{errorMessage}</p>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      {/* Deposit Summary */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Deposit Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Deposit Number</p>
            <p className="text-lg font-medium text-gray-900">{deposit.DepositNumber}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Customer</p>
            <p className="text-lg font-medium text-gray-900">{deposit.CustomerName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Original Amount</p>
            <p className="text-lg font-medium text-gray-900">${deposit.Amount.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Available Balance</p>
            <p className="text-lg font-medium text-green-600">${deposit.BalanceRemaining.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Application Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 mb-6">
          <div>
            <label htmlFor="applicationDate" className="block text-sm font-medium text-gray-700">
              Application Date
            </label>
            <input
              id="applicationDate"
              type="date"
              value={applicationDate}
              onChange={(e) => setApplicationDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            />
          </div>
          <div>
            <label htmlFor="memo" className="block text-sm font-medium text-gray-700">
              Memo (Optional)
            </label>
            <input
              id="memo"
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
              placeholder="Optional notes"
            />
          </div>
        </div>

        {/* Available Invoices */}
        {isLoadingInvoices ? (
          <div className="text-center py-8 text-gray-500">Loading invoices...</div>
        ) : availableInvoices.length > 0 && remainingBalance > 0 ? (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Available Invoices</h3>
            <div className="bg-gray-50 rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Invoice #</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Due Date</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Balance Due</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {availableInvoices.map(invoice => {
                    const balanceDue = invoice.TotalAmount - (invoice.AmountPaid || 0);
                    return (
                      <tr key={invoice.Id}>
                        <td className="px-4 py-2 text-sm text-gray-900">{invoice.InvoiceNumber}</td>
                        <td className="px-4 py-2 text-sm text-gray-600">{formatDate(invoice.DueDate)}</td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">${invoice.TotalAmount.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">${balanceDue.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleAddInvoice(invoice)}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Apply
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {/* Applications */}
        {applications.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Deposit Applied To</h3>
            <div className="space-y-3">
              {applications.map((app, index) => (
                <div key={app.InvoiceId} className="bg-indigo-50 p-4 rounded-md flex items-center gap-4">
                  <div className="flex-grow">
                    <div className="text-sm font-medium text-gray-900">
                      Invoice #{app.InvoiceNumber}
                    </div>
                    <div className="text-xs text-gray-500">
                      Balance due: ${app.InvoiceBalanceDue.toFixed(2)}
                    </div>
                  </div>
                  <div className="w-40">
                    <label className="block text-xs font-medium text-gray-500">Amount to Apply</label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2">
                        <span className="text-gray-500 text-sm">$</span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={app.InvoiceBalanceDue}
                        value={app.AmountToApply}
                        onChange={(e) => handleAmountChange(index, parseFloat(e.target.value) || 0)}
                        className="block w-full rounded-md border-gray-300 pl-6 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveApplication(index)}
                    className="text-red-600 hover:text-red-800 p-1"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {applications.length === 0 && availableInvoices.length === 0 && (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-md mb-6">
            No unpaid invoices found for this customer
          </div>
        )}

        {/* Totals */}
        <div className="border-t pt-4">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total to Apply:</span>
                <span className="font-medium text-gray-900">${totalToApply.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Remaining Balance:</span>
                <span className={`font-medium ${remainingBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  ${remainingBalance.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning if over-applied */}
        {remainingBalance < 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              The total amount to apply exceeds the available deposit balance. Please reduce the application amounts.
            </p>
          </div>
        )}

        {/* Info box about journal entry */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2">Journal Entry Effect</h4>
          <p className="text-sm text-blue-700">
            Applying this deposit will create journal entries:
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1">
            <li><strong>Debit:</strong> Unearned Revenue (Liability decreases)</li>
            <li><strong>Credit:</strong> Accounts Receivable (Reduces invoice balance)</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex justify-end items-center border-t pt-4 mt-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mr-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || applications.length === 0 || remainingBalance < 0}
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {mutation.isPending ? 'Applying...' : 'Apply Deposit'}
          </button>
        </div>
      </div>
    </div>
  );
}
