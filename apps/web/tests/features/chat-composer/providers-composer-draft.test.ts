// @vitest-environment jsdom
//
// The composer-draft adapter round-trips a draft through `localStorage`. The SSR
// (no-window) fallbacks live in the companion `-ssr` suite (node env).
import { afterEach, describe, expect, it } from 'vitest';

import { loadComposerDraft, saveComposerDraft } from '../../../src/providers/composer-draft';

afterEach(() => {
  window.localStorage.clear();
});

describe('composer-draft adapter', () => {
  it('saves and loads a draft by key', () => {
    saveComposerDraft('conv-1', 'hello world');
    expect(loadComposerDraft('conv-1')).toBe('hello world');
  });

  it('clears the stored draft when saving an empty string', () => {
    saveComposerDraft('conv-1', 'something');
    saveComposerDraft('conv-1', '');
    expect(loadComposerDraft('conv-1')).toBeNull();
  });

  it('returns null when there is no key', () => {
    expect(loadComposerDraft(undefined)).toBeNull();
    expect(loadComposerDraft('')).toBeNull();
  });

  it('save with no key is a no-op', () => {
    expect(() => saveComposerDraft(undefined, 'x')).not.toThrow();
    expect(loadComposerDraft(undefined)).toBeNull();
  });
});
