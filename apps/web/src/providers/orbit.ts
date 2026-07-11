// Orbit automation transport: status polling, the manual "persist config + run
// now" flow (`POST /api/orbit/run`), and the section's browser-subscription
// bridges (poll timer, window-focus re-check, the "copied" flash timeout).
// Single-adapter resource, so this is a flat provider file rather than a
// `providers/<resource>/` folder (ADR 0002).
import { syncConfigToDaemon, syncMediaProvidersToDaemon } from '../state/config';
import type { AppConfig, OrbitRunStartResponse, OrbitStatusResponse } from '../types';

/**
 * Fetch the current Orbit automation status. Returns `null` on a non-2xx
 * response or a thrown transport error (daemon offline in API-only
 * development) so the caller can leave its existing status untouched instead
 * of clobbering it with a failed refresh.
 */
export async function fetchOrbitStatus(): Promise<OrbitStatusResponse | null> {
  try {
    const response = await fetch('/api/orbit/status');
    if (!response.ok) return null;
    return (await response.json()) as OrbitStatusResponse;
  } catch {
    return null;
  }
}

/**
 * Persist the given config (media providers + app config) to the daemon, then
 * trigger a manual Orbit run. Throws on any failed step so the caller can
 * surface a run error.
 */
export async function persistConfigAndRunOrbit(
  config: AppConfig,
  options?: {
    daemonProviders?: AppConfig['mediaProviders'] | null;
    syncMediaProviders?: boolean;
    locale?: string | null;
  },
): Promise<OrbitRunStartResponse> {
  if (options?.syncMediaProviders !== false) {
    await syncMediaProvidersToDaemon(config.mediaProviders, {
      daemonProviders: options?.daemonProviders,
    });
  }
  await syncConfigToDaemon(config, { throwOnError: true });
  const response = await fetch('/api/orbit/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: options?.locale ?? null }),
  });
  if (!response.ok) throw new Error('Orbit run failed');
  return (await response.json()) as OrbitRunStartResponse;
}

/**
 * Poll on a fixed interval while an Orbit run is in flight, so the section
 * picks up completion without the user having to reopen Settings. Guarded by
 * `typeof window === 'undefined'` per the ADR 0002 browser-bridge pattern;
 * returns an unsubscribe.
 */
export function subscribeOrbitStatusPolling(onTick: () => void, intervalMs = 3000): () => void {
  if (typeof window === 'undefined') return () => {};
  const interval = window.setInterval(onTick, intervalMs);
  return () => window.clearInterval(interval);
}

/**
 * Re-check on window focus. Connector auth often completes in another window;
 * this lets the Orbit configuration gate reflect a newly connected account
 * without requiring the user to close and reopen Settings. Returns an
 * unsubscribe.
 */
export function subscribeWindowFocus(onFocus: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('focus', onFocus);
  return () => window.removeEventListener('focus', onFocus);
}

/**
 * Run `onTimeout` once after `delayMs`. Backs the "Copied" flash reset on the
 * markdown-copy button. Returns a cancel function.
 */
export function scheduleOrbitTimeout(onTimeout: () => void, delayMs: number): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = window.setTimeout(onTimeout, delayMs);
  return () => window.clearTimeout(handle);
}
