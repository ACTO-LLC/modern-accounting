import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isUncertain?: boolean;
  toolUsed?: string | null;
  attachments?: FileAttachment[];
  isEditing?: boolean;
  originalContent?: string;
  error?: boolean;
  retryable?: boolean;
  isProactiveSuggestion?: boolean;
}

export interface FileAttachment {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  extractedText?: string;
  preview?: string;
}

export interface Insight {
  type: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  action?: {
    label: string;
    path: string;
  };
}

// Page context for AI awareness
export interface PageContext {
  currentRoute: string;
  currentEntity?: string;  // e.g., "customer", "invoice"
  currentEntityId?: string;
  pageTitle?: string;
}

// Proactive suggestion configuration
export interface ProactiveSuggestion {
  route: string;
  routePattern?: RegExp;
  suggestion: string;
  quickActions?: string[];
}

// User preferences for proactive suggestions
export type SuggestionFrequency = 'always' | 'first_visit' | 'never';

export interface ChatPreferences {
  proactiveSuggestionsEnabled: boolean;
  suggestionFrequency: SuggestionFrequency;
  dismissedSuggestions: string[];  // Routes where user dismissed suggestions
}

interface ChatContextType {
  messages: Message[];
  isOpen: boolean;
  isLoading: boolean;
  insights: Insight[];
  pendingAttachments: FileAttachment[];
  pageContext: PageContext;
  preferences: ChatPreferences;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  setIsOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setInsights: (insights: Insight[]) => void;
  addPendingAttachment: (file: FileAttachment) => void;
  removePendingAttachment: (fileId: string) => void;
  clearPendingAttachments: () => void;
  setPageContext: (context: PageContext) => void;
  updatePreferences: (prefs: Partial<ChatPreferences>) => void;
  dismissSuggestionForRoute: (route: string) => void;
  getProactiveSuggestion: () => ProactiveSuggestion | null;
  markRouteAsVisited: (route: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const initialMessage: Message = {
  id: '1',
  role: 'assistant',
  content: "Hi! I'm Milton, your accounting assistant. I can help you with:\n\n" +
    "- **Data queries**: \"Show all invoices\", \"Who are my top customers?\", \"What's overdue?\"\n" +
    "- **Financial summaries**: \"Revenue this month\", \"How much do we owe vendors?\"\n" +
    "- **Accounting guidance**: \"Where should I expense a phone bill?\", \"What is depreciation?\"\n\n" +
    "What would you like to know?",
  timestamp: new Date(),
};

// Default preferences - load from localStorage if available
const PREFERENCES_STORAGE_KEY = 'chat-preferences';
const VISITED_ROUTES_KEY = 'chat-visited-routes';

const defaultPreferences: ChatPreferences = {
  proactiveSuggestionsEnabled: true,
  suggestionFrequency: 'first_visit',
  dismissedSuggestions: [],
};

function loadPreferences(): ChatPreferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (stored) {
      return { ...defaultPreferences, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load chat preferences:', e);
  }
  return defaultPreferences;
}

function savePreferences(prefs: ChatPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save chat preferences:', e);
  }
}

function getVisitedRoutes(): Set<string> {
  try {
    const stored = localStorage.getItem(VISITED_ROUTES_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.warn('Failed to load visited routes:', e);
  }
  return new Set();
}

function saveVisitedRoute(route: string): void {
  try {
    const visited = getVisitedRoutes();
    visited.add(route);
    localStorage.setItem(VISITED_ROUTES_KEY, JSON.stringify([...visited]));
  } catch (e) {
    console.warn('Failed to save visited route:', e);
  }
}

// Proactive suggestions mapped to routes
const proactiveSuggestions: ProactiveSuggestion[] = [
  {
    route: '/settings',
    suggestion: "I see you're on the **Settings** page. I can help you:\n\n" +
      "- Look up your business information from official sources\n" +
      "- Configure tax settings based on your location\n" +
      "- Set up accounting preferences\n\n" +
      "Would you like help with any of these?",
    quickActions: ['Help me fill in company details', 'Set up tax rates', 'Explain these settings'],
  },
  {
    route: '/customers/new',
    suggestion: "Creating a new customer? I can help you:\n\n" +
      "- **Import from QuickBooks** if you're migrating\n" +
      "- **Look up business information** online\n" +
      "- **Auto-fill from a business card** if you upload an image\n\n" +
      "How would you like to proceed?",
    quickActions: ['Import from QuickBooks', 'Look up a company', 'Upload a business card'],
  },
  {
    route: '/invoices/new',
    suggestion: "Starting a new invoice? I can assist with:\n\n" +
      "- **Suggest line items** based on this customer's history\n" +
      "- **Calculate totals** including applicable taxes\n" +
      "- **Apply terms and discounts** based on your settings\n\n" +
      "Would you like suggestions based on past invoices?",
    quickActions: ['Suggest items from history', 'Explain invoice fields', 'Calculate tax'],
  },
  {
    route: '/vendors/new',
    suggestion: "Adding a new vendor? Let me help:\n\n" +
      "- **Look up vendor information** online\n" +
      "- **Import from QuickBooks** if you're migrating\n" +
      "- **Set up default expense categories** for this vendor\n\n" +
      "Just provide a company name or website!",
    quickActions: ['Look up vendor info', 'Import from QuickBooks', 'Set default categories'],
  },
  {
    route: '/journal-entries/new',
    suggestion: "Creating a journal entry? I'll help ensure accuracy:\n\n" +
      "- **Verify your entry is balanced** (debits = credits)\n" +
      "- **Suggest the correct accounts** for common transactions\n" +
      "- **Explain account types** if you're unsure\n\n" +
      "What type of transaction are you recording?",
    quickActions: ['Suggest accounts for this entry', 'Explain debits and credits', 'Check if balanced'],
  },
  {
    route: '/bills/new',
    suggestion: "Recording a new bill? I can help:\n\n" +
      "- **Categorize the expense** to the right account\n" +
      "- **Check for duplicate bills** from this vendor\n" +
      "- **Schedule payment reminders**\n\n" +
      "What would you like help with?",
    quickActions: ['Suggest expense account', 'Check for duplicates', 'Set payment reminder'],
  },
  {
    route: '/reports/profit-loss',
    suggestion: "Looking at your **Profit & Loss** report? I can:\n\n" +
      "- **Explain variances** compared to previous periods\n" +
      "- **Identify trends** in revenue or expenses\n" +
      "- **Highlight unusual transactions** that may need review\n\n" +
      "Would you like me to analyze this report?",
    quickActions: ['Analyze this report', 'Compare to last month', 'Find unusual items'],
  },
  {
    route: '/bills',
    routePattern: /^\/bills$/,
    suggestion: "Viewing your bills? Let me check for any that need attention...\n\n" +
      "I can help you:\n" +
      "- **Review upcoming due dates**\n" +
      "- **Identify overdue bills**\n" +
      "- **Schedule batch payments**\n\n" +
      "Would you like a summary?",
    quickActions: ['Show overdue bills', 'Bills due this week', 'Schedule payments'],
  },
  {
    route: '/invoices',
    routePattern: /^\/invoices$/,
    suggestion: "Managing invoices? I can help with:\n\n" +
      "- **Track overdue invoices** and send reminders\n" +
      "- **Analyze payment patterns** by customer\n" +
      "- **Generate collection reports**\n\n" +
      "What would you like to focus on?",
    quickActions: ['Show overdue invoices', 'Customer payment analysis', 'Send reminders'],
  },
  {
    route: '/',
    routePattern: /^\/$/,
    suggestion: "Welcome to your dashboard! Here's what I've noticed:\n\n" +
      "I can provide insights on:\n" +
      "- **Cash flow trends**\n" +
      "- **Outstanding receivables**\n" +
      "- **Upcoming payments**\n\n" +
      "Would you like a quick financial summary?",
    quickActions: ['Financial summary', 'Cash flow forecast', 'Action items for today'],
  },
];

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [pageContext, setPageContext] = useState<PageContext>({ currentRoute: '/' });
  const [preferences, setPreferences] = useState<ChatPreferences>(loadPreferences);

  // Persist preferences when they change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, ...updates } : msg));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([initialMessage]);
  }, []);

  const addPendingAttachment = useCallback((file: FileAttachment) => {
    setPendingAttachments(prev => [...prev, file]);
  }, []);

  const removePendingAttachment = useCallback((fileId: string) => {
    setPendingAttachments(prev => prev.filter(f => f.fileId !== fileId));
  }, []);

  const clearPendingAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  const updatePreferences = useCallback((prefs: Partial<ChatPreferences>) => {
    setPreferences(prev => ({ ...prev, ...prefs }));
  }, []);

  const dismissSuggestionForRoute = useCallback((route: string) => {
    setPreferences(prev => ({
      ...prev,
      dismissedSuggestions: [...prev.dismissedSuggestions, route],
    }));
  }, []);

  const getProactiveSuggestion = useCallback((): ProactiveSuggestion | null => {
    // Check if suggestions are enabled
    if (!preferences.proactiveSuggestionsEnabled) {
      return null;
    }

    const currentRoute = pageContext.currentRoute;

    // Check if user dismissed suggestions for this route
    if (preferences.dismissedSuggestions.includes(currentRoute)) {
      return null;
    }

    // Check frequency setting
    if (preferences.suggestionFrequency === 'never') {
      return null;
    }

    if (preferences.suggestionFrequency === 'first_visit') {
      const visited = getVisitedRoutes();
      if (visited.has(currentRoute)) {
        return null;
      }
    }

    // Find matching suggestion
    for (const suggestion of proactiveSuggestions) {
      if (suggestion.routePattern) {
        if (suggestion.routePattern.test(currentRoute)) {
          return suggestion;
        }
      } else if (suggestion.route === currentRoute) {
        return suggestion;
      }
    }

    return null;
  }, [pageContext.currentRoute, preferences]);

  const markRouteAsVisited = useCallback((route: string) => {
    saveVisitedRoute(route);
  }, []);

  const value: ChatContextType = {
    messages,
    isOpen,
    isLoading,
    insights,
    pendingAttachments,
    pageContext,
    preferences,
    addMessage,
    updateMessage,
    clearMessages,
    setIsOpen,
    setIsLoading,
    setInsights,
    addPendingAttachment,
    removePendingAttachment,
    clearPendingAttachments,
    setPageContext,
    updatePreferences,
    dismissSuggestionForRoute,
    getProactiveSuggestion,
    markRouteAsVisited,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
