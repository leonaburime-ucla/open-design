// @vitest-environment jsdom
//
// The execution-mode section's BYOK connection-test cluster against a
// hand-written fake `ByokConnectionTestPort`. Pins: the "Test connection"
// state machine (idle -> running -> done; no-op while already running);
// the first-party-base-url-typo and blocking-draft-issue preconditions
// (notice + tracking on an explicit test, silent no-op on an auto-test);
// the reset-on-cfg-change effect (skipped on first render, resets state on
// a later cfg change, but not while a test is running); the debounced
// auto-test (fires through the port's timer bridge, skipped for a
// non-`api` mode / visual-stability mode / an already-tested key); and the
// abort-on-unmount cleanup.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, useT } from '../../../src/i18n';
import {
  useByokConnectionTest,
  type ByokConnectionTestInput,
} from '../../../src/features/settings/hooks/useByokConnectionTest.hooks';
import type { ByokConnectionTestPort } from '../../../src/features/settings/ports';
import type { ByokFirstPartyBaseUrlHint, ByokPreconditionNotice } from '../../../src/features/settings/types';
import type { ByokDraftValidation } from '../../../src/components/byok/validation';
import type { AppConfig, ConnectionTestResponse } from '../../../src/types';

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

function successResult(over: Partial<ConnectionTestResponse> = {}): ConnectionTestResponse {
  return { ok: true, kind: 'success', latencyMs: 12, model: 'claude-sonnet-4-5', ...over };
}

