import { z } from 'zod';
import * as featureLoader from '../feature-loader.js';
import * as db from '../db-client.js';
import { Feature, ExperienceLevel, OnboardingStatus } from '../types/feature.js';

// Tool result type matching MCP spec
interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// Helper to create a tool result
function result(data: any, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError
  };
}

function errorResult(message: string): ToolResult {
  return result({ error: message }, true);
}

// Define all tools
export const tools = [
  {
    name: 'ma_list_features',
    description: 'Get all Modern Accounting features with metadata for onboarding guidance. Returns features sorted by recommended learning order.',
    schema: z.object({
      category: z.enum(['foundation', 'transactions', 'accounting', 'advanced']).optional()
        .describe('Filter features by category'),
      maxDifficulty: z.number().min(1).max(5).optional()
        .describe('Filter by maximum difficulty level (1-5)'),
      includeDetails: z.boolean().optional().default(false)
        .describe('Include full descriptions and accounting concepts')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        let features = featureLoader.getAllFeatures();

        if (args.category) {
          features = features.filter(f => f.category === args.category);
        }
        if (args.maxDifficulty) {
          features = features.filter(f => f.difficulty <= args.maxDifficulty);
        }

        // Simplify output unless full details requested
        const output = features.map(f => {
          const base = {
            key: f.key,
            name: f.name,
            menuPath: f.menuPath,
            difficulty: f.difficulty,
            category: f.category,
            shortDescription: f.description.short,
            prerequisites: f.prerequisites,
            capabilities: f.capabilities
          };

          if (args.includeDetails) {
            return {
              ...base,
              detailedDescription: f.description.detailed,
              accountingConcepts: f.accountingConcepts,
              experienceLevelNotes: f.experienceLevelNotes,
              sampleTasks: f.sampleTasks,
              leadsTo: f.leadsTo
            };
          }

          return base;
        });

        return result({
          count: output.length,
          features: output
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_get_feature_details',
    description: 'Get detailed information about a specific Modern Accounting feature, including explanations tailored to user experience level.',
    schema: z.object({
      featureKey: z.string().describe('The feature key (e.g., "invoices", "journal_entries")'),
      experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional()
        .describe('Tailor explanation to this experience level')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const feature = featureLoader.getFeature(args.featureKey);
        if (!feature) {
          return errorResult(`Feature not found: ${args.featureKey}`);
        }

        const prerequisites = featureLoader.getPrerequisites(args.featureKey);
        const dependents = featureLoader.getDependents(args.featureKey);

        const output: any = {
          ...feature,
          prerequisiteDetails: prerequisites.map(p => ({
            key: p.key,
            name: p.name,
            shortDescription: p.description.short
          })),
          leadsToDetails: dependents.map(d => ({
            key: d.key,
            name: d.name,
            shortDescription: d.description.short
          }))
        };

        // Add tailored note if experience level provided
        if (args.experienceLevel && feature.experienceLevelNotes) {
          output.tailoredNote = feature.experienceLevelNotes[args.experienceLevel as ExperienceLevel];
        }

        return result(output);
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_get_user_onboarding_status',
    description: 'Get the current onboarding status and feature progress for a user.',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID to check')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        let onboarding = await db.getUserOnboarding(args.userId);

        // Create onboarding record if doesn't exist
        if (!onboarding) {
          onboarding = await db.createUserOnboarding(args.userId);
        }

        const progress = await db.getUserFeatureProgress(args.userId);
        const allFeatures = featureLoader.getAllFeatures();

        const unlockedFeatures = progress
          .filter(p => p.status !== 'locked')
          .map(p => p.featureKey);

        const completedFeatures = progress
          .filter(p => p.status === 'completed')
          .map(p => p.featureKey);

        const inProgressFeatures = progress
          .filter(p => p.status === 'in_progress')
          .map(p => p.featureKey);

        // Get next recommended feature
        const completedSet = new Set(completedFeatures);
        const unlockedSet = new Set(unlockedFeatures);
        const nextFeatures = featureLoader.getNextRecommendedFeatures(completedSet, unlockedSet, 1);

        const status: OnboardingStatus = {
          userId: args.userId,
          experienceLevel: onboarding.experienceLevel,
          primaryGoal: onboarding.primaryGoal,
          showAllFeatures: onboarding.showAllFeatures,
          onboardingCompleted: onboarding.onboardingCompleted,
          unlockedFeatures,
          completedFeatures,
          inProgressFeatures,
          nextRecommended: nextFeatures[0] || null
        };

        return result(status);
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_set_user_assessment',
    description: 'Set the user experience assessment results (experience level and primary goal).',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID'),
      experienceLevel: z.enum(['beginner', 'intermediate', 'advanced'])
        .describe('User self-reported experience level'),
      primaryGoal: z.enum(['invoicing', 'expenses', 'full_accounting'])
        .describe('User primary goal with MA')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        let onboarding = await db.getUserOnboarding(args.userId);
        if (!onboarding) {
          await db.createUserOnboarding(args.userId);
        }

        await db.updateUserOnboarding(args.userId, {
          experienceLevel: args.experienceLevel,
          primaryGoal: args.primaryGoal
        });

        // Generate the learning path
        const learningPath = featureLoader.generateLearningPath(
          args.experienceLevel,
          args.primaryGoal
        );

        // Unlock the first few features based on experience level
        // Beginners: 2 features, Intermediate: 3 features, Advanced: 4 features
        const initialUnlockCount = args.experienceLevel === 'beginner' ? 2
          : args.experienceLevel === 'intermediate' ? 3 : 4;

        const featuresToUnlock = learningPath.slice(0, initialUnlockCount);

        for (const feature of featuresToUnlock) {
          await db.unlockFeature(args.userId, feature.key);
        }

        return result({
          success: true,
          experienceLevel: args.experienceLevel,
          primaryGoal: args.primaryGoal,
          initiallyUnlocked: featuresToUnlock.map(f => f.key),
          learningPath: learningPath.map(f => ({
            key: f.key,
            name: f.name,
            difficulty: f.difficulty,
            shortDescription: f.description.short
          })),
          totalModules: learningPath.length
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_get_learning_path',
    description: 'Generate a recommended learning path based on experience level and goals.',
    schema: z.object({
      experienceLevel: z.enum(['beginner', 'intermediate', 'advanced'])
        .describe('User experience level'),
      primaryGoal: z.enum(['invoicing', 'expenses', 'full_accounting'])
        .describe('User primary goal')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const learningPath = featureLoader.generateLearningPath(
          args.experienceLevel,
          args.primaryGoal
        );

        return result({
          experienceLevel: args.experienceLevel,
          primaryGoal: args.primaryGoal,
          path: learningPath.map(f => ({
            key: f.key,
            name: f.name,
            menuPath: f.menuPath,
            difficulty: f.difficulty,
            category: f.category,
            shortDescription: f.description.short,
            prerequisites: f.prerequisites,
            tailoredNote: f.experienceLevelNotes[args.experienceLevel as ExperienceLevel]
          })),
          totalModules: learningPath.length
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_get_recommended_next',
    description: 'Get the recommended next feature(s) for a user based on their progress.',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID'),
      limit: z.number().min(1).max(5).optional().default(3)
        .describe('Maximum number of recommendations')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const progress = await db.getUserFeatureProgress(args.userId);
        const onboarding = await db.getUserOnboarding(args.userId);

        const completedFeatures = new Set(
          progress.filter(p => p.status === 'completed').map(p => p.featureKey)
        );
        const unlockedFeatures = new Set(
          progress.filter(p => p.status !== 'locked').map(p => p.featureKey)
        );

        const recommendations = featureLoader.getNextRecommendedFeatures(
          completedFeatures,
          unlockedFeatures,
          args.limit
        );

        return result({
          userId: args.userId,
          completedCount: completedFeatures.size,
          recommendations: recommendations.map(f => ({
            key: f.key,
            name: f.name,
            menuPath: f.menuPath,
            difficulty: f.difficulty,
            shortDescription: f.description.short,
            reason: unlockedFeatures.has(f.key)
              ? 'Already unlocked - continue where you left off'
              : `Prerequisites met: ${f.prerequisites.length === 0 ? 'none required' : f.prerequisites.join(', ')}`,
            tailoredNote: onboarding?.experienceLevel
              ? f.experienceLevelNotes[onboarding.experienceLevel as ExperienceLevel]
              : null
          }))
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_unlock_feature',
    description: 'Unlock a feature for the user after explanation. Checks prerequisites.',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID'),
      featureKey: z.string().describe('The feature to unlock'),
      force: z.boolean().optional().default(false)
        .describe('Force unlock even if prerequisites not met')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const feature = featureLoader.getFeature(args.featureKey);
        if (!feature) {
          return errorResult(`Feature not found: ${args.featureKey}`);
        }

        // Check prerequisites
        const progress = await db.getUserFeatureProgress(args.userId);
        const completedFeatures = new Set(
          progress.filter(p => p.status === 'completed').map(p => p.featureKey)
        );

        const canUnlock = featureLoader.canUnlockFeature(args.featureKey, completedFeatures);

        if (!canUnlock && !args.force) {
          const missingPrereqs = feature.prerequisites.filter(p => !completedFeatures.has(p));
          return errorResult(`Cannot unlock ${args.featureKey}. Missing prerequisites: ${missingPrereqs.join(', ')}`);
        }

        await db.unlockFeature(args.userId, args.featureKey);

        return result({
          success: true,
          featureKey: args.featureKey,
          featureName: feature.name,
          menuPath: feature.menuPath,
          message: `${feature.name} is now unlocked!`
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_start_feature_tutorial',
    description: 'Mark that user has started a feature tutorial/walkthrough.',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID'),
      featureKey: z.string().describe('The feature being learned'),
      totalSteps: z.number().optional().describe('Total steps in the tutorial')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const feature = featureLoader.getFeature(args.featureKey);
        if (!feature) {
          return errorResult(`Feature not found: ${args.featureKey}`);
        }

        // Ensure feature is unlocked first
        const progress = await db.getFeatureProgress(args.userId, args.featureKey);
        if (!progress || progress.status === 'locked') {
          await db.unlockFeature(args.userId, args.featureKey);
        }

        await db.startFeature(args.userId, args.featureKey, args.totalSteps);

        return result({
          success: true,
          featureKey: args.featureKey,
          status: 'in_progress',
          currentStep: 1,
          totalSteps: args.totalSteps || null
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_update_feature_progress',
    description: 'Update progress within a feature tutorial.',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID'),
      featureKey: z.string().describe('The feature'),
      currentStep: z.number().describe('Current step number')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        await db.updateFeatureStep(args.userId, args.featureKey, args.currentStep);

        return result({
          success: true,
          featureKey: args.featureKey,
          currentStep: args.currentStep
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_complete_feature',
    description: 'Mark a feature as completed after user finishes tutorial or demonstrates understanding.',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID'),
      featureKey: z.string().describe('The feature completed')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const feature = featureLoader.getFeature(args.featureKey);
        if (!feature) {
          return errorResult(`Feature not found: ${args.featureKey}`);
        }

        await db.completeFeature(args.userId, args.featureKey);

        // Get next recommendations
        const progress = await db.getUserFeatureProgress(args.userId);
        const completedFeatures = new Set(
          progress.filter(p => p.status === 'completed').map(p => p.featureKey)
        );
        const unlockedFeatures = new Set(
          progress.filter(p => p.status !== 'locked').map(p => p.featureKey)
        );

        const nextFeatures = featureLoader.getNextRecommendedFeatures(completedFeatures, unlockedFeatures, 2);
        const dependents = featureLoader.getDependents(args.featureKey);
        const newlyAvailable = dependents.filter(d =>
          featureLoader.canUnlockFeature(d.key, completedFeatures)
        );

        return result({
          success: true,
          featureKey: args.featureKey,
          featureName: feature.name,
          message: `Congratulations! You've completed ${feature.name}!`,
          completedCount: completedFeatures.size,
          newlyAvailableFeatures: newlyAvailable.map(f => ({
            key: f.key,
            name: f.name,
            shortDescription: f.description.short
          })),
          nextRecommendations: nextFeatures.map(f => ({
            key: f.key,
            name: f.name,
            shortDescription: f.description.short
          }))
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_show_all_features',
    description: 'Unlock all features for a user who wants to skip onboarding ("I know what I\'m doing").',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const allFeatures = featureLoader.getAllFeatures();
        const featureKeys = allFeatures.map(f => f.key);

        // Update onboarding status
        let onboarding = await db.getUserOnboarding(args.userId);
        if (!onboarding) {
          await db.createUserOnboarding(args.userId);
        }
        await db.updateUserOnboarding(args.userId, {
          showAllFeatures: true,
          onboardingCompleted: true
        });

        // Unlock all features
        await db.unlockAllFeatures(args.userId, featureKeys);

        return result({
          success: true,
          message: 'All features are now unlocked!',
          unlockedCount: featureKeys.length,
          features: allFeatures.map(f => ({
            key: f.key,
            name: f.name,
            menuPath: f.menuPath
          }))
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  },

  {
    name: 'ma_reset_onboarding',
    description: 'Reset onboarding progress for a user (start over).',
    schema: z.object({
      userId: z.string().uuid().describe('The user ID')
    }),
    handler: async (_sessionId: string, args: any): Promise<ToolResult> => {
      try {
        const pool = await db.getPool();

        // Delete all progress
        await pool.request()
          .input('userId', args.userId)
          .query('DELETE FROM UserFeatureProgress WHERE UserId = @userId');

        // Reset onboarding
        await pool.request()
          .input('userId', args.userId)
          .query(`
            UPDATE UserOnboarding
            SET ExperienceLevel = NULL,
                PrimaryGoal = NULL,
                ShowAllFeatures = 0,
                OnboardingCompleted = 0,
                UpdatedAt = GETUTCDATE()
            WHERE UserId = @userId
          `);

        return result({
          success: true,
          message: 'Onboarding has been reset. Ready to start fresh!'
        });
      } catch (err: any) {
        return errorResult(err.message);
      }
    }
  }
];

// Helper function to get tool by name
export function getTool(name: string) {
  return tools.find(t => t.name === name);
}

// Convert Zod schema to JSON Schema for MCP
export function zodToJsonSchema(zodSchema: z.ZodType<any>): any {
  const zodDef = (zodSchema as any)._def;
  return zodDefToJsonSchema(zodDef);
}

function zodDefToJsonSchema(def: any): any {
  if (!def) return { type: 'object' };

  const typeName = def.typeName;

  switch (typeName) {
    case 'ZodObject':
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(def.shape())) {
        const fieldDef = (value as any)._def;
        properties[key] = zodDefToJsonSchema(fieldDef);

        // Check if required
        if (fieldDef.typeName !== 'ZodOptional' && fieldDef.typeName !== 'ZodDefault') {
          required.push(key);
        }

        // Add description if present
        if (fieldDef.description) {
          properties[key].description = fieldDef.description;
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      };

    case 'ZodString':
      return { type: 'string' };

    case 'ZodNumber':
      return { type: 'number' };

    case 'ZodBoolean':
      return { type: 'boolean' };

    case 'ZodEnum':
      return { type: 'string', enum: def.values };

    case 'ZodArray':
      return {
        type: 'array',
        items: zodDefToJsonSchema(def.type._def)
      };

    case 'ZodOptional':
      return zodDefToJsonSchema(def.innerType._def);

    case 'ZodDefault':
      const schema = zodDefToJsonSchema(def.innerType._def);
      schema.default = def.defaultValue();
      return schema;

    case 'ZodUnion':
      return {
        anyOf: def.options.map((opt: any) => zodDefToJsonSchema(opt._def))
      };

    default:
      return { type: 'string' };
  }
}
