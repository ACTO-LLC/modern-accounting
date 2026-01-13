import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

interface ChatContextType {
  messages: Message[];
  isOpen: boolean;
  isLoading: boolean;
  insights: Insight[];
  pendingAttachments: FileAttachment[];
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  setIsOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setInsights: (insights: Insight[]) => void;
  addPendingAttachment: (file: FileAttachment) => void;
  removePendingAttachment: (fileId: string) => void;
  clearPendingAttachments: () => void;
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
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);

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

  const value: ChatContextType = {
    messages,
    isOpen,
    isLoading,
    insights,
    pendingAttachments,
    addMessage,
    updateMessage,
    clearMessages,
    setIsOpen,
    setIsLoading,
    setInsights,
    addPendingAttachment,
    removePendingAttachment,
    clearPendingAttachments,
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
