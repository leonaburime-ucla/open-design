// The chat-composer slice's dependency on transport/storage, expressed as an
// interface it owns. The slice depends on this port, never on `providers/`
// directly; a concrete adapter is bound to it in `dependencies.ts`. Tests supply
// a hand-written fake — no `localStorage` stubbing, no module-path mocks.

/** Persistence the composer's draft cluster needs. */
export interface ComposerDraftPort {
  /** Read a previously-saved draft for `key`, or `null` when absent. */
  load(key?: string): string | null;
  /** Persist (or clear, when the draft is empty) the draft for `key`. */
  save(key: string | undefined, draft: string): void;
}
