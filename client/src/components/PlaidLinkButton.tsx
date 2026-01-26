import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlaidLink, PlaidLinkOptions, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { Link2, Link2Off, Loader2, Building2, RefreshCw, WifiOff } from 'lucide-react';

const CHAT_API_BASE_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:7071';

// Check if the Plaid service is available
async function checkPlaidServiceAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/connections`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

interface PlaidConnection {
  id: string;
  itemId: string;
  institutionName: string;
  accountCount: number;
  syncStatus: string;
  lastSyncAt: string | null;
}

interface PlaidLinkButtonProps {
  onConnectionChange?: (connections: PlaidConnection[]) => void;
  compact?: boolean;
}

export default function PlaidLinkButton({ onConnectionChange, compact = false }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [connections, setConnections] = useState<PlaidConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [serviceAvailable, setServiceAvailable] = useState<boolean | null>(null);
  const hasCheckedService = useRef(false);

  // Check service availability once on mount
  useEffect(() => {
    if (!hasCheckedService.current) {
      hasCheckedService.current = true;
      checkPlaidServiceAvailable().then((available) => {
        setServiceAvailable(available);
        if (!available) {
          setIsLoading(false);
        }
      });
    }
  }, []);

  // Fetch existing connections - only if service is available
  const fetchConnections = useCallback(async () => {
    if (!serviceAvailable) return;
    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/connections`);
      if (!response.ok) throw new Error('Failed to fetch connections');
      const data = await response.json();
      setConnections(data.connections || []);
      onConnectionChange?.(data.connections || []);
    } catch (error) {
      console.error('Failed to fetch Plaid connections:', error);
      setConnections([]);
    } finally {
      setIsLoading(false);
    }
  }, [onConnectionChange, serviceAvailable]);

  // Create link token for Plaid Link - only if service is available
  const createLinkToken = useCallback(async () => {
    if (!serviceAvailable) return;
    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/link-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'default-user' }),
      });

      if (!response.ok) throw new Error('Failed to create link token');
      const data = await response.json();
      setLinkToken(data.linkToken);
    } catch (error) {
      console.error('Failed to create link token:', error);
    }
  }, [serviceAvailable]);

  // Initialize when service becomes available
  useEffect(() => {
    if (serviceAvailable) {
      fetchConnections();
      createLinkToken();
    }
  }, [fetchConnections, createLinkToken, serviceAvailable]);

  // Handle Plaid Link success
  const onSuccess = useCallback(async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    setIsConnecting(true);
    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/exchange-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken,
          metadata: {
            institution: metadata.institution,
            accounts: metadata.accounts,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to exchange token');

      const result = await response.json();
      console.log('Plaid connection successful:', result);

      // Refresh connections list
      await fetchConnections();

      // Create a new link token for next connection
      await createLinkToken();
    } catch (error) {
      console.error('Failed to complete Plaid connection:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [fetchConnections, createLinkToken]);

  // Plaid Link configuration
  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) {
        console.error('Plaid Link error:', err);
      }
      setIsConnecting(false);
    },
  };

  const { open, ready } = usePlaidLink(config);

  // Handle sync for a connection
  const handleSync = async (itemId: string) => {
    setIsSyncing(itemId);
    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/connections/${itemId}/sync`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Sync failed');
      const result = await response.json();
      console.log('Sync result:', result);

      // Refresh connections to get updated sync status
      await fetchConnections();
    } catch (error) {
      console.error('Failed to sync:', error);
    } finally {
      setIsSyncing(null);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (itemId: string) => {
    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/connections/${itemId}/disconnect`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Disconnect failed');

      // Refresh connections
      await fetchConnections();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-gray-500 dark:text-gray-400 ${compact ? 'text-xs' : 'text-sm'}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        {!compact && <span>Loading bank connections...</span>}
      </div>
    );
  }

  // Service unavailable state
  if (serviceAvailable === false) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <WifiOff className="w-4 h-4" />
          <span>Bank service offline</span>
        </div>
      );
    }
    return (
      <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <WifiOff className="w-5 h-5" />
          <span className="text-sm font-medium">Bank connection service unavailable</span>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          The Plaid API service is not running.
        </p>
      </div>
    );
  }

  // Compact mode: just show connect button
  if (compact) {
    return (
      <button
        onClick={() => open()}
        disabled={!ready || isConnecting}
        className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4" />
            <span>Connect Bank</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {/* Connected banks list */}
      {connections.length > 0 && (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg border border-green-200 dark:border-green-800"
            >
              <Building2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
                  {conn.institutionName}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400">
                  {conn.accountCount} account{conn.accountCount !== 1 ? 's' : ''} linked
                  {conn.lastSyncAt && (
                    <span className="ml-2">
                      Last sync: {new Date(conn.lastSyncAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSync(conn.itemId)}
                  disabled={isSyncing === conn.itemId}
                  className="p-1.5 hover:bg-green-100 dark:hover:bg-green-800 rounded transition-colors"
                  title="Sync transactions"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-green-600 dark:text-green-400 ${
                      isSyncing === conn.itemId ? 'animate-spin' : ''
                    }`}
                  />
                </button>
                <button
                  onClick={() => handleDisconnect(conn.itemId)}
                  className="p-1.5 hover:bg-green-100 dark:hover:bg-green-800 rounded transition-colors"
                  title="Disconnect bank"
                >
                  <Link2Off className="w-4 h-4 text-green-600 dark:text-green-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect button */}
      <button
        onClick={() => open()}
        disabled={!ready || isConnecting}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm disabled:opacity-50 transition-colors"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4" />
            <span>{connections.length > 0 ? 'Connect Another Bank' : 'Connect Bank Account'}</span>
          </>
        )}
      </button>
    </div>
  );
}
