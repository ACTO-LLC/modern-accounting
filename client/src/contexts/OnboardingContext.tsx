import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';

// Types matching MA MCP server
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type PrimaryGoal = 'invoicing' | 'expenses' | 'full_accounting';
export type FeatureStatus = 'locked' | 'unlocked' | 'in_progress' | 'completed';

export interface SpotlightConfig {
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export interface Feature {
  key: string;
  name: string;
  menuPath: string;
  difficulty: number;
  category: string;
  shortDescription: string;
  prerequisites: string[];
  capabilities: string[];
  spotlight?: SpotlightConfig;
}

export interface FeatureDetails extends Feature {
  detailedDescription: string;
  accountingConcepts: Array<{ term: string; explanation: string }>;
  experienceLevelNotes: {
    beginner: string;
    intermediate: string;
    advanced: string;
  };
  sampleTasks: Array<{ title: string; description: string }>;
  tailoredNote?: string;
}

export interface OnboardingStatus {
  userId: string;
  experienceLevel: ExperienceLevel | null;
  primaryGoal: PrimaryGoal | null;
  showAllFeatures: boolean;
  onboardingCompleted: boolean;
  unlockedFeatures: string[];
  completedFeatures: string[];
  inProgressFeatures: string[];
  nextRecommended: Feature | null;
}

export interface LearningPathItem {
  key: string;
  name: string;
  menuPath: string;
  difficulty: number;
  category: string;
  shortDescription: string;
  prerequisites: string[];
  tailoredNote: string;
}

export interface DetailedProgress {
  feature: Feature | LearningPathItem;
  status: FeatureStatus;
  isNext: boolean;
}

interface OnboardingContextType {
  // State
  isLoading: boolean;
  error: string | null;
  status: OnboardingStatus | null;
  features: Feature[];
  learningPath: LearningPathItem[];

  // Feature access
  isFeatureAccessible: (featureKey: string) => boolean;
  isFeatureCompleted: (featureKey: string) => boolean;
  getFeatureStatus: (featureKey: string) => FeatureStatus;

  // Progress helpers
  getDetailedProgress: () => DetailedProgress[];
  getNextRecommended: () => Feature | LearningPathItem | null;
  getPrerequisitesFor: (featureKey: string) => string[];
  getProgressSummary: () => { completed: number; total: number; percent: number };

  // Actions
  setAssessment: (experienceLevel: ExperienceLevel, primaryGoal: PrimaryGoal) => Promise<void>;
  unlockFeature: (featureKey: string) => Promise<void>;
  completeFeature: (featureKey: string) => Promise<void>;
  showAllFeatures: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  refreshStatus: () => Promise<void>;

  // Feature details
  getFeatureDetails: (featureKey: string) => Promise<FeatureDetails | null>;

  // UI state
  isOnboardingMode: boolean;
  setOnboardingMode: (mode: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const MA_MCP_URL = import.meta.env.VITE_MA_MCP_URL || '';
const MCP_ENABLED = MA_MCP_URL && !MA_MCP_URL.includes('localhost');

// MCP client for calling MA MCP server
class MaMcpClient {
  private sessionId: string | null = null;
  private sessionPromise: Promise<string> | null = null;

  private async createSession(): Promise<string> {
    if (!MCP_ENABLED) {
      throw new Error('MCP not configured for this environment');
    }
    const response = await fetch(`${MA_MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      })
    });

    const newSessionId = response.headers.get('mcp-session-id');
    if (!newSessionId) {
      throw new Error('Failed to get MCP session ID');
    }
    this.sessionId = newSessionId;
    return this.sessionId;
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;
    // Prevent race condition: if session creation is in progress, wait for it
    if (this.sessionPromise) return this.sessionPromise;

    this.sessionPromise = this.createSession();
    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = null;
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>, retryOnSessionError = true): Promise<unknown> {
    if (!MCP_ENABLED) {
      // MCP not configured - return null to indicate feature not available
      return null;
    }
    const sessionId = await this.ensureSession();

    const response = await fetch(`${MA_MCP_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': sessionId
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      })
    });

    const text = await response.text();
    // Parse SSE format
    const dataLine = text.split('\n').find(line => line.startsWith('data: '));
    if (!dataLine) {
      throw new Error('Invalid MCP response format');
    }

    const json = JSON.parse(dataLine.substring(6));
    if (json.error) {
      // If session expired, clear it and retry once
      if (json.error.message === 'Invalid or expired session' && retryOnSessionError) {
        this.sessionId = null;
        return this.callTool(toolName, args, false);
      }
      throw new Error(json.error.message);
    }

    // Parse the content text as JSON
    const content = json.result?.content?.[0]?.text;
    if (!content) {
      throw new Error('No content in MCP response');
    }

    return JSON.parse(content);
  }
}

const mcpClient = new MaMcpClient();

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [learningPath, setLearningPath] = useState<LearningPathItem[]>([]);
  const [isOnboardingMode, setOnboardingMode] = useState(false);

