import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

interface SpotlightTarget {
  featureKey: string;
  featureName: string;
  selector: string; // CSS selector to find the element
  message: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface FeatureSpotlightProps {
  target: SpotlightTarget | null;
  onDismiss: () => void;
  onNavigate?: () => void;
}

// Check if user prefers reduced motion
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function FeatureSpotlight({ target, onDismiss, onNavigate }: FeatureSpotlightProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  // Find and measure the target element
  const measureTarget = useCallback(() => {
    if (!target) return;

    try {
      const element = document.querySelector(target.selector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
        setIsVisible(true);
      } else {
        // Element not found - log warning and dismiss
        console.warn(`Spotlight target not found: ${target.selector} for feature "${target.featureKey}"`);
        onDismiss();
      }
    } catch (error) {
      // Invalid selector or other DOM error
      console.error(`Spotlight selector error for "${target.featureKey}":`, error);
      onDismiss();
    }
  }, [target, onDismiss]);

  // Listen for reduced motion preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    // Clean up previous handlers before setting new ones
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (resizeHandlerRef.current) {
      window.removeEventListener('resize', resizeHandlerRef.current);
      resizeHandlerRef.current = null;
    }

    if (target) {
      // Small delay to let the DOM settle after navigation
      timeoutRef.current = setTimeout(measureTarget, 100);

      // Store resize handler reference for proper cleanup
      resizeHandlerRef.current = measureTarget;
      window.addEventListener('resize', resizeHandlerRef.current);

      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (resizeHandlerRef.current) {
          window.removeEventListener('resize', resizeHandlerRef.current);
          resizeHandlerRef.current = null;
        }
      };
    } else {
      setIsVisible(false);
      setTargetRect(null);
    }
  }, [target, measureTarget]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isVisible, onDismiss]);

  if (!target || !isVisible || !targetRect) {
    return null;
  }

  // Calculate spotlight hole dimensions (with padding)
  const padding = 8;
  const hole = {
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
  };

  // Calculate callout position with viewport boundary checking
  const calloutWidth = 280; // max-w-xs is roughly 280px
  const calloutHeight = 150; // approximate height
  const margin = 16; // gap from target
  const viewportPadding = 12; // minimum distance from viewport edge

  // Determine best position based on available space
  let calloutPosition = target.position || 'right';

  // Check if preferred position would overflow viewport
  const spaceRight = window.innerWidth - (hole.left + hole.width + margin);
  const spaceLeft = hole.left - margin;
  const spaceBottom = window.innerHeight - (hole.top + hole.height + margin);
  const spaceTop = hole.top - margin;

  // Auto-adjust position if it would overflow
  if (calloutPosition === 'right' && spaceRight < calloutWidth + viewportPadding) {
    calloutPosition = spaceLeft >= calloutWidth + viewportPadding ? 'left' : 'bottom';
  } else if (calloutPosition === 'left' && spaceLeft < calloutWidth + viewportPadding) {
    calloutPosition = spaceRight >= calloutWidth + viewportPadding ? 'right' : 'bottom';
  } else if (calloutPosition === 'bottom' && spaceBottom < calloutHeight + viewportPadding) {
    calloutPosition = spaceTop >= calloutHeight + viewportPadding ? 'top' : 'right';
  } else if (calloutPosition === 'top' && spaceTop < calloutHeight + viewportPadding) {
    calloutPosition = spaceBottom >= calloutHeight + viewportPadding ? 'bottom' : 'right';
  }

  const calloutStyle: React.CSSProperties = {};

  switch (calloutPosition) {
    case 'right':
      calloutStyle.top = Math.max(viewportPadding, Math.min(
        hole.top + hole.height / 2,
        window.innerHeight - calloutHeight / 2 - viewportPadding
      ));
      calloutStyle.left = hole.left + hole.width + margin;
      calloutStyle.transform = 'translateY(-50%)';
      break;
    case 'left':
      calloutStyle.top = Math.max(viewportPadding, Math.min(
        hole.top + hole.height / 2,
        window.innerHeight - calloutHeight / 2 - viewportPadding
      ));
      calloutStyle.right = window.innerWidth - hole.left + margin;
      calloutStyle.transform = 'translateY(-50%)';
      break;
    case 'bottom':
      calloutStyle.top = hole.top + hole.height + margin;
      calloutStyle.left = Math.max(viewportPadding, Math.min(
        hole.left + hole.width / 2,
        window.innerWidth - calloutWidth / 2 - viewportPadding
      ));
      calloutStyle.transform = 'translateX(-50%)';
      break;
    case 'top':
      calloutStyle.bottom = window.innerHeight - hole.top + margin;
      calloutStyle.left = Math.max(viewportPadding, Math.min(
        hole.left + hole.width / 2,
        window.innerWidth - calloutWidth / 2 - viewportPadding
      ));
      calloutStyle.transform = 'translateX(-50%)';
      break;
  }

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
    }
    onDismiss();
  };

  return createPortal(
    <div className="fixed inset-0 z-[80]" onClick={onDismiss}>
      {/* SVG overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={hole.left}
              y={hole.top}
              width={hole.width}
              height={hole.height}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Glowing border around target */}
      <div
        className="absolute rounded-lg pointer-events-none"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.8), 0 0 20px rgba(99, 102, 241, 0.4)',
          animation: reducedMotion ? 'none' : 'pulse-glow 2s ease-in-out infinite',
        }}
      />

      {/* Callout card */}
      <div
        className={clsx(
          "absolute bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-4 max-w-xs",
          "border border-gray-200 dark:border-gray-700"
        )}
        style={calloutStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow pointer */}
        <div
          className={clsx(
            "absolute w-3 h-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rotate-45",
            calloutPosition === 'right' && "-left-1.5 top-1/2 -translate-y-1/2 border-l border-b",
            calloutPosition === 'left' && "-right-1.5 top-1/2 -translate-y-1/2 border-r border-t",
            calloutPosition === 'bottom' && "left-1/2 -top-1.5 -translate-x-1/2 border-l border-t",
            calloutPosition === 'top' && "left-1/2 -bottom-1.5 -translate-x-1/2 border-r border-b"
          )}
        />

        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3 pr-6">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {target.featureName} Unlocked!
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
              {target.message}
            </p>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={handleClick}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Try it now
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.8), 0 0 20px rgba(99, 102, 241, 0.4);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(99, 102, 241, 0.6), 0 0 30px rgba(99, 102, 241, 0.6);
          }
        }
      `}</style>
    </div>,
    document.body
  );
}

// Feature type for spotlight generation (matches OnboardingContext.Feature)
interface FeatureForSpotlight {
  key: string;
  name: string;
  menuPath: string;
  spotlight?: {
    message: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
  };
}

// Helper to generate spotlight targets from feature data
// Derives selector from menuPath instead of hardcoding
export function getSpotlightTarget(
  featureKey: string,
  features?: FeatureForSpotlight[]
): SpotlightTarget | null {
  // If features are provided, look up from there (data-driven approach)
  if (features && features.length > 0) {
    const feature = features.find(f => f.key === featureKey);
    if (feature && feature.spotlight) {
      return {
        featureKey,
        featureName: feature.name,
        selector: `[href="${feature.menuPath}"]`,
        message: feature.spotlight.message,
        position: feature.spotlight.position || 'right',
      };
    }
    // Feature found but no spotlight config
    if (feature) {
      return {
        featureKey,
        featureName: feature.name,
        selector: `[href="${feature.menuPath}"]`,
        message: `${feature.name} is now available!`,
        position: 'right',
      };
    }
  }

  // Fallback to hardcoded targets for backwards compatibility
  // This will be used if MCP server doesn't return spotlight data
  const fallbackTargets: Record<string, Omit<SpotlightTarget, 'featureKey'>> = {
    customers: {
      featureName: 'Customers',
      selector: '[href="/customers"]',
      message: 'This is where you manage your customers. Click to add your first customer!',
      position: 'right',
    },
    vendors: {
      featureName: 'Vendors',
      selector: '[href="/vendors"]',
      message: 'Track your suppliers and vendors here.',
      position: 'right',
    },
    products_services: {
      featureName: 'Products & Services',
      selector: '[href="/products-services"]',
      message: 'Set up what you sell to make invoicing faster.',
      position: 'right',
    },
    invoices: {
      featureName: 'Invoices',
      selector: '[href="/invoices"]',
      message: 'Create and send invoices to your customers from here.',
      position: 'right',
    },
    estimates: {
      featureName: 'Estimates',
      selector: '[href="/estimates"]',
      message: 'Create quotes and proposals before sending official invoices.',
      position: 'right',
    },
    bills: {
      featureName: 'Bills',
      selector: '[href="/bills"]',
      message: 'Track bills you receive from vendors.',
      position: 'right',
    },
    expenses: {
      featureName: 'Expenses',
      selector: '[href="/expenses"]',
      message: 'Record business expenses like purchases and payments.',
      position: 'right',
    },
    chart_of_accounts: {
      featureName: 'Chart of Accounts',
      selector: '[href="/accounts"]',
      message: 'Your accounting categories live here.',
      position: 'right',
    },
    journal_entries: {
      featureName: 'Journal Entries',
      selector: '[href="/journal-entries"]',
      message: 'Make manual accounting entries when needed.',
      position: 'right',
    },
    reports: {
      featureName: 'Reports',
      selector: '[href="/reports"]',
      message: 'See how your business is doing with financial reports.',
      position: 'right',
    },
  };

  const config = fallbackTargets[featureKey];
  if (!config) return null;

  return {
    featureKey,
    ...config,
  };
}
