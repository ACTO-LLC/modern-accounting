import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  Lock,
  ChevronDown,
  ChevronRight,
  Star,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { useOnboarding, Feature, FeatureStatus } from '../../contexts/OnboardingContext';

interface LearningChecklistProps {
  /** Show compact version for dashboard */
  compact?: boolean;
  /** Maximum items to show in compact mode */
  maxItems?: number;
  /** Show category grouping */
  showCategories?: boolean;
}

interface FeatureWithStatus extends Feature {
  status: FeatureStatus;
  isNext: boolean;
}

// Category display order and labels
const categoryOrder = ['foundation', 'transactions', 'accounting', 'advanced'];
const categoryLabels: Record<string, string> = {
  foundation: 'Foundation',
  transactions: 'Transactions',
  accounting: 'Accounting',
  advanced: 'Advanced'
};

function DifficultyIndicator({ difficulty }: { difficulty: number }) {
  return (
    <div className="flex gap-0.5" title={`Difficulty: ${difficulty}/5`}>
      {[1, 2, 3, 4, 5].map((level) => (
        <Star
          key={level}
          className={`h-3 w-3 ${
            level <= difficulty
              ? 'fill-amber-400 text-amber-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        />
      ))}
    </div>
  );
}

function StatusIcon({ status }: { status: FeatureStatus }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'in_progress':
      return <Circle className="h-5 w-5 text-blue-500 fill-blue-100" />;
    case 'unlocked':
      return <Circle className="h-5 w-5 text-indigo-500" />;
    case 'locked':
    default:
      return <Lock className="h-4 w-4 text-gray-400" />;
  }
}

function FeatureItem({
  feature,
  onNavigate,
  showDifficulty = true
}: {
  feature: FeatureWithStatus;
  onNavigate: (path: string) => void;
  showDifficulty?: boolean;
}) {
  const isClickable = feature.status !== 'locked';

  return (
    <button
      onClick={() => isClickable && onNavigate(feature.menuPath)}
      disabled={!isClickable}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
        isClickable
          ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
          : 'opacity-60 cursor-not-allowed'
      } ${
        feature.isNext
          ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-200 dark:ring-indigo-800'
          : ''
      }`}
    >
      <StatusIcon status={feature.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium truncate ${
            feature.status === 'locked'
              ? 'text-gray-500 dark:text-gray-400'
              : 'text-gray-900 dark:text-white'
          }`}>
            {feature.name}
          </span>
          {feature.isNext && (
            <span className="flex-shrink-0 text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
              Next
            </span>
          )}
        </div>
        {feature.status === 'locked' && feature.prerequisites.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
            Requires: {feature.prerequisites.join(', ')}
          </p>
        )}
      </div>
      {showDifficulty && <DifficultyIndicator difficulty={feature.difficulty} />}
      {isClickable && (
        <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
      )}
    </button>
  );
}

export default function LearningChecklist({
  compact = false,
  maxItems = 5,
  showCategories = true
}: LearningChecklistProps) {
  const navigate = useNavigate();
  const { features, status, getFeatureStatus, learningPath } = useOnboarding();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(categoryOrder)
  );

  // Don't show if user has completed onboarding or showing all features
  if (status?.onboardingCompleted || status?.showAllFeatures) {
    return null;
  }

  // Build feature list with status
  const featuresWithStatus: FeatureWithStatus[] = (learningPath.length > 0 ? learningPath : features)
    .map((f) => ({
      ...f,
      capabilities: 'capabilities' in f ? f.capabilities : [],
      spotlight: 'spotlight' in f ? f.spotlight : undefined,
      status: getFeatureStatus(f.key),
      isNext: status?.nextRecommended?.key === f.key
    }));

  // Calculate progress
  const completedCount = featuresWithStatus.filter(f => f.status === 'completed').length;
  const totalCount = featuresWithStatus.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Get next recommended if not set
  const nextFeature = featuresWithStatus.find(f => f.isNext) ||
    featuresWithStatus.find(f => f.status === 'unlocked');

  // For compact mode, show limited items prioritizing: next, in_progress, unlocked
  const displayFeatures = compact
    ? featuresWithStatus
        .filter(f => f.status !== 'locked')
        .sort((a, b) => {
          if (a.isNext) return -1;
          if (b.isNext) return 1;
          if (a.status === 'in_progress') return -1;
          if (b.status === 'in_progress') return 1;
          return 0;
        })
        .slice(0, maxItems)
    : featuresWithStatus;

  // Group by category
  const featuresByCategory = categoryOrder.reduce((acc, category) => {
    acc[category] = displayFeatures.filter(f => f.category === category);
    return acc;
  }, {} as Record<string, FeatureWithStatus[]>);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  if (compact) {
    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
            <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Continue Learning
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {completedCount} of {totalCount} modules completed
            </p>
          </div>
          <div className="relative h-12 w-12">
            <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-gray-200 dark:text-gray-700"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-indigo-600 dark:text-indigo-400"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${progressPercent}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-300">
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Feature list */}
        <div className="space-y-1">
          {displayFeatures.map((feature) => (
            <FeatureItem
              key={feature.key}
              feature={feature}
              onNavigate={handleNavigate}
              showDifficulty={false}
            />
          ))}
        </div>

        {/* View all link */}
        <button
          onClick={() => navigate('/settings')}
          className="mt-4 w-full text-center text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
        >
          View full learning path
        </button>
      </div>
    );
  }

  // Full view with categories
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Your Learning Journey
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {completedCount} of {totalCount} modules completed ({progressPercent}%)
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Feature list by category */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {showCategories ? (
          categoryOrder.map((category) => {
            const categoryFeatures = featuresByCategory[category];
            if (!categoryFeatures?.length) return null;

            const isExpanded = expandedCategories.has(category);
            const categoryCompleted = categoryFeatures.filter(f => f.status === 'completed').length;

            return (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {categoryLabels[category] || category}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {categoryCompleted}/{categoryFeatures.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1">
                    {categoryFeatures.map((feature) => (
                      <FeatureItem
                        key={feature.key}
                        feature={feature}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-4 space-y-1">
            {displayFeatures.map((feature) => (
              <FeatureItem
                key={feature.key}
                feature={feature}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Next recommended callout */}
      {nextFeature && (
        <div className="px-6 py-4 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-800">
          <p className="text-sm text-indigo-700 dark:text-indigo-300">
            <span className="font-medium">Up next:</span> {nextFeature.name} - {nextFeature.shortDescription}
          </p>
          <button
            onClick={() => handleNavigate(nextFeature.menuPath)}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            Start learning <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
