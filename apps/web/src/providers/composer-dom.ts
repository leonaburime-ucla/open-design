// Browser-side bridges for the chat-composer slice's dumb components. The two
// pieces of DOM the composer's presentational components need — an Escape-key
// subscription (to dismiss the attachment preview) and the viewport size (to
// clamp the design-toolbox hover panel on screen) — live here in providers/
// because they touch `window`. The orchestrator (which is DOM-capable) binds
// these and passes them down as props, so the slice component files stay
// DOM-free and pass the vertical-slice guard.

/**
 * Subscribe to the Escape key. Invokes `onEscape` on every Escape keydown until
 * the returned unsubscribe runs. No-op (returns a noop unsub) under SSR.
 */
export function subscribeEscapeKey(onEscape: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onEscape();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/** The current viewport size, used to clamp a portaled hover panel on screen. */
export function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}
