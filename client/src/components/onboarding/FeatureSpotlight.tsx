import { useState, useEffect, useCallback } from 'react';
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

export default function FeatureSpotlight({ target, onDismiss, onNavigate }: FeatureSpotlightProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Find and measure the target element
  const measureTarget = useCallback(() => {
    if (!target) return;

    const element = document.querySelector(target.selector);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
      setIsVisible(true);
    }
  }, [target]);

  useEffect(() => {
    if (target) {
      // Small delay to let the DOM settle after navigation
      const timer = setTimeout(measureTarget, 100);

      // Re-measure on resize
      window.addEventListener('resize', measureTarget);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', measureTarget);
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

  // Calculate callout position
  const calloutPosition = target.position || 'right';
  const calloutStyle: React.CSSProperties = {};

  switch (calloutPosition) {
    case 'right':
      calloutStyle.top = hole.top + hole.height / 2;
      calloutStyle.left = hole.left + hole.width + 16;
      calloutStyle.transform = 'translateY(-50%)';
      break;
    case 'left':
      calloutStyle.top = hole.top + hole.height / 2;
      calloutStyle.right = window.innerWidth - hole.left + 16;
      calloutStyle.transform = 'translateY(-50%)';
      break;
    case 'bottom':
      calloutStyle.top = hole.top + hole.height + 16;
      calloutStyle.left = hole.left + hole.width / 2;
      calloutStyle.transform = 'translateX(-50%)';
      break;
    case 'top':
      calloutStyle.bottom = window.innerHeight - hole.top + 16;
      calloutStyle.left = hole.left + hole.width / 2;
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
          animation: 'pulse-glow 2s ease-in-out infinite',
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

// Helper to generate spotlight targets for features
export function getSpotlightTarget(featureKey: string): SpotlightTarget | null {
  const targets: Record<string, Omit<SpotlightTarget, 'featureKey'>> = {
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

  const config = targets[featureKey];
  if (!config) return null;

  return {
    featureKey,
    ...config,
  };
}
