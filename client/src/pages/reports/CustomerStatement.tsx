import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, Download, Mail, Building2 } from 'lucide-react';
import { useCompanySettings } from '../../contexts/CompanySettingsContext';
import { DateRangePicker, formatCurrency, exportToCSV } from '../../components/reports';
import type { ReportColumn, ReportRow } from '../../components/reports';
import api from '../../lib/api';
import { formatDate, formatDateForOData, formatDateTime } from '../../lib/dateUtils';
import EmailStatementModal from '../../components/EmailStatementModal';

interface Customer {
  Id: string;
  Name: string;
  Email?: string;
  Phone?: string;
  Address?: string;
  City?: string;
  State?: string;
  Zip?: string;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  IssueDate: string;
  DueDate: string;
  TotalAmount: number;
  AmountPaid: number;
  Status: string;
}

interface Payment {
  Id: string;
  PaymentNumber: string;
  CustomerId: string;
  PaymentDate: string;
  TotalAmount: number;
  Status: string;
}

interface StatementLine {
  date: string;
  description: string;
  reference: string;
  charges: number;
  credits: number;
  balance: number;
}

interface AgingBucket {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
}

function createEmptyBucket(): AgingBucket {
  return {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
    total: 0,
  };
}

function getDefaultDateRange() {
  const today = new Date();
  const endDate = today.toISOString().split('T')[0];
  const startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1)
    .toISOString()
    .split('T')[0];
  return { startDate, endDate };
}

