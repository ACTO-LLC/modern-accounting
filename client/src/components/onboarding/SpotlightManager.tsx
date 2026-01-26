import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useOnboarding } from '../../contexts/OnboardingContext';
import FeatureSpotlight, { getSpotlightTarget } from './FeatureSpotlight';

// Track which spotlights have been shown in localStorage
const STORAGE_KEY = 'modern-accounting:shown-spotlights';

function getShownSpotlights(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  } catch (error) {
    console.warn('Failed to parse shown spotlights from localStorage:', error);
    return new Set();
  }
}

function markSpotlightShown(featureKey: string): void {
  try {
    const shown = getShownSpotlights();
    shown.add(featureKey);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...shown]));
  } catch (error) {
    console.warn('Failed to save spotlight state to localStorage:', error);
  }
}

// Check if any modal/dialog is currently open
function isModalOpen(): boolean {
  // Check for common modal indicators
  const modalSelectors = [
    '[role="dialog"]',
    '.fixed.inset-0.z-\\[70\\]', // FeatureTour modal
    '[aria-modal="true"]',
  ];

  for (const selector of modalSelectors) {
    try {
      if (document.querySelector(selector)) {
        return true;
      }
    } catch {
      // Invalid selector, skip
    }
  }
  return false;
}

export default function SpotlightManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, features } = useOnboarding();
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
  // Uses polling to check if modals are closed instead of arbitrary timeout
  useEffect(() => {
    if (currentSpotlight === null && spotlightQueue.length > 0) {
      let attempts = 0;
      const maxAttempts = 20; // 20 * 100ms = 2 seconds max wait
      const pollInterval = 100;

      const checkAndShow = () => {
        attempts++;

        // If no modal is open, show the spotlight
        if (!isModalOpen()) {
          const [next, ...rest] = spotlightQueue;
          setCurrentSpotlight(next);
          setSpotlightQueue(rest);
          return;
        }

        // If we've waited too long, give up on this spotlight
        if (attempts >= maxAttempts) {
          console.warn('Spotlight timed out waiting for modal to close');
          const [, ...rest] = spotlightQueue;
          setSpotlightQueue(rest);
          return;
        }

        // Keep polling
        timer = setTimeout(checkAndShow, pollInterval);
      };

      // Initial delay before first check
      let timer: NodeJS.Timeout = setTimeout(checkAndShow, 200);

      return () => clearTimeout(timer);
    }
  }, [currentSpotlight, spotlightQueue]);

  const handleDismiss = useCallback(() => {
    if (currentSpotlight) {
      markSpotlightShown(currentSpotlight);
    }
    setCurrentSpotlight(null);
  }, [currentSpotlight]);

  const handleNavigate = useCallback(() => {
    if (currentSpotlight) {
      const target = getSpotlightTarget(currentSpotlight, features);
      if (target) {
        try {
          // Extract path from selector
          const match = target.selector.match(/href="([^"]+)"/);
          if (match && match[1]) {
            navigate(match[1]);
          } else {
            console.warn(`Could not extract navigation path from selector: ${target.selector}`);
          }
        } catch (error) {
          console.error('Failed to navigate from spotlight:', error);
        }
      }
    }
  }, [currentSpotlight, navigate, features]);

  // Don't show spotlight if we're not on the dashboard (user is already navigating)
  // Only show spotlights when user is on main pages, not in the middle of a form
  const shouldShowSpotlight = location.pathname === '/' ||
    !location.pathname.includes('/new') && !location.pathname.includes('/edit');

  if (!currentSpotlight || !shouldShowSpotlight) {
    return null;
  }

  // Derive spotlight target from features data (data-driven approach)
  const target = getSpotlightTarget(currentSpotlight, features);

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
