// @vitest-environment jsdom
//
// The Orbit automation hook against a hand-written fake `OrbitPort` — no
// module mocks for transport, no global `fetch` stub. Pins: load-on-mount
// (status/templates/connector count), the configuration gate, the manual
// run flow (success navigates, failure surfaces a notice), and the
// markdown-copy flash. `navigate` is mocked since the hook calls it directly
// (route navigation is not part of the injected port — see the hook's header
// comment).
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OrbitRunStartResponse, OrbitStatusResponse, SkillSummary } from '../../../src/types';
import type { AppConfig } from '../../../src/types';
import { I18nProvider } from '../../../src/i18n';
import { useOrbit } from '../../../src/features/settings/hooks/useOrbit.hooks';
import type { OrbitPort } from '../../../src/features/settings/ports';

const navigateMock = vi.fn();
vi.mock('../../../src/router', () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
}));

function baseConfig(over: Partial<AppConfig> = {}): AppConfig {
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
    orbit: { enabled: false, time: '08:00', templateSkillId: 'orbit-general' },
    ...over,
  } as AppConfig;
}

function makePort(over: Partial<OrbitPort> = {}): OrbitPort {
  return {
    fetchStatus: vi.fn(async () => null as OrbitStatusResponse | null),
    fetchTemplates: vi.fn(async () => [] as SkillSummary[]),
    fetchConnectors: vi.fn(async () => []),
    runOrbit: vi.fn(async () => ({ projectId: 'proj-1', agentRunId: 'run-1' }) as OrbitRunStartResponse),
    subscribeStatusPolling: vi.fn(() => () => {}),
    subscribeWindowFocus: vi.fn(() => () => {}),
    scheduleTimeout: vi.fn(() => () => {}),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderOrbit(
  port: OrbitPort,
  input: Partial<Parameters<typeof useOrbit>[1]> = {},
) {
  const setCfg = vi.fn();
  const cfg = input.cfg ?? baseConfig();
  return {
    setCfg,
    ...renderHook(
      () =>
        useOrbit(port, {
          cfg,
          setCfg,
          composioApiKeyConfigured: false,
          onLeaveForOrbitProject: vi.fn(),
          ...input,
        }),
      { wrapper },
    ),
  };
}

describe('useOrbit', () => {
  it('loads status, templates (filtered/sorted), and the connector count on mount', async () => {
    const port = makePort({
      fetchStatus: vi.fn(async () => ({ running: false, lastRun: null }) as OrbitStatusResponse),
      fetchTemplates: vi.fn(async () => [
        { id: 'b', name: 'Beta', scenario: 'orbit' } as SkillSummary,
        { id: 'x', name: 'Skip me', scenario: 'not-orbit' } as SkillSummary,
        { id: 'a', name: 'Alpha', scenario: 'orbit' } as SkillSummary,
      ]),
      fetchConnectors: vi.fn(async () => [
        { status: 'connected' },
        { status: 'disconnected' },
      ] as never),
    });
    const { result } = renderOrbit(port);

    await waitFor(() => expect(result.current.orbitTemplates).not.toBeNull());
    expect(result.current.orbitTemplates?.map((t) => t.id)).toEqual(['a', 'b']);
    await waitFor(() => expect(result.current.connectedCount).toBe(1));
    expect(result.current.status?.running).toBe(false);
  });

  it('shows the configuration gate once the connector count resolves to zero', async () => {
    const port = makePort({ fetchConnectors: vi.fn(async () => []) });
    const { result } = renderOrbit(port);

    await waitFor(() => expect(result.current.connectedCount).toBe(0));
    expect(result.current.showConfigGate).toBe(true);
    expect(result.current.runDisabled).toBe(true);
  });

  it('hides the gate and enables the run CTA once a connector is connected', async () => {
    const port = makePort({ fetchConnectors: vi.fn(async () => [{ status: 'connected' }] as never) });
    const { result } = renderOrbit(port);

    await waitFor(() => expect(result.current.connectedCount).toBe(1));
    expect(result.current.showConfigGate).toBe(false);
    expect(result.current.runDisabled).toBe(false);
  });

  it('branches the gate copy on whether a Composio key is already saved', async () => {
    const port = makePort({ fetchConnectors: vi.fn(async () => []) });
    const withKey = renderOrbit(port, { composioApiKeyConfigured: true });
    await waitFor(() => expect(withKey.result.current.connectedCount).toBe(0));
    expect(withKey.result.current.gateCopyKeys.bodyKey).toBe('settings.orbit.gateBody');

    const withoutKey = renderOrbit(makePort({ fetchConnectors: vi.fn(async () => []) }), {
      composioApiKeyConfigured: false,
    });
    await waitFor(() => expect(withoutKey.result.current.connectedCount).toBe(0));
    expect(withoutKey.result.current.gateCopyKeys.bodyKey).toBe('settings.orbit.gateBodyNoKey');
  });

  it('runs Orbit, calls onLeaveForOrbitProject, and navigates to the new project on success', async () => {
    const onLeaveForOrbitProject = vi.fn();
    const runOrbit = vi.fn(async () => ({ projectId: 'proj-42', agentRunId: 'run-42' }));
    const port = makePort({ fetchConnectors: vi.fn(async () => [{ status: 'connected' }] as never), runOrbit });
    const { result } = renderOrbit(port, { onLeaveForOrbitProject });
    await waitFor(() => expect(result.current.connectedCount).toBe(1));

    act(() => result.current.triggerNow());
    await waitFor(() => expect(runOrbit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLeaveForOrbitProject).toHaveBeenCalledTimes(1));
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'project', projectId: 'proj-42' }),
    );
    await waitFor(() => expect(result.current.running).toBe(false));
  });

  it('surfaces an error notice and stops running when the run throws', async () => {
    const runOrbit = vi.fn(async () => {
      throw new Error('daemon offline');
    });
    const port = makePort({ fetchConnectors: vi.fn(async () => [{ status: 'connected' }] as never), runOrbit });
    const { result } = renderOrbit(port);
    await waitFor(() => expect(result.current.connectedCount).toBe(1));

    act(() => result.current.triggerNow());
    await waitFor(() => expect(result.current.notice?.kind).toBe('error'));
    expect(result.current.running).toBe(false);
  });

  it('is a no-op to call triggerNow again while already running', async () => {
    let resolveRun: ((value: OrbitRunStartResponse) => void) | undefined;
    const runOrbit = vi.fn(
      () => new Promise<OrbitRunStartResponse>((resolve) => {
        resolveRun = resolve;
      }),
    );
    const port = makePort({ fetchConnectors: vi.fn(async () => [{ status: 'connected' }] as never), runOrbit });
    const { result } = renderOrbit(port);
    await waitFor(() => expect(result.current.connectedCount).toBe(1));

    act(() => result.current.triggerNow());
    await waitFor(() => expect(result.current.running).toBe(true));
    act(() => result.current.triggerNow());
    expect(runOrbit).toHaveBeenCalledTimes(1);

    resolveRun?.({ projectId: 'p', agentRunId: 'r' });
    await waitFor(() => expect(result.current.running).toBe(false));
  });

  it('updateOrbit patches the config through setCfg', async () => {
    const port = makePort();
    const { result, setCfg } = renderOrbit(port);
    await waitFor(() => expect(result.current.connectedCount).not.toBeNull());

    act(() => result.current.updateOrbit({ enabled: true }));
    expect(setCfg).toHaveBeenCalledTimes(1);
    const updater = setCfg.mock.calls[0]?.[0] as (c: AppConfig) => AppConfig;
    expect(updater(baseConfig()).orbit?.enabled).toBe(true);
  });

  it('copies the last run markdown to the clipboard and schedules the "copied" reset', async () => {
    const scheduleTimeout = vi.fn(() => () => {});
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const port = makePort({
      scheduleTimeout,
      fetchStatus: vi.fn(async () => ({
        running: false,
        lastRun: { completedAt: '2026-01-01T00:00:00.000Z', connectorsChecked: 1, connectorsSucceeded: 1, connectorsFailed: 0, connectorsSkipped: 0, markdown: 'hello' },
      }) as OrbitStatusResponse),
    });
    const { result } = renderOrbit(port);
    await waitFor(() => expect(result.current.lastRun?.markdown).toBe('hello'));

    await act(async () => {
      await result.current.copyMarkdown();
    });
    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe(true);
    expect(scheduleTimeout).toHaveBeenCalledWith(expect.any(Function), 1600);
  });

  it('subscribes to status polling only while a run is in flight', async () => {
    const subscribeStatusPolling = vi.fn(() => () => {});
    const port = makePort({
      subscribeStatusPolling,
      fetchStatus: vi.fn(async () => ({ running: true, lastRun: null }) as OrbitStatusResponse),
    });
    renderOrbit(port);
    await waitFor(() => expect(subscribeStatusPolling).toHaveBeenCalledTimes(1));
  });
});
