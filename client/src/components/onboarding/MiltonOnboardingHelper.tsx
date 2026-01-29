import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useChat } from '../../contexts/ChatContext';
import { useOnboarding } from '../../contexts/OnboardingContext';

// Map paths to feature keys
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
  '/settings/tax': 'tax_settings',
};

// Feature-specific help messages Milton can provide
const featureHelpMessages: Record<string, {
  welcomeMessage: string;
  quickActions: string[];
}> = {
  customers: {
    welcomeMessage: "I see you're exploring Customers! This is where you manage everyone you sell to. Would you like help creating your first customer, or do you have questions about customer management?",
    quickActions: [
      'How do I add a customer?',
      'What info should I track for customers?',
      'Show me customer best practices',
    ],
  },
  vendors: {
    welcomeMessage: "Welcome to Vendors! Here you'll track everyone you pay - suppliers, contractors, service providers. Need help getting started?",
    quickActions: [
      'How do I add a vendor?',
      'What\'s the difference between vendors and customers?',
      'How do I track what I owe vendors?',
    ],
  },
  products_services: {
    welcomeMessage: "You're in Products & Services! Set up the items you sell here to make invoicing faster. Want me to walk you through creating your first item?",
    quickActions: [
      'How do I add a service?',
      'What\'s the difference between products and services?',
      'How do I set prices?',
    ],
  },
  invoices: {
    welcomeMessage: "Welcome to Invoices! This is where you bill your customers. Ready to create your first invoice, or would you like to understand how invoicing works first?",
    quickActions: [
      'How do I create an invoice?',
      'What happens when I send an invoice?',
      'How do I track unpaid invoices?',
    ],
  },
  estimates: {
    welcomeMessage: "You're in Estimates! Create quotes and proposals here before sending official invoices. Would you like help creating an estimate?",
    quickActions: [
      'How do I create an estimate?',
      'How do I convert an estimate to an invoice?',
      'What\'s the difference between estimates and invoices?',
    ],
  },
  bills: {
    welcomeMessage: "Welcome to Bills! Track what you owe to vendors here. Think of bills as invoices from OTHER companies to you. Need help entering a bill?",
    quickActions: [
      'How do I enter a bill?',
      'What\'s the difference between bills and expenses?',
      'How do I pay a bill?',
    ],
  },
  expenses: {
    welcomeMessage: "You're in Expenses! Record day-to-day spending like credit card purchases and cash payments here. Ready to log an expense?",
    quickActions: [
      'How do I record an expense?',
      'How should I categorize expenses?',
      'Can I attach receipts?',
    ],
  },
  chart_of_accounts: {
    welcomeMessage: "Welcome to the Chart of Accounts! This is the backbone of your accounting - every dollar flows through these accounts. Don't worry, we've set up the common ones for you. Would you like me to explain how it works?",
    quickActions: [
      'What is a chart of accounts?',
      'What are the account types?',
      'Should I add more accounts?',
    ],
  },
  journal_entries: {
    welcomeMessage: "You're in Journal Entries - the foundation of double-entry bookkeeping! Most transactions create these automatically, but you can make manual entries here for special cases. Want me to explain debits and credits?",
    quickActions: [
      'What are journal entries?',
      'Explain debits and credits',
      'When do I need manual entries?',
    ],
  },
  reports: {
    welcomeMessage: "Welcome to Reports! This is where all your data comes together to show you how your business is doing. Let me help you find the right report for your needs.",
    quickActions: [
      'What reports should I run?',
      'What is a P&L report?',
      'How do I read a balance sheet?',
    ],
  },
  tax_settings: {
    welcomeMessage: "You're in Tax Settings! This is where you configure how sales tax is calculated for your invoices. You can choose manual selection, automatic ZIP-based lookup, or connect to paid tax APIs for precise rates. Want me to explain the options?",
    quickActions: [
      'Which tax method should I use?',
      'How does automatic tax calculation work?',
      'What is Avalara/TaxJar?',
      'Do I need to collect sales tax?',
    ],
  },
};

/**
 * This component enhances Milton (ChatInterface) with onboarding awareness.
 * It monitors the current page and user's onboarding status to provide
 * contextual help when users visit newly unlocked features.
 */
export default function MiltonOnboardingHelper() {
  const location = useLocation();
  const { addMessage, setIsOpen, messages, isOpen } = useChat();
  const { getFeatureStatus, status: onboardingStatus, getFeatureDetails } = useOnboarding();

  const lastFeatureHelpRef = useRef<string | null>(null);
  const hasShownInitialHelpRef = useRef<Set<string>>(
    (() => {
      const saved = localStorage.getItem('modern-accounting:milton-feature-help');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    })()
  );

  useEffect(() => {
    // Skip if onboarding is completed or all features shown
    if (onboardingStatus?.showAllFeatures || onboardingStatus?.onboardingCompleted) {
      return;
    }

    // Get current feature key
    const featureKey = pathToFeatureKey[location.pathname];
    if (!featureKey) return;

    // Check feature status
    const featureStatus = getFeatureStatus(featureKey);

    // Only provide help for unlocked or in_progress features
    if (featureStatus !== 'unlocked' && featureStatus !== 'in_progress') {
      return;
    }

    // Check if we've already shown help for this feature in this session
    if (lastFeatureHelpRef.current === featureKey) {
      return;
    }

    // Check if we've ever shown help for this feature
    const shownHelp = hasShownInitialHelpRef.current;
    if (shownHelp.has(featureKey)) {
      return;
    }

    // Get help message for this feature
    const helpInfo = featureHelpMessages[featureKey];
    if (!helpInfo) return;

    // Show Milton with contextual help after a short delay
    const timer = setTimeout(async () => {
      // Only show if chat isn't already open with recent messages
      const recentMessages = messages.filter(m =>
        Date.now() - m.timestamp.getTime() < 60000
      );

      if (recentMessages.length > 1) {
        // User has been chatting recently, don't interrupt
        return;
      }

      // Get additional feature details
      const details = await getFeatureDetails(featureKey);

      // Add welcome message from Milton
      addMessage({
        role: 'assistant',
        content: helpInfo.welcomeMessage +
          (details?.tailoredNote ? `\n\n**Tip for you:** ${details.tailoredNote}` : ''),
        isProactiveSuggestion: true,
      });

      // Open the chat if it's closed
      if (!isOpen) {
        setIsOpen(true);
      }

      // Mark as shown
      lastFeatureHelpRef.current = featureKey;
      shownHelp.add(featureKey);
      localStorage.setItem('modern-accounting:milton-feature-help', JSON.stringify([...shownHelp]));
    }, 2000); // 2 second delay to let the page load

    return () => clearTimeout(timer);
  }, [location.pathname, onboardingStatus, getFeatureStatus, getFeatureDetails, addMessage, setIsOpen, messages, isOpen]);

  // This component doesn't render anything - it just manages Milton's behavior
  return null;
}

// Export the feature help messages for use by ChatInterface
export { featureHelpMessages, pathToFeatureKey };