function makePort(over: Partial<ByokConnectionTestPort> = {}): ByokConnectionTestPort {
  return {
    testProvider: vi.fn(async () => successResult()),
    // Fires immediately by default so tests exercising the debounced
    // auto-test don't need real/fake timer juggling; override with a no-op
    // (`vi.fn(() => () => {})`) to assert the debounce is skipped instead.
    scheduleAutoTestTimeout: vi.fn((onTimeout: () => void) => {
      onTimeout();
      return () => {};
    }),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderConnectionTest(
  port: ByokConnectionTestPort,
  over: Partial<ByokConnectionTestInput> = {},
) {
  const track = vi.fn();
  const focusByokRequiredField = vi.fn();
  const setByokPreconditionNotice = vi.fn();
  const showByokDraftValidationNotice = vi.fn();
  const initialCfg = over.cfg ?? cfg();
  const rendered = renderHook(
    (props: Partial<ByokConnectionTestInput>) => {
      const t = useT();
      return useByokConnectionTest(port, {
        apiProtocol: 'anthropic',
        cfg: initialCfg,
        t,
        track,
        byokDraftValidation: VALID_DRAFT,
        byokFirstPartyBaseUrl: undefined,
        visualStabilityMode: false,
        focusByokRequiredField,
        setByokPreconditionNotice,
        showByokDraftValidationNotice,
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
    ...rendered,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useByokConnectionTest', () => {
  it('starts idle', () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const { result } = renderConnectionTest(port);
    expect(result.current.providerTestState).toEqual({ status: 'idle' });
  });

  it('handleTestProvider runs the connection test and lands a done result', async () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const { result } = renderConnectionTest(port);
    await act(async () => {
      await result.current.handleTestProvider();
    });
    expect(port.testProvider).toHaveBeenCalledTimes(1);
    expect(port.testProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-test',
        model: 'claude-sonnet-4-5',
      }),
      expect.any(AbortSignal),
    );
    expect(result.current.providerTestState).toEqual({ status: 'done', result: successResult() });
  });

  it('is a no-op while already running', async () => {
    let resolveTest: (r: ConnectionTestResponse) => void = () => {};
    const port = makePort({
      scheduleAutoTestTimeout: vi.fn(() => () => {}),
      testProvider: vi.fn(() => new Promise<ConnectionTestResponse>((resolve) => { resolveTest = resolve; })),
    });
    const { result } = renderConnectionTest(port);
    let firstCall: Promise<void>;
    act(() => {
      firstCall = result.current.handleTestProvider();
    });
    expect(result.current.providerTestState).toEqual({ status: 'running' });
    await act(async () => {
      await result.current.handleTestProvider();
    });
    expect(port.testProvider).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveTest(successResult());
      await firstCall;
    });
  });

  it('shows the base-url precondition notice and focuses the field on a first-party host typo', async () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const hint: ByokFirstPartyBaseUrlHint = { baseUrl: 'https://api.anthropic.com', hostTypo: true };
    const { result, setByokPreconditionNotice, focusByokRequiredField } = renderConnectionTest(port, {
      byokFirstPartyBaseUrl: hint,
    });
    await act(async () => {
      await result.current.handleTestProvider();
    });
    expect(port.testProvider).not.toHaveBeenCalled();
    expect(setByokPreconditionNotice).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'test', field: 'base_url' }),
    );
    expect(focusByokRequiredField).toHaveBeenCalledWith('base_url');
  });

  it('a silent (auto-test) call swallows the host-typo precondition instead of notifying', async () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const hint: ByokFirstPartyBaseUrlHint = { baseUrl: 'https://api.anthropic.com', hostTypo: true };
    const { result, setByokPreconditionNotice } = renderConnectionTest(port, {
      byokFirstPartyBaseUrl: hint,
    });
    await act(async () => {
      await result.current.handleTestProvider({ silentPreconditions: true });
    });
    expect(port.testProvider).not.toHaveBeenCalled();
    expect(setByokPreconditionNotice).not.toHaveBeenCalled();
  });

  it('shows the draft-validation notice and tracks a failed result on blocking draft issues', async () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const { result, showByokDraftValidationNotice, track } = renderConnectionTest(port, {
      byokDraftValidation: BLOCKING_DRAFT,
    });
    await act(async () => {
      await result.current.handleTestProvider();
    });
    expect(port.testProvider).not.toHaveBeenCalled();
    expect(showByokDraftValidationNotice).toHaveBeenCalledWith('test', BLOCKING_DRAFT);
    expect(track).toHaveBeenCalledWith(
      'settings_byok_test_result',
      expect.objectContaining({ result: 'failed', field_missing: 'api_key' }),
      undefined,
    );
  });

  it('silentPreconditions skips blocking-issue notification entirely', async () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const { result, showByokDraftValidationNotice, track } = renderConnectionTest(port, {
      byokDraftValidation: BLOCKING_DRAFT,
    });
    await act(async () => {
      await result.current.handleTestProvider({ silentPreconditions: true });
    });
    expect(showByokDraftValidationNotice).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it('lands a done/error result and tracks a failure when the port rejects', async () => {
    const port = makePort({
      scheduleAutoTestTimeout: vi.fn(() => () => {}),
      testProvider: vi.fn(async () => { throw new Error('network down'); }),
    });
    const { result, track } = renderConnectionTest(port);
    await act(async () => {
      await result.current.handleTestProvider();
    });
    expect(result.current.providerTestState).toEqual({
      status: 'done',
      result: expect.objectContaining({ ok: false, detail: 'network down' }),
    });
    expect(track).toHaveBeenCalledWith(
      'settings_byok_test_result',
      expect.objectContaining({ result: 'failed', error_code: 'Error' }),
      undefined,
    );
  });

  it('focuses the model field when the test comes back not_found_model', async () => {
    const port = makePort({
      scheduleAutoTestTimeout: vi.fn(() => () => {}),
      testProvider: vi.fn(async () => ({ ok: false, kind: 'not_found_model', latencyMs: 5 }) as ConnectionTestResponse),
    });
    const { result, focusByokRequiredField } = renderConnectionTest(port);
    await act(async () => {
      await result.current.handleTestProvider();
    });
    expect(focusByokRequiredField).toHaveBeenCalledWith('model');
  });

  it('handleAutoTestProvider is a no-op while running, with a host typo, or with blocking issues', () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const { result: withBlockingIssues } = renderConnectionTest(port, {
      byokDraftValidation: BLOCKING_DRAFT,
    });
    act(() => withBlockingIssues.current.handleAutoTestProvider());
    expect(port.testProvider).not.toHaveBeenCalled();

    const hint: ByokFirstPartyBaseUrlHint = { baseUrl: 'https://api.anthropic.com', hostTypo: true };
    const { result: withHostTypo } = renderConnectionTest(port, { byokFirstPartyBaseUrl: hint });
    act(() => withHostTypo.current.handleAutoTestProvider());
    expect(port.testProvider).not.toHaveBeenCalled();
  });

  it('handleAutoTestProvider runs the test once and skips a repeat for the same config key', async () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const { result } = renderConnectionTest(port);
    await act(async () => {
      result.current.handleAutoTestProvider();
    });
    await waitFor(() => expect(port.testProvider).toHaveBeenCalledTimes(1));
    act(() => result.current.handleAutoTestProvider());
    expect(port.testProvider).toHaveBeenCalledTimes(1);
  });

  it('resets provider test state on a later cfg change, but not on the first render', async () => {
    const port = makePort({ scheduleAutoTestTimeout: vi.fn(() => () => {}) });
    const { result, setByokPreconditionNotice, rerender } = renderConnectionTest(port);
    await act(async () => {
      await result.current.handleTestProvider();
    });
    expect(result.current.providerTestState.status).toBe('done');
    setByokPreconditionNotice.mockClear();

    rerender({ cfg: cfg({ apiKey: 'sk-changed' }) });
    expect(result.current.providerTestState).toEqual({ status: 'idle' });
    expect(setByokPreconditionNotice).toHaveBeenCalledWith(null);
  });

  it('does not reset a running test on a cfg change', async () => {
    let resolveTest: (r: ConnectionTestResponse) => void = () => {};
    const port = makePort({
      scheduleAutoTestTimeout: vi.fn(() => () => {}),
      testProvider: vi.fn(() => new Promise<ConnectionTestResponse>((resolve) => { resolveTest = resolve; })),
    });
    const { result, rerender } = renderConnectionTest(port);
    act(() => {
      void result.current.handleTestProvider();
    });
    expect(result.current.providerTestState).toEqual({ status: 'running' });

    rerender({ cfg: cfg({ apiKey: 'sk-changed' }) });
    expect(result.current.providerTestState).toEqual({ status: 'running' });

    await act(async () => {
      resolveTest(successResult());
    });
  });

  it('skips the debounced auto-test outside api mode, in visual-stability mode, or with a host typo', () => {
    const scheduleAutoTestTimeout = vi.fn(() => () => {});
    const port = makePort({ scheduleAutoTestTimeout });

    renderConnectionTest(port, { cfg: cfg({ mode: 'daemon' }) });
    expect(scheduleAutoTestTimeout).not.toHaveBeenCalled();

    renderConnectionTest(port, { visualStabilityMode: true });
    expect(scheduleAutoTestTimeout).not.toHaveBeenCalled();

    renderConnectionTest(port, {
      byokFirstPartyBaseUrl: { baseUrl: 'https://api.anthropic.com', hostTypo: true },
    });
    expect(scheduleAutoTestTimeout).not.toHaveBeenCalled();
  });

  it('the debounced auto-test fires through the port timer bridge and runs the test', async () => {
    const port = makePort();
    const { result } = renderConnectionTest(port);
    await waitFor(() => expect(port.testProvider).toHaveBeenCalledTimes(1));
    expect(result.current.providerTestState.status).toBe('done');
  });

  it('aborts the in-flight test on unmount', async () => {
    let seenSignal: AbortSignal | null = null;
    const port = makePort({
      scheduleAutoTestTimeout: vi.fn(() => () => {}),
      testProvider: vi.fn((_input, signal?: AbortSignal) => {
        seenSignal = signal ?? null;
        return new Promise<ConnectionTestResponse>(() => {});
      }),
    });
    const { result, unmount } = renderConnectionTest(port);
    act(() => {
      void result.current.handleTestProvider();
    });
    expect(seenSignal).not.toBeNull();
    expect(seenSignal!.aborted).toBe(false);
    unmount();
    expect(seenSignal!.aborted).toBe(true);
  });
});
