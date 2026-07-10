// Feature-local hook for the composer's draft text and its per-conversation
// persistence. Follows the slice's hook-wiring paradigm:
//   - `useComposerDraft(port, opts)` is the real hook. Its storage dependency is
//     INJECTED as the slice port, so it holds no import to a provider and
//     unit-tests against a hand-written fake `ComposerDraftPort` — no
//     `localStorage` stub, no module mocks.
//   - `useWiredComposerDraft(opts)` (the wirer, bottom of file) binds the real
//     provider port and is the default the orchestrator uses, so production
//     callers pass nothing while tests swap the whole hook.
import { useEffect, useRef, useState } from 'react';
import type { ComposerDraftPort } from '../ports';
import { composerDraftPort } from '../dependencies';

/** Everything the orchestrator needs for the composer's draft text. */
export interface ComposerDraftController {
  /** The current draft text. */
  draft: string;
  /** Replace the draft text (also updates `draftRef` on the next render). */
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  /**
   * Synchronous mirror of `draft`. Event handlers that mutate the draft off a
   * captured render closure (notably the annotation listener, where two uploads
   * can resolve concurrently) read/write this ref so their edits compose instead
   * of clobbering one another. The orchestrator keeps it in lockstep with
   * `draft` from the editor-change and programmatic-set paths.
   */
  draftRef: React.MutableRefObject<string>;
}

/** Options seeding the initial draft: an explicit initial value wins, otherwise
 *  a persisted draft for `draftStorageKey` is restored. */
export interface ComposerDraftOptions {
  initialDraft?: string;
  draftStorageKey?: string;
}

export function useComposerDraft(
  port: ComposerDraftPort,
  { initialDraft, draftStorageKey }: ComposerDraftOptions,
): ComposerDraftController {
  const [draft, setDraft] = useState(() => initialDraft ?? port.load(draftStorageKey) ?? '');
  const draftRef = useRef(draft);

  // Persist the draft under its storage key (cleared when empty) so a reload of
  // the same conversation restores it.
  useEffect(() => {
    port.save(draftStorageKey, draft);
  }, [port, draftStorageKey, draft]);

  return { draft, setDraft, draftRef };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-use draft
 * controller. This is the default the orchestrator uses; swap the whole hook in
 * tests.
 */
export function useWiredComposerDraft(opts: ComposerDraftOptions): ComposerDraftController {
  return useComposerDraft(composerDraftPort, opts);
}
