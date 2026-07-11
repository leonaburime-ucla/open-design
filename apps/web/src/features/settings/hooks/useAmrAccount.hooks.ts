// Feature-local hook for the execution-mode section's AMR account cluster:
// the vela sign-in status card + wallet-balance snapshot shown on the AMR
// agent card. Transport (`fetchVelaLoginStatus`/`fetchAmrWalletSnapshot`)
// and the window-resync/login-status-event browser bridges are reached only
// through the injected `AmrAccountPort` (ADR 0002).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import { amrAccountPort } from '../dependencies';
import type { AmrAccountPort } from '../ports';
import type { AmrAgentPresence, AmrLoginStatus } from '../types';

/** Inputs the AMR account cluster needs from its caller. */
export interface AmrAccountInput {
  /** The agent catalog; only `id`/`available` are read (is the AMR agent live?). */
  agents: readonly AmrAgentPresence[];
  /** Mirrors the resolved sign-in status up to the orchestrator's caller
   *  (`SettingsDialog`'s own `onAmrLoginStatusChange` prop). */
  onAmrLoginStatusChange?: (status: AmrLoginStatus | null) => void;
  /** Called when the AMR agent stops being available, so a sibling cluster
   *  (the agent card grid's hover state) can clear a now-stale reference. */
  onAmrAgentUnavailable?: () => void;
}

/** Everything the execution-mode JSX reads off the AMR account cluster. */
export interface AmrAccountController {
  amrCardStatus: AmrLoginStatus | null;
  /** Passed straight through to `<AmrLoginPill onStatusChange>` — the pill
   *  itself resolves a fresh status after a sign-in/out action and reports it
   *  back up rather than this cluster re-fetching it. */
  setAmrCardStatus: (status: AmrLoginStatus | null) => void;
  amrCardStatusReady: boolean;
  amrWalletSnapshot: AmrWalletSnapshot | null;
  amrWalletReady: boolean;
  refreshAmrWalletSnapshot: (options?: { refresh?: boolean }) => Promise<void>;
}

export function useAmrAccount(port: AmrAccountPort, input: AmrAccountInput): AmrAccountController {
  const { agents, onAmrLoginStatusChange, onAmrAgentUnavailable } = input;
  // The orchestrator's `onAmrAgentUnavailable` is typically a fresh inline
  // arrow each render (it closes over a sibling cluster's setter); a ref
  // keeps it out of the fetch effect's deps so a render alone can't
  // re-trigger the fetch — only a real `agents` change does.
  const onAmrAgentUnavailableRef = useRef(onAmrAgentUnavailable);
  onAmrAgentUnavailableRef.current = onAmrAgentUnavailable;
  const [amrCardStatus, setAmrCardStatus] = useState<AmrLoginStatus | null>(null);
  const [amrCardStatusReady, setAmrCardStatusReady] = useState(false);
  const [amrWalletSnapshotState, setAmrWalletSnapshotState] = useState<AmrWalletSnapshot | null>(null);
  const [amrWalletReady, setAmrWalletReady] = useState(false);

  useEffect(() => {
    onAmrLoginStatusChange?.(amrCardStatus);
  }, [amrCardStatus, onAmrLoginStatusChange]);

  const refreshAmrWalletSnapshot = useCallback(async (options: { refresh?: boolean } = {}) => {
    setAmrWalletReady(false);
    const next = await port.fetchWalletSnapshot(options);
    setAmrWalletSnapshotState(next);
    setAmrWalletReady(true);
  }, [port]);

  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent) {
      setAmrCardStatus(null);
      setAmrCardStatusReady(false);
      onAmrAgentUnavailableRef.current?.();
      return;
    }
    let cancelled = false;
    // Refetch in place on every agents refresh, but do NOT flip
    // `amrCardStatusReady` back to false here. The post-sign-in model-catalog
    // rescan loop hands down a fresh `agents` array on each retry; tearing the
    // pill down to the hidden `--placeholder` between the reset and the async
    // status read made the Sign out action blink out and back on every tick.
    // Readiness latches true after the first read and only resets when AMR
    // becomes unavailable (handled above).
    void port.fetchLoginStatus().then((next) => {
      if (!cancelled) {
        setAmrCardStatus(next);
        setAmrCardStatusReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [agents, port]);

  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent || amrCardStatus?.loggedIn !== true) {
      setAmrWalletSnapshotState(null);
      setAmrWalletReady(false);
      return;
    }
    let cancelled = false;
    setAmrWalletReady(false);
    void port.fetchWalletSnapshot().then((next) => {
      if (cancelled) return;
      setAmrWalletSnapshotState(next);
      setAmrWalletReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    agents,
    port,
    amrCardStatus?.loggedIn,
    amrCardStatus?.profile,
    amrCardStatus?.user?.id,
    amrCardStatus?.user?.email,
  ]);

  // Reconcile AMR sign-in state whenever the user returns to the window. The
  // vela device-login flow completes in an external browser / AMR console; if
  // the in-pill poll has already timed out (or the login finished fully
  // out-of-band), the card would otherwise keep showing the stale signed-out
  // state until Settings is closed and reopened. Resyncing on focus /
  // visibility keeps the signed-in state, email, and Sign out action live.
  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent) return;
    let cancelled = false;
    const resyncAmrStatus = () => {
      void port.fetchLoginStatus().then((next) => {
        if (cancelled || !next) return;
        setAmrCardStatus(next);
        if (next.loggedIn) void refreshAmrWalletSnapshot({ refresh: true });
      });
    };
    const unsubscribe = port.subscribeWindowResync(resyncAmrStatus);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [agents, port, refreshAmrWalletSnapshot]);

  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent) return;
    let cancelled = false;
    const unsubscribe = port.subscribeLoginStatusEvent((reason) => {
      if (reason === 'login-canceled') return;
      void port.fetchLoginStatus().then((next) => {
        if (cancelled || !next) return;
        setAmrCardStatus(next);
        setAmrCardStatusReady(true);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [agents, port]);

  return {
    amrCardStatus,
    setAmrCardStatus,
    amrCardStatusReady,
    amrWalletSnapshot: amrWalletSnapshotState,
    amrWalletReady,
    refreshAmrWalletSnapshot,
  };
}

export function useWiredAmrAccount(input: AmrAccountInput): AmrAccountController {
  return useAmrAccount(amrAccountPort, input);
}
