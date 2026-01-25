import { useState } from 'react';
import { useOnboarding, ExperienceLevel, PrimaryGoal } from '../../contexts/OnboardingContext';
import { MessageCircle, Sparkles, ChevronRight, Check } from 'lucide-react';
import clsx from 'clsx';

type Step = 'welcome' | 'experience' | 'goal' | 'ready';

export default function OnboardingWelcome() {
  const { setAssessment, showAllFeatures, learningPath, isOnboardingMode, setOnboardingMode } = useOnboarding();
  const [step, setStep] = useState<Step>('welcome');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null);
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Don't render if not in onboarding mode
  if (!isOnboardingMode) {
    return null;
  }

  const handleSkip = async () => {
    try {
      setIsSubmitting(true);
      await showAllFeatures();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExperienceSelect = (level: ExperienceLevel) => {
    setExperienceLevel(level);
    setStep('goal');
  };

  const handleGoalSelect = async (goal: PrimaryGoal) => {
    setPrimaryGoal(goal);
    if (experienceLevel) {
      try {
        setIsSubmitting(true);
        await setAssessment(experienceLevel, goal);
        setStep('ready');
      } catch (error) {
        console.error('Failed to set assessment:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleStart = () => {
    setOnboardingMode(false);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header with Milton */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <MessageCircle className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Hi, I'm Milton!</h1>
              <p className="text-indigo-100">Your Modern Accounting assistant</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'welcome' && (
            <div className="space-y-6">
              <p className="text-gray-600 dark:text-gray-300 text-lg">
                Welcome to Modern Accounting! I'll help you get started and learn the system at your own pace.
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                I'll unlock features as we go, so you're never overwhelmed. Ready to begin?
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setStep('experience')}
                  className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Sparkles className="w-5 h-5" />
                  Let's Get Started
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSkip}
                  disabled={isSubmitting}
                  className="w-full py-2 px-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
                >
                  {isSubmitting ? 'Loading...' : "I'm experienced - show me everything"}
                </button>
              </div>
            </div>
          )}

          {step === 'experience' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  What's your experience with accounting software?
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  This helps me explain things at the right level.
                </p>
              </div>
              <div className="space-y-3">
                <ExperienceOption
                  level="beginner"
                  title="I'm new to this"
                  description="Never used accounting software before, or just getting started"
                  selected={experienceLevel === 'beginner'}
                  onClick={() => handleExperienceSelect('beginner')}
                />
                <ExperienceOption
                  level="intermediate"
                  title="I have some experience"
                  description="Used QuickBooks, Xero, or similar software before"
                  selected={experienceLevel === 'intermediate'}
                  onClick={() => handleExperienceSelect('intermediate')}
                />
                <ExperienceOption
                  level="advanced"
                  title="I'm a pro"
                  description="Accountant or experienced bookkeeper"
                  selected={experienceLevel === 'advanced'}
                  onClick={() => handleExperienceSelect('advanced')}
                />
              </div>
            </div>
          )}

          {step === 'goal' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  What's your main goal?
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  I'll customize your learning path based on what you need most.
                </p>
              </div>
              <div className="space-y-3">
                <GoalOption
                  goal="invoicing"
                  title="Send invoices to clients"
                  description="Focus on customers, products, and invoicing"
                  selected={primaryGoal === 'invoicing'}
                  onClick={() => handleGoalSelect('invoicing')}
                  disabled={isSubmitting}
                />
                <GoalOption
                  goal="expenses"
                  title="Track expenses and bills"
                  description="Focus on vendors, bills, and expense tracking"
                  selected={primaryGoal === 'expenses'}
                  onClick={() => handleGoalSelect('expenses')}
                  disabled={isSubmitting}
                />
                <GoalOption
                  goal="full_accounting"
                  title="Full business accounting"
                  description="Learn everything - invoicing, expenses, reports, and more"
                  selected={primaryGoal === 'full_accounting'}
                  onClick={() => handleGoalSelect('full_accounting')}
                  disabled={isSubmitting}
                />
              </div>
              <button
                onClick={() => setStep('experience')}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ← Back
              </button>
            </div>
          )}

          {step === 'ready' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  You're all set!
                </h2>
                <p className="text-gray-500 dark:text-gray-400">
                  I've created a personalized learning path just for you.
                </p>
              </div>

              {learningPath.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Your learning path ({learningPath.length} modules):
                  </h3>
                  <div className="space-y-2">
                    {learningPath.slice(0, 4).map((item, index) => (
                      <div key={item.key} className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                      </div>
                    ))}
                    {learningPath.length > 4 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 ml-9">
                        +{learningPath.length - 4} more...
                      </p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleStart}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
              >
                Start Exploring
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ExperienceOptionProps {
  level: ExperienceLevel;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function ExperienceOption({ title, description, selected, onClick }: ExperienceOptionProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full p-4 rounded-lg border-2 text-left transition-all",
        selected
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
          : "border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-700"
      )}
    >
      <div className="font-medium text-gray-900 dark:text-white">{title}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{description}</div>
    </button>
  );
}

interface GoalOptionProps {
  goal: PrimaryGoal;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function GoalOption({ title, description, selected, onClick, disabled }: GoalOptionProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "w-full p-4 rounded-lg border-2 text-left transition-all",
        disabled && "opacity-50 cursor-not-allowed",
        selected
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
          : "border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-700"
      )}
    >
      <div className="font-medium text-gray-900 dark:text-white">{title}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{description}</div>
    </button>
  );
}
