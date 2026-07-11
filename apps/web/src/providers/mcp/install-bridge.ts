// Browser-subscription bridges for the Integrations (MCP install snippet)
// section: the client-picker's outside-click/Escape dismissal and the
// "Copied" badge auto-reset timer. Kept out of the slice so its hooks stay
// DOM-free (ADR 0002).

/**
 * Close the client picker when the user clicks outside `getContainer()` or
 * presses Escape. `getContainer` is read on each event rather than captured
 * once so the caller can pass a ref getter without this bridge knowing about
 * React refs. Returns an unsubscribe.
 */
export function subscribeOutsideClickAndEscape(
  getContainer: () => HTMLElement | null,
  onClose: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const onPointerDown = (e: MouseEvent) => {
    const container = getContainer();
    if (!container) return;
    if (!container.contains(e.target as Node)) onClose();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  document.addEventListener('mousedown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('mousedown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  };
}

/**
 * Run `onTimeout` once after `delayMs`. Backs the "Copied" badge auto-reset
 * on the install snippet's copy button. Returns a cancel function.
 */
export function scheduleMcpCopyResetTimeout(onTimeout: () => void, delayMs: number): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = window.setTimeout(onTimeout, delayMs);
  return () => window.clearTimeout(handle);
}

/**
 * Open a client deeplink (currently only Cursor's `cursor://...` scheme) via
 * a hidden anchor click rather than a `window.location`/`window.open`
 * assignment — some browsers block navigating unknown schemes from a button
 * handler's direct assignment, but a synthetic anchor click still works.
 */
export function openMcpDeeplink(url: string): void {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener noreferrer';
  a.click();
}
