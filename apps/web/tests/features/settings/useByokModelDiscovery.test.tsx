// @vitest-environment jsdom
//
// The execution-mode section's BYOK model-discovery cluster against a
// hand-written fake `ByokModelDiscoveryPort`. Pins: the account-model-list
// fetch state machine (idle -> running -> done; no-op while already
// running); the azure/ollama/unsupported-provider preconditions (silent
// tracking-only unless explicit); the first-party-base-url-typo and
// blocking-draft-issue preconditions; the cache-hit short-circuit (no
// network call, tracks `source: 'cache'`); the reset-on-cfg-change effect
// (skipped on first render, resets state on a later cfg change, but not
// while a fetch is running); `commitProviderModelsInputs`/`onByokKeyCommit`
// committing the fetch key (or deferring after a dirty-paste key clean); the
// debounced auto-fetch (fires through the port's timer bridge, skipped
// outside `api` mode / visual-stability mode / before the key is committed);
// and the abort-on-unmount cleanup.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useT } from '../../../src/i18n';
import {
  useByokModelDiscovery,
  type ByokModelDiscoveryInput,
} from '../../../src/features/settings/hooks/useByokModelDiscovery.hooks';
import type { ByokModelDiscoveryPort } from '../../../src/features/settings/ports';
import type { ByokFirstPartyBaseUrlHint, ProviderModelsCache } from '../../../src/features/settings/types';
import type { ByokDraftValidation } from '../../../src/components/byok/validation';
import type { AppConfig, ProviderModelsResponse } from '../../../src/types';

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
    ...over,
  } as AppConfig;
}

const VALID_DRAFT: ByokDraftValidation = { ok: true, issues: [] };
const BLOCKING_DRAFT: ByokDraftValidation = {
  ok: false,
  issues: [
    { field: 'api_key', level: 'error', code: 'api_key_required', message: 'API key required' },
  ],
};

function successResult(over: Partial<ProviderModelsResponse> = {}): ProviderModelsResponse {
  return {
    ok: true,
    kind: 'success',
    latencyMs: 12,
    models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
    ...over,
  };
}

