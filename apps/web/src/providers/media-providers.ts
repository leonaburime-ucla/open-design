// Browser-subscription bridge for the media-providers settings section. It
// has no data transport of its own — reload is an injected caller callback —
// so this file holds only the timer bridge the section needs to stay
// DOM-free (ADR 0002).

/**
 * Run `onTimeout` once after `delayMs`. Backs the reload-success notice's
 * auto-dismiss. Returns a cancel function.
 */
export function scheduleMediaProvidersReloadNoticeTimeout(
  onTimeout: () => void,
  delayMs: number,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = window.setTimeout(onTimeout, delayMs);
  return () => window.clearTimeout(handle);
}
