import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';
import FeatureSpotlight, { getSpotlightTarget } from './FeatureSpotlight';

// Track which spotlights have been shown in localStorage
const STORAGE_KEY = 'ma-shown-spotlights';

function getShownSpotlights(): Set<string> {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? new Set(JSON.parse(saved)) : new Set();
}

function markSpotlightShown(featureKey: string): void {
  const shown = getShownSpotlights();
  shown.add(featureKey);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...shown]));
}

export default function SpotlightManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useOnboarding();
  const [currentSpotlight, setCurrentSpotlight] = useState<string | null>(null);
  const [spotlightQueue, setSpotlightQueue] = useState<string[]>([]);
  const previousUnlockedRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Detect newly unlocked features and queue spotlights
  useEffect(() => {
    // Skip on initial load to avoid showing spotlights for already unlocked features
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      if (status?.unlockedFeatures) {
        previousUnlockedRef.current = new Set(status.unlockedFeatures);
      }
      return;
    }

    // Skip if showAllFeatures is true
    if (status?.showAllFeatures) {
      return;
    }

    if (status?.unlockedFeatures) {
      const currentUnlocked = new Set(status.unlockedFeatures);
      const previousUnlocked = previousUnlockedRef.current;
      const shownSpotlights = getShownSpotlights();

      // Find newly unlocked features that haven't been spotlighted yet
      const newlyUnlocked = [...currentUnlocked].filter(
        f => !previousUnlocked.has(f) && !shownSpotlights.has(f)
      );

      if (newlyUnlocked.length > 0) {
        // Add to queue (don't show immediately - let FeatureTour show first)
        setSpotlightQueue(prev => [...prev, ...newlyUnlocked]);
      }

      previousUnlockedRef.current = currentUnlocked;
    }
  }, [status?.unlockedFeatures, status?.showAllFeatures]);

  // Listen for manual spotlight triggers
  useEffect(() => {
    const handleTrigger = (e: CustomEvent<{ featureKey: string }>) => {
      const { featureKey } = e.detail;
      const shownSpotlights = getShownSpotlights();
      if (!shownSpotlights.has(featureKey)) {
        setSpotlightQueue(prev => [...prev, featureKey]);
      }
    };

    window.addEventListener('trigger-spotlight', handleTrigger as EventListener);
    return () => window.removeEventListener('trigger-spotlight', handleTrigger as EventListener);
  }, []);

  // Show next spotlight from queue when none is showing
  useEffect(() => {
    if (currentSpotlight === null && spotlightQueue.length > 0) {
      // Small delay to let any other modals close
      const timer = setTimeout(() => {
        const [next, ...rest] = spotlightQueue;
        setCurrentSpotlight(next);
        setSpotlightQueue(rest);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [currentSpotlight, spotlightQueue]);

  const handleDismiss = () => {
    if (currentSpotlight) {
      markSpotlightShown(currentSpotlight);
    }
    setCurrentSpotlight(null);
  };

  const handleNavigate = () => {
    if (currentSpotlight) {
      const target = getSpotlightTarget(currentSpotlight);
      if (target) {
        // Extract path from selector
        const match = target.selector.match(/href="([^"]+)"/);
        if (match) {
          navigate(match[1]);
        }
      }
    }
  };

  // Don't show spotlight if we're not on the dashboard (user is already navigating)
  // Only show spotlights when user is on main pages, not in the middle of a form
  const shouldShowSpotlight = location.pathname === '/' ||
    !location.pathname.includes('/new') && !location.pathname.includes('/edit');

  if (!currentSpotlight || !shouldShowSpotlight) {
    return null;
  }

  const target = getSpotlightTarget(currentSpotlight);

  return (
    <FeatureSpotlight
      target={target}
      onDismiss={handleDismiss}
      onNavigate={handleNavigate}
    />
  );
}

// Export function to manually trigger a spotlight (e.g., after FeatureTour closes)
export function triggerSpotlight(featureKey: string): void {
  const shownSpotlights = getShownSpotlights();
  if (!shownSpotlights.has(featureKey)) {
    // Dispatch custom event that SpotlightManager can listen for
    window.dispatchEvent(new CustomEvent('trigger-spotlight', { detail: { featureKey } }));
  }
}

// Export function to reset shown spotlights (for testing/reset)
export function resetSpotlights(): void {
  localStorage.removeItem(STORAGE_KEY);
}
