import { useState } from 'react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { RefreshCw, CheckCircle, BookOpen, Eye } from 'lucide-react';
import { resetSpotlights } from './SpotlightManager';

export default function OnboardingSettings() {
  const { status, resetOnboarding, showAllFeatures, learningPath, isLoading } = useOnboarding();
  const [isResetting, setIsResetting] = useState(false);
  const [isShowingAll, setIsShowingAll] = useState(false);

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset your onboarding progress? This will hide features until you complete the onboarding again.')) {
      return;
    }

    try {
      setIsResetting(true);
      // Also reset spotlight tracking and feature tours
      localStorage.removeItem('modern-accounting:seen-feature-tours');
      localStorage.removeItem('modern-accounting:milton-feature-help');
      resetSpotlights();
      await resetOnboarding();
    } catch (error) {
      console.error('Failed to reset onboarding:', error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleShowAll = async () => {
    try {
      setIsShowingAll(true);
      await showAllFeatures();
    } catch (error) {
      console.error('Failed to show all features:', error);
    } finally {
      setIsShowingAll(false);
    }
  };

  if (isLoading || !status) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const completedCount = status.completedFeatures.length;
  const totalFeatures = learningPath.length || 10;
  const progressPercent = Math.round((completedCount / totalFeatures) * 100);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Onboarding & Learning
        </h3>
      </div>

      {/* Progress */}
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Learning Progress</span>
          <span className="text-gray-900 dark:text-white font-medium">
            {completedCount} of {totalFeatures} modules
          </span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Status Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div className="text-gray-500 dark:text-gray-400">Experience Level</div>
          <div className="font-medium text-gray-900 dark:text-white capitalize">
            {status.experienceLevel || 'Not set'}
          </div>
        </div>
        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div className="text-gray-500 dark:text-gray-400">Primary Goal</div>
          <div className="font-medium text-gray-900 dark:text-white capitalize">
            {status.primaryGoal?.replace('_', ' ') || 'Not set'}
          </div>
        </div>
      </div>

      {/* Feature Access */}
      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center gap-2">
          {status.showAllFeatures ? (
            <>
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-700 dark:text-green-400">All features unlocked</span>
            </>
          ) : (
            <>
              <Eye className="w-5 h-5 text-amber-500" />
              <span className="text-amber-700 dark:text-amber-400">
                Progressive unlock mode - features unlock as you learn
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2">
        {!status.showAllFeatures && (
          <button
            onClick={handleShowAll}
            disabled={isShowingAll}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
            {isShowingAll ? 'Unlocking...' : 'Show All Features'}
          </button>
        )}

        <button
          onClick={handleReset}
          disabled={isResetting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
          {isResetting ? 'Resetting...' : 'Reset Onboarding'}
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Resetting will restart your learning journey and hide advanced features until you unlock them again.
      </p>
    </div>
  );
}
