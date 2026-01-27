import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileUp, Upload, CheckSquare } from 'lucide-react';
import BankImport from './BankImport';
import ImportTransactions from './ImportTransactions';
import BankImportMatches from './BankImportMatches';

type TabType = 'bank-import' | 'csv-import' | 'review-matches';

const tabs: { id: TabType; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'bank-import', name: 'Bank Import', icon: FileUp },
  { id: 'csv-import', name: 'CSV Import', icon: Upload },
  { id: 'review-matches', name: 'Review Matches', icon: CheckSquare },
];

export default function UnifiedImport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') as TabType) || 'bank-import';
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl);

  // Sync state with URL when URL changes (e.g., from redirects)
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Import</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Import bank transactions, CSV files, and review matched transactions.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'bank-import' && <BankImport />}
      {activeTab === 'csv-import' && <ImportTransactions />}
      {activeTab === 'review-matches' && <BankImportMatches />}
    </div>
  );
}
