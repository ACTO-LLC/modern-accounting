import { useRef, useEffect } from 'react';
import { MessageCircle, X, Send, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useChat, Insight } from '../contexts/ChatContext';

// Configure DOMPurify to allow safe link attributes
const sanitizeConfig: DOMPurify.Config = {
  ALLOWED_TAGS: ['a', 'b', 'i', 'em', 'strong', 'br', 'p', 'span', 'ul', 'li', 'ol'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  ALLOW_DATA_ATTR: false,
};

function sanitizeAndFormatContent(content: string): string {
  // Convert markdown bold to HTML
  let htmlContent = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Convert markdown links to HTML
  htmlContent = htmlContent.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // Convert newlines to breaks
  htmlContent = htmlContent.replace(/\n/g, '<br />');
  // Sanitize the result
  return DOMPurify.sanitize(htmlContent, sanitizeConfig);
}

// Quick action chips component
function QuickActions({ onAction, disabled }: { onAction: (text: string) => void; disabled: boolean }) {
  const actions = [
    { label: 'Show overdue invoices', icon: '!' },
    { label: 'Revenue this month', icon: '$' },
    { label: 'Top customers', icon: '#' },
  ];

  return (
    <div className="flex flex-wrap gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <span className="text-xs text-gray-500 dark:text-gray-400 w-full mb-1">Quick actions:</span>
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.label)}
          disabled={disabled}
          className="text-xs px-3 py-1.5 rounded-full transition-colors
            bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300
            border border-gray-200 dark:border-gray-600
            hover:bg-indigo-50 dark:hover:bg-indigo-900/30
            hover:text-indigo-600 dark:hover:text-indigo-400
            hover:border-indigo-300 dark:hover:border-indigo-700
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

// Insights panel component
function InsightsPanel({
  insights,
  onAskAbout,
  disabled
}: {
  insights: Insight[];
  onAskAbout: (title: string) => void;
  disabled: boolean;
}) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-amber-800 dark:text-amber-300">
        <Sparkles className="w-4 h-4" />
        Insights
      </div>
      <div className="space-y-2">
        {insights.slice(0, 3).map((insight, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded text-xs shadow-sm"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {insight.severity === 'warning' && (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              )}
              <span className="text-gray-700 dark:text-gray-300 truncate">
                {insight.message}
              </span>
            </div>
            <button
              onClick={() => onAskAbout(`Tell me more about ${insight.title.toLowerCase()}`)}
              disabled={disabled}
              className="text-indigo-600 dark:text-indigo-400 hover:underline ml-2 flex-shrink-0 disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Uncertainty badge component
function UncertaintyBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-2">
      <AlertTriangle className="w-3 h-3" />
      Based on available data - verify for accuracy
    </span>
  );
}

export default function ChatInterface() {
  const {
    messages,
    isOpen,
    isLoading,
    insights,
    addMessage,
    clearMessages,
    setIsOpen,
    setIsLoading,
    setInsights,
  } = useChat();

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch insights when chat opens
  useEffect(() => {
    if (isOpen) {
      fetch('http://localhost:7071/api/insights')
        .then((r) => r.json())
        .then((data) => setInsights(data.insights || []))
        .catch(console.error);
    }
  }, [isOpen, setInsights]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    addMessage({ role: 'user', content: text });
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:7071/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10), // Send last 10 messages for context
        }),
      });

      if (!response.ok) throw new Error('Chat API failed');

      const data = await response.json();

      addMessage({
        role: 'assistant',
        content: data.response || 'Sorry, I encountered an error.',
        isUncertain: data.isUncertain,
        toolUsed: data.toolUsed,
      });
    } catch (error) {
      console.error('Chat error:', error);
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error connecting to the server. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRef.current) {
      sendMessage(inputRef.current.value);
      inputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleQuickAction = (action: string) => {
    sendMessage(action);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg
          hover:bg-indigo-700 transition-all hover:scale-110 z-50
          dark:bg-indigo-500 dark:hover:bg-indigo-600"
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[600px] rounded-lg shadow-2xl flex flex-col z-50
      bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="bg-indigo-600 dark:bg-indigo-700 text-white p-4 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          <h3 className="font-semibold">Accounting Assistant</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearMessages}
            className="hover:bg-indigo-700 dark:hover:bg-indigo-600 p-1.5 rounded transition-colors"
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="hover:bg-indigo-700 dark:hover:bg-indigo-600 p-1.5 rounded transition-colors"
            aria-label="Close chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Insights Panel */}
      <InsightsPanel insights={insights} onAskAbout={handleQuickAction} disabled={isLoading} />

      {/* Quick Actions */}
      <QuickActions onAction={handleQuickAction} disabled={isLoading} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white'
                  : `bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm border border-gray-100 dark:border-gray-700 ${
                      message.isUncertain ? 'border-l-4 border-l-amber-400' : ''
                    }`
              }`}
            >
              <div
                className="text-sm leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: sanitizeAndFormatContent(message.content),
                }}
              />
              {message.role === 'assistant' && message.isUncertain && <UncertaintyBadge />}
              {message.role === 'assistant' && message.toolUsed && (
                <span className="block text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Source: {message.toolUsed.replace(/_/g, ' ')}
                </span>
              )}
              <p
                className={`text-xs mt-2 ${
                  message.role === 'user'
                    ? 'text-indigo-200'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex gap-1.5">
                <div
                  className="w-2 h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                ></div>
                <div
                  className="w-2 h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                ></div>
                <div
                  className="w-2 h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                ></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask me anything..."
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
              text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500"
            disabled={isLoading}
            onKeyPress={handleKeyPress}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 dark:bg-indigo-500 text-white p-2 rounded-lg
              hover:bg-indigo-700 dark:hover:bg-indigo-600
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
