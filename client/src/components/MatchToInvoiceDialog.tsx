import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatCurrencyStandalone } from '../contexts/CurrencyContext';
import { formatDate } from '../lib/dateUtils';
import { createPaymentJournalEntry } from '../lib/autoPostingService';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import CustomerSelector from './CustomerSelector';

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName: string;
  TotalAmount: number;
  AmountPaid: number;
  BalanceDue: number;
  Status: string;
  DueDate: string;
}

interface MatchToInvoiceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bankTransaction: {
    Id: string;
    Amount: number;
    Description: string;
    TransactionDate: string;
    SourceAccountId: string;
  };
  onMatched: () => void;
}

export default function MatchToInvoiceDialog({
  isOpen,
  onClose,
  bankTransaction,
  onMatched,
}: MatchToInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const { settings } = useCompanySettings();
  const [customerId, setCustomerId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [amountToApply, setAmountToApply] = useState<number>(bankTransaction.Amount);

  // Fetch unpaid invoices for selected customer
  const { data: unpaidInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ['invoices-unpaid', customerId],
    queryFn: async (): Promise<Invoice[]> => {
      if (!customerId) return [];
      const response = await api.get(
        `/invoices?$filter=CustomerId eq ${customerId} and Status ne 'Paid' and Status ne 'Draft'&$orderby=DueDate`
      );
      return response.data.value;
    },
    enabled: !!customerId,
  });

  const selectedInvoice = unpaidInvoices?.find(inv => inv.Id === selectedInvoiceId);

  // When an invoice is selected, pre-fill the amount
  const handleSelectInvoice = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    const invoice = unpaidInvoices?.find(inv => inv.Id === invoiceId);
    if (invoice) {
      setAmountToApply(Math.min(bankTransaction.Amount, invoice.BalanceDue));
    }
  };

  // Match mutation — follows BankImportMatches acceptMatchMutation pattern
  const matchMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error('No invoice selected');

      // Generate sequential payment number (same pattern as NewPayment.tsx)
      let paymentNumber = `PMT-${Date.now()}`;
      try {
        const lastPaymentResp = await api.get<{ value: { PaymentNumber: string }[] }>(
          '/payments?$orderby=PaymentNumber desc&$top=1'
        );
        const lastNumber = lastPaymentResp.data.value?.[0]?.PaymentNumber;
        if (lastNumber) {
          const match = lastNumber.match(/PMT-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10) + 1;
            paymentNumber = `PMT-${num.toString().padStart(4, '0')}`;
          }
        } else {
          paymentNumber = 'PMT-0001';
        }
      } catch {
        // Fall back to timestamp-based number
      }

      // 1. Create payment record
      const paymentResponse = await api.post('/payments_write', {
        PaymentNumber: paymentNumber,
        CustomerId: customerId,
        PaymentDate: bankTransaction.TransactionDate,
        TotalAmount: amountToApply,
        PaymentMethod: 'Bank Transfer',
        DepositAccountId: bankTransaction.SourceAccountId,
        Memo: `Matched from bank deposit: ${bankTransaction.Description}`,
        Status: 'Completed',
      });

      const paymentId = paymentResponse.data.value?.[0]?.Id || paymentResponse.data.Id;
      if (!paymentId) {
        throw new Error('Failed to determine created payment ID');
      }

      // 2. Auto-post journal entry (Debit Bank, Credit AR) in simple mode
      if (settings.invoicePostingMode === 'simple') {
        try {
          await createPaymentJournalEntry(
            paymentId,
            amountToApply,
            paymentNumber,
            selectedInvoice.CustomerName || 'Customer',
            bankTransaction.TransactionDate,
            bankTransaction.SourceAccountId
          );
        } catch (postingError) {
          console.warn('Auto-posting failed, payment still created:', postingError);
        }
      }

      // 3. Create payment application
      await api.post('/paymentapplications', {
        PaymentId: paymentId,
        InvoiceId: selectedInvoiceId,
        AmountApplied: amountToApply,
      });

      // 4. Update invoice AmountPaid and Status
      const newAmountPaid = (selectedInvoice.AmountPaid || 0) + amountToApply;
      const newStatus = newAmountPaid >= selectedInvoice.TotalAmount ? 'Paid' : 'Partial';

      await api.patch(`/invoices_write/Id/${selectedInvoiceId}`, {
        AmountPaid: newAmountPaid,
        Status: newStatus,
      });

      // 5. Update bank transaction status
      await api.patch(`/banktransactions/Id/${bankTransaction.Id}`, {
        Status: 'Matched',
        MatchedPaymentId: paymentId,
        MatchedAt: new Date().toISOString(),
      });

      return { paymentId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unified-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Deposit matched to invoice successfully');
      onMatched();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(`Failed to match deposit: ${error.message}`);
    },
  });

  const handleClose = () => {
    setCustomerId('');
    setSelectedInvoiceId('');
    setAmountToApply(bankTransaction.Amount);
    onClose();
  };

  if (!isOpen) return null;

  const isExactMatch = (balanceDue: number) =>
    Math.abs(balanceDue - bankTransaction.Amount) < 0.01;

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl transform transition-all pointer-events-auto max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Match Deposit to Invoice
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4 overflow-y-auto space-y-5">
            {/* Transaction Summary */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
                Bank Deposit
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Date</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {formatDate(bankTransaction.TransactionDate)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Description</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={bankTransaction.Description}>
                    {bankTransaction.Description}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Amount</div>
                  <div className="text-lg font-semibold text-green-600">
                    {formatCurrencyStandalone(bankTransaction.Amount)}
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Customer
              </label>
              <CustomerSelector
                value={customerId}
                onChange={(id) => {
                  setCustomerId(id);
                  setSelectedInvoiceId('');
                }}
              />
            </div>

            {/* Unpaid Invoices */}
            {customerId && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Unpaid Invoices
                </h4>
                {isLoadingInvoices ? (
                  <div className="text-center py-6 text-gray-500 dark:text-gray-400">
                    Loading invoices...
                  </div>
                ) : !unpaidInvoices?.length ? (
                  <div className="text-center py-6 text-gray-500 bg-gray-50 dark:bg-gray-700 dark:text-gray-400 rounded-md">
                    No unpaid invoices found for this customer
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                      <thead className="bg-gray-100 dark:bg-gray-600">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 w-8"></th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Invoice #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Due Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Balance Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {unpaidInvoices.map(invoice => (
                          <tr
                            key={invoice.Id}
                            onClick={() => handleSelectInvoice(invoice.Id)}
                            className={`cursor-pointer transition-colors ${
                              selectedInvoiceId === invoice.Id
                                ? 'bg-indigo-50 dark:bg-indigo-900/30'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-600'
                            }`}
                          >
                            <td className="px-4 py-2">
                              <input
                                type="radio"
                                name="invoice-select"
                                checked={selectedInvoiceId === invoice.Id}
                                onChange={() => handleSelectInvoice(invoice.Id)}
                                className="h-4 w-4 text-indigo-600 border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                              {invoice.InvoiceNumber}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                              {formatDate(invoice.DueDate)}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 text-right">
                              {formatCurrencyStandalone(invoice.TotalAmount)}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-right">
                              <span className={isExactMatch(invoice.BalanceDue) ? 'text-green-600 font-bold' : 'text-gray-900 dark:text-gray-100'}>
                                {formatCurrencyStandalone(invoice.BalanceDue)}
                              </span>
                              {isExactMatch(invoice.BalanceDue) && (
                                <CheckCircle className="inline-block w-4 h-4 ml-1 text-green-600" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Amount to Apply */}
            {selectedInvoiceId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount to Apply
                </label>
                <div className="relative w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={Math.min(bankTransaction.Amount, selectedInvoice?.BalanceDue || bankTransaction.Amount)}
                    value={amountToApply}
                    onChange={(e) => setAmountToApply(parseFloat(e.target.value) || 0)}
                    className="pl-7 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-gray-700 dark:text-gray-100 p-2"
                  />
                </div>
                {selectedInvoice && amountToApply > selectedInvoice.BalanceDue && (
                  <p className="mt-1 text-sm text-red-600">
                    Amount exceeds invoice balance due ({formatCurrencyStandalone(selectedInvoice.BalanceDue)})
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => matchMutation.mutate()}
              disabled={
                !selectedInvoiceId ||
                !amountToApply ||
                amountToApply <= 0 ||
                (selectedInvoice ? amountToApply > selectedInvoice.BalanceDue : false) ||
                matchMutation.isPending
              }
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {matchMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                'Apply Payment'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
