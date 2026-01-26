import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { Feature } from './types/feature.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let featuresCache: Map<string, Feature> | null = null;

export function loadFeatures(): Map<string, Feature> {
  if (featuresCache) {
    return featuresCache;
  }

  const featuresDir = path.join(__dirname, '..', 'features');
  const features = new Map<string, Feature>();

  const files = fs.readdirSync(featuresDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    const filePath = path.join(featuresDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const feature = yaml.load(content) as Feature;

    if (feature && feature.key) {
      features.set(feature.key, feature);
    }
  }

  featuresCache = features;
  return features;
}

export function getFeature(key: string): Feature | undefined {
  const features = loadFeatures();
  return features.get(key);
}

export function getAllFeatures(): Feature[] {
  const features = loadFeatures();
  return Array.from(features.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getFeaturesByCategory(category: string): Feature[] {
  return getAllFeatures().filter(f => f.category === category);
}

export function getFeaturesByMaxDifficulty(maxDifficulty: number): Feature[] {
  return getAllFeatures().filter(f => f.difficulty <= maxDifficulty);
}

export function getPrerequisites(featureKey: string): Feature[] {
  const feature = getFeature(featureKey);
  if (!feature) return [];

  return feature.prerequisites
    .map(key => getFeature(key))
    .filter((f): f is Feature => f !== undefined);
}

export function getDependents(featureKey: string): Feature[] {
  return getAllFeatures().filter(f => f.prerequisites.includes(featureKey));
}

export function canUnlockFeature(featureKey: string, completedFeatures: Set<string>): boolean {
  const feature = getFeature(featureKey);
  if (!feature) return false;

  // All prerequisites must be completed
  return feature.prerequisites.every(prereq => completedFeatures.has(prereq));
}

export function getNextRecommendedFeatures(
  completedFeatures: Set<string>,
  unlockedFeatures: Set<string>,
  limit: number = 3
): Feature[] {
  const allFeatures = getAllFeatures();

  // Find features that:
  // 1. Are not completed
  // 2. Have all prerequisites completed
  // 3. Sorted by difficulty and sort order
  const available = allFeatures
    .filter(f => !completedFeatures.has(f.key))
    .filter(f => canUnlockFeature(f.key, completedFeatures))
    .sort((a, b) => {
      // Prefer already unlocked features
      const aUnlocked = unlockedFeatures.has(a.key) ? 0 : 1;
      const bUnlocked = unlockedFeatures.has(b.key) ? 0 : 1;
      if (aUnlocked !== bUnlocked) return aUnlocked - bUnlocked;

      // Then by difficulty
      if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;

      // Then by sort order
      return a.sortOrder - b.sortOrder;
    });

  return available.slice(0, limit);
}

export function generateLearningPath(
  experienceLevel: 'beginner' | 'intermediate' | 'advanced',
  primaryGoal: string
): Feature[] {
  const allFeatures = getAllFeatures();

  // Filter based on goal
  let relevantFeatures: Feature[];

  switch (primaryGoal) {
    case 'invoicing':
      // Focus on AR: customers, products, invoices, estimates
      relevantFeatures = allFeatures.filter(f =>
        ['customers', 'products_services', 'invoices', 'estimates', 'reports'].includes(f.key)
      );
      break;
    case 'expenses':
      // Focus on AP: vendors, bills, expenses
      relevantFeatures = allFeatures.filter(f =>
        ['vendors', 'bills', 'expenses', 'reports'].includes(f.key)
      );
      break;
    case 'full_accounting':
    default:
      // All features
      relevantFeatures = allFeatures;
      break;
  }

  // Adjust difficulty threshold based on experience
  let maxDifficulty: number;
  switch (experienceLevel) {
    case 'beginner':
      maxDifficulty = 3; // Skip most advanced features initially
      break;
    case 'intermediate':
      maxDifficulty = 4;
      break;
    case 'advanced':
    default:
      maxDifficulty = 5;
      break;
  }

  // Filter by difficulty and sort by sort order
  return relevantFeatures
    .filter(f => f.difficulty <= maxDifficulty)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Invalidate cache (useful for development/hot reload)
export function clearFeaturesCache(): void {
  featuresCache = null;
}
