import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isUncertain?: boolean;
  toolUsed?: string | null;
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

interface ChatContextType {
  messages: Message[];
  isOpen: boolean;
  isLoading: boolean;
  insights: Insight[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setIsOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setInsights: (insights: Insight[]) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const initialMessage: Message = {
  id: '1',
  role: 'assistant',
  content: "Hi! I'm your accounting assistant. I can help you with:\n\n" +
    "- **Data queries**: \"Show all invoices\", \"Who are my top customers?\", \"What's overdue?\"\n" +
    "- **Financial summaries**: \"Revenue this month\", \"How much do we owe vendors?\"\n" +
    "- **Accounting guidance**: \"Where should I expense a phone bill?\", \"What is depreciation?\"\n\n" +
    "What would you like to know?",
  timestamp: new Date(),
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);

  const addMessage = useCallback((message: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...message,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([initialMessage]);
  }, []);

  const value: ChatContextType = {
    messages,
    isOpen,
    isLoading,
    insights,
    addMessage,
    clearMessages,
    setIsOpen,
    setIsLoading,
    setInsights,
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
