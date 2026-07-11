// Feature-local hook for the execution-mode section's local-CLI agent list
// cluster: rescan (manual + on-return-to-tab + the post-AMR-sign-in
// model-catalog chase), the per-agent connection test, and the docs/install
// link handlers (including the AMR-attributed install URL). Transport
// (`testAgent`) and the external-URL opener are reached only through the
// injected `DaemonAgentPort` (ADR 0002).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { agentIdToTracking } from '@open-design/contracts/analytics';
import { useAnalytics } from '../../../analytics/provider';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
  type TrackingAmrEntrySource,
} from '../../../analytics/amr-attribution';
import { getResolvedDeviceId } from '../../../analytics/client';
import { trackSettingsCliTestResult } from '../../../analytics/events';
import { orderAgentsWithOpenDesignFirst } from '../../../components/agentOrdering';
import { isVisibleLocalCliAgent } from '../../../utils/visibleAgents';
import type { AgentInfo, AppConfig } from '../../../types';
import { daemonAgentPort } from '../dependencies';
import type { DaemonAgentPort } from '../ports';
import { AMR_SIGN_IN_RESCAN_ATTEMPTS, AMR_SIGN_IN_RESCAN_RETRY_MS } from '../constants';
import { agentRefreshOptionsForConfig, sanitizeHttpsUrl } from '../rules';
import type { AgentRefreshOptions, RescanNotice, TestState } from '../types';

/** Inputs the local-CLI agent list cluster needs from its caller. */
export interface DaemonAgentsInput {
  cfg: AppConfig;
  agents: AgentInfo[];
  agentsLoading: boolean;
  onRefreshAgents: (
    options?: AgentRefreshOptions,
  ) => AgentInfo[] | Promise<AgentInfo[] | void> | void;
  /** The AMR account cluster's resolved sign-in status — drives the
   *  post-sign-in model-catalog chase below. */
  amrLoggedIn: boolean;
}

/** Everything the execution-mode JSX reads off the local-CLI agent cluster. */
export interface DaemonAgentsController {
  agentRescanRunning: boolean;
  agentRescanNotice: RescanNotice | null;
  agentTestState: TestState;
  setAgentTestState: Dispatch<SetStateAction<TestState>>;
  hoveredAgentCardId: string | null;
  setHoveredAgentCardId: Dispatch<SetStateAction<string | null>>;
  agentCustomModelIds: ReadonlySet<string>;
  setAgentCustomModelIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  installedCount: number;
  visibleAgents: AgentInfo[];
  installedAgents: AgentInfo[];
  unavailableAgents: AgentInfo[];
  initialAgentScanRunning: boolean;
  handleTestAgent: () => Promise<void>;
  handleRefreshAgents: () => Promise<void>;
  markAgentInstallIntent: () => void;
  attributedAmrSettingsUrl: (url: string, sourceDetail: TrackingAmrEntrySource) => string;
  openAgentFixUrl: (
    url: string | undefined,
    amrEntrySourceDetail?: TrackingAmrEntrySource,
  ) => void;
  diagnosticHandlersForAgent: (agent: AgentInfo) => {
    onRescan: () => void;
    onOpenDocs?: () => void;
    onOpenInstall?: () => void;
  };
}

