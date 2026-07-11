// Browser-subscription bridges for the settings slice's AMR account cluster
// (the vela sign-in/wallet card on the execution-mode section). Kept out of
// the slice so its hooks stay DOM-free (ADR 0002). The actual data fetches
// (`fetchVelaLoginStatus`, `fetchAmrWalletSnapshot`) already live in
// `providers/daemon` and are bound alongside these bridges in the settings
// slice's `dependencies.ts`.
import {
  AMR_LOGIN_STATUS_EVENT,
  amrLoginStatusEventReason,
} from '../components/amrLoginPolling';
import type { AmrLoginStatusEventReason } from '../components/amrLoginPolling';

/**
 * Re-check AMR sign-in state when the window regains focus or the tab
 * becomes visible again. The vela device-login flow completes in an
 * external browser; if the in-pill poll already timed out (or the login
 * finished fully out-of-band), this is what notices the user came back.
 * Skips a hidden-tab visibilitychange tick (the moment BEFORE the tab is
 * shown, not after). Returns an unsubscribe.
 */
export function subscribeAmrWindowResync(onResync: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleResync = () => {
    if (document.visibilityState === 'hidden') return;
    onResync();
  };
  window.addEventListener('focus', handleResync);
  document.addEventListener('visibilitychange', handleResync);
  return () => {
    window.removeEventListener('focus', handleResync);
    document.removeEventListener('visibilitychange', handleResync);
  };
}

/**
 * Listen for the cross-component `od:amr-login-status-change` signal fired
 * by `notifyAmrLoginStatusChanged` (e.g. a login kicked off from
 * `AmrLoginPill`/`InlineModelSwitcher` elsewhere in the app). Returns an
 * unsubscribe.
 */
export function subscribeAmrLoginStatusEvent(
  onEvent: (reason: AmrLoginStatusEventReason) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handleEvent = (event: Event) => onEvent(amrLoginStatusEventReason(event));
  window.addEventListener(AMR_LOGIN_STATUS_EVENT, handleEvent);
  return () => window.removeEventListener(AMR_LOGIN_STATUS_EVENT, handleEvent);
}
