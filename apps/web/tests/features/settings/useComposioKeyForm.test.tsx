// @vitest-environment jsdom
//
// Unit tests for the connectors credential-form hook. The pure credential-state
// derivation is characterized in rules.test; this pins the hook's OWN behavior:
// save gating, the optimistic saved→tail transition and its error rollback, and
// the two-stage destructive Clear flow (request → continue → timed arm →
// commit). The persist transport is a hand-written fake (ADR 0002) — no global
// fetch mock. Timers drive the arm/auto-dismiss windows, so tests use fake ones.
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { useComposioKeyForm } from '../../../src/features/settings/hooks/useComposioKeyForm.hooks';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

function configWithComposio(composio: AppConfig['composio']): AppConfig {
  return { ...baseConfig, composio };
}

/**
 * Drive the hook with a real `useState`-backed config so `setCfg`/`updateComposio`
 * round-trips exactly as it does under the ConnectorSection component.
 */
function useHarness(
  initial: AppConfig,
  onPersist: (composio: AppConfig['composio']) => Promise<void> | void,
  composioConfigLoading = false,
) {
  const [cfg, setCfg] = useState(initial);
  const form = useComposioKeyForm({
    cfg,
    setCfg,
    composioConfigLoading,
    onPersistComposioKey: onPersist,
  });
  return { cfg, form };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('useComposioKeyForm derived state', () => {
  it('is empty and both actions disabled with no key', () => {
    const { result } = renderHook(() => useHarness(configWithComposio({}), vi.fn()));
    expect(result.current.form.apiKeyConfigured).toBe(false);
    expect(result.current.form.saveDisabled).toBe(true);
    expect(result.current.form.clearDisabled).toBe(true);
  });

  it('enables Save once a draft is typed', () => {
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKey: 'sk-draft' }), vi.fn()),
    );
    expect(result.current.form.hasPendingEdit).toBe(true);
    expect(result.current.form.saveDisabled).toBe(false);
  });

  it('exposes the saved tail and keeps Clear enabled for a configured key', () => {
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKeyConfigured: true, apiKeyTail: '1234' }), vi.fn()),
    );
    expect(result.current.form.hasSavedKey).toBe(true);
    expect(result.current.form.tail).toBe('1234');
    expect(result.current.form.clearDisabled).toBe(false);
  });

  it('locks both actions while the daemon config is still hydrating', () => {
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKey: 'sk-draft', apiKeyConfigured: true }), vi.fn(), true),
    );
    expect(result.current.form.saveDisabled).toBe(true);
    expect(result.current.form.clearDisabled).toBe(true);
  });
});

describe('useComposioKeyForm save flow', () => {
  it('persists the draft, then normalizes into the saved state with the last-4 tail', async () => {
    const onPersist = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKey: 'sk-secret-7890' }), onPersist),
    );

    await act(async () => {
      await result.current.form.handleSaveKey();
    });

    expect(onPersist).toHaveBeenCalledWith({ apiKey: 'sk-secret-7890' });
    expect(result.current.form.apiKey).toBe('');
    expect(result.current.form.hasSavedKey).toBe(true);
    expect(result.current.form.tail).toBe('7890');
    expect(result.current.form.keySaveStatus).toBe('saved');

    // The saved pill auto-dismisses back to idle after ~2s.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.form.keySaveStatus).toBe('idle');
  });

  it('lands in the error state and leaves the draft intact when persistence throws', async () => {
    const onPersist = vi.fn(async () => {
      throw new Error('nope');
    });
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKey: 'sk-secret' }), onPersist),
    );

    await act(async () => {
      await result.current.form.handleSaveKey();
    });

    expect(result.current.form.keySaveStatus).toBe('error');
    expect(result.current.form.apiKey).toBe('sk-secret');
  });

  it('no-ops Save when there is no pending edit', async () => {
    const onPersist = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKeyConfigured: true }), onPersist),
    );
    await act(async () => {
      await result.current.form.handleSaveKey();
    });
    expect(onPersist).not.toHaveBeenCalled();
  });
});

describe('useComposioKeyForm clear flow', () => {
  it('walks request → continue → armed → commit, persisting the cleared key', async () => {
    const onPersist = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKeyConfigured: true, apiKeyTail: '1234' }), onPersist),
    );

    act(() => {
      result.current.form.handleClearRequest();
    });
    expect(result.current.form.clearStage).toBe('confirm');

    act(() => {
      result.current.form.handleClearContinue();
    });
    expect(result.current.form.clearStage).toBe('final');
    expect(result.current.form.clearArmed).toBe(false);

    // The destructive button stays inert until the brief arming window elapses.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current.form.clearArmed).toBe(true);

    await act(async () => {
      await result.current.form.handleClearCommit();
    });
    expect(onPersist).toHaveBeenCalledWith({
      apiKey: '',
      apiKeyConfigured: false,
      apiKeyTail: '',
    });
    expect(result.current.form.clearStage).toBe('idle');
    expect(result.current.form.hasSavedKey).toBe(false);
  });

  it('refuses to commit the clear before the arming window elapses', async () => {
    const onPersist = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKeyConfigured: true }), onPersist),
    );

    act(() => {
      result.current.form.handleClearRequest();
      result.current.form.handleClearContinue();
    });
    await act(async () => {
      await result.current.form.handleClearCommit();
    });
    expect(onPersist).not.toHaveBeenCalled();
  });

  it('aborts back to idle from the confirm panel', () => {
    const { result } = renderHook(() =>
      useHarness(configWithComposio({ apiKeyConfigured: true }), vi.fn()),
    );
    act(() => {
      result.current.form.handleClearRequest();
    });
    act(() => {
      result.current.form.handleClearAbort();
    });
    expect(result.current.form.clearStage).toBe('idle');
  });
});
