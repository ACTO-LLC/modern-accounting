import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Edit, Building2, Mail } from 'lucide-react';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import api from '../lib/api';
import { formatGuidForOData } from '../lib/validation';
import EmailInvoiceModal from '../components/EmailInvoiceModal';
import EmailHistory from '../components/EmailHistory';

interface InvoiceLine {
  Id: string;
  Description: string;
  Quantity: number;
  UnitPrice: number;
  Amount: number;
}

interface Invoice {
  Id: string;
  InvoiceNumber: string;
  CustomerId: string;
  CustomerName?: string;
  IssueDate: string;
  DueDate: string;
  TotalAmount: number;
  Status: 'Draft' | 'Sent' | 'Paid' | 'Overdue';
  Lines: InvoiceLine[];
}

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

export default function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { settings: company } = useCompanySettings();
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailHistoryRefresh, setEmailHistoryRefresh] = useState(0);

  // Fetch invoice
  const { data: invoice, isLoading: invoiceLoading } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=Id eq ${formatGuidForOData(id!, 'Invoice Id')}`
      );
      return response.data.value?.[0];
    },
    enabled: !!id,
  });

  // Fetch invoice lines
  const { data: lines } = useQuery<InvoiceLine[]>({
    queryKey: ['invoiceLines', id],
    queryFn: async () => {
      const response = await api.get<{ value: InvoiceLine[] }>(
        `/invoicelines?$filter=InvoiceId eq ${formatGuidForOData(id!, 'Invoice Id')}`
      );
      return response.data.value || [];
    },
    enabled: !!id,
  });

  // Fetch customer
  const { data: customer } = useQuery<Customer>({
    queryKey: ['customer', invoice?.CustomerId],
    queryFn: async () => {
      const response = await api.get<{ value: Customer[] }>(
        `/customers?$filter=Id eq ${formatGuidForOData(invoice!.CustomerId, 'Customer Id')}`
      );
      return response.data.value?.[0];
    },
    enabled: !!invoice?.CustomerId,
  });

  const handlePrint = () => {
    // Set document title to control print filename
    const originalTitle = document.title;
    const issueDate = invoice ? new Date(invoice.IssueDate).toISOString().split('T')[0] : '';
    document.title = `invoice-${invoice?.InvoiceNumber || 'unknown'}-${issueDate}`;

    window.print();

    // Restore original title after print dialog
    setTimeout(() => {
      document.title = originalTitle;
    }, 100);
  };

  if (invoiceLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Invoice not found</p>
        <Link to="/invoices" className="text-indigo-600 hover:text-indigo-800 mt-2 inline-block">
          Back to Invoices
        </Link>
      </div>
    );
  }

  const statusColors = {
    Draft: 'bg-gray-100 text-gray-800',
    Sent: 'bg-blue-100 text-blue-800',
    Paid: 'bg-green-100 text-green-800',
    Overdue: 'bg-red-100 text-red-800',
  };

  const invoiceLines = lines || invoice.Lines || [];
  const subtotal = invoiceLines.reduce((sum, line) => sum + (line.Quantity * line.UnitPrice), 0);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action Bar - Hidden when printing */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/invoices')}
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Invoice {invoice.InvoiceNumber}</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[invoice.Status]}`}>
            {invoice.Status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEmailModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Mail className="h-4 w-4" />
            Email
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <Link
            to={`/invoices/${id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <Edit className="h-4 w-4" />
            Edit
          </Link>
        </div>
      </div>

      {/* Invoice Document */}
      <div className="bg-white shadow-lg rounded-lg print:shadow-none print:rounded-none">
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
                  <span className="text-2xl font-bold text-gray-900 print:text-xl">{company.name}</span>
                </div>
              )}
              {company.address && (
                <div className="text-sm text-gray-600 print:text-xs">
                  <p>{company.address}</p>
                  {(company.city || company.state || company.zip) && (
                    <p>{[company.city, company.state, company.zip].filter(Boolean).join(', ')}</p>
                  )}
                  {company.phone && <p>{company.phone}</p>}
                  {company.email && <p>{company.email}</p>}
                </div>
              )}
            </div>

            {/* Invoice Title */}
            <div className="text-right">
              <h2 className="text-3xl font-bold text-gray-900 print:text-2xl">INVOICE</h2>
              <p className="text-lg text-gray-600 mt-1 print:text-base">#{invoice.InvoiceNumber}</p>
            </div>
          </div>

          {/* Bill To & Invoice Details */}
          <div className="grid grid-cols-2 gap-8 mb-8 print:mb-6 print:gap-4">
            {/* Bill To */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 print:text-xs">
                Bill To
              </h3>
              {customer ? (
                <div className="text-sm text-gray-900 print:text-xs">
                  <p className="font-semibold">{customer.Name}</p>
                  {customer.Address && <p>{customer.Address}</p>}
                  {(customer.City || customer.State || customer.Zip) && (
                    <p>{[customer.City, customer.State, customer.Zip].filter(Boolean).join(', ')}</p>
                  )}
                  {customer.Email && <p>{customer.Email}</p>}
                  {customer.Phone && <p>{customer.Phone}</p>}
                </div>
              ) : (
                <p className="text-sm text-gray-500 print:text-xs">Loading customer...</p>
              )}
            </div>

            {/* Invoice Details */}
            <div className="text-right">
              <div className="inline-block text-left">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm print:text-xs">
                  <span className="text-gray-500">Invoice Date:</span>
                  <span className="text-gray-900 font-medium">
                    {new Date(invoice.IssueDate).toLocaleDateString()}
                  </span>
                  <span className="text-gray-500">Due Date:</span>
                  <span className="text-gray-900 font-medium">
                    {new Date(invoice.DueDate).toLocaleDateString()}
                  </span>
                  <span className="text-gray-500">Status:</span>
                  <span className={`font-medium ${invoice.Status === 'Paid' ? 'text-green-600' : invoice.Status === 'Overdue' ? 'text-red-600' : 'text-gray-900'}`}>
                    {invoice.Status}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <table className="w-full mb-8 print:mb-6">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2">
                  Description
                </th>
                <th className="text-right py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2 w-24">
                  Qty
                </th>
                <th className="text-right py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2 w-32">
                  Unit Price
                </th>
                <th className="text-right py-3 text-sm font-semibold text-gray-600 print:text-xs print:py-2 w-32">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoiceLines.map((line, index) => (
                <tr key={line.Id || index} className="border-b border-gray-100">
                  <td className="py-3 text-sm text-gray-900 print:text-xs print:py-2">
                    {line.Description}
                  </td>
                  <td className="py-3 text-sm text-gray-900 text-right print:text-xs print:py-2">
                    {line.Quantity}
                  </td>
                  <td className="py-3 text-sm text-gray-900 text-right print:text-xs print:py-2">
                    ${line.UnitPrice.toFixed(2)}
                  </td>
                  <td className="py-3 text-sm text-gray-900 text-right print:text-xs print:py-2">
                    ${(line.Quantity * line.UnitPrice).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64">
              <div className="flex justify-between py-2 text-sm print:text-xs">
                <span className="text-gray-600">Subtotal:</span>
                <span className="text-gray-900 font-medium">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-gray-900 text-lg font-bold print:text-base print:py-2">
                <span>Total:</span>
                <span>${invoice.TotalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-gray-200 print:mt-8 print:pt-4">
            <p className="text-sm text-gray-500 text-center print:text-xs">
              Thank you for your business!
            </p>
            {company.website && (
              <p className="text-sm text-gray-400 text-center mt-1 print:text-xs">
                {company.website}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Email History - Hidden when printing */}
      <div className="mt-6 bg-white shadow-lg rounded-lg p-6 print:hidden">
        <EmailHistory
          invoiceId={invoice.Id}
          refreshTrigger={emailHistoryRefresh}
        />
      </div>

      {/* Email Invoice Modal */}
      <EmailInvoiceModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        invoice={invoice}
        customer={customer || null}
        onEmailSent={() => setEmailHistoryRefresh(prev => prev + 1)}
      />
    </div>
  );
}
