import { ChevronRight, Home } from 'lucide-react';
import { BreadcrumbItem, EntityType } from './types';

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

const entityLabels: Record<EntityType, string> = {
  vendor: 'Vendors',
  customer: 'Customers',
  purchaseorder: 'Purchase Orders',
  bill: 'Bills',
  invoice: 'Invoices',
  estimate: 'Estimates',
  purchaseorderline: 'Line Items',
  billline: 'Line Items',
  invoiceline: 'Line Items',
  estimateline: 'Line Items',
};

export default function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="flex items-center space-x-2 text-sm mb-6" aria-label="Breadcrumb">
      <button
        onClick={() => onNavigate(-1)}
        className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors"
        title="Back to list"
      >
        <Home className="w-4 h-4" />
      </button>

      {items.map((item, index) => (
        <div key={`${item.entityType}-${item.id}`} className="flex items-center">
          <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
          {index === items.length - 1 ? (
            <span className="font-medium text-gray-900">
              {item.label}
            </span>
          ) : (
            <button
              onClick={() => onNavigate(index)}
              className="text-gray-500 hover:text-indigo-600 hover:underline transition-colors"
            >
              {item.label}
            </button>
          )}
        </div>
      ))}

      {items.length > 0 && (
        <span className="text-gray-400 text-xs ml-2">
          ({entityLabels[items[items.length - 1].entityType]})
        </span>
      )}
    </nav>
  );
}
