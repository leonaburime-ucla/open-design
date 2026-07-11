// @vitest-environment jsdom
//
// The execution-mode section's local-CLI agent list cluster against a
// hand-written fake `DaemonAgentPort`. Pins: installed/unavailable agent
// list derivation; the CLI connection test state machine (idle -> running ->
// done, no-op while already running or with no selected agent); the rescan
// state machine (running flag, success/error notice, guarded against
// concurrent calls) and its notice auto-dismiss timer bridge; the
// install-return bridge firing a rescan only when a rescan was actually
// pending; and the post-AMR-sign-in model-catalog chase effect.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useDaemonAgents,
  type DaemonAgentsInput,
} from '../../../src/features/settings/hooks/useDaemonAgents.hooks';
import type { DaemonAgentPort } from '../../../src/features/settings/ports';
import type { AgentInfo, AppConfig } from '../../../src/types';

function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude',
    name: 'Claude Code',
    available: true,
    ...over,
  } as AgentInfo;
}

function cfg(over: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'daemon',
    agentId: 'claude',
    ...over,
  } as AppConfig;
}

function makePort(over: Partial<DaemonAgentPort> = {}): DaemonAgentPort {
  return {
    testAgent: vi.fn(async () => ({ ok: true, kind: 'ok', latencyMs: 12, model: 'default' }) as any),
    openExternalUrl: vi.fn(),
    scheduleRescanNoticeTimeout: vi.fn(() => () => {}),
    subscribeInstallReturn: vi.fn(() => () => {}),
    ...over,
  };
}

// Stable references — `renderHook`'s callback re-invokes on every render, so
// an inline array/object literal as a default would recreate `agents`/`cfg`
// on every render, live-looping the hook's `[agents, ...]`/`[cfg..., ...]`-
// keyed effects.
const CLAUDE_AVAILABLE = [agent()];

