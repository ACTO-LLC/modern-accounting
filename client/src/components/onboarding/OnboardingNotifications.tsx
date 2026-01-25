import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useOnboarding } from '../../contexts/OnboardingContext';

// Feature metadata for notifications
const featureInfo: Record<string, { name: string; path: string; description: string }> = {
  customers: { name: 'Customers', path: '/customers', description: 'Manage your customer contacts' },
  vendors: { name: 'Vendors', path: '/vendors', description: 'Track your suppliers and vendors' },
  products_services: { name: 'Products & Services', path: '/products-services', description: 'Set up what you sell' },
  invoices: { name: 'Invoices', path: '/invoices', description: 'Bill your customers' },
  estimates: { name: 'Estimates', path: '/estimates', description: 'Create quotes and proposals' },
  bills: { name: 'Bills', path: '/bills', description: 'Track what you owe' },
  expenses: { name: 'Expenses', path: '/expenses', description: 'Record business spending' },
  chart_of_accounts: { name: 'Chart of Accounts', path: '/accounts', description: 'Your accounting categories' },
  journal_entries: { name: 'Journal Entries', path: '/journal-entries', description: 'Core accounting entries' },
  reports: { name: 'Reports', path: '/reports', description: 'See your financial big picture' },
};

export default function OnboardingNotifications() {
  const navigate = useNavigate();
  const { status } = useOnboarding();
  const previousUnlockedRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  useEffect(() => {
    // Skip on initial load to avoid showing notifications for already unlocked features
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      if (status?.unlockedFeatures) {
        previousUnlockedRef.current = new Set(status.unlockedFeatures);
      }
      return;
    }

    // Skip if showAllFeatures is true (user skipped onboarding)
    if (status?.showAllFeatures) {
      return;
    }

    // Check for newly unlocked features
    if (status?.unlockedFeatures) {
      const currentUnlocked = new Set(status.unlockedFeatures);
      const previousUnlocked = previousUnlockedRef.current;

      // Find newly unlocked features
      const newlyUnlocked = [...currentUnlocked].filter(f => !previousUnlocked.has(f));

      // Show toast for each newly unlocked feature
      newlyUnlocked.forEach(featureKey => {
        const info = featureInfo[featureKey];
        if (info) {
          toast.custom(
            (t) => (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      New Feature Unlocked!
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                      {info.name}: {info.description}
                    </div>
                    <button
                      onClick={() => {
                        toast.dismiss(t);
                        navigate(info.path);
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                    >
                      Explore now
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ),
            {
              duration: 8000,
              position: 'top-right',
            }
          );
        }
      });

      // Update previous state
      previousUnlockedRef.current = currentUnlocked;
    }
  }, [status?.unlockedFeatures, status?.showAllFeatures, navigate]);

  // Also show notification when a feature is completed
  const previousCompletedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status?.showAllFeatures || initialLoadRef.current) {
      if (status?.completedFeatures) {
        previousCompletedRef.current = new Set(status.completedFeatures);
      }
      return;
    }

    if (status?.completedFeatures) {
      const currentCompleted = new Set(status.completedFeatures);
      const previousCompleted = previousCompletedRef.current;

      // Find newly completed features
      const newlyCompleted = [...currentCompleted].filter(f => !previousCompleted.has(f));

      // Show congratulations toast for completed features
      newlyCompleted.forEach(featureKey => {
        const info = featureInfo[featureKey];
        if (info) {
          toast.success(
            <div>
              <div className="font-semibold">Module Completed!</div>
              <div className="text-sm opacity-90">
                You've mastered {info.name}
              </div>
            </div>,
            {
              duration: 5000,
              position: 'top-right',
            }
          );
        }
      });

      // Update previous state
      previousCompletedRef.current = currentCompleted;
    }
  }, [status?.completedFeatures, status?.showAllFeatures]);

  // This component doesn't render anything - it just manages notifications
  return null;
}
