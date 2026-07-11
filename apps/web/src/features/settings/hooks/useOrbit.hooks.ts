// Feature-local hook for the Orbit automation section: status polling, the
// design-template registry fetch, the connected-integration gate, and the
// manual "run it now" flow. Its transport dependency is INJECTED as the
// slice's `OrbitPort`, so it holds no import to a provider and is testable
// against a hand-written fake — no module mocks, no global `fetch` stub.
//
// `navigate` (route navigation) is imported directly rather than through the
// port: it is a synchronous client-side history call, not a transport/DOM
// subscription the guard's port-binding rule targets (only `providers/`
// imports are restricted to `dependencies.ts`).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../../i18n';
import { navigate as navigateRoute } from '../../../router';
import { DEFAULT_ORBIT } from '../../../state/config';
import type { AppConfig, OrbitConfig, OrbitRunSummary, OrbitStatusResponse, SkillSummary } from '../../../types';
import type { OrbitPort } from '../ports';
import { orbitPort } from '../dependencies';
import type { OrbitConfigGateCopyKeys, OrbitMeterSegments, OrbitNotice } from '../types';
import {
  computeOrbitMeterSegments,
  configForManualOrbitRun,
  countConnectedConnectors,
  deriveEffectiveOrbitTemplateId,
  deriveOrbitLastRun,
  filterAndSortOrbitTemplates,
  findOrbitTemplate,
  formatOrbitRelativeTime,
  isOrbitRunDisabled,
  nextLegacyLastRunTemplateSkillId,
  orbitConfigGateCopyKeys,
  orbitLiveArtifactHref,
  orbitTriggerLabelKey,
} from '../rules';

/** Inputs the Orbit section needs from its caller. */
export interface OrbitInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  /** Whether the user has already saved a Composio API key. Drives the Orbit
   *  configuration gate's copy/CTA. */
  composioApiKeyConfigured: boolean;
  daemonMediaProviders?: AppConfig['mediaProviders'] | null;
  daemonMediaProvidersFetchState?: 'idle' | 'ok' | 'error';
  /** Called right before navigating to the generated Orbit project so the
   *  caller can persist any unsaved Orbit edits and close itself. */
  onLeaveForOrbitProject: (runConfig: AppConfig) => void;
}

/** Everything the Orbit section JSX reads off the controller. */
export interface OrbitController {
  orbit: OrbitConfig;
  status: OrbitStatusResponse | null;
  running: boolean;
  notice: OrbitNotice | null;
  copied: boolean;
  orbitTemplates: SkillSummary[] | null;
  connectedCount: number | null;
  effectiveTemplateSkillId: string;
  selectedTemplate: SkillSummary | null;
  lastRun: OrbitRunSummary | null;
  nextRunLabel: string | null;
  lastRunAbs: string | null;
  lastRunRel: string | null;
  liveArtifactHref: string | null;
  isBusy: boolean;
  meter: OrbitMeterSegments;
  automationState: 'active' | 'off';
  triggerLabel: string;
  showConfigGate: boolean;
  gateCopyKeys: OrbitConfigGateCopyKeys;
  runDisabled: boolean;
  runDisabledTitle: string;
  controlsLocked: boolean;
  controlsLockedHint: string | undefined;
  updateOrbit: (patch: Partial<OrbitConfig>) => void;
  triggerNow: () => void;
  copyMarkdown: () => void;
}

