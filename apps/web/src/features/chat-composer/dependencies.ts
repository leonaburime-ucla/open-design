// Composition root for the chat-composer slice: binds a concrete transport
// adapter to the slice's port. This is the ONE feature file allowed to import
// `providers/` — everything else in the slice depends on the port, so swapping
// the adapter (or a fake in tests) touches only this file.
import { loadComposerDraft, saveComposerDraft } from '../../providers/composer-draft';
import type { ComposerDraftPort } from './ports';

/** Default binding: the real `localStorage`-backed draft persistence. */
export const composerDraftPort: ComposerDraftPort = {
  load: loadComposerDraft,
  save: saveComposerDraft,
};
