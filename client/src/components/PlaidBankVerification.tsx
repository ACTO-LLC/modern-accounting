import { useState, useCallback, useEffect } from 'react';
import { usePlaidLink, PlaidLinkOptions, PlaidLinkOnSuccessMetadata } from 'react-plaid-link';
import { CheckCircle, AlertTriangle, Loader2, ShieldCheck, Link2Off, Building2 } from 'lucide-react';
import { formatDateShort } from '../lib/dateUtils';

const CHAT_API_BASE_URL = import.meta.env.VITE_CHAT_API_URL || '';

interface VerificationStatus {
  status: 'Unverified' | 'Pending' | 'Verified' | 'Failed' | 'Expired';
  verifiedAt?: string;
  institutionName?: string;
  hasBankInfo?: boolean;
}

interface PlaidBankVerificationProps {
  employeeId: string;
  onVerificationChange?: (status: VerificationStatus) => void;
  initialStatus?: VerificationStatus;
  className?: string;
}

export default function PlaidBankVerification({
  employeeId,
  onVerificationChange,
  initialStatus,
  className = '',
}: PlaidBankVerificationProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>(
    initialStatus || { status: 'Unverified' }
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current verification status
  const fetchStatus = useCallback(async () => {
    if (!employeeId) return;

    try {
      setIsLoading(true);
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/verify-bank/status/${employeeId}`);
      if (!response.ok) throw new Error('Failed to fetch verification status');
      const data = await response.json();
      if (data.success) {
        const status: VerificationStatus = {
          status: data.status,
          verifiedAt: data.verifiedAt,
          institutionName: data.institutionName,
          hasBankInfo: data.hasBankInfo,
        };
        setVerificationStatus(status);
        onVerificationChange?.(status);
      }
    } catch (err) {
      console.error('Failed to fetch verification status:', err);
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, onVerificationChange]);

  // Create link token for Plaid Link
  const createLinkToken = useCallback(async () => {
    if (!employeeId) return;

    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/verify-bank/link-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });

      if (!response.ok) throw new Error('Failed to create link token');
      const data = await response.json();
      if (data.success) {
        setLinkToken(data.linkToken);
      }
    } catch (err) {
      console.error('Failed to create link token:', err);
      setError('Failed to initialize bank verification');
    }
  }, [employeeId]);

  // Initialize on mount
  useEffect(() => {
    if (employeeId) {
      fetchStatus();
      createLinkToken();
    }
  }, [employeeId, fetchStatus, createLinkToken]);

  // Handle Plaid Link success
  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setIsVerifying(true);
      setError(null);

      try {
        const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/verify-bank/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken,
            employeeId,
            metadata: {
              institution: metadata.institution,
              accounts: metadata.accounts,
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Verification failed');
        }

        const result = await response.json();
        console.log('Bank verification successful:', result);

        const newStatus: VerificationStatus = {
          status: 'Verified',
          verifiedAt: new Date().toISOString(),
          institutionName: result.institutionName,
          hasBankInfo: true,
        };
        setVerificationStatus(newStatus);
        onVerificationChange?.(newStatus);

        // Refresh link token for potential re-verification
        await createLinkToken();
      } catch (err) {
        console.error('Bank verification failed:', err);
        setError(err instanceof Error ? err.message : 'Verification failed');
        setVerificationStatus({ status: 'Failed' });
      } finally {
        setIsVerifying(false);
      }
    },
    [employeeId, createLinkToken, onVerificationChange]
  );

  // Handle removing verification
  const handleRemoveVerification = async () => {
    if (!confirm('Are you sure you want to remove bank verification? The employee will need to re-verify their account.')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${CHAT_API_BASE_URL}/api/plaid/verify-bank/remove/${employeeId}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to remove verification');

      const newStatus: VerificationStatus = { status: 'Unverified' };
      setVerificationStatus(newStatus);
      onVerificationChange?.(newStatus);
    } catch (err) {
      console.error('Failed to remove verification:', err);
      setError('Failed to remove bank verification');
    } finally {
      setIsLoading(false);
    }
  };

  // Plaid Link configuration
  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) {
        console.error('Plaid Link error:', err);
        setError(err.error_message || 'Bank connection was cancelled');
      }
      setIsVerifying(false);
    },
  };

  const { open, ready } = usePlaidLink(config);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-gray-500 dark:text-gray-400 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading verification status...</span>
      </div>
    );
  }

  // Render based on verification status
  const isVerified = verificationStatus.status === 'Verified';
  const isPending = verificationStatus.status === 'Pending';
  const isFailed = verificationStatus.status === 'Failed';

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Status Display */}
      {isVerified && (
        <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 px-4 py-3 rounded-lg border border-green-200 dark:border-green-800">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                Bank Account Verified
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200">
                <ShieldCheck className="w-3 h-3 mr-1" />
                Verified
              </span>
            </div>
            {verificationStatus.institutionName && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 mt-1">
                <Building2 className="w-3 h-3" />
                <span>{verificationStatus.institutionName}</span>
                {verificationStatus.verifiedAt && (
                  <span className="ml-2">
                    Verified on {formatDateShort(verificationStatus.verifiedAt)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleRemoveVerification}
            disabled={isLoading}
            className="p-1.5 hover:bg-green-100 dark:hover:bg-green-800 rounded transition-colors"
            title="Remove verification"
          >
            <Link2Off className="w-4 h-4 text-green-600 dark:text-green-400" />
          </button>
        </div>
      )}

      {isFailed && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium text-red-800 dark:text-red-200">
              Verification Failed
            </span>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
            )}
          </div>
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <Loader2 className="w-5 h-5 text-yellow-600 dark:text-yellow-400 animate-spin flex-shrink-0" />
          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            Verification Pending...
          </span>
        </div>
      )}

      {!isVerified && !isPending && (
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              Bank Account Not Verified
            </span>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Verify the bank account to reduce ACH failures and ensure secure direct deposits.
            </p>
          </div>
        </div>
      )}

      {/* Verify Button */}
      {!isVerified && (
        <button
          onClick={() => open()}
          disabled={!ready || isVerifying || !linkToken}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm disabled:opacity-50 transition-colors text-sm"
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>{isFailed ? 'Retry Verification' : 'Verify Bank Account'}</span>
            </>
          )}
        </button>
      )}

      {/* Re-verify option for verified accounts */}
      {isVerified && (
        <button
          onClick={() => open()}
          disabled={!ready || isVerifying || !linkToken}
          className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline text-sm disabled:opacity-50"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Re-verify with different account</span>
        </button>
      )}

      {/* Error display */}
      {error && !isFailed && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
