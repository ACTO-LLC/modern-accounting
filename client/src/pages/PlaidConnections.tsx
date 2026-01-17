import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlaidLink, PlaidLinkOptions, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import {
  Building2,
  Link2,
  Link2Off,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Landmark,
  Settings,
} from 'lucide-react';
import api from '../lib/api';

const CHAT_API_BASE_URL = import.meta.env.VITE_CHAT_API_URL || 'http://localhost:7071';

interface PlaidConnection {
  id: string;
  itemId: string;
  institutionId: string;
  institutionName: string;
  accountCount: number;
  syncStatus: string;
  syncErrorMessage: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

interface PlaidAccount {
  id: string;
  plaidAccountId: string;
  accountName: string;
  officialName: string | null;
  accountType: string;
  accountSubtype: string | null;
  mask: string | null;
  linkedAccountId: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  institutionName: string;
}

interface LedgerAccount {
  Id: string;
  Name: string;
  Type: string;
  Code: string;
}

export default function PlaidConnections() {
  const queryClient = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [linkingAccountId, setLinkingAccountId] = useState<string | null>(null);
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState<string>('');

  // Fetch connections
  const { data: connectionsData, isLoading: connectionsLoading } = useQuery({
    queryKey: ['plaid-connections'],
    queryFn: async () => {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/connections`);
      if (!response.ok) throw new Error('Failed to fetch connections');
      return response.json();
    },
  });

  // Fetch accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['plaid-accounts'],
    queryFn: async () => {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/accounts`);
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return response.json();
    },
  });

  // Fetch chart of accounts (for linking)
  const { data: ledgerAccountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const response = await api.get<{ value: LedgerAccount[] }>('/accounts');
      return response.data.value;
    },
  });

  const connections: PlaidConnection[] = connectionsData?.connections || [];
  const plaidAccounts: PlaidAccount[] = accountsData?.accounts || [];
  const ledgerAccounts: LedgerAccount[] = ledgerAccountsData || [];

  // Filter ledger accounts for linking (Bank and Credit Card types)
  const linkableAccounts = ledgerAccounts.filter(
    (a) => a.Type === 'Bank' || a.Type === 'Credit Card'
  );

  // Create link token
  const createLinkToken = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    createLinkToken();
  }, [createLinkToken]);

  // Plaid Link success handler
  const onPlaidSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
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

        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['plaid-connections'] });
        queryClient.invalidateQueries({ queryKey: ['plaid-accounts'] });
        await createLinkToken();
      } catch (error) {
        console.error('Failed to complete connection:', error);
      } finally {
        setIsConnecting(false);
      }
    },
    [queryClient, createLinkToken]
  );

  const plaidConfig: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: () => setIsConnecting(false),
  };

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink(plaidConfig);

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/connections/${itemId}/sync`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Sync failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaid-connections'] });
      queryClient.invalidateQueries({ queryKey: ['plaid-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['banktransactions'] });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/connections/${itemId}/disconnect`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Disconnect failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaid-connections'] });
      queryClient.invalidateQueries({ queryKey: ['plaid-accounts'] });
    },
  });

  // Link account mutation
  const linkAccountMutation = useMutation({
    mutationFn: async ({ accountId, ledgerAccountId }: { accountId: string; ledgerAccountId: string }) => {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/accounts/${accountId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledgerAccountId }),
      });
      if (!response.ok) throw new Error('Link failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaid-accounts'] });
      setLinkingAccountId(null);
      setSelectedLedgerAccount('');
    },
  });

  // Sync all mutation
  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/sync-all`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Sync all failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaid-connections'] });
      queryClient.invalidateQueries({ queryKey: ['plaid-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['banktransactions'] });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'Error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'Syncing':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'credit':
        return <CreditCard className="w-5 h-5 text-gray-500" />;
      default:
        return <Landmark className="w-5 h-5 text-gray-500" />;
    }
  };

  const isLoading = connectionsLoading || accountsLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Bank Connections</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Connect your bank accounts for automatic transaction import
          </p>
        </div>
        <div className="flex items-center gap-3">
          {connections.length > 0 && (
            <button
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
              Sync All
            </button>
          )}
          <button
            onClick={() => openPlaidLink()}
            disabled={!plaidReady || isConnecting}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Link2 className="w-4 h-4" />
            Connect Bank
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No bank accounts connected
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Connect your bank accounts to automatically import transactions. We support 12,000+ US
            financial institutions.
          </p>
          <button
            onClick={() => openPlaidLink()}
            disabled={!plaidReady || isConnecting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Link2 className="w-4 h-4" />
            Connect Your First Bank
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connections */}
          {connections.map((conn) => {
            const connAccounts = plaidAccounts.filter((a) => a.institutionName === conn.institutionName);

            return (
              <div
                key={conn.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {/* Connection header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {conn.institutionName}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        {getStatusIcon(conn.syncStatus)}
                        <span>
                          {conn.syncStatus}
                          {conn.lastSyncAt && ` - Last sync: ${new Date(conn.lastSyncAt).toLocaleString()}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => syncMutation.mutate(conn.itemId)}
                      disabled={syncMutation.isPending}
                      className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title="Sync transactions"
                    >
                      <RefreshCw
                        className={`w-5 h-5 text-gray-600 dark:text-gray-400 ${
                          syncMutation.isPending ? 'animate-spin' : ''
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to disconnect this bank?')) {
                          disconnectMutation.mutate(conn.itemId);
                        }
                      }}
                      className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      title="Disconnect"
                    >
                      <Link2Off className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {conn.syncStatus === 'Error' && conn.syncErrorMessage && (
                  <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400">{conn.syncErrorMessage}</p>
                  </div>
                )}

                {/* Accounts list */}
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {connAccounts.map((account) => (
                    <div key={account.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getAccountIcon(account.accountType)}
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {account.accountName}
                            {account.mask && (
                              <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                                ****{account.mask}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {account.accountSubtype || account.accountType}
                            {account.currentBalance != null && (
                              <span className="ml-2">
                                Balance: ${account.currentBalance.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.linkedAccountId ? (
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            Linked
                          </span>
                        ) : linkingAccountId === account.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedLedgerAccount}
                              onChange={(e) => setSelectedLedgerAccount(e.target.value)}
                              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            >
                              <option value="">Select account...</option>
                              {linkableAccounts.map((la) => (
                                <option key={la.Id} value={la.Id}>
                                  {la.Name} ({la.Type})
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() =>
                                linkAccountMutation.mutate({
                                  accountId: account.id,
                                  ledgerAccountId: selectedLedgerAccount,
                                })
                              }
                              disabled={!selectedLedgerAccount || linkAccountMutation.isPending}
                              className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setLinkingAccountId(null);
                                setSelectedLedgerAccount('');
                              }}
                              className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setLinkingAccountId(account.id)}
                            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            <Settings className="w-4 h-4" />
                            Link to Account
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
