import { useRef, useEffect, useState, useCallback } from 'react';
import { MessageCircle, X, Send, AlertTriangle, Sparkles, RefreshCw, Paperclip, Edit2, RotateCcw, XCircle, FileIcon, Image as ImageIcon, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useNavigate } from 'react-router-dom';
import { useChat, Insight, FileAttachment } from '../contexts/ChatContext';
import QBOConnectButton, { getQboSessionId } from './QBOConnectButton';

// API configuration
const CHAT_API_BASE_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:7071';

// Configure DOMPurify to allow safe link attributes
const sanitizeConfig = {
  ALLOWED_TAGS: ['a', 'b', 'i', 'em', 'strong', 'br', 'p', 'span', 'ul', 'li', 'ol'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-internal'],
  ALLOW_DATA_ATTR: true,
};

function sanitizeAndFormatContent(content: string): string {
  // Convert markdown bold to HTML
  let htmlContent = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Convert markdown links to HTML - internal links (starting with /) don't open in new tab
  htmlContent = htmlContent.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, text, url) => {
      const isInternal = url.startsWith('/');
      if (isInternal) {
        return `<a href="${url}" class="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300" data-internal="true">${text}</a>`;
      }
      return `<a href="${url}" class="underline text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
  );
  // Convert newlines to breaks
  htmlContent = htmlContent.replace(/\n/g, '<br />');
  // Sanitize the result - DOMPurify.sanitize returns a string in most contexts
  const sanitized = DOMPurify.sanitize(htmlContent, sanitizeConfig);
  return typeof sanitized === 'string' ? sanitized : String(sanitized);
}

// Quick action chips component - collapsible (starts expanded only during onboarding)
function QuickActions({ onAction, disabled, qboConnected, isOnboarding }: { onAction: (text: string) => void; disabled: boolean; qboConnected: boolean; isOnboarding: boolean }) {
  const [isExpanded, setIsExpanded] = useState(isOnboarding);
  const [wasOnboarding, setWasOnboarding] = useState(isOnboarding);

  // Auto-collapse when user moves past onboarding without picking a quick action
  if (wasOnboarding && !isOnboarding) {
    setIsExpanded(false);
    setWasOnboarding(false);
  }

  const actions = isOnboarding
    ? [
        { label: 'Yes, from QuickBooks', icon: 'QB', style: 'qbo' },
        { label: 'Yes, from another platform', icon: '↗', style: 'default' },
        { label: 'Starting fresh', icon: '✨', style: 'default' },
      ]
    : [
        { label: 'Show overdue invoices', icon: '!', style: 'default' },
        { label: 'Revenue this month', icon: '$', style: 'default' },
        { label: 'Top customers', icon: '#', style: 'default' },
        ...(qboConnected ? [{ label: 'Migrate from QuickBooks', icon: 'QB', style: 'qbo' }] : []),
      ];

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
      >
        <span>{isOnboarding ? 'Quick responses' : 'Quick actions'}</span>
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {isExpanded && (
        <div className="flex flex-wrap gap-2 px-3 pb-2">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => onAction(action.label)}
              disabled={disabled}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors
                bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300
                border border-gray-200 dark:border-gray-600
                hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                hover:text-indigo-600 dark:hover:text-indigo-400
                hover:border-indigo-300 dark:hover:border-indigo-700
                disabled:opacity-50 disabled:cursor-not-allowed
                ${action.style === 'qbo' ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300' : ''}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Insights panel component - collapsible with badge
function InsightsPanel({
  insights,
  onAskAbout,
  disabled
}: {
  insights: Insight[];
  onAskAbout: (title: string) => void;
  disabled: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!insights || insights.length === 0) return null;

  const warningCount = insights.filter(i => i.severity === 'warning').length;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-800/20 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
          <Sparkles className="w-4 h-4" />
          <span>Insights</span>
          {warningCount > 0 && (
            <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {warningCount}
            </span>
          )}
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-amber-600" /> : <ChevronRight className="w-4 h-4 text-amber-600" />}
      </button>
      {isExpanded && (
        <div className="px-3 pb-2 space-y-2">
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
      )}
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

// Copy all messages button component
function CopyAllButton({ messages }: { messages: Array<{ role: string; content: string; timestamp: Date }> }) {
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    const formattedMessages = messages.map(msg => {
      const date = msg.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const speaker = msg.role === 'user' ? 'You' : 'Assistant';
      return `[${date} ${time}] ${speaker}:\n${msg.content}`;
    }).join('\n\n---\n\n');

    try {
      await navigator.clipboard.writeText(formattedMessages);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <button
      onClick={handleCopyAll}
      className="hover:bg-indigo-700 dark:hover:bg-indigo-600 p-1.5 rounded transition-colors"
      aria-label="Copy conversation"
      title="Copy conversation"
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-300" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
}

export default function ChatInterface() {
  const {
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
  } = useChat();

  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [qboConnected, setQboConnected] = useState(false);

  // Handle clicks on internal links in chat messages
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' && target.dataset.internal === 'true') {
      e.preventDefault();
      const href = target.getAttribute('href');
      if (href) {
        navigate(href);
      }
    }
  }, [navigate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch insights when chat opens
  useEffect(() => {
    if (isOpen) {
      fetch(`${CHAT_API_BASE_URL}/api/insights`)
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

  // Show welcome message when chat opens for the first time (no messages)
  const hasShownWelcome = useRef(false);
  useEffect(() => {
    if (isOpen && messages.length === 0 && !hasShownWelcome.current) {
      hasShownWelcome.current = true;
      // Add welcome message from assistant
      addMessage({
        role: 'assistant',
        content: `Welcome to ACTO! I'm your accounting assistant and I'm here to help you get started.

**Are you migrating from another accounting platform** like QuickBooks, Xero, or FreshBooks? I can help import your existing data to make the transition seamless!

Or if you're starting fresh, I can help you set up your chart of accounts and create your first customers.

What would you like to do?`
      });
    }
  }, [isOpen, messages.length, addMessage]);

  // Handle file upload
  const uploadFile = async (file: File): Promise<FileAttachment | null> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/chat/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      return data.file;
    } catch (error) {
      console.error('File upload error:', error);
      return null;
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileInfo = await uploadFile(file);
      if (fileInfo) {
        addPendingAttachment(fileInfo);
      }
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // Clipboard paste handler
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const fileInfo = await uploadFile(file);
          if (fileInfo) {
            addPendingAttachment(fileInfo);
          }
        }
      }
    }
  };

  const sendMessage = async (text: string, attachments: FileAttachment[] = []) => {
    if ((!text.trim() && attachments.length === 0) || isLoading) return;

    addMessage({ role: 'user', content: text, attachments });
    setIsLoading(true);
    clearPendingAttachments();

    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-QBO-Session-Id': getQboSessionId()
        },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10),
          attachments,
        }),
      });

      if (!response.ok) throw new Error('Chat API failed');

      const data = await response.json();

      if (data.error) {
        addMessage({
          role: 'assistant',
          content: data.error || 'Sorry, I encountered an error.',
          error: true,
          retryable: data.retryable || false,
        });
      } else {
        addMessage({
          role: 'assistant',
          content: data.response || 'Sorry, I encountered an error.',
          isUncertain: data.isUncertain,
          toolUsed: data.toolUsed,
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      addMessage({
        role: 'assistant',
        content: 'I had trouble connecting to the server. This might be a temporary issue.',
        error: true,
        retryable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRef.current) {
      sendMessage(inputRef.current.value, pendingAttachments);
      inputRef.current.value = '';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Up arrow to edit last user message
    if (e.key === 'ArrowUp' && inputRef.current?.value === '') {
      e.preventDefault();
      const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        handleEditMessage(lastUserMessage.id, lastUserMessage.content);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditContent(content);
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editContent.trim()) return;

    // Find the message being edited
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    // Update the edited message
    updateMessage(messageId, { content: editContent, originalContent: messages[messageIndex].content });
    
    setEditingMessageId(null);
    setEditContent('');

    // Resubmit with edited content
    await sendMessage(editContent, messages[messageIndex].attachments || []);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleRetry = async (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    // Get the previous user message
    const prevUserMessage = messages[messageIndex - 1];
    if (prevUserMessage.role !== 'user') return;

    // Resubmit
    await sendMessage(prevUserMessage.content, prevUserMessage.attachments || []);
  };

  const handleQuickAction = (action: string) => {
    sendMessage(action, []);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg
          hover:bg-indigo-700 transition-all hover:scale-110 z-50
          dark:bg-indigo-500 dark:hover:bg-indigo-600
          ${isLoading ? 'animate-pulse ring-4 ring-indigo-300 dark:ring-indigo-400' : ''}`}
        aria-label={isLoading ? "AI is thinking..." : "Open chat"}
        title={isLoading ? "AI is working on a response..." : "Open chat"}
      >
        <MessageCircle className={`w-6 h-6 ${isLoading ? 'animate-bounce' : ''}`} />
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
          <CopyAllButton messages={messages} />
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

      {/* QBO Connection Status - compact */}
      <div className="px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <QBOConnectButton
          compact={true}
          onStatusChange={(status) => {
            setQboConnected(status.connected);
          }}
        />
      </div>

      {/* Insights Panel */}
      <InsightsPanel insights={insights} onAskAbout={handleQuickAction} disabled={isLoading} />

      {/* Quick Actions */}
      <QuickActions
        onAction={handleQuickAction}
        disabled={isLoading}
        qboConnected={qboConnected}
        isOnboarding={messages.length === 1 && messages[0]?.role === 'assistant'}
      />

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="fixed inset-0 bg-indigo-500/20 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
              <Paperclip className="w-12 h-12 text-indigo-600 dark:text-indigo-400 mx-auto mb-2" />
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Drop files here</p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-indigo-600 dark:bg-indigo-500 text-white'
                  : `bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm border border-gray-100 dark:border-gray-700 ${
                      message.isUncertain ? 'border-l-4 border-l-amber-400' : ''
                    } ${message.error ? 'border-l-4 border-l-red-400' : ''}`
              }`}
            >
              {/* Edit mode */}
              {editingMessageId === message.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    rows={3}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(message.id)}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                    >
                      Save & Resubmit
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100 rounded text-sm hover:bg-gray-400 dark:hover:bg-gray-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* File attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {message.attachments.map((att) => (
                        <div key={att.fileId} className="flex items-center gap-2 text-xs bg-white/10 rounded p-1">
                          {att.fileType.startsWith('image/') ? (
                            <ImageIcon className="w-4 h-4" />
                          ) : (
                            <FileIcon className="w-4 h-4" />
                          )}
                          <span className="truncate">{att.fileName}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message content */}
                  <div
                    className="text-sm leading-relaxed"
                    onClick={handleContentClick}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeAndFormatContent(message.content),
                    }}
                  />

                  {/* Edit button for user messages */}
                  {message.role === 'user' && !isLoading && (
                    <button
                      onClick={() => handleEditMessage(message.id, message.content)}
                      className="opacity-0 group-hover:opacity-100 mt-2 text-xs flex items-center gap-1 hover:underline transition-opacity"
                      title="Edit message"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                  )}

                  {/* Retry button for error messages */}
                  {message.role === 'assistant' && message.error && message.retryable && (
                    <button
                      onClick={() => handleRetry(message.id)}
                      className="mt-2 text-xs flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
                      disabled={isLoading}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry
                    </button>
                  )}

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
                </>
              )}
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
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
            {pendingAttachments.map((att) => (
              <div 
                key={att.fileId} 
                className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 text-xs"
              >
                {att.fileType.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                ) : (
                  <FileIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                )}
                <span className="truncate max-w-[150px]">{att.fileName}</span>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(att.fileId)}
                  className="text-red-500 hover:text-red-700"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="p-4 flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.csv,.xlsx,.xls"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="text-gray-600 dark:text-gray-400 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700
              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Attach file"
            title="Attach file (or drag & drop, or paste)"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask me anything... (↑ to edit last message)"
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
              text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500"
            disabled={isLoading}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
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
