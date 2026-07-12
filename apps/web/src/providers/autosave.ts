// Timer bridge for the settings autosave loop. No data transport of its own
// — persistence goes through the caller-injected `onPersist` — only the
// SSR-guarded `setTimeout`/`clearTimeout` wrapper the guard's DOM-global rule
// requires `features/**` to reach through a port. Mirrors `scheduleOrbitTimeout`.

/**
 * Run `onTimeout` once after `delayMs`. Returns a cancel function. Reused for
 * the autosave loop's debounced-save, "Saved"-flash, and media-provider-sync
 * retry timers.
 */
export function scheduleAutosaveTimeout(onTimeout: () => void, delayMs: number): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = window.setTimeout(onTimeout, delayMs);
  return () => window.clearTimeout(handle);
}
