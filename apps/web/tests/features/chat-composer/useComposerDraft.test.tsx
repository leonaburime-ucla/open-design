// @vitest-environment jsdom
//
// Unit tests for the draft hook. Transport/storage is injected as the slice port
// so the hook tests against a hand-written fake — no localStorage stub, no module
// mocks. Pins the seed precedence (initialDraft > stored > empty), persistence on
// change, and the synchronous draftRef mirror.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useComposerDraft } from '../../../src/features/chat-composer/hooks/useComposerDraft.hooks';
import type { ComposerDraftPort } from '../../../src/features/chat-composer/ports';

function makePort(stored: Record<string, string> = {}): ComposerDraftPort & { saved: Array<[string | undefined, string]> } {
  const saved: Array<[string | undefined, string]> = [];
  return {
    saved,
    load: (key?: string) => (key ? stored[key] ?? null : null),
    save: (key, draft) => {
      saved.push([key, draft]);
    },
  };
}

describe('useComposerDraft', () => {
  it('seeds from initialDraft when provided', () => {
    const port = makePort({ k: 'stored' });
    const { result } = renderHook(() =>
      useComposerDraft(port, { initialDraft: 'seeded', draftStorageKey: 'k' }),
    );
    expect(result.current.draft).toBe('seeded');
  });

  it('falls back to the stored draft for the storage key', () => {
    const port = makePort({ k: 'stored' });
    const { result } = renderHook(() => useComposerDraft(port, { draftStorageKey: 'k' }));
    expect(result.current.draft).toBe('stored');
  });

  it('defaults to empty when there is neither an initial nor a stored draft', () => {
    const port = makePort();
    const { result } = renderHook(() => useComposerDraft(port, { draftStorageKey: 'missing' }));
    expect(result.current.draft).toBe('');
  });

  it('persists on change through the injected port', () => {
    const port = makePort();
    const { result } = renderHook(() => useComposerDraft(port, { draftStorageKey: 'k' }));
    act(() => {
      result.current.setDraft('hello');
    });
    expect(port.saved.at(-1)).toEqual(['k', 'hello']);
  });

  it('exposes draftRef seeded from the initial draft, writable by the caller', () => {
    // draftRef is the synchronous mirror the orchestrator keeps in lockstep from
    // the editor-change / programmatic-set paths — the hook seeds it and hands it
    // back; it is not auto-synced from setDraft (that is the caller's job).
    const port = makePort();
    const { result } = renderHook(() =>
      useComposerDraft(port, { initialDraft: 'seed' }),
    );
    expect(result.current.draftRef.current).toBe('seed');
    act(() => {
      result.current.draftRef.current = 'written';
    });
    expect(result.current.draftRef.current).toBe('written');
  });

  it('does not blow up when save throws is irrelevant — save is fire-and-forget', () => {
    const port: ComposerDraftPort = { load: () => null, save: vi.fn() };
    const { result } = renderHook(() => useComposerDraft(port, { draftStorageKey: 'k' }));
    act(() => {
      result.current.setDraft('x');
    });
    expect(port.save).toHaveBeenCalledWith('k', 'x');
  });
});
