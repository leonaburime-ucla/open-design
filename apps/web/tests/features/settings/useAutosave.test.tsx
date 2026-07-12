// @vitest-environment jsdom
//
// The SettingsDialog autosave loop against a hand-written fake `AutosavePort`.
// Pins: the first-tick skip (mount doesn't "save"); the debounced save on a
// later `cfg` change (pending -> saving -> saved, and the appearance-revert
// baseline updates on success); the draft-only-change short-circuit (no
// `onPersist` call, settles to idle); the forced media-provider-sync path
// (still persists on a draft-only change, clears the pending-edit set on
// success); the error/retry loop when a forced sync fails; and the unmount
// flush of a pending save.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useAutosave,
  type AutosaveInput,
} from '../../../src/features/settings/hooks/useAutosave.hooks';
import type { AutosavePort } from '../../../src/features/settings/ports';
import type { AppConfig } from '../../../src/types';

function cfg(over: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'api',
    apiKey: 'sk-test',
    apiProtocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: null,
    skillId: null,
    designSystemId: null,
    theme: 'system',
    accentColor: '#c96442',
    ...over,
  } as AppConfig;
}

function makePort(over: Partial<AutosavePort> = {}): AutosavePort {
  return {
    // Auto-fires the debounced-save (400ms) and retry (1500ms) timers
    // immediately so persist-path tests don't need real/fake timer
    // juggling; leaves the "Saved" flash (1800ms) pending so its transient
    // status is observable — see the dedicated flash test below, which
    // captures and manually fires it. Override with a no-op
    // (`vi.fn(() => () => {})`) to assert a schedule without asserting fire.
    scheduleTimeout: vi.fn((onTimeout: () => void, delayMs: number) => {
      if (delayMs !== 1800) onTimeout();
      return () => {};
    }),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

function renderAutosave(port: AutosavePort, over: Partial<AutosaveInput> = {}) {
  const onPersist = over.onPersist ?? vi.fn(async () => undefined);
  const isAutosaveDraftOnlyChange = over.isAutosaveDraftOnlyChange ?? vi.fn(() => false);
  const lastSavedAppearanceRef = over.lastSavedAppearanceRef ?? {
    current: { theme: 'system' as const, accentColor: '#c96442' },
  };
  const setPendingMediaProviderEditIds = over.setPendingMediaProviderEditIds ?? vi.fn();
  const initialCfg = over.cfg ?? cfg();
  const rendered = renderHook(
    (props: { cfg: AppConfig }) =>
      useAutosave(port, {
        onPersist,
        isAutosaveDraftOnlyChange,
        lastSavedAppearanceRef,
        setPendingMediaProviderEditIds,
        ...over,
        cfg: props.cfg,
      }),
    { wrapper, initialProps: { cfg: initialCfg } },
  );
  return {
    onPersist,
    isAutosaveDraftOnlyChange,
    lastSavedAppearanceRef,
    setPendingMediaProviderEditIds,
    ...rendered,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAutosave', () => {
  it('starts idle and does not persist on mount', () => {
    const port = makePort({ scheduleTimeout: vi.fn(() => () => {}) });
    const { result, onPersist } = renderAutosave(port);

    expect(result.current.autosaveStatus).toBe('idle');
    expect(onPersist).not.toHaveBeenCalled();
  });

  it('debounces a later cfg change through pending -> saving -> saved and updates the appearance baseline', async () => {
    const port = makePort();
    const onPersist = vi.fn(async () => undefined);
    const { result, rerender, lastSavedAppearanceRef } = renderAutosave(port, { onPersist });

    const next = cfg({ apiKey: 'sk-changed', theme: 'dark', accentColor: '#2563eb' });
    act(() => rerender({ cfg: next }));

    await waitFor(() => expect(onPersist).toHaveBeenCalledWith(next, { forceMediaProviderSync: false }));
    await waitFor(() => expect(result.current.autosaveStatus).toBe('saved'));
    expect(lastSavedAppearanceRef.current).toEqual({ theme: 'dark', accentColor: '#2563eb' });
    expect(result.current.autosaveLastSavedRef.current).toBe(next);
  });

  it('settles the "Saved" flash back to idle once its timer fires', async () => {
    const port = makePort();
    const onPersist = vi.fn(async () => undefined);
    const { result, rerender } = renderAutosave(port, { onPersist });

    act(() => rerender({ cfg: cfg({ apiKey: 'sk-flash' }) }));
    await waitFor(() => expect(result.current.autosaveStatus).toBe('saved'));

    const flashCall = (port.scheduleTimeout as ReturnType<typeof vi.fn>).mock.calls.find(
      ([, delayMs]) => delayMs === 1800,
    );
    expect(flashCall).toBeTruthy();
    act(() => flashCall![0]());

    await waitFor(() => expect(result.current.autosaveStatus).toBe('idle'));
  });

  it('skips the persist and settles to idle for a draft-only change', async () => {
    const port = makePort();
    const onPersist = vi.fn(async () => undefined);
    const isAutosaveDraftOnlyChange = vi.fn(() => true);
    const { result, rerender } = renderAutosave(port, { onPersist, isAutosaveDraftOnlyChange });

    act(() => rerender({ cfg: cfg({ apiKey: 'sk-draft-only' }) }));

    await waitFor(() => expect(result.current.autosaveStatus).toBe('idle'));
    expect(onPersist).not.toHaveBeenCalled();
  });

  it('recordMediaProviderEdit forces a sync (bypassing the draft-only short-circuit) and clears pending ids on success', async () => {
    const port = makePort();
    const onPersist = vi.fn(async () => undefined);
    const isAutosaveDraftOnlyChange = vi.fn(() => true);
    const setPendingMediaProviderEditIds = vi.fn();
    const { result, rerender } = renderAutosave(port, {
      onPersist,
      isAutosaveDraftOnlyChange,
      setPendingMediaProviderEditIds,
    });

    act(() => result.current.recordMediaProviderEdit('elevenlabs'));
    expect(setPendingMediaProviderEditIds).toHaveBeenCalled();

    const next = cfg({ apiKey: 'sk-draft-only' });
    act(() => rerender({ cfg: next }));

    await waitFor(() =>
      expect(onPersist).toHaveBeenCalledWith(next, { forceMediaProviderSync: true }),
    );
    await waitFor(() =>
      expect(setPendingMediaProviderEditIds).toHaveBeenLastCalledWith(new Set()),
    );
  });

  it('retries a failed forced media-provider sync and succeeds on the retry', async () => {
    const port = makePort();
    // Fails once (the initial attempt), then succeeds on the scheduled retry
    // so the loop terminates instead of retrying indefinitely.
    const onPersist = vi.fn(async () => {
      if (onPersist.mock.calls.length === 1) throw new Error('network down');
    });
    const setPendingMediaProviderEditIds = vi.fn();
    const view = renderAutosave(port, {
      onPersist,
      isAutosaveDraftOnlyChange: () => true,
      setPendingMediaProviderEditIds,
    });

    act(() => view.result.current.recordMediaProviderEdit('runway'));
    act(() => view.rerender({ cfg: cfg({ apiKey: 'sk-retry' }) }));

    await waitFor(() => expect(onPersist).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.result.current.autosaveStatus).toBe('saved'));
    expect(setPendingMediaProviderEditIds).toHaveBeenLastCalledWith(new Set());
  });

  it('flushes a pending save on unmount', () => {
    const port = makePort({ scheduleTimeout: vi.fn(() => () => {}) });
    const onPersist = vi.fn(async () => undefined);
    const { rerender, unmount } = renderAutosave(port, { onPersist });

    const next = cfg({ apiKey: 'sk-unmount' });
    act(() => rerender({ cfg: next }));
    expect(onPersist).not.toHaveBeenCalled();

    act(() => unmount());
    expect(onPersist).toHaveBeenCalledWith(next, { forceMediaProviderSync: false });
  });
});