export function useDaemonAgents(
  port: DaemonAgentPort,
  input: DaemonAgentsInput,
): DaemonAgentsController {
  const { cfg, agents, agentsLoading, onRefreshAgents, amrLoggedIn } = input;
  const analytics = useAnalytics();

  const [agentRescanRunning, setAgentRescanRunning] = useState(false);
  const [agentRescanNotice, setAgentRescanNotice] = useState<RescanNotice | null>(null);
  const [agentTestState, setAgentTestState] = useState<TestState>({ status: 'idle' });
  const [hoveredAgentCardId, setHoveredAgentCardId] = useState<string | null>(null);
  const [agentCustomModelIds, setAgentCustomModelIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const agentTestAbortRef = useRef<AbortController | null>(null);
  const pendingAgentInstallRescanRef = useRef(false);
  // Guards the AMR catalog-chase loop so concurrent renders can't start it
  // twice (see the re-detect effect below).
  const amrRescanInFlightRef = useRef(false);
  const agentTestRevisionRef = useRef(0);

  const installedCount = useMemo(
    () => agents.filter((a) => a.available && isVisibleLocalCliAgent(a)).length,
    [agents],
  );

  const visibleAgents = agents.filter(isVisibleLocalCliAgent);
  const installedAgents = orderAgentsWithOpenDesignFirst(
    visibleAgents.filter((a) => a.available),
  );
  const unavailableAgents = visibleAgents.filter((a) => !a.available);
  const initialAgentScanRunning = agentsLoading && agents.length === 0;

  const agentChoiceForTest =
    cfg.mode === 'daemon' && cfg.agentId ? cfg.agentModels?.[cfg.agentId] : null;
  useEffect(() => {
    agentTestRevisionRef.current += 1;
    setAgentTestState((state) =>
      state.status === 'running' ? state : { status: 'idle' },
    );
  }, [
    cfg.agentId,
    agentChoiceForTest?.model,
    agentChoiceForTest?.reasoning,
    cfg.agentCliEnv,
  ]);

  // Rescan notices are list-level feedback for a one-shot action and
  // shouldn't linger in the content stream. After 6s, fade them out so
  // repeated Rescan clicks don't pile up; the next click resets the
  // notice immediately, so this only affects "user moved on" cases.
  useEffect(() => {
    if (!agentRescanNotice) return;
    return port.scheduleRescanNoticeTimeout(() => setAgentRescanNotice(null), 6000);
  }, [agentRescanNotice, port]);

  // Releasing the abort controller on unmount avoids the "setState after
  // unmount" warning if the dialog closes while a test is still running.
  useEffect(() => {
    return () => {
      agentTestAbortRef.current?.abort();
    };
  }, []);

  const markAgentInstallIntent = () => {
    pendingAgentInstallRescanRef.current = true;
  };
  const handleRefreshAgents = async () => {
    if (agentRescanRunning) return;
    setAgentRescanRunning(true);
    setAgentRescanNotice(null);
    try {
      const refreshed = await onRefreshAgents(agentRefreshOptionsForConfig(cfg));
      const nextAgents = Array.isArray(refreshed) ? refreshed : agents;
      setAgentRescanNotice({
        kind: 'success',
        count: nextAgents.filter((a) => a.available).length,
      });
    } catch {
      setAgentRescanNotice({ kind: 'error' });
    } finally {
      setAgentRescanRunning(false);
    }
  };
  const attributedAmrSettingsUrl = (
    url: string,
    sourceDetail: TrackingAmrEntrySource,
  ) => {
    const attribution = recordAmrEntry(analytics.track, sourceDetail, new Date(), {
      metricsConsent: cfg.telemetry?.metrics === true,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent: cfg.telemetry?.metrics === true,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId: cfg.installationId,
    });
    return attributedAmrUrl(url, attribution, deviceId);
  };
  const openAgentFixUrl = (
    url: string | undefined,
    amrEntrySourceDetail?: TrackingAmrEntrySource,
  ) => {
    const href = sanitizeHttpsUrl(url);
    if (!href) return;
    markAgentInstallIntent();
    port.openExternalUrl(
      amrEntrySourceDetail
        ? attributedAmrSettingsUrl(href, amrEntrySourceDetail)
        : href,
    );
  };
  const diagnosticHandlersForAgent = (agent: AgentInfo) => {
    const docsUrl = sanitizeHttpsUrl(agent.docsUrl);
    const installUrl = sanitizeHttpsUrl(agent.installUrl);
    return {
      onRescan: () => void handleRefreshAgents(),
      ...(docsUrl ? { onOpenDocs: () => openAgentFixUrl(docsUrl) } : {}),
      ...(installUrl
        ? {
            onOpenInstall: () =>
              openAgentFixUrl(
                installUrl,
                agent.id === 'amr' ? 'settings_amr_install' : undefined,
              ),
          }
        : {}),
    };
  };

  useEffect(() => {
    const handleReturnToSettings = () => {
      if (!pendingAgentInstallRescanRef.current || agentRescanRunning) {
        return;
      }
      pendingAgentInstallRescanRef.current = false;
      void handleRefreshAgents();
    };
    return port.subscribeInstallReturn(handleReturnToSettings);
  }, [agentRescanRunning, handleRefreshAgents, port]);

  // Chase AMR's live model catalog whenever the user is signed in but the
  // model list hasn't arrived yet. AMR is detected at app start (often while
  // signed out, so it comes back with an empty, fail-closed list), and the
  // live `vela models` catalog only becomes fetchable once the credential
  // lands — and can lag the credential write by a beat. We must cover every
  // way Settings ends up "signed in + empty", not just an in-Settings
  // sign-in edge: onboarding signs in and re-detects exactly once, so if that
  // single call lands during the propagation window Settings later mounts
  // already signed in with an empty list. Keying on `loggedIn === true` +
  // "AMR has no models" handles both; the picker shows its loading state
  // until the catalog fills in.
  //
  // `onRefreshAgents` / `agents` are read through refs so re-detecting (which
  // changes their identity) can't tear the retry loop down mid-flight — that
  // is what made the loading row flash and vanish before the catalog arrived.
  // The in-flight ref keeps a single loop running across renders.
  const onRefreshAgentsRef = useRef(onRefreshAgents);
  onRefreshAgentsRef.current = onRefreshAgents;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  useEffect(() => {
    if (amrLoggedIn !== true) return;
    const amr = agentsRef.current.find((agent) => agent.id === 'amr');
    if (!amr || (amr.models?.length ?? 0) > 0) return;
    if (amrRescanInFlightRef.current) return;
    amrRescanInFlightRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        for (
          let attempt = 0;
          attempt < AMR_SIGN_IN_RESCAN_ATTEMPTS && !cancelled;
          attempt += 1
        ) {
          let next: void | AgentInfo[];
          try {
            next = await onRefreshAgentsRef.current();
          } catch {
            return;
          }
          if (cancelled) return;
          const detected = Array.isArray(next) ? next : [];
          const refreshed = detected.find((agent) => agent.id === 'amr');
          // Stop once the live catalog has caught up (or AMR vanished); a
          // still-empty list means vela hasn't published the catalog yet, so
          // retry.
          if (!refreshed || (refreshed.models?.length ?? 0) > 0) return;
          await new Promise((resolve) => {
            setTimeout(resolve, AMR_SIGN_IN_RESCAN_RETRY_MS);
          });
        }
      } finally {
        amrRescanInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      amrRescanInFlightRef.current = false;
    };
  }, [amrLoggedIn]);

  const handleTestAgent = async () => {
    if (agentTestState.status === 'running') {
      return;
    }
    const selected = agents.find((a) => a.id === cfg.agentId && a.available);
    if (!selected) return;
    const choice = cfg.agentModels?.[selected.id] ?? {};
    const controller = new AbortController();
    const revision = agentTestRevisionRef.current;
    agentTestAbortRef.current = controller;
    setAgentTestState({ status: 'running' });
    const startedAt = performance.now();
    const cliProviderId = agentIdToTracking(selected.id);
    const clearIfStale = () => {
      if (agentTestAbortRef.current === controller) {
        setAgentTestState({ status: 'idle' });
      }
    };
    try {
      const result = await port.testAgent(
        {
          agentId: selected.id,
          model: choice.model || undefined,
          reasoning: choice.reasoning || undefined,
          agentCliEnv: cfg.agentCliEnv ?? {},
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (agentTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setAgentTestState({ status: 'done', result });
      trackSettingsCliTestResult(analytics.track, {
        page_name: 'settings',
        area: 'configure_execution_mode',
        cli_provider_id: cliProviderId,
        result: result.ok ? 'success' : 'failed',
        ...(result.ok ? {} : { error_code: result.kind || 'UNKNOWN' }),
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (agentTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setAgentTestState({
        status: 'done',
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: choice.model || 'default',
          detail: err instanceof Error ? err.message : 'Test request failed',
        },
      });
      trackSettingsCliTestResult(analytics.track, {
        page_name: 'settings',
        area: 'configure_execution_mode',
        cli_provider_id: cliProviderId,
        result: 'failed',
        error_code: err instanceof Error ? err.name : 'UNKNOWN',
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } finally {
      if (agentTestAbortRef.current === controller) {
        agentTestAbortRef.current = null;
      }
    }
  };

  return {
    agentRescanRunning,
    agentRescanNotice,
    agentTestState,
    setAgentTestState,
    hoveredAgentCardId,
    setHoveredAgentCardId,
    agentCustomModelIds,
    setAgentCustomModelIds,
    installedCount,
    visibleAgents,
    installedAgents,
    unavailableAgents,
    initialAgentScanRunning,
    handleTestAgent,
    handleRefreshAgents,
    markAgentInstallIntent,
    attributedAmrSettingsUrl,
    openAgentFixUrl,
    diagnosticHandlersForAgent,
  };
}

export function useWiredDaemonAgents(input: DaemonAgentsInput): DaemonAgentsController {
  return useDaemonAgents(daemonAgentPort, input);
}
