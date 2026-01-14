import { useState, useEffect, useCallback } from 'react';
import { Link2, Link2Off, Loader2, Building2 } from 'lucide-react';

// API configuration
const CHAT_API_BASE_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:7071';

interface QBOStatus {
  connected: boolean;
  companyName?: string;
  realmId?: string;
  sessionId?: string;
}

interface QBOConnectButtonProps {
  onStatusChange?: (status: QBOStatus) => void;
  compact?: boolean;
}

// Generate a persistent session ID for this browser
function getQboSessionId(): string {
  let sessionId = localStorage.getItem('qbo_session_id');
  if (!sessionId) {
    sessionId = `qbo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('qbo_session_id', sessionId);
  }
  return sessionId;
}

export default function QBOConnectButton({ onStatusChange, compact = false }: QBOConnectButtonProps) {
  const [status, setStatus] = useState<QBOStatus>({ connected: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const sessionId = getQboSessionId();

  // Check connection status
  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/qbo/status`, {
        headers: {
          'X-QBO-Session-Id': sessionId
        }
      });

      if (!response.ok) throw new Error('Status check failed');

      const data = await response.json();
      const newStatus = {
        connected: data.connected,
        companyName: data.companyName,
        realmId: data.realmId,
        sessionId
      };

      setStatus(newStatus);
      onStatusChange?.(newStatus);
    } catch (error) {
      console.error('QBO status check error:', error);
      setStatus({ connected: false, sessionId });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, onStatusChange]);

  // Check status on mount and listen for OAuth completion
  useEffect(() => {
    checkStatus();

    // Listen for postMessage from OAuth popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'qbo_connected') {
        console.log('QBO connected via postMessage:', event.data.companyName);
        setIsConnecting(false);
        checkStatus(); // Refresh status from server
      }
    };

    // Re-check when window regains focus (backup for popup close)
    const handleFocus = () => {
      if (isConnecting) {
        checkStatus();
        setIsConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkStatus, isConnecting]);

  // Listen for OAuth callback via URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('qbo_connected') === 'true') {
      // Clear the URL params
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh status
      checkStatus();
    }
  }, [checkStatus]);

  // Initiate OAuth connection
  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/qbo/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-QBO-Session-Id': sessionId
        },
        body: JSON.stringify({
          redirectUrl: window.location.origin + window.location.pathname
        })
      });

      if (!response.ok) throw new Error('Connect initiation failed');

      const data = await response.json();

      if (data.authUrl) {
        // Open OAuth in popup or redirect
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        window.open(
          data.authUrl,
          'qbo-oauth',
          `width=${width},height=${height},left=${left},top=${top}`
        );
      }
    } catch (error) {
      console.error('QBO connect error:', error);
      setIsConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      await fetch(`${CHAT_API_BASE_URL}/api/qbo/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-QBO-Session-Id': sessionId
        }
      });

      setStatus({ connected: false, sessionId });
      onStatusChange?.({ connected: false, sessionId });
    } catch (error) {
      console.error('QBO disconnect error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>Checking QuickBooks...</span>}
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className={`flex items-center gap-2 ${compact ? '' : 'bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg border border-green-200 dark:border-green-800'}`}>
        <Building2 className={`w-4 h-4 text-green-600 dark:text-green-400 ${compact ? '' : ''}`} />
        <div className={`flex-1 min-w-0 ${compact ? '' : ''}`}>
          {!compact && (
            <div className="text-xs text-green-700 dark:text-green-300 font-medium">Connected to QuickBooks</div>
          )}
          <div className={`${compact ? 'text-xs' : 'text-sm'} text-green-800 dark:text-green-200 truncate`}>
            {status.companyName || 'QuickBooks Company'}
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          className="p-1 hover:bg-green-100 dark:hover:bg-green-800 rounded transition-colors"
          title="Disconnect from QuickBooks"
        >
          <Link2Off className="w-4 h-4 text-green-600 dark:text-green-400" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className={`flex items-center gap-2 transition-colors
        ${compact
          ? 'text-xs text-indigo-600 dark:text-indigo-400 hover:underline'
          : 'bg-[#2CA01C] hover:bg-[#1E7813] text-white px-4 py-2 rounded-lg font-medium shadow-sm disabled:opacity-50'
        }`}
    >
      {isConnecting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {!compact && <span>Connecting...</span>}
        </>
      ) : (
        <>
          <Link2 className="w-4 h-4" />
          <span>{compact ? 'Connect QB' : 'Connect to QuickBooks'}</span>
        </>
      )}
    </button>
  );
}

// Export the session ID getter for use in other components
export { getQboSessionId };
