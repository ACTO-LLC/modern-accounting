export interface AccountingConcept {
  term: string;
  explanation: string;
}

export interface SampleTask {
  title: string;
  description: string;
}

export interface FeatureDescription {
  short: string;
  detailed: string;
}

export interface ExperienceLevelNotes {
  beginner: string;
  intermediate: string;
  advanced: string;
}

export interface Feature {
  key: string;
  name: string;
  menuPath: string;
  icon: string;
  difficulty: number;
  category: 'foundation' | 'transactions' | 'accounting' | 'advanced';
  sortOrder: number;
  description: FeatureDescription;
  capabilities: string[];
  accountingConcepts: AccountingConcept[];
  prerequisites: string[];
  leadsTo: string[];
  experienceLevelNotes: ExperienceLevelNotes;
  sampleTasks: SampleTask[];
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface UserOnboarding {
  id: string;
  userId: string;
  experienceLevel: ExperienceLevel | null;
  primaryGoal: string | null;
  showAllFeatures: boolean;
  onboardingCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserFeatureProgress {
  id: string;
  userId: string;
  featureKey: string;
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  unlockedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  currentStep: number | null;
  totalSteps: number | null;
}

export interface FeatureWithProgress extends Feature {
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed';
  unlockedAt: Date | null;
  completedAt: Date | null;
  currentStep: number | null;
  totalSteps: number | null;
  isAccessible: boolean; // Can be unlocked (all prerequisites met)
}

export interface LearningPath {
  experienceLevel: ExperienceLevel;
  primaryGoal: string;
  features: Feature[];
  estimatedModules: number;
}

export interface OnboardingStatus {
  userId: string;
  experienceLevel: ExperienceLevel | null;
  primaryGoal: string | null;
  showAllFeatures: boolean;
  onboardingCompleted: boolean;
  unlockedFeatures: string[];
  completedFeatures: string[];
  inProgressFeatures: string[];
  nextRecommended: Feature | null;
}