  // Get user ID from auth - use oid (object ID) from token claims
  const userId = user?.idTokenClaims?.oid as string | undefined;

  // Load features list (once)
  useEffect(() => {
    async function loadFeatures() {
      try {
        const result = await mcpClient.callTool('ma_list_features', {}) as {
          features: Feature[];
        };
        setFeatures(result.features);
      } catch (err) {
        console.error('Failed to load features:', err);
      }
    }
    loadFeatures();
  }, []);

  // Load user onboarding status
  const refreshStatus = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await mcpClient.callTool('ma_get_user_onboarding_status', {
        userId
      }) as OnboardingStatus;

      setStatus(result);

      // Check if this is a new user who needs onboarding
      if (!result.onboardingCompleted && !result.showAllFeatures && !result.experienceLevel) {
        setOnboardingMode(true);
      }

      // If user has assessment, load their learning path
      if (result.experienceLevel && result.primaryGoal) {
        const pathResult = await mcpClient.callTool('ma_get_learning_path', {
          experienceLevel: result.experienceLevel,
          primaryGoal: result.primaryGoal
        }) as { path: LearningPathItem[] };
        setLearningPath(pathResult.path);
      }
    } catch (err) {
      console.error('Failed to load onboarding status:', err);
      setError(err instanceof Error ? err.message : 'Failed to load onboarding status');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated && userId) {
      refreshStatus();
    }
  }, [isAuthenticated, userId, refreshStatus]);

  // Feature access checks
  const isFeatureAccessible = useCallback((featureKey: string): boolean => {
    if (!status) return false;
    if (status.showAllFeatures) return true;
    return status.unlockedFeatures.includes(featureKey) ||
           status.completedFeatures.includes(featureKey) ||
           status.inProgressFeatures.includes(featureKey);
  }, [status]);

  const isFeatureCompleted = useCallback((featureKey: string): boolean => {
    if (!status) return false;
    return status.completedFeatures.includes(featureKey);
  }, [status]);

  const getFeatureStatus = useCallback((featureKey: string): FeatureStatus => {
    if (!status) return 'locked';
    if (status.showAllFeatures) return 'unlocked';
    if (status.completedFeatures.includes(featureKey)) return 'completed';
    if (status.inProgressFeatures.includes(featureKey)) return 'in_progress';
    if (status.unlockedFeatures.includes(featureKey)) return 'unlocked';
    return 'locked';
  }, [status]);

  // Progress helpers
  const getDetailedProgress = useCallback((): DetailedProgress[] => {
    const featureList = learningPath.length > 0 ? learningPath : features;
    return featureList.map(f => ({
      feature: f,
      status: getFeatureStatus(f.key),
      isNext: status?.nextRecommended?.key === f.key
    }));
  }, [features, learningPath, getFeatureStatus, status?.nextRecommended?.key]);

  const getNextRecommended = useCallback((): Feature | LearningPathItem | null => {
    if (status?.nextRecommended) return status.nextRecommended;
    // Fall back to first unlocked feature
    const featureList = learningPath.length > 0 ? learningPath : features;
    return featureList.find(f => getFeatureStatus(f.key) === 'unlocked') || null;
  }, [status?.nextRecommended, learningPath, features, getFeatureStatus]);

  const getPrerequisitesFor = useCallback((featureKey: string): string[] => {
    const feature = features.find(f => f.key === featureKey);
    return feature?.prerequisites || [];
  }, [features]);

  const getProgressSummary = useCallback(() => {
    const featureList = learningPath.length > 0 ? learningPath : features;
    const total = featureList.length;
    const completed = featureList.filter(f => getFeatureStatus(f.key) === 'completed').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percent };
  }, [features, learningPath, getFeatureStatus]);

  // Actions
  const setAssessment = useCallback(async (experienceLevel: ExperienceLevel, primaryGoal: PrimaryGoal) => {
    if (!userId) return;

    try {
      const result = await mcpClient.callTool('ma_set_user_assessment', {
        userId,
        experienceLevel,
        primaryGoal
      }) as { learningPath: LearningPathItem[] };

      setLearningPath(result.learningPath.map(item => ({
        ...item,
        tailoredNote: '' // Will be filled in by separate call if needed
      })));

      await refreshStatus();
    } catch (err) {
      console.error('Failed to set assessment:', err);
      throw err;
    }
  }, [userId, refreshStatus]);

  const unlockFeature = useCallback(async (featureKey: string) => {
    if (!userId) return;

    try {
      await mcpClient.callTool('ma_unlock_feature', {
        userId,
        featureKey,
        force: true // Allow unlocking even if prerequisites not met (for flexibility)
      });

      await refreshStatus();
    } catch (err) {
      console.error('Failed to unlock feature:', err);
      throw err;
    }
  }, [userId, refreshStatus]);

  const completeFeature = useCallback(async (featureKey: string) => {
    if (!userId) return;

    try {
      await mcpClient.callTool('ma_complete_feature', {
        userId,
        featureKey
      });

      await refreshStatus();
    } catch (err) {
      console.error('Failed to complete feature:', err);
      throw err;
    }
  }, [userId, refreshStatus]);

  const showAllFeatures = useCallback(async () => {
    if (!userId) return;

    try {
      await mcpClient.callTool('ma_show_all_features', { userId });
      setOnboardingMode(false);
      await refreshStatus();
    } catch (err) {
      console.error('Failed to show all features:', err);
      throw err;
    }
  }, [userId, refreshStatus]);

  const resetOnboarding = useCallback(async () => {
    if (!userId) return;

    try {
      await mcpClient.callTool('ma_reset_onboarding', { userId });
      setOnboardingMode(true);
      await refreshStatus();
    } catch (err) {
      console.error('Failed to reset onboarding:', err);
      throw err;
    }
  }, [userId, refreshStatus]);

  const getFeatureDetails = useCallback(async (featureKey: string): Promise<FeatureDetails | null> => {
    try {
      const result = await mcpClient.callTool('ma_get_feature_details', {
        featureKey,
        experienceLevel: status?.experienceLevel || 'beginner'
      }) as FeatureDetails;

      return result;
    } catch (err) {
      console.error('Failed to get feature details:', err);
      return null;
    }
  }, [status?.experienceLevel]);

  const value: OnboardingContextType = {
    isLoading,
    error,
    status,
    features,
    learningPath,
    isFeatureAccessible,
    isFeatureCompleted,
    getFeatureStatus,
    getDetailedProgress,
    getNextRecommended,
    getPrerequisitesFor,
    getProgressSummary,
    setAssessment,
    unlockFeature,
    completeFeature,
    showAllFeatures,
    resetOnboarding,
    refreshStatus,
    getFeatureDetails,
    isOnboardingMode,
    setOnboardingMode
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

// Hook for checking feature access in nav items
export function useFeatureAccess(featureKey: string | undefined) {
  const { isFeatureAccessible, getFeatureStatus, isLoading, status } = useOnboarding();

  // If onboarding is not loaded yet, allow access (don't block while loading)
  if (isLoading) {
    return { isAccessible: true, status: 'unlocked' as FeatureStatus, isLoading };
  }

  // If showAllFeatures is true, everything is accessible
  if (status?.showAllFeatures) {
    return { isAccessible: true, status: 'unlocked' as FeatureStatus, isLoading: false };
  }

  // If no feature key: hide during active onboarding, show otherwise
  // Items without featureKey are "advanced" features not part of the learning path
  if (!featureKey) {
    // If user has no assessment yet (new user), hide ungated items
    // If user completed onboarding, show everything
    const hideUngated = status && !status.onboardingCompleted && status.experienceLevel;
    return {
      isAccessible: !hideUngated,
      status: 'locked' as FeatureStatus,
      isLoading: false
    };
  }

  return {
    isAccessible: isFeatureAccessible(featureKey),
    status: getFeatureStatus(featureKey),
    isLoading
  };
}
