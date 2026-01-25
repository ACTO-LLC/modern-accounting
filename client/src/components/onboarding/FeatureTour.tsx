import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { X, ChevronRight, ChevronLeft, Sparkles, BookOpen, CheckCircle } from 'lucide-react';
import { useOnboarding, FeatureDetails } from '../../contexts/OnboardingContext';
import clsx from 'clsx';

// Map menu paths to feature keys
const pathToFeatureKey: Record<string, string> = {
  '/customers': 'customers',
  '/vendors': 'vendors',
  '/products-services': 'products_services',
  '/invoices': 'invoices',
  '/estimates': 'estimates',
  '/bills': 'bills',
  '/expenses': 'expenses',
  '/accounts': 'chart_of_accounts',
  '/journal-entries': 'journal_entries',
  '/reports': 'reports',
};

export default function FeatureTour() {
  const location = useLocation();
  const { getFeatureStatus, getFeatureDetails, completeFeature, status: onboardingStatus } = useOnboarding();

  const [showTour, setShowTour] = useState(false);
  const [featureDetails, setFeatureDetails] = useState<FeatureDetails | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [seenFeatures, setSeenFeatures] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('ma-seen-feature-tours');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Get feature key for current path
  const currentFeatureKey = pathToFeatureKey[location.pathname];
  const featureStatus = currentFeatureKey ? getFeatureStatus(currentFeatureKey) : null;

  // Check if we should show the tour for this feature
  useEffect(() => {
    async function checkAndShowTour() {
      // Only show for unlocked features that haven't been seen
      if (
        currentFeatureKey &&
        featureStatus === 'unlocked' &&
        !seenFeatures.has(currentFeatureKey) &&
        !onboardingStatus?.showAllFeatures
      ) {
        const details = await getFeatureDetails(currentFeatureKey);
        if (details) {
          setFeatureDetails(details);
          setCurrentStep(0);
          setShowTour(true);
        }
      }
    }

    checkAndShowTour();
  }, [location.pathname, currentFeatureKey, featureStatus, seenFeatures, getFeatureDetails, onboardingStatus?.showAllFeatures]);

  const handleClose = () => {
    if (currentFeatureKey) {
      // Mark as seen
      const newSeen = new Set(seenFeatures);
      newSeen.add(currentFeatureKey);
      setSeenFeatures(newSeen);
      localStorage.setItem('ma-seen-feature-tours', JSON.stringify([...newSeen]));
    }
    setShowTour(false);
    setFeatureDetails(null);
  };

  const handleComplete = async () => {
    if (currentFeatureKey) {
      try {
        await completeFeature(currentFeatureKey);
      } catch (error) {
        console.error('Failed to complete feature:', error);
      }
    }
    handleClose();
  };

  const handleNextStep = () => {
    if (featureDetails && currentStep < getTotalSteps() - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getTotalSteps = () => {
    if (!featureDetails) return 0;
    // Steps: Overview, Capabilities, Concepts (if any), Tasks
    let steps = 2; // Overview + Capabilities always present
    if (featureDetails.accountingConcepts?.length > 0) steps++;
    if (featureDetails.sampleTasks?.length > 0) steps++;
    return steps;
  };

  if (!showTour || !featureDetails) {
    return null;
  }

  const totalSteps = getTotalSteps();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-indigo-200 uppercase tracking-wide">New Feature Unlocked</div>
                <h2 className="text-xl font-bold">{featureDetails.name}</h2>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              aria-label="Close tour"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Progress dots */}
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={clsx(
                  "h-1.5 rounded-full transition-all",
                  i === currentStep ? "w-6 bg-white" : "w-1.5 bg-white/40"
                )}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[250px]">
          {currentStep === 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                Overview
              </h3>
              <p className="text-gray-600 dark:text-gray-300">
                {featureDetails.shortDescription}
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm whitespace-pre-line">
                {featureDetails.detailedDescription}
              </p>
              {featureDetails.tailoredNote && (
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-3 rounded-lg">
                  <p className="text-sm text-indigo-700 dark:text-indigo-300">
                    <strong>Tip:</strong> {featureDetails.tailoredNote}
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                What You Can Do
              </h3>
              <ul className="space-y-2">
                {featureDetails.capabilities.map((cap, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-600 dark:text-gray-300">{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {currentStep === 2 && featureDetails.accountingConcepts?.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Key Concepts
              </h3>
              <div className="space-y-3">
                {featureDetails.accountingConcepts.slice(0, 3).map((concept, i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                    <div className="font-medium text-gray-900 dark:text-white">{concept.term}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {concept.explanation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {((currentStep === 2 && !featureDetails.accountingConcepts?.length) ||
            (currentStep === 3 && featureDetails.accountingConcepts?.length > 0)) &&
            featureDetails.sampleTasks?.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Try These Tasks
              </h3>
              <div className="space-y-3">
                {featureDetails.sampleTasks.map((task, i) => (
                  <div key={i} className="border border-gray-200 dark:border-gray-600 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-sm font-medium">
                        {i + 1}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">{task.title}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-8">
                      {task.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
          <button
            onClick={handlePrevStep}
            disabled={currentStep === 0}
            className={clsx(
              "flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
              currentStep === 0
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <span className="text-sm text-gray-500 dark:text-gray-400">
            {currentStep + 1} of {totalSteps}
          </span>

          <button
            onClick={handleNextStep}
            className="flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {currentStep === totalSteps - 1 ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Got It!
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
