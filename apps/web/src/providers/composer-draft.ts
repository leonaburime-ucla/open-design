// Transport-ish adapter for the composer's per-conversation draft persistence.
// This is the ONE place the chat-composer draft touches `window.localStorage`,
// so the slice's `useComposerDraft` hook reaches it through an injected port and
// stays DOM/storage-free (and unit-testable with a fake). A flat single-adapter
// file (not a folder) because it is the only home for this storage key.

/** Read a previously-saved draft for `key`, or `null` when absent/unavailable. */
export function loadComposerDraft(key?: string): string | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Persist (or clear, when empty) the draft for `key`. Storage errors are
 *  swallowed so the composer keeps working in privacy modes. */
export function saveComposerDraft(key: string | undefined, draft: string): void {
  if (!key || typeof window === 'undefined') return;
  try {
    if (draft) {
      window.localStorage.setItem(key, draft);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable in privacy modes; the composer should still work.
  }
}
