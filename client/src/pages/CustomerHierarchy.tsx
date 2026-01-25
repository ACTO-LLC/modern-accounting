import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { formatGuidForOData } from '../lib/validation';
import { formatDate } from '../lib/dateUtils';
import {
  HierarchyView,
  HierarchyLevel,
  EntityCardData,
  Customer,
  Invoice,
  Estimate,
  InvoiceLine,
  EstimateLine,
} from '../components/hierarchy';

type DocumentType = 'invoices' | 'estimates';

const statusVariants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  Draft: 'neutral',
  Sent: 'info',
  Paid: 'success',
  Overdue: 'error',
  Partial: 'warning',
  Accepted: 'success',
  Rejected: 'error',
  Expired: 'warning',
  Converted: 'info',
};

export default function CustomerHierarchy() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [currentDocumentType, setCurrentDocumentType] = useState<DocumentType | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);

  // Redirect if no id
  useEffect(() => {
    if (!id) {
      navigate('/customers');
    }
  }, [id, navigate]);

  // Fetch customer details
  const { data: customer, isLoading: customerLoading, isError: customerError } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => {
      const response = await api.get<Customer>(`/customers/Id/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Fetch invoices for this customer
  const { data: invoices, isLoading: invoicesLoading, isError: invoicesError } = useQuery({
    queryKey: ['customer-invoices', id],
    queryFn: async () => {
      const response = await api.get<{ value: Invoice[] }>(
        `/invoices?$filter=CustomerId eq ${formatGuidForOData(id!, 'CustomerId')}`
      );
      return response.data.value;
    },
    enabled: !!id && currentLevel === 0,
  });

  // Fetch estimates for this customer
  const { data: estimates, isLoading: estimatesLoading, isError: estimatesError } = useQuery({
    queryKey: ['customer-estimates', id],
    queryFn: async () => {
      const response = await api.get<{ value: Estimate[] }>(
        `/estimates?$filter=CustomerId eq ${formatGuidForOData(id!, 'CustomerId')}`
      );
      return response.data.value;
    },
    enabled: !!id && currentLevel === 0,
  });

  // Fetch invoice lines
  const { data: invoiceLines, isLoading: invoiceLinesLoading, isError: invoiceLinesError } = useQuery({
    queryKey: ['invoice-lines', selectedDocumentId],
    queryFn: async () => {
      const response = await api.get<{ value: InvoiceLine[] }>(
        `/invoicelines?$filter=InvoiceId eq ${formatGuidForOData(selectedDocumentId!, 'InvoiceId')}`
      );
      return response.data.value;
    },
    enabled: !!selectedDocumentId && currentDocumentType === 'invoices',
  });

  // Fetch estimate lines
  const { data: estimateLines, isLoading: estimateLinesLoading, isError: estimateLinesError } = useQuery({
    queryKey: ['estimate-lines', selectedDocumentId],
    queryFn: async () => {
      const response = await api.get<{ value: EstimateLine[] }>(
        `/estimatelines?$filter=EstimateId eq ${formatGuidForOData(selectedDocumentId!, 'EstimateId')}`
      );
      return response.data.value;
    },
    enabled: !!selectedDocumentId && currentDocumentType === 'estimates',
  });

  // Convert invoices and estimates to card data for level 0
  const documentCards: EntityCardData[] = [
    ...(invoices || []).map((invoice): EntityCardData => ({
      id: invoice.Id,
      title: `Invoice #${invoice.InvoiceNumber}`,
      subtitle: formatDate(invoice.IssueDate),
      entityType: 'invoice',
      status: {
        label: invoice.Status,
        variant: statusVariants[invoice.Status] || 'neutral',
      },
      amount: invoice.TotalAmount,
      metadata: [
        { label: 'Due Date', value: formatDate(invoice.DueDate) },
      ],
    })),
    ...(estimates || []).map((estimate): EntityCardData => ({
      id: estimate.Id,
      title: `Estimate #${estimate.EstimateNumber}`,
      subtitle: formatDate(estimate.IssueDate),
      entityType: 'estimate',
      status: {
        label: estimate.Status,
        variant: statusVariants[estimate.Status] || 'neutral',
      },
      amount: estimate.TotalAmount,
      metadata: [
        { label: 'Expires', value: formatDate(estimate.ExpirationDate) || 'No expiration' },
      ],
    })),
  ];

  // Convert line items to card data for level 1
  const lineItemCards: EntityCardData[] = currentDocumentType === 'invoices'
    ? (invoiceLines || []).map((line): EntityCardData => ({
        id: line.Id,
        title: line.Description || 'Line Item',
        subtitle: line.ProductServiceName || undefined,
        entityType: 'invoiceline',
        amount: (line.Quantity || 0) * (line.UnitPrice || 0),
        metadata: [
          { label: 'Quantity', value: String(line.Quantity || 0) },
          { label: 'Unit Price', value: `$${(line.UnitPrice || 0).toFixed(2)}` },
        ],
      }))
    : (estimateLines || []).map((line): EntityCardData => ({
        id: line.Id,
        title: line.Description || 'Line Item',
        entityType: 'estimateline',
        amount: line.Amount || (line.Quantity || 0) * (line.UnitPrice || 0),
        metadata: [
          { label: 'Quantity', value: String(line.Quantity || 0) },
          { label: 'Unit Price', value: `$${(line.UnitPrice || 0).toFixed(2)}` },
        ],
      }));

  const handleLevelChange = useCallback((level: number, selectedIds: string[]) => {
    setCurrentLevel(level);

    if (level === 0) {
      setSelectedDocumentId(null);
      setCurrentDocumentType(null);
    } else if (level === 1 && selectedIds.length > 0) {
      const selectedId = selectedIds[0];
      setSelectedDocumentId(selectedId);

      // Determine document type
      const isInvoice = invoices?.some(inv => inv.Id === selectedId);
      setCurrentDocumentType(isInvoice ? 'invoices' : 'estimates');
    }
  }, [invoices]);

  // Build hierarchy levels
  const levels: HierarchyLevel[] = [
    {
      entityType: 'invoice', // Combined view of Invoices and Estimates
      items: documentCards,
      loading: invoicesLoading || estimatesLoading,
      emptyMessage: invoicesError || estimatesError
        ? 'Error loading invoices or estimates. Please try again.'
        : 'No invoices or estimates found for this customer',
    },
    {
      entityType: currentDocumentType === 'invoices' ? 'invoiceline' : 'estimateline',
      items: lineItemCards,
      loading: invoiceLinesLoading || estimateLinesLoading,
      emptyMessage: invoiceLinesError || estimateLinesError
        ? 'Error loading line items. Please try again.'
        : 'No line items found',
    },
  ];

  if (customerLoading || !customer) {
    return (
      <div className="max-w-7xl mx-auto">
        {customerError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-red-800 font-semibold mb-2">Error Loading Customer</h2>
            <p className="text-red-600 text-sm">
              Failed to load customer details. Please try again or contact support if the problem persists.
            </p>
          </div>
        ) : (
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <HierarchyView
      rootEntityType="customer"
      rootEntity={{
        id: customer.Id,
        name: customer.Name,
      }}
      levels={levels}
      onLevelChange={handleLevelChange}
    />
  );
}