function makePort(over: Partial<ByokModelDiscoveryPort> = {}): ByokModelDiscoveryPort {
  return {
    fetchModels: vi.fn(async () => successResult()),
    // Fires immediately by default so tests exercising the debounced
    // auto-fetch don't need real/fake timer juggling; override with a no-op
    // (`vi.fn(() => () => {})`) to assert the debounce is skipped instead.
    scheduleAutoFetchTimeout: vi.fn((onTimeout: () => void) => {
      onTimeout();
      return () => {};
    }),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderModelDiscovery(
  port: ByokModelDiscoveryPort,
  over: Partial<ByokModelDiscoveryInput> = {},
) {
  const track = vi.fn();
  const focusByokRequiredField = vi.fn();
  const setByokPreconditionNotice = vi.fn();
  const showByokDraftValidationNotice = vi.fn();
  const handleAutoTestProvider = vi.fn();
  const updateApiConfig = vi.fn();
  const initialCfg = over.cfg ?? cfg();
  // Defaults to an incomplete (no-apiKey) seed so most tests start from a
  // null committed key regardless of `cfg`'s own validity — the seeding
  // behavior itself is covered by its own dedicated tests below, which pass
  // `initial` explicitly.
  const initialSeed = over.initial ?? cfg({ apiKey: '' });
  const providerModelsKey = over.providerModelsKey ?? 'anthropic|https://api.anthropic.com|hash|';
  let cache: ProviderModelsCache = over.providerModelsCache ?? {};
  const setProviderModelsCache = vi.fn((updater) => {
    cache = typeof updater === 'function' ? updater(cache) : updater;
  });
  const rendered = renderHook(
    (props: Partial<ByokModelDiscoveryInput>) => {
      const t = useT();
      return useByokModelDiscovery(port, {
        apiProtocol: 'anthropic',
        cfg: initialCfg,
        initial: initialSeed,
        t,
        track,
        byokModelFetchDraftValidation: VALID_DRAFT,
        byokFirstPartyBaseUrl: undefined,
        providerModelsKey,
        providerModelsCache: cache,
        setProviderModelsCache,
        visualStabilityMode: false,
        focusByokRequiredField,
        setByokPreconditionNotice,
        showByokDraftValidationNotice,
        handleAutoTestProvider,
        updateApiConfig,
        ...over,
        ...props,
      });
    },
    { wrapper, initialProps: {} },
  );
  return {
    track,
    focusByokRequiredField,
    setByokPreconditionNotice,
    showByokDraftValidationNotice,
    handleAutoTestProvider,
    updateApiConfig,
    setProviderModelsCache,
    ...rendered,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useByokModelDiscovery', () => {
  it('starts idle with no committed key', () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const { result } = renderModelDiscovery(port);
    expect(result.current.providerModelsState).toEqual({ status: 'idle' });
    expect(result.current.providerModelsCommittedKey).toBeNull();
  });

  it('seeds the committed key from a valid `initial` config', () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const initial = cfg();
    const { result } = renderModelDiscovery(port, { cfg: initial, initial });
    expect(result.current.providerModelsCommittedKey).not.toBeNull();
  });

  it('does not seed the committed key when the initial config is incomplete', () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const initial = cfg({ apiKey: '' });
    const { result } = renderModelDiscovery(port, { cfg: initial, initial });
    expect(result.current.providerModelsCommittedKey).toBeNull();
  });

  it('handleFetchProviderModels runs the fetch and lands a done result', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const { result } = renderModelDiscovery(port);
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(port.fetchModels).toHaveBeenCalledTimes(1);
    expect(port.fetchModels).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-test',
      }),
      expect.any(AbortSignal),
    );
    expect(result.current.providerModelsState).toEqual(
      expect.objectContaining({ status: 'done', result: successResult() }),
    );
  });

  it('is a no-op while already running', async () => {
    let resolveFetch: (r: ProviderModelsResponse) => void = () => {};
    const port = makePort({
      scheduleAutoFetchTimeout: vi.fn(() => () => {}),
      fetchModels: vi.fn(() => new Promise<ProviderModelsResponse>((resolve) => { resolveFetch = resolve; })),
    });
    const { result } = renderModelDiscovery(port);
    let firstCall: Promise<void>;
    act(() => {
      firstCall = result.current.handleFetchProviderModels();
    });
    expect(result.current.providerModelsState.status).toBe('running');
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(port.fetchModels).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch(successResult());
      await firstCall;
    });
  });

  it('serves a cache hit without calling the port, tracking source: cache', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const key = 'anthropic|https://api.anthropic.com|hash|';
    const { result, track } = renderModelDiscovery(port, {
      providerModelsKey: key,
      providerModelsCache: { [key]: [{ id: 'cached-model', label: 'Cached Model' }] },
    });
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(port.fetchModels).not.toHaveBeenCalled();
    expect(result.current.providerModelsState).toEqual({
      status: 'done',
      cacheKey: key,
      result: expect.objectContaining({ ok: true, models: [{ id: 'cached-model', label: 'Cached Model' }] }),
    });
    expect(track).toHaveBeenCalledWith(
      'settings_byok_models_fetch_result',
      expect.objectContaining({ result: 'success', source: 'cache' }),
      undefined,
    );
  });

  it('rejects azure/ollama with a precondition notice unless silent', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const { result, setByokPreconditionNotice, track } = renderModelDiscovery(port, {
      cfg: cfg({ apiProtocol: 'azure' }),
      apiProtocol: 'azure',
    });
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(port.fetchModels).not.toHaveBeenCalled();
    expect(setByokPreconditionNotice).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'test' }),
    );
    expect(track).toHaveBeenCalledWith(
      'settings_byok_models_fetch_result',
      expect.objectContaining({ result: 'failed', error_code: 'unsupported_azure' }),
      undefined,
    );

    setByokPreconditionNotice.mockClear();
    await act(async () => {
      await result.current.handleFetchProviderModels({ silent: true });
    });
    expect(setByokPreconditionNotice).not.toHaveBeenCalled();
  });

  it('shows the base-url precondition notice and focuses the field on a first-party host typo', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const hint: ByokFirstPartyBaseUrlHint = { baseUrl: 'https://api.anthropic.com', hostTypo: true };
    const { result, setByokPreconditionNotice, focusByokRequiredField } = renderModelDiscovery(port, {
      byokFirstPartyBaseUrl: hint,
    });
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(port.fetchModels).not.toHaveBeenCalled();
    expect(setByokPreconditionNotice).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'test', field: 'base_url' }),
    );
    expect(focusByokRequiredField).toHaveBeenCalledWith('base_url');
  });

  it('shows the draft-validation notice and tracks a failed result on blocking draft issues', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const { result, showByokDraftValidationNotice, track } = renderModelDiscovery(port, {
      byokModelFetchDraftValidation: BLOCKING_DRAFT,
    });
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(port.fetchModels).not.toHaveBeenCalled();
    expect(showByokDraftValidationNotice).toHaveBeenCalledWith('test', BLOCKING_DRAFT);
    expect(track).toHaveBeenCalledWith(
      'settings_byok_models_fetch_result',
      expect.objectContaining({ result: 'failed', field_missing: 'api_key' }),
      undefined,
    );
  });

  it('lands a done/error result and tracks a failure when the port rejects', async () => {
    const port = makePort({
      scheduleAutoFetchTimeout: vi.fn(() => () => {}),
      fetchModels: vi.fn(async () => { throw new Error('network down'); }),
    });
    const { result, track } = renderModelDiscovery(port);
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(result.current.providerModelsState).toEqual({
      status: 'done',
      cacheKey: expect.any(String),
      result: expect.objectContaining({ ok: false, detail: 'network down' }),
    });
    expect(track).toHaveBeenCalledWith(
      'settings_byok_models_fetch_result',
      expect.objectContaining({ result: 'failed', error_code: 'Error' }),
      undefined,
    );
  });

  it('caches a successful result with models', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const { result, setProviderModelsCache } = renderModelDiscovery(port);
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(setProviderModelsCache).toHaveBeenCalled();
  });

  it('commitProviderModelsInputs commits the key, or clears it on blocking issues', () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const key = 'anthropic|https://api.anthropic.com|hash|';
    const { result } = renderModelDiscovery(port, { providerModelsKey: key });
    act(() => result.current.commitProviderModelsInputs());
    expect(result.current.providerModelsCommittedKey).toBe(key);

    const { result: blocked } = renderModelDiscovery(port, {
      providerModelsKey: key,
      byokModelFetchDraftValidation: BLOCKING_DRAFT,
    });
    act(() => blocked.current.commitProviderModelsInputs());
    expect(blocked.current.providerModelsCommittedKey).toBeNull();
  });

  it('onByokKeyCommit commits the model key and re-tests the connection', () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const key = 'anthropic|https://api.anthropic.com|hash|';
    const { result, handleAutoTestProvider } = renderModelDiscovery(port, { providerModelsKey: key });
    act(() => result.current.onByokKeyCommit());
    expect(result.current.providerModelsCommittedKey).toBe(key);
    expect(handleAutoTestProvider).toHaveBeenCalledTimes(1);
  });

  it('onByokKeyCommit defers the commit/auto-test and cleans a dirty-paste key first', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const dirty = cfg({ apiKey: 'sk-test\n' });
    const { result, updateApiConfig, handleAutoTestProvider, rerender } = renderModelDiscovery(port, {
      cfg: dirty,
    });
    act(() => result.current.onByokKeyCommit());
    expect(updateApiConfig).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    expect(handleAutoTestProvider).not.toHaveBeenCalled();

    // Simulate the cleaned key landing on cfg — the deferred effect should
    // then commit the key and fire the auto-test.
    rerender({ cfg: cfg({ apiKey: 'sk-test' }) });
    await waitFor(() => expect(handleAutoTestProvider).toHaveBeenCalledTimes(1));
  });

  it('resets provider-models state on a later cfg change, but not on the first render', async () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const { result, setByokPreconditionNotice, rerender } = renderModelDiscovery(port);
    await act(async () => {
      await result.current.handleFetchProviderModels();
    });
    expect(result.current.providerModelsState.status).toBe('done');
    setByokPreconditionNotice.mockClear();

    rerender({ cfg: cfg({ apiKey: 'sk-changed' }) });
    expect(result.current.providerModelsState).toEqual({ status: 'idle' });
    expect(result.current.providerModelsCommittedKey).toBeNull();
    expect(setByokPreconditionNotice).toHaveBeenCalledWith(null);
  });

  it('skips the reset once when skipNextProviderModelsReset(true) is set before a cfg change', () => {
    const port = makePort({ scheduleAutoFetchTimeout: vi.fn(() => () => {}) });
    const key = 'anthropic|https://api.anthropic.com|hash|';
    const { result, setByokPreconditionNotice, rerender } = renderModelDiscovery(port, {
      providerModelsKey: key,
    });
    act(() => {
      result.current.setProviderModelsCommittedKey(key);
      result.current.skipNextProviderModelsReset(true);
    });

    rerender({ cfg: cfg({ apiKey: 'sk-changed' }), providerModelsKey: key });
    expect(result.current.providerModelsCommittedKey).toBe(key);
    expect(setByokPreconditionNotice).not.toHaveBeenCalledWith(null);
  });

  it('aborts and resets a running fetch to idle on a cfg change (unlike the gentler connection-test reset)', async () => {
    let resolveFetch: (r: ProviderModelsResponse) => void = () => {};
    const port = makePort({
      scheduleAutoFetchTimeout: vi.fn(() => () => {}),
      fetchModels: vi.fn(() => new Promise<ProviderModelsResponse>((resolve) => { resolveFetch = resolve; })),
    });
    const { result, rerender } = renderModelDiscovery(port);
    act(() => {
      void result.current.handleFetchProviderModels();
    });
    expect(result.current.providerModelsState.status).toBe('running');

    rerender({ cfg: cfg({ apiKey: 'sk-changed' }) });
    expect(result.current.providerModelsState).toEqual({ status: 'idle' });

    await act(async () => {
      resolveFetch(successResult());
    });
  });

  it('skips the debounced auto-fetch outside api mode, in visual-stability mode, or with a host typo', () => {
    const scheduleAutoFetchTimeout = vi.fn(() => () => {});
    const port = makePort({ scheduleAutoFetchTimeout });

    renderModelDiscovery(port, { cfg: cfg({ mode: 'daemon' }) });
    expect(scheduleAutoFetchTimeout).not.toHaveBeenCalled();

    renderModelDiscovery(port, { visualStabilityMode: true });
    expect(scheduleAutoFetchTimeout).not.toHaveBeenCalled();

    renderModelDiscovery(port, {
      byokFirstPartyBaseUrl: { baseUrl: 'https://api.anthropic.com', hostTypo: true },
    });
    expect(scheduleAutoFetchTimeout).not.toHaveBeenCalled();
  });

  it('skips the debounced auto-fetch until the key/base-URL are committed (non-AIHubMix)', () => {
    const scheduleAutoFetchTimeout = vi.fn(() => () => {});
    const port = makePort({ scheduleAutoFetchTimeout });
    renderModelDiscovery(port, { providerModelsKey: 'a-key' });
    expect(scheduleAutoFetchTimeout).not.toHaveBeenCalled();
  });

  it('the debounced auto-fetch fires through the port timer bridge once committed', async () => {
    const port = makePort();
    const key = 'anthropic|https://api.anthropic.com|hash|';
    const { result } = renderModelDiscovery(port, { providerModelsKey: key });
    act(() => result.current.setProviderModelsCommittedKey(key));
    await waitFor(() => expect(port.fetchModels).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.providerModelsState.status).toBe('done'));
  });

  it('AIHubMix fetches without waiting for a committed key', async () => {
    const port = makePort();
    const { result } = renderModelDiscovery(port, {
      apiProtocol: 'aihubmix',
      cfg: cfg({ apiProtocol: 'aihubmix', apiKey: '' }),
    });
    await waitFor(() => expect(port.fetchModels).toHaveBeenCalledTimes(1));
    expect(result.current.providerModelsState.status).toBe('done');
  });

  it('aborts the in-flight fetch on unmount', async () => {
    let seenSignal: AbortSignal | null = null;
    const port = makePort({
      scheduleAutoFetchTimeout: vi.fn(() => () => {}),
      fetchModels: vi.fn((_input, signal?: AbortSignal) => {
        seenSignal = signal ?? null;
        return new Promise<ProviderModelsResponse>(() => {});
      }),
    });
    const { result, unmount } = renderModelDiscovery(port);
    act(() => {
      void result.current.handleFetchProviderModels();
    });
    expect(seenSignal).not.toBeNull();
    expect(seenSignal!.aborted).toBe(false);
    unmount();
    expect(seenSignal!.aborted).toBe(true);
  });
});
