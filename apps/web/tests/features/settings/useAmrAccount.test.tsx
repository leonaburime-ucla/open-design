// @vitest-environment jsdom
//
// The AMR account cluster's hook against a hand-written fake `AmrAccountPort`.
// Pins: no fetch when the AMR agent is unavailable (and the sibling
// hover-state reset fires); fetch + ready-latch when it becomes available;
// wallet snapshot only fetched while signed in; the window-resync bridge
// refetches status and (when signed in) forces a wallet refresh; the
// login-status-event bridge refetches unless the reason is
// `login-canceled`; and `setAmrCardStatus` is exposed for the
// `<AmrLoginPill onStatusChange>` wiring.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useAmrAccount,
  type AmrAccountInput,
} from '../../../src/features/settings/hooks/useAmrAccount.hooks';
import type { AmrAccountPort } from '../../../src/features/settings/ports';
import type { AmrLoginStatus } from '../../../src/features/settings/types';

function loginStatus(over: Partial<AmrLoginStatus> = {}): AmrLoginStatus {
  return {
    loggedIn: true,
    profile: 'default',
    user: { id: 'u1', email: 'user@example.com' },
    configPath: '/tmp/.amr/config.json',
    ...over,
  };
}

// A stable reference — `renderHook`'s callback re-invokes on every render, so
// an inline array literal as a default would recreate `agents` (and retrigger
// every `[agents, ...]`-keyed effect) on every render, live-looping the hook.
const AMR_AGENT_AVAILABLE = [{ id: 'amr', available: true }];
const AMR_AGENT_ABSENT: { id: string; available: boolean }[] = [];

function makePort(over: Partial<AmrAccountPort> = {}): AmrAccountPort {
  return {
    fetchLoginStatus: vi.fn(async () => loginStatus()),
    fetchWalletSnapshot: vi.fn(async () => ({ status: 'available', balanceUsd: '12.30' }) as any),
    subscribeWindowResync: vi.fn(() => () => {}),
    subscribeLoginStatusEvent: vi.fn(() => () => {}),
    ...over,
  };
}

function renderAmrAccount(port: AmrAccountPort, over: Partial<AmrAccountInput> = {}) {
  const onAmrLoginStatusChange = vi.fn();
  const onAmrAgentUnavailable = vi.fn();
  return {
    onAmrLoginStatusChange,
    onAmrAgentUnavailable,
    ...renderHook(() =>
      useAmrAccount(port, {
        agents: AMR_AGENT_AVAILABLE,
        onAmrLoginStatusChange,
        onAmrAgentUnavailable,
        ...over,
      }),
    ),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAmrAccount', () => {
  it('does not fetch and resets state when the AMR agent is unavailable', async () => {
    const port = makePort();
    const { result, onAmrAgentUnavailable } = renderAmrAccount(port, { agents: AMR_AGENT_ABSENT });
    expect(port.fetchLoginStatus).not.toHaveBeenCalled();
    expect(result.current.amrCardStatus).toBeNull();
    expect(result.current.amrCardStatusReady).toBe(false);
    expect(onAmrAgentUnavailable).toHaveBeenCalledTimes(1);
  });

  it('fetches login status and latches ready when the AMR agent is available', async () => {
    const port = makePort();
    const { result, onAmrLoginStatusChange } = renderAmrAccount(port);
    await waitFor(() => expect(result.current.amrCardStatusReady).toBe(true));
    expect(port.fetchLoginStatus).toHaveBeenCalledTimes(1);
    expect(result.current.amrCardStatus?.loggedIn).toBe(true);
    await waitFor(() => expect(onAmrLoginStatusChange).toHaveBeenCalledWith(result.current.amrCardStatus));
  });

  it('fetches the wallet snapshot only once signed in, and resets it when signed out', async () => {
    const port = makePort({ fetchLoginStatus: vi.fn(async () => loginStatus({ loggedIn: false })) });
    const { result } = renderAmrAccount(port);
    await waitFor(() => expect(result.current.amrCardStatusReady).toBe(true));
    expect(port.fetchWalletSnapshot).not.toHaveBeenCalled();
    expect(result.current.amrWalletSnapshot).toBeNull();
  });

  it('fetches the wallet snapshot once the login status resolves signed-in', async () => {
    const port = makePort();
    const { result } = renderAmrAccount(port);
    await waitFor(() => expect(result.current.amrWalletReady).toBe(true));
    expect(port.fetchWalletSnapshot).toHaveBeenCalledTimes(1);
    expect(result.current.amrWalletSnapshot).toEqual({ status: 'available', balanceUsd: '12.30' });
  });

  it('the window-resync bridge refetches status and force-refreshes the wallet when signed in', async () => {
    let resyncHandler: (() => void) | null = null;
    const port = makePort({
      subscribeWindowResync: vi.fn((onResync: () => void) => {
        resyncHandler = onResync;
        return () => {};
      }),
    });
    const { result } = renderAmrAccount(port);
    await waitFor(() => expect(result.current.amrCardStatusReady).toBe(true));
    vi.mocked(port.fetchLoginStatus).mockClear();
    vi.mocked(port.fetchWalletSnapshot).mockClear();

    expect(resyncHandler).not.toBeNull();
    await act(async () => {
      resyncHandler?.();
    });
    await waitFor(() => expect(port.fetchLoginStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(port.fetchWalletSnapshot).toHaveBeenCalledWith({ refresh: true }));
  });

  it('the login-status-event bridge ignores a login-canceled reason', async () => {
    let eventHandler: ((reason: 'login-started' | 'login-canceled' | 'status-changed') => void) | null = null;
    const port = makePort({
      subscribeLoginStatusEvent: vi.fn((onEvent) => {
        eventHandler = onEvent;
        return () => {};
      }),
    });
    const { result } = renderAmrAccount(port);
    await waitFor(() => expect(result.current.amrCardStatusReady).toBe(true));
    vi.mocked(port.fetchLoginStatus).mockClear();

    expect(eventHandler).not.toBeNull();
    act(() => eventHandler?.('login-canceled'));
    expect(port.fetchLoginStatus).not.toHaveBeenCalled();

    act(() => eventHandler?.('status-changed'));
    await waitFor(() => expect(port.fetchLoginStatus).toHaveBeenCalledTimes(1));
  });

  it('exposes setAmrCardStatus for the AmrLoginPill onStatusChange wiring', async () => {
    const port = makePort();
    const { result } = renderAmrAccount(port);
    await waitFor(() => expect(result.current.amrCardStatusReady).toBe(true));
    const nextStatus = loginStatus({ profile: 'work' });
    act(() => result.current.setAmrCardStatus(nextStatus));
    expect(result.current.amrCardStatus).toBe(nextStatus);
  });
});
