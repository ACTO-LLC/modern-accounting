import { useEffect, useRef, useState, useCallback } from 'react';

interface VersionManifest {
  version: string;
  buildId: string;
}

interface VersionCheckResult {
  /** True when a newer version has been detected */
  updateAvailable: boolean;
  /** The new version string, if available */
  newVersion: string | null;
  /** Reload the page to get the latest version */
  reload: () => void;
  /** Dismiss the update notification (until next check finds a newer version) */
  dismiss: () => void;
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const VERSION_URL = '/version.json';

/**
 * Polls /version.json to detect new deployments.
 * When a new buildId is detected, sets updateAvailable=true so the UI can
 * prompt the user to reload. This ensures users always get the latest code
 * after a production deployment without needing to manually clear cache.
 *
 * Only active in production mode — in development, Vite's HMR handles updates.
 */
export function useVersionCheck(): VersionCheckResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const currentBuildIdRef = useRef<string | null>(null);
  const dismissedBuildIdRef = useRef<string | null>(null);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  const dismiss = useCallback(() => {
    // Track which buildId was dismissed so we don't re-show the same notification
    if (newVersion) {
      dismissedBuildIdRef.current = currentBuildIdRef.current;
    }
    setUpdateAvailable(false);
  }, [newVersion]);

  useEffect(() => {
    // Only check in production — in dev, Vite HMR handles updates
    if (import.meta.env.DEV) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function checkVersion() {
      try {
        // Add cache-busting query param so the browser always fetches fresh version.json
        const res = await fetch(`${VERSION_URL}?_t=${Date.now()}`, {
          cache: 'no-store',
        });

        if (!res.ok) return;

        const manifest: VersionManifest = await res.json();

        if (cancelled) return;

        if (currentBuildIdRef.current === null) {
          // First check — store the current buildId as baseline
          currentBuildIdRef.current = manifest.buildId;
        } else if (manifest.buildId !== currentBuildIdRef.current) {
          // Build ID changed — a new deployment happened
          currentBuildIdRef.current = manifest.buildId;

          // Only show notification if this build hasn't been dismissed
          if (manifest.buildId !== dismissedBuildIdRef.current) {
            setNewVersion(manifest.version);
            setUpdateAvailable(true);
          }
        }
      } catch {
        // Silently ignore fetch errors (offline, etc.)
      }

      if (!cancelled) {
        timeoutId = setTimeout(checkVersion, CHECK_INTERVAL_MS);
      }
    }

    // Start checking after a brief delay to avoid impacting initial page load
    timeoutId = setTimeout(checkVersion, 10_000);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  return { updateAvailable, newVersion, reload, dismiss };
}
