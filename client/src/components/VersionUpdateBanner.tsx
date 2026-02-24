import { useVersionCheck } from '../hooks/useVersionCheck';

/**
 * Displays a non-intrusive banner at the top of the page when a new version
 * of the application has been deployed. Users can click "Refresh" to reload
 * and get the latest version, or dismiss the notification.
 *
 * The banner uses fixed positioning so it appears above all other content
 * without disrupting the page layout.
 */
export default function VersionUpdateBanner() {
  const { updateAvailable, newVersion, reload, dismiss } = useVersionCheck();

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-2 text-center text-sm shadow-md flex items-center justify-center gap-4">
      <span>
        A new version{newVersion ? ` (v${newVersion})` : ''} is available.
      </span>
      <button
        onClick={reload}
        className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-blue-50 transition-colors"
      >
        Refresh
      </button>
      <button
        onClick={dismiss}
        className="text-blue-200 hover:text-white text-sm underline transition-colors"
        aria-label="Dismiss update notification"
      >
        Later
      </button>
    </div>
  );
}
