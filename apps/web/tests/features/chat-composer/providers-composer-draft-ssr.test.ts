// @vitest-environment node
//
// The composer-draft adapter guards every `localStorage` touch with
// `typeof window === 'undefined'`. Those guards are unreachable under jsdom, so
// this companion suite runs in the node environment (no `window`) to exercise
// the SSR fallbacks for real.
import { describe, expect, it } from 'vitest';

import { loadComposerDraft, saveComposerDraft } from '../../../src/providers/composer-draft';

describe('composer-draft SSR fallbacks (no window)', () => {
  it('has no window in this environment', () => {
    expect(typeof window).toBe('undefined');
  });

  it('load returns null and save no-ops without throwing', () => {
    expect(loadComposerDraft('conv-1')).toBeNull();
    expect(() => saveComposerDraft('conv-1', 'x')).not.toThrow();
  });
});
