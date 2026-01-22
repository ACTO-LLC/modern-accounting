import { Search } from 'lucide-react';

export interface TransactionFiltersState {
  status: string;
  confidence: string;
  account: string;
  source: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface Account {
  Id: string;
  Name: string;
}

interface TransactionFiltersProps {
  filters: TransactionFiltersState;
  accounts: Account[];
  onFilterChange: (filters: TransactionFiltersState) => void;
}

export default function TransactionFilters({ filters, accounts, onFilterChange }: TransactionFiltersProps) {
  const updateFilter = <K extends keyof TransactionFiltersState>(
    key: K,
    value: TransactionFiltersState[K]
  ) => {
    onFilterChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4">
        {/* Search */}
        <div className="lg:col-span-2">
          <label htmlFor="searchFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              id="searchFilter"
              type="text"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Search description..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Status */}
        <div>
          <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Status
          </label>
          <select
            id="statusFilter"
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="Posted">Posted</option>
            <option value="Excluded">Excluded</option>
          </select>
        </div>

        {/* Confidence */}
        <div>
          <label htmlFor="confidenceFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Confidence
          </label>
          <select
            id="confidenceFilter"
            value={filters.confidence}
            onChange={(e) => updateFilter('confidence', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All</option>
            <option value="high">High (80%+)</option>
            <option value="medium">Medium (60-79%)</option>
            <option value="low">Low (&lt;60%)</option>
          </select>
        </div>

        {/* Account */}
        <div>
          <label htmlFor="accountFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Account
          </label>
          <select
            id="accountFilter"
            value={filters.account}
            onChange={(e) => updateFilter('account', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Accounts</option>
            {accounts.map(acc => (
              <option key={acc.Id} value={acc.Id}>{acc.Name}</option>
            ))}
          </select>
        </div>

        {/* Source */}
        <div>
          <label htmlFor="sourceFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Source
          </label>
          <select
            id="sourceFilter"
            value={filters.source}
            onChange={(e) => updateFilter('source', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Sources</option>
            <option value="BankFeed">Bank Feed</option>
            <option value="Import">CSV Import</option>
            <option value="Manual">Manual Entry</option>
          </select>
        </div>

        {/* Date Range */}
        <div className="lg:col-span-2">
          <label htmlFor="dateFromFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date Range
          </label>
          <div className="flex gap-2">
            <input
              id="dateFromFilter"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
              className="flex-1 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              id="dateToFilter"
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
              className="flex-1 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
