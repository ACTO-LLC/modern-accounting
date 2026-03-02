import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { formatDate } from '../lib/dateUtils';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';

interface CreditMemo {
  Id: string;
  CreditMemoNumber: string;
  CustomerId: string;
  CustomerName: string;
  CreditDate: string;
  TotalAmount: number;
  AmountApplied: number;
  AmountRefunded: number;
  BalanceRemaining: number;
  Status: string;
  Reason: string;
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

export default function ApplyCreditMemo() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicationLine[]>([]);
  const [applicationDate, setApplicationDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch the credit memo
  const { data: creditMemo, isLoading: isLoadingCreditMemo } = useQuery({
    queryKey: ['creditmemo', id],
    queryFn: async (): Promise<CreditMemo | null> => {
      if (!id) return null;
      const response = await api.get<{ value: CreditMemo[] }>(`/creditmemos?$filter=Id eq ${id}`);
      return response.data.value[0] || null;
    },
    enabled: !!id,
  });

  // Fetch unpaid invoices for the same customer
  const { data: unpaidInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices-unpaid', creditMemo?.CustomerId],
    queryFn: async (): Promise<Invoice[]> => {
      if (!creditMemo?.CustomerId) return [];
      const response = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=CustomerId eq ${creditMemo.CustomerId} and Status ne 'Paid' and Status ne 'Draft'&$orderby=DueDate`
      );
      return response.data.value;
    },
    enabled: !!creditMemo?.CustomerId,
  });

  // Calculate totals
  const totalToApply = useMemo(() => {
    return applications.reduce((sum, app) => sum + (app.AmountToApply || 0), 0);
  }, [applications]);

  const remainingBalance = useMemo(() => {
    if (!creditMemo) return 0;
    return creditMemo.BalanceRemaining - totalToApply;
  }, [creditMemo, totalToApply]);

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

  const mutation = useMutation({
    mutationFn: async () => {
      if (!creditMemo || applications.length === 0) {
        throw new Error('No applications to process');
      }

      // Create credit applications and update invoice amounts
      for (const app of applications) {
        // Create the credit application record
        await api.post('/creditapplications_write', {
          CreditMemoId: creditMemo.Id,
          InvoiceId: app.InvoiceId,
          AmountApplied: app.AmountToApply,
          ApplicationDate: applicationDate,
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

      // Update the credit memo's AmountApplied and Status
      const newAmountApplied = creditMemo.AmountApplied + totalToApply;
      const totalUsed = newAmountApplied + creditMemo.AmountRefunded;
      const newStatus = totalUsed >= creditMemo.TotalAmount ? 'Applied' : 'PartiallyApplied';

      await api.patch(`/creditmemos_write/Id/${creditMemo.Id}`, {
        AmountApplied: newAmountApplied,
        Status: newStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creditmemos'] });
      queryClient.invalidateQueries({ queryKey: ['creditapplications'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      navigate('/credit-memos');
    },
    onError: (error) => {
      console.error('Failed to apply credit memo:', error);
      setErrorMessage('Failed to apply credit memo. Please try again.');
    },
  });

  if (isLoadingCreditMemo) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-8">Loading credit memo...</div>
      </div>
    );
  }

  if (!creditMemo) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600">Credit memo not found</p>
        </div>
      </div>
    );
  }

  if (creditMemo.Status === 'Applied' || creditMemo.Status === 'Voided') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-yellow-700">
            This credit memo has already been fully applied or voided and cannot receive additional applications.
          </p>
          <button
            onClick={() => navigate('/credit-memos')}
            className="mt-4 text-indigo-600 hover:text-indigo-800"
          >
            Return to Credit Memos
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
        <h1 className="text-2xl font-semibold text-gray-900">Apply Credit Memo to Invoices</h1>
      </div>

      {errorMessage && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4 flex justify-between items-center">
          <p className="text-red-600">{errorMessage}</p>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:text-red-800">
            Dismiss
          </button>
        </div>
      )}

      {/* Credit Memo Summary */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Credit Memo Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Credit Memo #</p>
            <p className="text-lg font-medium text-gray-900">{creditMemo.CreditMemoNumber}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Customer</p>
            <p className="text-lg font-medium text-gray-900">{creditMemo.CustomerName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Amount</p>
            <p className="text-lg font-medium text-gray-900">{formatCurrencyStandalone(creditMemo.TotalAmount)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Available Balance</p>
            <p className="text-lg font-medium text-green-600">{formatCurrencyStandalone(creditMemo.BalanceRemaining)}</p>
          </div>
        </div>
        {creditMemo.Reason && (
          <div className="mt-4">
            <p className="text-sm text-gray-500">Reason</p>
            <p className="text-sm text-gray-700">{creditMemo.Reason}</p>
          </div>
        )}
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
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">{formatCurrencyStandalone(invoice.TotalAmount)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">{formatCurrencyStandalone(balanceDue)}</td>
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
            <h3 className="text-sm font-medium text-gray-700 mb-2">Credit Applied To</h3>
            <div className="space-y-3">
              {applications.map((app, index) => (
                <div key={app.InvoiceId} className="bg-indigo-50 p-4 rounded-md flex items-center gap-4">
                  <div className="flex-grow">
                    <div className="text-sm font-medium text-gray-900">
                      Invoice #{app.InvoiceNumber}
                    </div>
                    <div className="text-xs text-gray-500">
                      Balance due: {formatCurrencyStandalone(app.InvoiceBalanceDue)}
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
                <span className="font-medium text-gray-900">{formatCurrencyStandalone(totalToApply)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Remaining Balance:</span>
                <span className={`font-medium ${remainingBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrencyStandalone(remainingBalance)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning if over-applied */}
        {remainingBalance < 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-600">
              The total amount to apply exceeds the available credit balance. Please reduce the application amounts.
            </p>
          </div>
        )}

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
            {mutation.isPending ? 'Applying...' : 'Apply Credit'}
          </button>
        </div>
      </div>
    </div>
  );
}