export function useOrbit(port: OrbitPort, input: OrbitInput): OrbitController {
  const {
    cfg,
    setCfg,
    composioApiKeyConfigured,
    daemonMediaProviders,
    daemonMediaProvidersFetchState,
    onLeaveForOrbitProject,
  } = input;
  const { locale, t } = useI18n();
  const orbit = cfg.orbit ?? DEFAULT_ORBIT;

  const [status, setStatus] = useState<OrbitStatusResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<OrbitNotice | null>(null);
  const [copied, setCopied] = useState(false);
  const [legacyLastRunTemplateSkillId, setLegacyLastRunTemplateSkillId] = useState<string | null>(null);
  const legacyLastRunIdentity = status?.lastRun?.id
    ?? `${status?.lastRun?.completedAt ?? ''}:${status?.lastRun?.agentRunId ?? ''}:${status?.lastRun?.markdown ?? ''}`;
  const [orbitTemplates, setOrbitTemplates] = useState<SkillSummary[] | null>(null);
  const [connectedCount, setConnectedCount] = useState<number | null>(null);
  // Once the user clicks Generate we close Settings and navigate away. The ref
  // lets late-arriving handlers no-op without React warnings.
  const isMountedRef = useRef(true);
  useEffect(() => {
    // React Strict Mode replays mount effects in development. Reset the ref on
    // each setup so the synthetic cleanup from the first pass does not leave
    // async Orbit status / connector refreshes permanently thinking the panel
    // has unmounted.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateOrbit = (patch: Partial<OrbitConfig>) => {
    setCfg((curr) => ({
      ...curr,
      orbit: { ...(curr.orbit ?? DEFAULT_ORBIT), ...patch },
    }));
  };

  const refreshStatus = async () => {
    const result = await port.fetchStatus();
    if (!isMountedRef.current || result === null) return;
    setStatus(result);
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    if (!status?.running) return undefined;
    return port.subscribeStatusPolling(() => {
      void refreshStatus();
    });
  }, [status?.running]);

  // Fetch the design-template registry once on mount and filter to
  // scenario === 'orbit'. fetchTemplates tolerates transport failure (the
  // provider swallows errors and resolves []), so the panel transitions from
  // "loading" -> "empty" and the rest of the Orbit controls stay functional.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const all = await port.fetchTemplates();
      if (!alive) return;
      setOrbitTemplates(filterAndSortOrbitTemplates(all));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const refreshConnectedCount = useCallback(async () => {
    const list = await port.fetchConnectors();
    if (!isMountedRef.current) return;
    setConnectedCount(countConnectedConnectors(list));
  }, []);

  // Fetch the connector catalog on mount to determine whether the Orbit
  // configuration gate should render.
  useEffect(() => {
    void refreshConnectedCount();
  }, [refreshConnectedCount]);

  // Connector auth often completes in another window. Re-check when focus
  // returns so the Orbit gate reflects newly connected accounts without
  // requiring the user to close and reopen Settings.
  useEffect(() => {
    return port.subscribeWindowFocus(() => {
      void refreshConnectedCount();
    });
  }, [refreshConnectedCount]);

  const effectiveTemplateSkillId = deriveEffectiveOrbitTemplateId(
    orbit.templateSkillId,
    DEFAULT_ORBIT.templateSkillId,
  );

  useEffect(() => {
    setLegacyLastRunTemplateSkillId((current) =>
      nextLegacyLastRunTemplateSkillId(status, effectiveTemplateSkillId, current));
  }, [effectiveTemplateSkillId, legacyLastRunIdentity, status]);

  const selectedTemplate = useMemo(
    () => findOrbitTemplate(orbitTemplates, effectiveTemplateSkillId),
    [effectiveTemplateSkillId, orbitTemplates],
  );

  const triggerNow = () => {
    if (running) return;
    setRunning(true);
    setNotice(null);

    void (async () => {
      try {
        const runConfig = configForManualOrbitRun(cfg);
        const payload = await port.runOrbit(runConfig, {
          daemonProviders: daemonMediaProviders,
          syncMediaProviders: daemonMediaProvidersFetchState === 'ok',
          locale,
        });
        if (!payload.projectId) throw new Error('Orbit run did not return a project');

        onLeaveForOrbitProject(runConfig);
        navigateRoute({
          kind: 'project',
          projectId: payload.projectId,
          conversationId: null,
          fileName: null,
        });
      } catch {
        if (!isMountedRef.current) return;
        setNotice({
          kind: 'error',
          message: t('settings.orbit.runError'),
        });
      } finally {
        if (!isMountedRef.current) return;
        setRunning(false);
        void refreshStatus();
      }
    })();
  };

  const lastRun = deriveOrbitLastRun(status, effectiveTemplateSkillId, legacyLastRunTemplateSkillId);
  const nextRunLabel = status?.nextRunAt ? new Date(status.nextRunAt).toLocaleString() : null;
  const lastRunAbs = lastRun ? new Date(lastRun.completedAt).toLocaleString() : null;
  const lastRunRel = formatOrbitRelativeTime(lastRun?.completedAt, t);
  const liveArtifactHref = orbitLiveArtifactHref(lastRun);
  const isBusy = running || Boolean(status?.running);

  const copyMarkdown = async () => {
    if (!lastRun?.markdown) return;
    try {
      await navigator.clipboard.writeText(lastRun.markdown);
      setCopied(true);
      port.scheduleTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access may be denied in some browsing contexts; silently skip.
    }
  };

  const meter = computeOrbitMeterSegments(lastRun);
  const automationState: 'active' | 'off' = orbit.enabled ? 'active' : 'off';
  const triggerLabel = t(orbitTriggerLabelKey(lastRun));

  const showConfigGate = connectedCount === 0;
  const gateCopyKeys = orbitConfigGateCopyKeys(composioApiKeyConfigured);
  const runDisabled = isOrbitRunDisabled(isBusy, connectedCount);
  const runDisabledTitle = showConfigGate
    ? t('settings.orbit.gateTitle')
    : t('settings.orbit.runTitle');

  const controlsLocked = showConfigGate;
  const controlsLockedHint = controlsLocked
    ? t('settings.orbit.controlsLockedHint')
    : undefined;

  return {
    orbit,
    status,
    running,
    notice,
    copied,
    orbitTemplates,
    connectedCount,
    effectiveTemplateSkillId,
    selectedTemplate,
    lastRun,
    nextRunLabel,
    lastRunAbs,
    lastRunRel,
    liveArtifactHref,
    isBusy,
    meter,
    automationState,
    triggerLabel,
    showConfigGate,
    gateCopyKeys,
    runDisabled,
    runDisabledTitle,
    controlsLocked,
    controlsLockedHint,
    updateOrbit,
    triggerNow,
    copyMarkdown,
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredOrbit(input: OrbitInput): OrbitController {
  return useOrbit(orbitPort, input);
}