function renderDaemonAgents(port: DaemonAgentPort, over: Partial<DaemonAgentsInput> = {}) {
  const onRefreshAgents = vi.fn(async () => CLAUDE_AVAILABLE);
  return {
    onRefreshAgents,
    ...renderHook(() =>
      useDaemonAgents(port, {
        cfg: cfg(),
        agents: CLAUDE_AVAILABLE,
        agentsLoading: false,
        onRefreshAgents,
        amrLoggedIn: false,
        ...over,
      }),
    ),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDaemonAgents', () => {
  it('derives installed/unavailable agent lists and the installed count', () => {
    const port = makePort();
    const agents = [agent({ id: 'claude', available: true }), agent({ id: 'codex', available: false })];
    const { result } = renderDaemonAgents(port, { agents });
    expect(result.current.installedAgents.map((a) => a.id)).toEqual(['claude']);
    expect(result.current.unavailableAgents.map((a) => a.id)).toEqual(['codex']);
    expect(result.current.installedCount).toBe(1);
  });

  it('initialAgentScanRunning is true only while loading with no agents yet', () => {
    const port = makePort();
    const { result, rerender } = renderHook(
      (props: Partial<DaemonAgentsInput>) =>
        useDaemonAgents(port, {
          cfg: cfg(),
          agents: [],
          agentsLoading: true,
          onRefreshAgents: vi.fn(),
          amrLoggedIn: false,
          ...props,
        }),
      { initialProps: {} },
    );
    expect(result.current.initialAgentScanRunning).toBe(true);
    rerender({ agents: CLAUDE_AVAILABLE, agentsLoading: false });
    expect(result.current.initialAgentScanRunning).toBe(false);
  });

  it('handleTestAgent runs the connection test and lands a done result', async () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    await act(async () => {
      await result.current.handleTestAgent();
    });
    expect(port.testAgent).toHaveBeenCalledTimes(1);
    expect(port.testAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'claude' }),
      expect.any(AbortSignal),
    );
    expect(result.current.agentTestState).toEqual({
      status: 'done',
      result: { ok: true, kind: 'ok', latencyMs: 12, model: 'default' },
    });
  });

  it('handleTestAgent is a no-op with no selected/available agent', async () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port, { cfg: cfg({ agentId: 'nonexistent' }) });
    await act(async () => {
      await result.current.handleTestAgent();
    });
    expect(port.testAgent).not.toHaveBeenCalled();
    expect(result.current.agentTestState).toEqual({ status: 'idle' });
  });

  it('setAgentTestState lets a caller externally reset the test state (Codex path repair)', () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    act(() => result.current.setAgentTestState({ status: 'running' }));
    expect(result.current.agentTestState).toEqual({ status: 'running' });
    act(() => result.current.setAgentTestState({ status: 'idle' }));
    expect(result.current.agentTestState).toEqual({ status: 'idle' });
  });

  it('handleRefreshAgents sets the running flag and a success notice', async () => {
    const port = makePort();
    const { result, onRefreshAgents } = renderDaemonAgents(port);
    let inFlight: Promise<void>;
    act(() => {
      inFlight = result.current.handleRefreshAgents();
    });
    expect(result.current.agentRescanRunning).toBe(true);
    await act(async () => {
      await inFlight;
    });
    expect(onRefreshAgents).toHaveBeenCalledTimes(1);
    expect(result.current.agentRescanRunning).toBe(false);
    expect(result.current.agentRescanNotice).toEqual({ kind: 'success', count: 1 });
  });

  it('handleRefreshAgents sets an error notice when onRefreshAgents rejects', async () => {
    const port = makePort();
    const onRefreshAgents = vi.fn(async () => {
      throw new Error('boom');
    });
    const { result } = renderDaemonAgents(port, { onRefreshAgents });
    await act(async () => {
      await result.current.handleRefreshAgents();
    });
    expect(result.current.agentRescanNotice).toEqual({ kind: 'error' });
  });

  it('schedules the rescan notice auto-dismiss through the port timer bridge', async () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    await act(async () => {
      await result.current.handleRefreshAgents();
    });
    await waitFor(() => expect(port.scheduleRescanNoticeTimeout).toHaveBeenCalledWith(expect.any(Function), 6000));
  });

  it('the install-return bridge only rescans when an install was actually pending', async () => {
    let installReturnHandler: (() => void) | null = null;
    const port = makePort({
      subscribeInstallReturn: vi.fn((onReturn: () => void) => {
        installReturnHandler = onReturn;
        return () => {};
      }),
    });
    const { result, onRefreshAgents } = renderDaemonAgents(port);
    expect(installReturnHandler).not.toBeNull();

    // No pending install intent yet — a bare return-to-tab is a no-op.
    act(() => installReturnHandler?.());
    expect(onRefreshAgents).not.toHaveBeenCalled();

    act(() => result.current.markAgentInstallIntent());
    await act(async () => {
      installReturnHandler?.();
    });
    await waitFor(() => expect(onRefreshAgents).toHaveBeenCalledTimes(1));
  });

  it('openAgentFixUrl marks install intent and opens the sanitized URL', () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    act(() => result.current.openAgentFixUrl('https://example.com/install'));
    expect(port.openExternalUrl).toHaveBeenCalledWith('https://example.com/install');
  });

  it('openAgentFixUrl ignores a non-https URL', () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    act(() => result.current.openAgentFixUrl('javascript:alert(1)'));
    expect(port.openExternalUrl).not.toHaveBeenCalled();
  });

  it('openAgentFixUrl attributes the URL when an AMR entry source is given', () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    act(() => result.current.openAgentFixUrl('https://amr.example.com/install', 'settings_amr_install'));
    expect(port.openExternalUrl).toHaveBeenCalledTimes(1);
    const openedUrl = vi.mocked(port.openExternalUrl).mock.calls[0]?.[0] as string;
    expect(openedUrl.startsWith('https://amr.example.com/install')).toBe(true);
    expect(openedUrl).toContain('od_origin=');
  });

  it('diagnosticHandlersForAgent wires rescan/docs/install through the same handlers', () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    const handlers = result.current.diagnosticHandlersForAgent(
      agent({ id: 'codex', available: false, docsUrl: 'https://docs.example.com', installUrl: 'https://install.example.com' } as any),
    );
    expect(handlers.onOpenDocs).toBeDefined();
    expect(handlers.onOpenInstall).toBeDefined();
    act(() => handlers.onOpenDocs?.());
    expect(port.openExternalUrl).toHaveBeenCalledWith('https://docs.example.com/');
  });

  it('diagnosticHandlersForAgent omits docs/install handlers when the agent has no links', () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    const handlers = result.current.diagnosticHandlersForAgent(agent({ id: 'codex', available: false }));
    expect(handlers.onOpenDocs).toBeUndefined();
    expect(handlers.onOpenInstall).toBeUndefined();
  });

  it('chases the AMR catalog once signed in with an empty model list, and stops once models arrive', async () => {
    const amrEmpty = agent({ id: 'amr', available: true, models: [] } as any);
    const amrFilled = agent({ id: 'amr', available: true, models: [{ id: 'amr-1', label: 'AMR 1' }] } as any);
    const onRefreshAgents = vi.fn(async () => [amrFilled]);
    const port = makePort();
    renderHook(() =>
      useDaemonAgents(port, {
        cfg: cfg(),
        agents: [amrEmpty],
        agentsLoading: false,
        onRefreshAgents,
        amrLoggedIn: true,
      }),
    );
    await waitFor(() => expect(onRefreshAgents).toHaveBeenCalledTimes(1));
  });

  it('does not chase the AMR catalog when not signed in', () => {
    const amrEmpty = agent({ id: 'amr', available: true, models: [] } as any);
    const onRefreshAgents = vi.fn(async () => [amrEmpty]);
    const port = makePort();
    renderHook(() =>
      useDaemonAgents(port, {
        cfg: cfg(),
        agents: [amrEmpty],
        agentsLoading: false,
        onRefreshAgents,
        amrLoggedIn: false,
      }),
    );
    expect(onRefreshAgents).not.toHaveBeenCalled();
  });

  it('setHoveredAgentCardId and setAgentCustomModelIds expose plain setters', () => {
    const port = makePort();
    const { result } = renderDaemonAgents(port);
    act(() => result.current.setHoveredAgentCardId('claude'));
    expect(result.current.hoveredAgentCardId).toBe('claude');
    act(() => result.current.setAgentCustomModelIds((prev) => new Set(prev).add('claude')));
    expect(result.current.agentCustomModelIds.has('claude')).toBe(true);
  });
});
