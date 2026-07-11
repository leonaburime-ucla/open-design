// Browser-subscription bridges for the settings slice's local-CLI agent list
// cluster (the execution-mode section's rescan/install-doc flow). Kept out of
// the slice so its hook stays DOM-free (ADR 0002).

/**
 * Run `onTimeout` once after `delayMs`. Backs the "Rescan agents" success/
 * error notice's auto-dismiss. Returns a cancel function.
 */
export function scheduleAgentRescanNoticeTimeout(
  onTimeout: () => void,
  delayMs: number,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = window.setTimeout(onTimeout, delayMs);
  return () => window.clearTimeout(handle);
}

/**
 * Notify when the user returns to the Settings tab (window regains focus, or
 * the tab becomes visible again) — how the "install an agent" flow catches a
 * user coming back from an external install link. Skips a hidden-tab
 * visibilitychange tick (the moment BEFORE the tab is shown, not after).
 * Returns an unsubscribe.
 */
export function subscribeAgentInstallReturn(onReturn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleReturn = () => {
    if (document.visibilityState === 'hidden') return;
    onReturn();
  };
  document.addEventListener('visibilitychange', handleReturn);
  window.addEventListener('focus', handleReturn);
  return () => {
    document.removeEventListener('visibilitychange', handleReturn);
    window.removeEventListener('focus', handleReturn);
  };
}