export default function CustomerStatement() {
  const { settings: company } = useCompanySettings();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const { startDate: defaultStart, endDate: defaultEnd } = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch all customers
  const { data: customers, isLoading: loadingCustomers, error: customersError } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>('/customers?$orderby=Name');
      return response.data.value;
    },
  });

  // Fetch selected customer details
  const { data: customer, error: customerError } = useQuery({
    queryKey: ['customer', selectedCustomerId],
    queryFn: async () => {
      const encodedId = encodeURIComponent(selectedCustomerId);
      const response = await api.get<{ value: Customer[] }>(
        `/customers?$filter=Id eq ${encodedId}`
      );
      return response.data.value[0];
    },
    enabled: !!selectedCustomerId,
  });

  // Fetch invoices for the selected customer within date range
  const { data: invoices, isLoading: loadingInvoices, error: invoicesError } = useQuery({
    queryKey: ['customer-invoices', selectedCustomerId, startDate, endDate],
    queryFn: async () => {
      const odataStart = formatDateForOData(startDate);
      const odataEnd = formatDateForOData(endDate, true);
      const response = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=CustomerId eq ${selectedCustomerId} and IssueDate ge ${odataStart} and IssueDate le ${odataEnd}&$orderby=IssueDate`
      );
      return response.data.value;
    },
    enabled: !!selectedCustomerId,
  });

  // Fetch payments for the selected customer within date range
  const { data: payments, isLoading: loadingPayments, error: paymentsError } = useQuery({
    queryKey: ['customer-payments', selectedCustomerId, startDate, endDate],
    queryFn: async () => {
      const odataStart = formatDateForOData(startDate);
      const odataEnd = formatDateForOData(endDate, true);
      const response = await api.get<{ value: Payment[] }>(
        `/payments?$filter=CustomerId eq ${selectedCustomerId} and PaymentDate ge ${odataStart} and PaymentDate le ${odataEnd} and Status eq 'Completed'&$orderby=PaymentDate`
      );
      return response.data.value;
    },
    enabled: !!selectedCustomerId,
  });

  // Fetch all outstanding invoices for aging calculation (regardless of date range)
  const { data: outstandingInvoices, error: outstandingError } = useQuery({
    queryKey: ['customer-outstanding-invoices', selectedCustomerId],
    queryFn: async () => {
      const encodedId = encodeURIComponent(selectedCustomerId);
      const response = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=CustomerId eq ${encodedId} and Status ne 'Paid' and Status ne 'Cancelled' and Status ne 'Voided'`
      );
      return response.data.value;
    },
    enabled: !!selectedCustomerId,
  });

  // Fetch invoices and payments before the start date to calculate beginning balance
  const { data: priorInvoices } = useQuery({
    queryKey: ['customer-prior-invoices', selectedCustomerId, startDate],
    queryFn: async () => {
      const odataStart = formatDateForOData(startDate);
      const response = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=CustomerId eq ${selectedCustomerId} and IssueDate lt ${odataStart} and Status ne 'Cancelled' and Status ne 'Voided'`
      );
      return response.data.value;
    },
    enabled: !!selectedCustomerId,
  });

  const { data: priorPayments } = useQuery({
    queryKey: ['customer-prior-payments', selectedCustomerId, startDate],
    queryFn: async () => {
      const odataStart = formatDateForOData(startDate);
      const response = await api.get<{ value: Payment[] }>(
        `/payments?$filter=CustomerId eq ${selectedCustomerId} and PaymentDate lt ${odataStart} and Status eq 'Completed'`
      );
      return response.data.value;
    },
    enabled: !!selectedCustomerId,
  });

  // Calculate statement data
  const statementData = useMemo(() => {
    if (!invoices && !payments) {
      return { lines: [], beginningBalance: 0, endingBalance: 0 };
    }

    // Calculate beginning balance from prior transactions
    let beginningBalance = 0;
    priorInvoices?.forEach((invoice: Invoice) => {
      if (invoice.Status !== 'Cancelled' && invoice.Status !== 'Voided') {
        beginningBalance += invoice.TotalAmount;
      }
    });
    priorPayments?.forEach((payment: Payment) => {
      beginningBalance -= payment.TotalAmount;
    });

    // Combine and sort all transactions by date
    const allTransactions: StatementLine[] = [];
    let runningBalance = beginningBalance;

    // Add invoices (charges)
    invoices?.forEach((invoice: Invoice) => {
      if (invoice.Status !== 'Cancelled' && invoice.Status !== 'Voided') {
        allTransactions.push({
          date: invoice.IssueDate,
          description: `Invoice #${invoice.InvoiceNumber}`,
          reference: invoice.InvoiceNumber,
          charges: invoice.TotalAmount,
          credits: 0,
          balance: 0, // Will be calculated after sorting
        });
      }
    });

    // Add payments (credits)
    payments?.forEach((payment: Payment) => {
      allTransactions.push({
        date: payment.PaymentDate,
        description: `Payment #${payment.PaymentNumber}`,
        reference: payment.PaymentNumber,
        charges: 0,
        credits: payment.TotalAmount,
        balance: 0, // Will be calculated after sorting
      });
    });

    // Sort by date
    allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    allTransactions.forEach((line) => {
      runningBalance += line.charges - line.credits;
      line.balance = runningBalance;
    });

    return {
      lines: allTransactions,
      beginningBalance,
      endingBalance: runningBalance,
    };
  }, [invoices, payments, priorInvoices, priorPayments]);

  // Calculate aging buckets
  const agingData = useMemo(() => {
    if (!outstandingInvoices) return createEmptyBucket();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const aging = createEmptyBucket();

    outstandingInvoices.forEach((invoice: Invoice) => {
      const balanceDue = invoice.TotalAmount - (invoice.AmountPaid || 0);
      if (balanceDue <= 0) return;

      // Parse the due date more robustly
      const dueDateStr = invoice.DueDate.split('T')[0]; // Get YYYY-MM-DD part
      const dueDate = new Date(dueDateStr + 'T00:00:00'); // Parse as local date
      
      // Ensure valid date
      if (isNaN(dueDate.getTime())) {
        console.warn(`Invalid due date for invoice: ${invoice.InvoiceNumber}`);
        return;
      }

      const daysPastDue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysPastDue <= 0) {
        aging.current += balanceDue;
      } else if (daysPastDue <= 30) {
        aging.days1to30 += balanceDue;
      } else if (daysPastDue <= 60) {
        aging.days31to60 += balanceDue;
      } else if (daysPastDue <= 90) {
        aging.days61to90 += balanceDue;
      } else {
        aging.days90plus += balanceDue;
      }

      aging.total += balanceDue;
    });

    return aging;
  }, [outstandingInvoices]);

  // Prepare data for CSV export
  const columns: ReportColumn[] = [
    { key: 'date', header: 'Date', align: 'left' },
    { key: 'description', header: 'Description', align: 'left' },
    { key: 'reference', header: 'Reference', align: 'left' },
    { key: 'charges', header: 'Charges', align: 'right', format: (v) => (v ? formatCurrency(v) : '-') },
    { key: 'credits', header: 'Credits', align: 'right', format: (v) => (v ? formatCurrency(v) : '-') },
    { key: 'balance', header: 'Balance', align: 'right', format: (v) => formatCurrency(v) },
  ];

  const tableData: ReportRow[] = statementData.lines.map((line: StatementLine) => ({
    date: formatDate(line.date),
    description: line.description,
    reference: line.reference,
    charges: line.charges || undefined,
    credits: line.credits || undefined,
    balance: line.balance,
  }));

  const handleExportCSV = () => {
    if (!customer) return;
    const fileName = `statement-${customer.Name.replace(/\s+/g, '-')}-${startDate}-to-${endDate}`;
    exportToCSV(fileName, columns, tableData);
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = customer
      ? `Statement-${customer.Name.replace(/\s+/g, '-')}-${endDate}`
      : 'Customer-Statement';
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  const isLoading = loadingCustomers || loadingInvoices || loadingPayments;
  const hasError = customersError || customerError || invoicesError || paymentsError || outstandingError;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Navigation and Controls - Hidden when printing */}
      <div className="mb-4 print:hidden">
        <Link
          to="/reports"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Reports
        </Link>
      </div>

      {/* Error Display */}
      {hasError && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 print:hidden">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading statement data</h3>
              <div className="mt-2 text-sm text-red-700">
                {customersError && <p>Failed to load customers: {String(customersError)}</p>}
                {customerError && <p>Failed to load customer details: {String(customerError)}</p>}
                {invoicesError && <p>Failed to load invoices: {String(invoicesError)}</p>}
                {paymentsError && <p>Failed to load payments: {String(paymentsError)}</p>}
                {outstandingError && <p>Failed to load outstanding invoices: {String(outstandingError)}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mb-6 bg-white shadow rounded-lg p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="customer" className="block text-sm font-medium text-gray-700 mb-1">
              Customer
            </label>
            <select
              id="customer"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            >
              <option value="">Select a customer</option>
              {customers?.map((c) => (
                <option key={c.Id} value={c.Id}>
                  {c.Name}
                </option>
              ))}
            </select>
          </div>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              disabled={!selectedCustomerId}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              onClick={handleExportCSV}
              disabled={!selectedCustomerId}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              disabled={!selectedCustomerId || !customer?.Email}
              title={!customer?.Email ? 'Customer has no email address' : undefined}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
          </div>
        </div>
      </div>

      {!selectedCustomerId ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          Select a customer to generate a statement
        </div>
      ) : isLoading ? (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          Loading statement data...
        </div>
      ) : (
        /* Statement Document */
        <div ref={printRef} className="bg-white shadow-lg rounded-lg print:shadow-none print:rounded-none">
          <div className="p-8 print:p-6">
            {/* Header */}
            <div className="flex justify-between items-start mb-8 print:mb-6">
              {/* Company Info */}
              <div>
                {company.logoUrl ? (
                  <img
                    src={company.logoUrl}
                    alt={company.name}
                    className="h-16 max-w-[200px] object-contain mb-4 print:h-12"
                  />
                ) : (
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-8 w-8 text-indigo-600 print:h-6 print:w-6" />
                    <span className="text-2xl font-bold text-gray-900 print:text-xl">
                      {company.name}
                    </span>
                  </div>
                )}
                {company.address && (
                  <div className="text-sm text-gray-600 print:text-xs">
                    <p>{company.address}</p>
                    {(company.city || company.state || company.zip) && (
                      <p>
                        {[company.city, company.state, company.zip].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {company.phone && <p>{company.phone}</p>}
                    {company.email && <p>{company.email}</p>}
                  </div>
                )}
              </div>

              {/* Statement Title */}
              <div className="text-right">
                <h2 className="text-3xl font-bold text-gray-900 print:text-2xl">STATEMENT</h2>
                <p className="text-sm text-gray-600 mt-2 print:text-xs">
                  {formatDate(startDate)} - {formatDate(endDate)}
                </p>
                <p className="text-sm text-gray-500 mt-1 print:text-xs">
                  Statement Date: {formatDate(new Date().toISOString())}
                </p>
              </div>
            </div>

            {/* Bill To */}
            <div className="mb-8 print:mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 print:text-xs">
                Bill To
              </h3>
              {customer ? (
                <div className="text-sm text-gray-900 print:text-xs">
                  <p className="font-semibold">{customer.Name}</p>
                  {customer.Address && <p>{customer.Address}</p>}
                  {(customer.City || customer.State || customer.Zip) && (
                    <p>
                      {[customer.City, customer.State, customer.Zip].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {customer.Email && <p>{customer.Email}</p>}
                  {customer.Phone && <p>{customer.Phone}</p>}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Loading...</p>
              )}
            </div>

            {/* Transactions Table */}
            <table className="w-full mb-8 print:mb-6">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2">
                    Date
                  </th>
                  <th className="text-left py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2">
                    Description
                  </th>
                  <th className="text-right py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2 w-28">
                    Charges
                  </th>
                  <th className="text-right py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2 w-28">
                    Credits
                  </th>
                  <th className="text-right py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2 w-32">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Beginning Balance Row */}
                {statementData.beginningBalance !== 0 && (
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <td className="py-3 text-sm text-gray-900 print:text-xs print:py-2">
                      {formatDate(startDate)}
                    </td>
                    <td className="py-3 text-sm font-medium text-gray-900 print:text-xs print:py-2">
                      Beginning Balance
                    </td>
                    <td className="py-3 text-sm text-gray-900 text-right print:text-xs print:py-2">
                      -
                    </td>
                    <td className="py-3 text-sm text-gray-900 text-right print:text-xs print:py-2">
                      -
                    </td>
                    <td className="py-3 text-sm text-gray-900 text-right font-medium print:text-xs print:py-2">
                      {formatCurrency(statementData.beginningBalance)}
                    </td>
                  </tr>
                )}
                {statementData.lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No transactions found for this period
                    </td>
                  </tr>
                ) : (
                  statementData.lines.map((line, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-3 text-sm text-gray-900 print:text-xs print:py-2">
                        {formatDate(line.date)}
                      </td>
                      <td className="py-3 text-sm text-gray-900 print:text-xs print:py-2">
                        {line.description}
                      </td>
                      <td className="py-3 text-sm text-gray-900 text-right print:text-xs print:py-2">
                        {line.charges > 0 ? formatCurrency(line.charges) : '-'}
                      </td>
                      <td className="py-3 text-sm text-gray-900 text-right print:text-xs print:py-2">
                        {line.credits > 0 ? formatCurrency(line.credits) : '-'}
                      </td>
                      <td className="py-3 text-sm text-gray-900 text-right font-medium print:text-xs print:py-2">
                        {formatCurrency(line.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Summary */}
            <div className="flex justify-between items-start mb-8 print:mb-6">
              {/* Aging Summary */}
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 print:text-xs">
                  Aging Summary
                </h3>
                <div className="grid grid-cols-5 gap-2 max-w-lg">
                  <div className="bg-gray-50 rounded p-2 text-center">
                    <div className="text-xs text-gray-500 uppercase">Current</div>
                    <div className="text-sm font-semibold text-gray-900 print:text-xs">
                      {formatCurrency(agingData.current)}
                    </div>
                  </div>
                  <div className="bg-yellow-50 rounded p-2 text-center">
                    <div className="text-xs text-gray-500 uppercase">1-30</div>
                    <div className="text-sm font-semibold text-yellow-600 print:text-xs">
                      {formatCurrency(agingData.days1to30)}
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded p-2 text-center">
                    <div className="text-xs text-gray-500 uppercase">31-60</div>
                    <div className="text-sm font-semibold text-orange-600 print:text-xs">
                      {formatCurrency(agingData.days31to60)}
                    </div>
                  </div>
                  <div className="bg-red-50 rounded p-2 text-center">
                    <div className="text-xs text-gray-500 uppercase">61-90</div>
                    <div className="text-sm font-semibold text-red-500 print:text-xs">
                      {formatCurrency(agingData.days61to90)}
                    </div>
                  </div>
                  <div className="bg-red-100 rounded p-2 text-center">
                    <div className="text-xs text-gray-500 uppercase">90+</div>
                    <div className="text-sm font-semibold text-red-700 print:text-xs">
                      {formatCurrency(agingData.days90plus)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Balance Due */}
              <div className="text-right">
                <div className="inline-block bg-indigo-50 rounded-lg p-4">
                  <div className="text-sm text-indigo-600 uppercase font-medium">
                    Total Amount Due
                  </div>
                  <div className="text-2xl font-bold text-indigo-700 print:text-xl">
                    {formatCurrency(agingData.total)}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-8 border-t border-gray-200 print:mt-8 print:pt-4">
              <p className="text-sm text-gray-500 text-center print:text-xs">
                Please remit payment by the due date. Thank you for your business!
              </p>
              {company.website && (
                <p className="text-sm text-gray-400 text-center mt-1 print:text-xs">
                  {company.website}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timestamp - Hidden when printing */}
      {selectedCustomerId && !isLoading && (
        <div className="mt-6 text-center text-sm text-gray-500 print:hidden">
          <p>
            Generated on{' '}
            {formatDateTime(new Date())}
          </p>
        </div>
      )}

      {/* Email Statement Modal */}
      {customer && (
        <EmailStatementModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          customer={customer}
          startDate={startDate}
          endDate={endDate}
          totalDue={agingData.total}
        />
      )}
    </div>
  );
}
