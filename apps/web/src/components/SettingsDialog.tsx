import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { VisuallyHidden } from '@open-design/components';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  agentIdToTracking,
  byokProtocolToTracking,
  executionModeToTracking,
  settingsSectionToTracking,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import {
  amrHandoffDeviceId,
  attributedAmrUrl,
  recordAmrEntry,
  type TrackingAmrEntrySource,
} from '../analytics/amr-attribution';
import { getResolvedDeviceId } from '../analytics/client';
import {
  trackSettingsByokModelsFetchResult,
  trackSettingsByokTestResult,
  trackSettingsCliTestResult,
  trackSettingsByokFieldClick,
  trackSettingsByokProviderOptionClick,
  trackSettingsConnectorAuthResult,
  trackSettingsLocalCliClick,
  trackSettingsExecutionModeTabClick,
  trackSettingsPrivacyClick,
  trackSettingsView,
} from '../analytics/events';
import { useI18n } from '../i18n';
import type { Locale } from '../i18n';
import type { Dict } from '../i18n/types';
import { AgentIcon } from './AgentIcon';
import { AgentDiagnosticRow } from './AgentDiagnosticRow';
import { AmrLoginPill } from './AmrLoginPill';
import { PlanBadge } from './PlanBadge';
import { orderAgentsWithOpenDesignFirst } from './agentOrdering';
import {
  AMR_LOGIN_STATUS_EVENT,
  amrLoginStatusEventReason,
} from './amrLoginPolling';
import {
  canUpgradeVelaPlan,
  fetchAmrWalletSnapshot,
  fetchVelaLoginStatus,
  formatVelaBalanceUsd,
  type VelaLoginStatus,
} from '../providers/daemon';
import {
  amrPlansUrlForProfile,
  amrProfileBadgeLabel,
} from '../runtime/amr-guidance';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';
import { Icon } from './Icon';
import {
  CUSTOM_MODEL_SENTINEL,
  SearchableModelSelect,
} from './modelOptions';
import {
  KNOWN_PROVIDERS,
  hasAnyConfiguredProvider,
  syncComposioConfigToDaemon,
} from '../state/config';
import {
  API_PROTOCOL_TABS,
  DEFAULT_BASE_URL_BY_PROTOCOL,
  API_PROTOCOL_LABELS,
  isFixedOriginGateway,
  resolveFixedOriginBaseUrl,
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../state/apiProtocols';
import {
  agentRefreshOptionsForConfig,
  AGENT_CLI_AUTH_ENV_KEYS,
  AGENT_CLI_BASE_URL_ENV_KEYS,
  AGENT_CLI_ENV_FIELDS,
  AGENT_SHORT_DESCRIPTIONS,
  amrWalletValueLabel,
  AMR_PROFILE_AGENT_ID,
  AMR_PROFILE_ENV_KEY,
  AMR_SIGN_IN_RESCAN_ATTEMPTS,
  AMR_SIGN_IN_RESCAN_RETRY_MS,
  apiModelOptionLabel,
  API_KEY_CONSOLE_LINKS,
  AboutSection,
  AppearanceSection,
  applyApiProtocolConfig,
  byokDraftBaseUrlHost,
  byokErrorKindFromIssues,
  byokFieldMissingFromIssues,
  byokFirstPartyBaseUrlHint,
  byokProviderDraftKey,
  byokProviderKeyForConfig,
  byokTrackingTestResult,
  canFetchProviderModels,
  canRunProviderConnectionTest,
  cleanAgentVersionLabel,
  codexPathRepairState,
  codexPathStrings,
  ConnectorSection,
  configForManualOrbitRun,
  currentApiProtocolConfig,
  CritiqueTheaterSection,
  defaultApiProtocolConfig,
  displayAgentName,
  hidesAccountModelSourceLabel,
  InstructionsSection,
  IntegrationsSection,
  isOrbitRunDisabled,
  isProviderModelDiscoveryUnsupported,
  isValidApiBaseUrl,
  LanguageSection,
  MediaProvidersSection,
  mergeProviderModelOptions,
  missingByokConnectionFields,
  missingByokModelFetchFields,
  NotificationsSection,
  OrbitSection,
  persistByokProviderConfigDraft,
  providerConnectionTestKey,
  providerFamilyLabel,
  providerModelsCacheKey,
  reconcileAmrModelChoice,
  reconcileAmrProfileEnv,
  sanitizeHttpsUrl,
  sanitizeSettingsSavePayload,
  shouldEnableSettingsSave,
  shouldShowCustomModelInput,
  siblingProviderForProtocol,
  switchApiProtocolConfig,
  testStatusVariant,
  updateAgentCliEnvValue,
  updateCurrentApiProtocolConfig,
  useWiredAbout,
  type AgentRefreshOptions,
  type ByokFieldMissing,
  type ByokFirstPartyBaseUrlHint,
  type ByokRequiredField,
  type ProviderModelsCache,
  type SettingsSection,
} from '../features/settings';
import { persistConfigAndRunOrbit } from '../providers/orbit';
// Backward-compatible re-export: the definitions, ConnectorSection, and
// OrbitSection now live in the settings slice (Orbit's transport lives in
// `providers/orbit`). Kept as a thin pass-through so this orchestrator's
// public export surface stays identical (external importers and existing
// tests are unaffected); production consumers import the slice barrel
// directly.
export {
  agentRefreshOptionsForConfig,
  amrWalletValueLabel,
  canFetchProviderModels,
  canRunProviderConnectionTest,
  ConnectorSection,
  configForManualOrbitRun,
  deriveAboutUpdateControl,
  deriveComposioCredentialState,
  isOrbitRunDisabled,
  isProviderModelDiscoveryUnsupported,
  isValidApiBaseUrl,
  mergeProviderModelOptions,
  OrbitSection,
  providerModelsCacheKey,
  reconcileAmrModelChoice,
  reconcileAmrProfileEnv,
  sanitizeSettingsSavePayload,
  shouldEnableSettingsSave,
  shouldShowCustomModelInput,
  switchApiProtocolConfig,
  testStatusVariant,
  updateAgentCliEnvValue,
  updateCurrentApiProtocolConfig,
} from '../features/settings';
export { persistConfigAndRunOrbit } from '../providers/orbit';
export type {
  AboutUpdateControl,
  AgentRefreshOptions,
  ComposioCredentialState,
  SettingsSection,
} from '../features/settings';
import {
  MAX_MAX_TOKENS,
  MIN_MAX_TOKENS,
  modelMaxTokensDefault,
} from '../state/maxTokens';
import type {
  AgentInfo,
  AgentModelChoice,
  ApiProtocol,
  ApiProtocolConfig,
  AppConfig,
  AppTheme,
  AppVersionInfo,
  ConnectionTestResponse,
  DesignSystemGenerationJob,
  ExecMode,
  ProviderModelOption,
  ProviderModelsResponse,
} from '../types';
import { testAgent, testApiProvider } from '../providers/connection-test';
import { fetchProviderModels } from '../providers/provider-models';
import { openExternalUrl } from '../providers/registry';
import { useByokImageModelOptions, useByokVideoModelOptions, useByokSpeechModelOptions } from '../media/aihubmix-image-models';
import { isVisualStabilityMode } from '../utils/visualStability';
import { byokProviderRequiresApiKey } from '../utils/byokProvider';
import { Toast } from './Toast';
import { PetSettings } from './pet/PetSettings';
import { McpClientSection } from './McpClientSection';
import { DesignSystemsSection } from './DesignSystemsSection';
import { PrivacySection } from './PrivacySection';
import { ProjectLocationsSection } from './ProjectLocationsSection';
import { RoutinesSection } from './RoutinesSection';
import { ConnectorsBrowser } from './ConnectorsBrowser';
import { MemoryModelInline } from './MemoryModelInline';
import { MemorySection } from './MemorySection';
import { ByokConnectionTestControl } from './byok/ByokConnectionTestControl';
import { ByokKeyField } from './byok/ByokKeyField';
import { ByokModelField } from './byok/ByokModelField';
import { ByokProviderBaseUrl } from './byok/ByokProviderBaseUrl';
import { ByokProviderPicker } from './byok/ByokProviderPicker';
import {
  blockingByokDraftFields,
  blockingByokDraftIssues,
  cleanByokApiKey,
  resolveByokModelPreference,
  validateByokDraft,
  type ByokDraftField,
  type ByokDraftIssue,
  type ByokDraftValidation,
} from './byok/validation';
import {
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
  resolveAccentColor,
} from '../state/appearance';
import { isAutosaveDraftOnlyChange } from '../App';


interface ByokProviderPreset {
  id: string;
  title: string;
  protocol: ApiProtocol;
  baseUrl: string;
  model: string;
  custom?: boolean;
}

// One-shot focus hint when opening the dialog. `'amr'` scrolls the AMR agent
// card into view on the execution section and plays a highlight (plus a
// sign-in coachmark when the user has not authorized AMR yet).
export type SettingsHighlight = 'amr' | null;



interface Props {
  initial: AppConfig;
  agents: AgentInfo[];
  agentsLoading?: boolean;
  daemonLive: boolean;
  appVersionInfo: AppVersionInfo | null;
  welcome?: boolean;
  initialSection?: SettingsSection;
  initialHighlight?: SettingsHighlight;
  providerModelsCache?: ProviderModelsCache;
  /**
   * Persist the current draft. Invoked by the dialog's autosave loop on
   * every committed edit. Returns a promise that resolves once both
   * localStorage and the daemon have caught up so the footer status
   * indicator can flip from "Saving…" to "Saved". Should NOT close the
   * dialog and should NOT mutate onboarding state — it represents an
   * incremental save, not a final commit.
   */
  onPersist: (cfg: AppConfig, options?: { forceMediaProviderSync?: boolean }) => Promise<void> | void;
  /**
   * Persist the Composio API key separately from the broader autosave
   * loop. Composio secrets need an explicit user gesture so half-typed
   * keys never leave the browser, so this is wired to a section-local
   * "Save key" button rather than the autosave channel.
   */
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
  /**
   * True while the daemon-backed Composio config is still hydrating on
   * first paint after a dev-server / app restart. The Connectors section
   * renders a skeleton over the input + buttons during this window so
   * the user does not mistake the temporarily empty input for "no key
   * saved" and so accidental Save/Clear clicks cannot overwrite the
   * saved state with `''` before the daemon's response lands.
   */
  composioConfigLoading?: boolean;
  onClose: () => void;
  onRefreshAgents: (
    options?: AgentRefreshOptions,
  ) => AgentInfo[] | Promise<AgentInfo[] | void> | void;
  onAmrLoginStatusChange?: (status: VelaLoginStatus | null) => void;
  daemonMediaProviders?: AppConfig['mediaProviders'] | null;
  daemonMediaProvidersFetchState?: 'idle' | 'ok' | 'error';
  mediaProvidersNotice?: string | null;
  onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
  onProjectsRefresh?: () => Promise<void> | void;
  /** Same channel for skill registry mutations. */
  onSkillsChanged?: (affectedSkillId?: string) => void;
  /** Same channel for design-system registry mutations. */
  onDesignSystemsChanged?: (affectedDesignSystemId?: string) => void;
  onDesignSystemImportRebuildJob?: (designSystemId: string, job: DesignSystemGenerationJob) => void;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<ProviderModelsCache>>;
}



type RescanNotice =
  | { kind: 'success'; count: number }
  | { kind: 'error' };

type TestState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: ConnectionTestResponse };


type ProviderModelsState =
  | { status: 'idle' }
  | { status: 'running'; cacheKey: string }
  | { status: 'done'; cacheKey: string; result: ProviderModelsResponse };

interface ByokProviderFormDraft {
  apiConfig: ApiProtocolConfig;
  maxTokensInput: string;
  maxTokens: AppConfig['maxTokens'];
  providerModelsCommittedKey: string | null;
  providerModelsState: ProviderModelsState;
  showApiKey: boolean;
  apiModelCustomEditing: boolean;
  apiModelUserSelected: boolean;
}

type ByokPreconditionAction = 'test';





export function SettingsDialog({
  initial,
  agents,
  agentsLoading = false,
  daemonLive,
  appVersionInfo,
  welcome,
  initialSection = 'execution',
  initialHighlight = null,
  onPersist,
  onPersistComposioKey,
  composioConfigLoading = false,
  onClose,
  onRefreshAgents,
  onAmrLoginStatusChange,
  daemonMediaProviders,
  daemonMediaProvidersFetchState = 'idle',
  mediaProvidersNotice,
  onReloadMediaProviders,
  onProjectsRefresh,
  onDesignSystemsChanged,
  onDesignSystemImportRebuildJob,
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
}: Props) {
  const { t, locale } = useI18n();
  const analytics = useAnalytics();
  // Backfill the fixed-origin base URL on mount too, so a config persisted with
  // an empty baseUrl (e.g. selected AIHubMix before this resolution existed)
  // isn't stuck blocking the live model fetch until the user re-selects the tab.
  const [cfg, setCfg] = useState<AppConfig>(() => ({
    ...initial,
    baseUrl: resolveFixedOriginBaseUrl(initial.apiProtocol ?? 'anthropic', initial.baseUrl),
  }));
  const [maxTokensInput, setMaxTokensInput] = useState(
    initial.maxTokens == null ? '' : String(initial.maxTokens),
  );
  const [pendingMediaProviderEditIds, setPendingMediaProviderEditIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const previousInitialRef = useRef(initial);
  const lastSavedAppearanceRef = useRef({
    theme: initial.theme ?? 'system',
    accentColor: resolveAccentColor(initial.accentColor),
  });

  // settings_view — fire on dialog open and on every section switch so the
  // configuration funnel can see which section the user spent time in.
  // The fire is keyed on section so a section bounce (open → switch →
  // close) emits one event per surface.
  const lastViewSectionRef = useRef<string | null>(null);

  useEffect(() => {
    lastSavedAppearanceRef.current = {
      theme: initial.theme ?? 'system',
      accentColor: resolveAccentColor(initial.accentColor),
    };
  }, [initial.theme, initial.accentColor]);

  useEffect(() => {
    const previousInitial = previousInitialRef.current;
    setCfg((current) => {
      const nextAgentCliEnv = reconcileAmrProfileEnv(current.agentCliEnv, initial.agentCliEnv);
      const nextAgentModels = reconcileAmrModelChoice(current.agentModels, previousInitial, initial);
      if (
        nextAgentCliEnv === current.agentCliEnv
        && nextAgentModels === current.agentModels
      ) {
        return current;
      }
      return {
        ...current,
        agentCliEnv: nextAgentCliEnv,
        agentModels: nextAgentModels,
      };
    });
    autosaveLastSavedRef.current = {
      ...autosaveLastSavedRef.current,
      agentCliEnv: reconcileAmrProfileEnv(
        autosaveLastSavedRef.current.agentCliEnv,
        initial.agentCliEnv,
      ),
      agentModels: reconcileAmrModelChoice(
        autosaveLastSavedRef.current.agentModels,
        previousInitial,
        initial,
      ),
    };
    previousInitialRef.current = initial;
  }, [initial]);

  // Revert the live theme preview to the most recently persisted appearance.
  // That is the initial appearance until autosave succeeds; after autosave,
  // closing Settings must not roll the document back to stale colors.
  useLayoutEffect(() => {
    return () => {
      applyAppearanceToDocument(lastSavedAppearanceRef.current);
    };
  }, []);
  const [showApiKey, setShowApiKey] = useState(false);
  const byokProviderFormDraftsRef = useRef<Record<string, ByokProviderFormDraft>>({});
  const lastCustomByokProviderDraftKeysRef = useRef<Partial<Record<ApiProtocol, string>>>(
    (initial.apiProviderBaseUrl ?? null) === null
      ? { [initial.apiProtocol ?? 'anthropic']: byokProviderKeyForConfig(initial) }
      : {},
  );
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [settingsSidebarCollapsed, setSettingsSidebarCollapsed] = useState(false);
  const [settingsFullscreen, setSettingsFullscreen] = useState(false);
  // Scroll the right-hand content pane back to the top whenever the user
  // picks a different settings section. Without this, switching from a
  // long section the user had scrolled (e.g. Library) into a short one
  // (About) keeps the previous scrollTop, so the new section's header
  // can land out of view and the panel reads as half-loaded. Issue #634.
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  // AMR-card focus, driven by the failed-run nudge (`initialHighlight==='amr'`).
  const amrCardRef = useRef<HTMLDivElement | null>(null);
  // Card pulse: a brief attention flash that auto-clears after a few seconds.
  const [amrHighlightActive, setAmrHighlightActive] = useState(false);
  // Coachmark: persists (unlike the card pulse) until the real pointer reaches
  // the authorize button — so it won't vanish while the user is still moving
  // toward it.
  const [amrCoachmarkArmed, setAmrCoachmarkArmed] = useState(false);
  // The fake-cursor coachmark dismisses as soon as the real pointer reaches the
  // authorize button — once the user has found it, the hint has done its job.
  const [amrCoachmarkDismissed, setAmrCoachmarkDismissed] = useState(false);
  const [agentRescanRunning, setAgentRescanRunning] = useState(false);
  const [agentRescanNotice, setAgentRescanNotice] =
    useState<RescanNotice | null>(null);
  const [agentTestState, setAgentTestState] = useState<TestState>({
    status: 'idle',
  });
  const [amrCardStatus, setAmrCardStatus] = useState<VelaLoginStatus | null>(null);
  const [amrCardStatusReady, setAmrCardStatusReady] = useState(false);
  const [amrWalletSnapshot, setAmrWalletSnapshot] = useState<AmrWalletSnapshot | null>(null);
  const [amrWalletReady, setAmrWalletReady] = useState(false);
  const [hoveredAgentCardId, setHoveredAgentCardId] = useState<string | null>(null);
  const [providerTestState, setProviderTestState] = useState<TestState>({
    status: 'idle',
  });

  useEffect(() => {
    onAmrLoginStatusChange?.(amrCardStatus);
  }, [amrCardStatus, onAmrLoginStatusChange]);

  const formatAmrWalletBalance = useCallback((balanceUsd: string | null | undefined) => {
    if (!balanceUsd) return null;
    const amount = Number(balanceUsd);
    if (!Number.isFinite(amount)) return `$${balanceUsd}`;
    return new Intl.NumberFormat(locale, {
      currency: 'USD',
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(amount);
  }, [locale]);

  const refreshAmrWalletSnapshot = useCallback(async (options: { refresh?: boolean } = {}) => {
    setAmrWalletReady(false);
    const next = await fetchAmrWalletSnapshot(options);
    setAmrWalletSnapshot(next);
    setAmrWalletReady(true);
  }, []);

  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent) {
      setAmrCardStatus(null);
      setAmrCardStatusReady(false);
      setHoveredAgentCardId(null);
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
    void fetchVelaLoginStatus().then((next) => {
      if (!cancelled) {
        setAmrCardStatus(next);
        setAmrCardStatusReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [agents]);

  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent || amrCardStatus?.loggedIn !== true) {
      setAmrWalletSnapshot(null);
      setAmrWalletReady(false);
      return;
    }
    let cancelled = false;
    setAmrWalletReady(false);
    void fetchAmrWalletSnapshot().then((next) => {
      if (cancelled) return;
      setAmrWalletSnapshot(next);
      setAmrWalletReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    agents,
    amrCardStatus?.loggedIn,
    amrCardStatus?.profile,
    amrCardStatus?.user?.id,
    amrCardStatus?.user?.email,
  ]);

  // Reconcile AMR sign-in state whenever the user returns to the window. The
  // vela device-login flow completes in an external browser / AMR console; if
  // the in-pill poll has already timed out (or the login finished fully
  // out-of-band), the card would otherwise keep showing the stale signed-out
  // state until Settings is closed and reopened. Refetching on focus /
  // visibility keeps the signed-in state, email, and Sign out action live.
  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent) return;
    let cancelled = false;
    // Passive read only. Push the daemon's current status down into the card;
    // the pill mirrors it via `initialStatus` (and clears any stale login error
    // when it sees a signed-in status). Do NOT republish the login-state-change
    // event here — that restarts the pill's poll/pending machine on every focus
    // and, while the external browser is stealing and returning focus during a
    // login, ping-pongs the action between "Signing in…" and "Authorize".
    const resyncAmrStatus = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchVelaLoginStatus().then((next) => {
        if (cancelled || !next) return;
        setAmrCardStatus(next);
        if (next.loggedIn) void refreshAmrWalletSnapshot({ refresh: true });
      });
    };
    window.addEventListener('focus', resyncAmrStatus);
    document.addEventListener('visibilitychange', resyncAmrStatus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', resyncAmrStatus);
      document.removeEventListener('visibilitychange', resyncAmrStatus);
    };
  }, [agents, refreshAmrWalletSnapshot]);

  useEffect(() => {
    const hasAmrAgent = agents.some((agent) => agent.id === 'amr' && agent.available);
    if (!hasAmrAgent) return;
    let cancelled = false;
    const resyncAmrStatus = (event: Event) => {
      const reason = amrLoginStatusEventReason(event);
      if (reason === 'login-canceled') return;
      void fetchVelaLoginStatus().then((next) => {
        if (cancelled || !next) return;
        setAmrCardStatus(next);
        setAmrCardStatusReady(true);
      });
    };
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, resyncAmrStatus);
    return () => {
      cancelled = true;
      window.removeEventListener(AMR_LOGIN_STATUS_EVENT, resyncAmrStatus);
    };
  }, [agents]);
  const [byokPreconditionNotice, setByokPreconditionNotice] = useState<{
    action: ByokPreconditionAction;
    field?: ByokRequiredField;
    message: string;
  } | null>(null);
  const [providerModelsState, setProviderModelsState] =
    useState<ProviderModelsState>({ status: 'idle' });
  const [localProviderModelsCache, setLocalProviderModelsCache] =
    useState<ProviderModelsCache>({});
  const hasSharedProviderModelsCache =
    Boolean(sharedProviderModelsCache) && Boolean(onProviderModelsCacheChange);
  const activeProviderModelsCache =
    hasSharedProviderModelsCache
      ? sharedProviderModelsCache!
      : localProviderModelsCache;
  const activeSetProviderModelsCache =
    hasSharedProviderModelsCache
      ? onProviderModelsCacheChange!
      : setLocalProviderModelsCache;
  const [providerModelsCommittedKey, setProviderModelsCommittedKey] =
    useState<string | null>(() => {
      const protocol = initial.apiProtocol ?? 'anthropic';
      if (
        initial.mode !== 'api' ||
        protocol === 'azure' ||
        protocol === 'ollama' ||
        missingByokModelFetchFields(initial, protocol).length > 0 ||
        !isValidApiBaseUrl(initial.baseUrl)
      ) {
        return null;
      }
      return providerModelsCacheKey(
        protocol,
        initial.baseUrl,
        initial.apiKey,
        initial.apiVersion ?? '',
      );
    });
  const agentTestAbortRef = useRef<AbortController | null>(null);
  const providerTestAbortRef = useRef<AbortController | null>(null);
  const providerModelsAbortRef = useRef<AbortController | null>(null);
  const pendingAgentInstallRescanRef = useRef(false);
  // Guards the AMR catalog-chase loop so concurrent renders can't start it
  // twice (see the re-detect effect below).
  const amrRescanInFlightRef = useRef(false);
  const agentTestRevisionRef = useRef(0);
  const providerTestRevisionRef = useRef(0);
  const providerModelsRevisionRef = useRef(0);
  const providerTestFirstResetRef = useRef(true);
  const providerModelsFirstResetRef = useRef(true);
  const providerModelsSkipNextResetRef = useRef(false);
  const deferAfterKeyCleanRef = useRef(false);
  const providerAutoTestKeyRef = useRef<string | null>(null);
  const byokLastUnsuccessfulTestKeyRef = useRef<string | null>(null);
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const baseUrlInputRef = useRef<HTMLInputElement | null>(null);
  const modelSelectRef = useRef<HTMLButtonElement | null>(null);
  const customModelInputRef = useRef<HTMLInputElement | null>(null);
  const focusByokRequiredFieldAfterProtocolSwitchRef = useRef(false);
  const visualStabilityMode = isVisualStabilityMode();
  // Tracks whether the current BYOK model value came from an explicit user
  // pick (combobox selection or custom entry) rather than an auto-populated
  // provider preset. The account-model auto-switch must never overwrite a
  // deliberate choice, even when that choice equals the provider preset id.
  const apiModelUserSelectedRef = useRef(false);
  const [apiModelCustomEditing, setApiModelCustomEditing] = useState(false);
  const [agentCustomModelIds, setAgentCustomModelIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  // About section: app-version/updater status row, diagnostics export, and
  // reset-onboarding. Called here (not inside the dumb `AboutSection`) so
  // the toast survives the user switching away from the About section
  // mid-action, mirroring the original `<Toast>` placement outside the
  // section's conditional block.
  const about = useWiredAbout({ cfg, setCfg, appVersionInfo, onClose });

  // Imperative handle for the External MCP section. The dialog footer Save
  // routes through this when the MCP tab is active so the user can press the
  // single Save button at the bottom instead of hunting for the inner one.
  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  // settings_view — fires whenever the active section changes (and once on
  // mount). Keying the fire on a section+section-string lets us dedupe
  // accidental double-renders while still capturing genuine tab switches.
  useEffect(() => {
    if (lastViewSectionRef.current === activeSection) return;
    lastViewSectionRef.current = activeSection;
    // v2 settings_view collapses to `{ page=settings, area }`; the
    // execution_mode / has_available_cli / selected_cli_id signal that v1
    // tagged onto every view now lives in the configure-state global
    // properties (registered once and inherited by every event).
    trackSettingsView(analytics.track, {
      page_name: 'settings',
      area: settingsSectionToTracking(activeSection),
    });
  }, [activeSection, analytics.track]);
  useEffect(() => {
    const el = settingsContentRef.current;
    if (el) el.scrollTop = 0;
  }, [activeSection]);

  // One-shot AMR-card focus from the failed-run nudge: scroll the card into
  // view (on the next frame, so it wins over the section's scrollTop reset
  // above) and play a brief highlight + arm the sign-in coachmark. The
  // coachmark only actually shows when the AMR card reports a signed-out state
  // (`amrCardStatus?.loggedIn === false`). If the execution pane is in API mode
  // the AMR card is absent and this no-ops.
  useEffect(() => {
    if (initialHighlight !== 'amr' || activeSection !== 'execution') return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      amrCardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setAmrCoachmarkDismissed(false);
      setAmrHighlightActive(true);
      setAmrCoachmarkArmed(true);
    });
    // Only the card pulse auto-clears; the coachmark persists until the pointer
    // reaches the authorize button (or the user signs in).
    const clear = setTimeout(() => {
      if (!cancelled) setAmrHighlightActive(false);
    }, 3200);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(clear);
    };
  }, [initialHighlight, activeSection]);

  const selectedMemoryChatAgent =
    cfg.mode === 'daemon' && cfg.agentId
      ? agents.find((agent) => agent.id === cfg.agentId) ?? null
      : null;
  const selectedMemoryChatModel =
    cfg.mode === 'daemon' && cfg.agentId
      ? cfg.agentModels?.[cfg.agentId]?.model
      ?? selectedMemoryChatAgent?.models?.[0]?.id
      ?? null
    : null;
  const agentChoiceForTest =
    cfg.mode === 'daemon' && cfg.agentId
      ? cfg.agentModels?.[cfg.agentId]
      : null;
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
    const id = window.setTimeout(() => setAgentRescanNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [agentRescanNotice]);
  useEffect(() => {
    if (providerTestFirstResetRef.current) {
      providerTestFirstResetRef.current = false;
      return;
    }
    providerTestRevisionRef.current += 1;
    providerAutoTestKeyRef.current = null;
    setByokPreconditionNotice(null);
    setProviderTestState((state) =>
      state.status === 'running' ? state : { status: 'idle' },
    );
  }, [
    cfg.apiProtocol,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.model,
    cfg.apiVersion,
  ]);
  useEffect(() => {
    if (providerModelsFirstResetRef.current) {
      providerModelsFirstResetRef.current = false;
      return;
    }
    if (providerModelsSkipNextResetRef.current) {
      providerModelsSkipNextResetRef.current = false;
      return;
    }
    providerModelsRevisionRef.current += 1;
    providerModelsAbortRef.current?.abort();
    providerModelsAbortRef.current = null;
    setProviderModelsCommittedKey(null);
    setByokPreconditionNotice(null);
    setProviderModelsState({ status: 'idle' });
  }, [
    cfg.apiProtocol,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.apiVersion,
  ]);
  // Releasing the abort controllers on unmount avoids the "setState after
  // unmount" warning if the dialog closes while a test is still running.
  useEffect(() => {
    return () => {
      agentTestAbortRef.current?.abort();
      providerTestAbortRef.current?.abort();
      providerModelsAbortRef.current?.abort();
    };
  }, []);

  const installedCount = useMemo(
    () => agents.filter((a) => a.available && isVisibleLocalCliAgent(a)).length,
    [agents],
  );

  const setMode = (mode: ExecMode) => {
    setCfg((c) => {
      const modeBefore = executionModeToTracking(c.mode);
      const modeAfter = executionModeToTracking(mode);
      if (modeBefore !== modeAfter) {
        trackSettingsExecutionModeTabClick(analytics.track, {
          page_name: 'settings',
          area: 'configure_execution_mode',
          element: 'execution_mode_tab',
          action: 'switch_execution_mode',
          mode_before: modeBefore,
          mode_after: modeAfter,
        });
      }
      return { ...c, mode };
    });
  };
  const setByokProvider = (provider: ByokProviderPreset) => {
    const currentDraftKey = byokProviderKeyForConfig(cfg);
    const currentApiConfig = currentApiProtocolConfig(cfg);
    if ((cfg.apiProviderBaseUrl ?? null) === null) {
      lastCustomByokProviderDraftKeysRef.current[cfg.apiProtocol ?? 'anthropic'] =
        currentDraftKey;
    }
    byokProviderFormDraftsRef.current[currentDraftKey] = {
      apiConfig: currentApiConfig,
      maxTokens: cfg.maxTokens,
      maxTokensInput,
      providerModelsCommittedKey,
      providerModelsState,
      showApiKey,
      apiModelCustomEditing,
      apiModelUserSelected: apiModelUserSelectedRef.current,
    };
    const nextProviderBaseUrlForCurrent = provider.custom ? null : provider.baseUrl;
    const providerChangedBeforeSwitch = provider.custom
      ? (cfg.apiProviderBaseUrl ?? null) !== null
      : (cfg.apiProtocol ?? 'anthropic') !== provider.protocol ||
        (cfg.apiProviderBaseUrl ?? null) !== nextProviderBaseUrlForCurrent;
    focusByokRequiredFieldAfterProtocolSwitchRef.current = !provider.custom;
    providerModelsSkipNextResetRef.current = providerChangedBeforeSwitch;
    setCfg((current) => {
      const currentProtocol = current.apiProtocol ?? 'anthropic';
      const nextProviderBaseUrl = provider.custom ? null : provider.baseUrl;
      const providerChanged = provider.custom
        ? (current.apiProviderBaseUrl ?? null) !== null
        : currentProtocol !== provider.protocol ||
          (current.apiProviderBaseUrl ?? null) !== nextProviderBaseUrl;
      const switched = switchApiProtocolConfig(current, provider.protocol);
      const fallbackApiConfig = currentApiProtocolConfig(switched);
      const customDraftKey = provider.custom
        ? lastCustomByokProviderDraftKeysRef.current[provider.protocol]
        : null;
      const nextProviderDraftKey = customDraftKey ?? byokProviderDraftKey(
        provider.protocol,
        nextProviderBaseUrl,
        provider.custom ? fallbackApiConfig.baseUrl : provider.baseUrl,
      );
      const savedDraft = nextProviderDraftKey
        ? byokProviderFormDraftsRef.current[nextProviderDraftKey]
        : undefined;
      const persistedDraft = nextProviderDraftKey
        ? current.byokProviderConfigDrafts?.[nextProviderDraftKey]
        : undefined;
      const applyDraftUiState = (draft: ByokProviderFormDraft | undefined) => {
        setShowApiKey(draft?.showApiKey ?? false);
        setApiModelCustomEditing(draft?.apiModelCustomEditing ?? false);
        apiModelUserSelectedRef.current = draft?.apiModelUserSelected ?? false;
        setMaxTokensInput(
          draft
            ? draft.maxTokensInput
            : switched.maxTokens == null ? '' : String(switched.maxTokens),
        );
        setProviderModelsCommittedKey(draft?.providerModelsCommittedKey ?? null);
        setProviderModelsState(draft?.providerModelsState ?? { status: 'idle' });
      };
      if (savedDraft) {
        applyDraftUiState(savedDraft);
        return applyApiProtocolConfig(
          persistByokProviderConfigDraft(
            {
              ...switched,
              maxTokens: savedDraft.maxTokens,
            },
            currentDraftKey,
            currentApiProtocolConfig(current),
          ),
          provider.protocol,
          savedDraft.apiConfig,
        );
      }
      if (persistedDraft) {
        applyDraftUiState(undefined);
        return applyApiProtocolConfig(
          persistByokProviderConfigDraft(
            {
              ...switched,
              maxTokens: persistedDraft.maxTokens,
            },
            currentDraftKey,
            currentApiProtocolConfig(current),
          ),
          provider.protocol,
          persistedDraft.apiConfig,
        );
      }
      const switchedWithCurrentDraft = persistByokProviderConfigDraft(
        switched,
        currentDraftKey,
        currentApiProtocolConfig(current),
      );
      if (provider.custom) {
        applyDraftUiState(undefined);
        return updateCurrentApiProtocolConfig(switchedWithCurrentDraft, {
          apiProviderBaseUrl: null,
          ...(providerChanged ? { model: '' } : {}),
        });
      }
      applyDraftUiState(undefined);
      return updateCurrentApiProtocolConfig(switchedWithCurrentDraft, {
        ...(providerChanged ? { apiKey: '' } : {}),
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiProviderBaseUrl: provider.baseUrl,
      });
    });
  };
  const updateApiConfig = (patch: Partial<ApiProtocolConfig>) =>
    setCfg((c) => updateCurrentApiProtocolConfig(c, patch));
  const updateMaxTokensInput = (raw: string) => {
    setMaxTokensInput(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setCfg((c) => ({ ...c, maxTokens: undefined }));
      return;
    }
    const value = Number(trimmed);
    const nextMaxTokens =
      Number.isInteger(value) &&
      value >= MIN_MAX_TOKENS &&
      value <= MAX_MAX_TOKENS
        ? value
        : undefined;
    setCfg((c) => ({ ...c, maxTokens: nextMaxTokens }));
  };
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
    void openExternalUrl(
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
      if (
        !pendingAgentInstallRescanRef.current ||
        agentRescanRunning ||
        document.visibilityState === 'hidden'
      ) {
        return;
      }
      pendingAgentInstallRescanRef.current = false;
      void handleRefreshAgents();
    };
    document.addEventListener('visibilitychange', handleReturnToSettings);
    window.addEventListener('focus', handleReturnToSettings);
    return () => {
      document.removeEventListener('visibilitychange', handleReturnToSettings);
      window.removeEventListener('focus', handleReturnToSettings);
    };
  }, [agentRescanRunning, handleRefreshAgents]);

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
  // (see renderAgentModelConfig) until the catalog fills in.
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
    if (amrCardStatus?.loggedIn !== true) return;
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
  }, [amrCardStatus?.loggedIn]);

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
      const result = await testAgent(
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

  const handleTestProvider = async (
    options: { silentPreconditions?: boolean } = {},
  ) => {
    if (providerTestState.status === 'running') {
      return;
    }
    const blockingIssues = blockingByokDraftIssues(byokDraftValidation);
    const hasFirstPartyHostTypo = Boolean(byokFirstPartyBaseUrl?.hostTypo);
    const currentConfigKey = providerConnectionTestKey(apiProtocol, cfg);
    const lastUnsuccessfulConfigKey = byokLastUnsuccessfulTestKeyRef.current;
    const configKeyChanged = lastUnsuccessfulConfigKey !== null &&
      lastUnsuccessfulConfigKey !== currentConfigKey;
    if (hasFirstPartyHostTypo) {
      if (!options.silentPreconditions) {
        setByokPreconditionNotice({
          action: 'test',
          field: 'base_url',
          message: t('settings.testInvalidBaseUrl'),
        });
        focusByokRequiredField('base_url');
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
      return;
    }
    if (blockingIssues.length > 0) {
      if (options.silentPreconditions) {
        return;
      }
      showByokDraftValidationNotice('test', byokDraftValidation);
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(analytics.track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: 'failed',
          error_code: byokErrorKindFromIssues(blockingIssues),
          error_kind: byokErrorKindFromIssues(blockingIssues),
          field_missing: byokFieldMissingFromIssues(blockingIssues),
          config_key_changed: configKeyChanged,
          success_after_action: false,
          duration_ms: 0,
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
      return;
    }
    const controller = new AbortController();
    const revision = providerTestRevisionRef.current;
    providerTestAbortRef.current = controller;
    setProviderTestState({ status: 'running' });
    const startedAt = performance.now();
    const clearIfStale = () => {
      if (providerTestAbortRef.current === controller) {
        setProviderTestState({ status: 'idle' });
      }
    };
    try {
      const result = await testApiProvider(
        {
          protocol: apiProtocol,
          baseUrl: cfg.baseUrl,
          apiKey: cleanByokApiKey(cfg.apiKey),
          model: cfg.model,
          apiVersion:
            apiProtocol === 'azure'
              ? cfg.apiVersion?.trim() || undefined
              : undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({ status: 'done', result });
      if (!result.ok && result.kind === 'not_found_model') {
        focusByokRequiredField('model');
      }
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(analytics.track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: byokTrackingTestResult(result),
          ...(result.ok ? {} : { error_code: result.kind || 'UNKNOWN' }),
          ...(result.ok ? {} : { error_kind: result.kind || 'UNKNOWN' }),
          field_missing: 'none',
          config_key_changed: configKeyChanged,
          success_after_action: result.ok && configKeyChanged,
          duration_ms: Math.round(performance.now() - startedAt),
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = result.ok ? null : currentConfigKey;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({
        status: 'done',
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: cfg.model,
          detail: err instanceof Error ? err.message : 'Test request failed',
        },
      });
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(analytics.track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: 'failed',
          error_code: err instanceof Error ? err.name : 'UNKNOWN',
          error_kind: err instanceof Error ? err.name : 'UNKNOWN',
          field_missing: 'none',
          config_key_changed: configKeyChanged,
          success_after_action: false,
          duration_ms: Math.round(performance.now() - startedAt),
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
    } finally {
      if (providerTestAbortRef.current === controller) {
        providerTestAbortRef.current = null;
      }
    }
  };

  const handleAutoTestProvider = () => {
    if (providerTestState.status === 'running') {
      return;
    }
    if (byokFirstPartyBaseUrl?.hostTypo) {
      return;
    }
    if (blockingByokDraftIssues(byokDraftValidation).length > 0) {
      return;
    }
    const key = providerConnectionTestKey(apiProtocol, cfg);
    if (providerAutoTestKeyRef.current === key) {
      return;
    }
    providerAutoTestKeyRef.current = key;
    void handleTestProvider({ silentPreconditions: true });
  };

  const handleFetchProviderModels = async (
    options: { silent?: boolean; trigger?: 'auto' | 'manual' } = {},
  ) => {
    const trigger = options.trigger ?? (options.silent ? 'auto' : 'manual');
    const byokProviderId = byokProtocolToTracking(apiProtocol);
    const trackModelsFetchResult = (
      props: Omit<
        Parameters<typeof trackSettingsByokModelsFetchResult>[1],
        'page_name' | 'area' | 'provider_id' | 'trigger' | 'source'
      >,
      source: 'network' | 'cache' = 'network',
    ) => {
      if (!byokProviderId) return;
      trackSettingsByokModelsFetchResult(analytics.track, {
        page_name: 'settings',
        area: 'configure_execution_mode_byok',
        provider_id: byokProviderId,
        trigger,
        source,
        ...props,
      });
    };
    if (providerModelsState.status === 'running') {
      return;
    }
    if (apiProtocol === 'azure') {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_azure',
        error_kind: 'unsupported_azure',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupportedAzure'),
        });
      }
      return;
    }
    if (apiProtocol === 'ollama') {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_ollama',
        error_kind: 'unsupported_ollama',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupportedOllama'),
        });
      }
      return;
    }
    if (isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)) {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_provider_models',
        error_kind: 'unsupported_provider_models',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupported'),
        });
      }
      return;
    }
    const modelFetchBlockingIssues = blockingByokDraftIssues(
      byokModelFetchDraftValidation,
    );
    if (byokFirstPartyBaseUrl?.hostTypo) {
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          field: 'base_url',
          message: t('settings.testInvalidBaseUrl'),
        });
        focusByokRequiredField('base_url');
      }
      return;
    }
    if (modelFetchBlockingIssues.length > 0) {
      trackModelsFetchResult({
        result: 'failed',
        error_code: byokErrorKindFromIssues(modelFetchBlockingIssues),
        error_kind: byokErrorKindFromIssues(modelFetchBlockingIssues),
        field_missing: byokFieldMissingFromIssues(modelFetchBlockingIssues),
        duration_ms: 0,
      });
      if (!options.silent) {
        showByokDraftValidationNotice('test', byokModelFetchDraftValidation);
      }
      return;
    }
    const cacheKey = providerModelsCacheKey(
      apiProtocol,
      cfg.baseUrl,
      cfg.apiKey,
      cfg.apiVersion ?? '',
    );
    const cachedModels = activeProviderModelsCache[cacheKey];
    if (cachedModels) {
      trackModelsFetchResult(
        {
          result: 'success',
          model_count: cachedModels.length,
          duration_ms: 0,
        },
        'cache',
      );
      setProviderModelsState({
        status: 'done',
        cacheKey,
        result: {
          ok: true,
          kind: 'success',
          latencyMs: 0,
          models: cachedModels,
        },
      });
      return;
    }
    const controller = new AbortController();
    const revision = providerModelsRevisionRef.current;
    providerModelsAbortRef.current = controller;
    setProviderModelsState({ status: 'running', cacheKey });
    const startedAt = performance.now();
    const clearIfStale = () => {
      if (providerModelsAbortRef.current === controller) {
        setProviderModelsState({ status: 'idle' });
      }
    };
    try {
      const result = await fetchProviderModels(
        {
          protocol: apiProtocol,
          baseUrl: cfg.baseUrl,
          apiKey: cleanByokApiKey(cfg.apiKey),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (providerModelsRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      if (result.ok && result.models?.length) {
        activeSetProviderModelsCache((prev) => ({
          ...prev,
          [cacheKey]: result.models ?? [],
        }));
      }
      trackModelsFetchResult({
        result: result.ok ? 'success' : 'failed',
        ...(result.ok ? {} : { error_code: result.kind || 'UNKNOWN' }),
        ...(result.ok ? {} : { error_kind: result.kind || 'UNKNOWN' }),
        model_count: result.ok ? result.models?.length ?? 0 : 0,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      setProviderModelsState({ status: 'done', cacheKey, result });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (providerModelsRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderModelsState({
        status: 'done',
        cacheKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          detail: err instanceof Error ? err.message : 'Model list request failed',
        },
      });
      trackModelsFetchResult({
        result: 'failed',
        error_code: err instanceof Error ? err.name : 'UNKNOWN',
        error_kind: err instanceof Error ? err.name : 'UNKNOWN',
        model_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } finally {
      if (providerModelsAbortRef.current === controller) {
        providerModelsAbortRef.current = null;
      }
    }
  };

  const renderTestMessage = (
    result: ConnectionTestResponse,
    kindForSuccess: 'api' | 'cli',
  ): string => {
    const ms = Math.max(0, Math.round(result.latencyMs));
    const sample = result.sample ?? '';
    const agentName = result.agentName ?? '';
    const testedModel = result.model ?? cfg.model;
    if (result.ok) {
      const baseMessage = kindForSuccess === 'api'
        ? t('settings.testSuccessApi', { ms, sample })
        : t('settings.testSuccessCli', { agentName, ms, sample });
      if (kindForSuccess === 'cli' && cfg.agentId === 'codex') {
        const codexStrings = codexPathStrings(locale);
        if (
          result.usedExecutableSource === 'configured' &&
          result.configuredExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.configuredSuccess(result.configuredExecutablePath)}`;
        }
        if (
          result.usedExecutableSource === 'fallback_invalid' &&
          result.configuredExecutablePath &&
          result.detectedExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.invalidFallback(
            result.configuredExecutablePath,
            result.detectedExecutablePath,
          )}`;
        }
        if (
          result.usedExecutableSource === 'fallback_failed' &&
          result.configuredExecutablePath &&
          result.detectedExecutablePath
        ) {
          return `${baseMessage} ${codexStrings.failedFallback(
            result.configuredExecutablePath,
            result.detectedExecutablePath,
          )}`;
        }
      }
      return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
    }
    switch (result.kind) {
      case 'auth_failed':
        return t('settings.testAuthFailed');
      case 'forbidden':
        return t('settings.testForbidden');
      case 'not_found_model':
        return t('settings.testNotFoundModel', { model: testedModel });
      case 'invalid_model_id':
        return t('settings.testInvalidModelId', { model: testedModel });
      case 'invalid_base_url':
        return t('settings.testInvalidBaseUrl');
      case 'rate_limited':
        return t('settings.testRateLimited');
      case 'upstream_unavailable': {
        const baseMessage = t('settings.testUpstream', {
          status: result.status ?? 0,
        });
        return result.detail ? `${baseMessage} ${result.detail}` : baseMessage;
      }
      case 'timeout':
        return t('settings.testTimeout', { ms });
      case 'agent_not_installed':
        return t('settings.testAgentMissing', { agentName });
      case 'agent_auth_required':
        return result.detail || 'Agent authentication is required.';
      case 'agent_spawn_failed':
        return t('settings.testAgentSpawn', {
          agentName,
          detail: result.detail ?? '',
        });
      default:
        return t('settings.testUnknown', { detail: result.detail ?? '' });
    }
  };

  const applyCodexDetectedPath = (detectedPath: string) => {
    setCfg((c) => updateAgentCliEnvValue(c, 'codex', 'CODEX_BIN', detectedPath));
    setAgentTestState({ status: 'idle' });
  };

  const clearCodexCustomPath = () => {
    setCfg((c) => updateAgentCliEnvValue(c, 'codex', 'CODEX_BIN', ''));
    setAgentTestState({ status: 'idle' });
  };

  const apiProtocol = cfg.apiProtocol ?? 'anthropic';
  const apiKeyConsoleLink = API_KEY_CONSOLE_LINKS[apiProtocol];
  const byokProviderPresets: ReadonlyArray<ByokProviderPreset> = [
    {
      id: 'anthropic',
      title: 'Anthropic',
      protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    },
    {
      id: 'openai',
      title: 'OpenAI',
      protocol: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    },
    {
      id: 'google-ai-studio',
      title: 'Google Gemini',
      protocol: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-3.5-flash',
    },
    {
      id: 'ollama',
      title: 'Ollama Cloud',
      protocol: 'ollama',
      baseUrl: 'https://ollama.com',
      model: 'gpt-oss:120b',
    },
    {
      id: 'azure',
      title: 'Azure OpenAI',
      protocol: 'azure',
      baseUrl: '',
      model: '',
    },
    {
      id: 'siliconflow',
      title: '硅基流动',
      protocol: 'openai',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'deepseek-ai/DeepSeek-V3.1',
    },
    {
      id: 'ppio',
      title: 'PPIO',
      protocol: 'openai',
      baseUrl: 'https://api.ppinfra.com/v3/openai',
      model: 'deepseek/deepseek-v3.1',
    },
    {
      id: 'nvidia',
      title: 'NVIDIA',
      protocol: 'openai',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'openai/gpt-oss-120b',
    },
    {
      id: 'stepfun',
      title: 'StepFun',
      protocol: 'openai',
      baseUrl: 'https://api.stepfun.ai/v1',
      model: 'step-2-mini',
    },
    {
      id: 'deepseek',
      title: 'DeepSeek',
      protocol: 'openai',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    },
    {
      id: 'openrouter',
      title: 'OpenRouter',
      protocol: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3.7-sonnet',
    },
    {
      id: 'mistral',
      title: 'Mistral AI',
      protocol: 'openai',
      baseUrl: 'https://api.mistral.ai/v1',
      model: 'mistral-large-latest',
    },
    {
      id: 'xai',
      title: 'xAI',
      protocol: 'openai',
      baseUrl: 'https://api.x.ai/v1',
      model: 'grok-4',
    },
    {
      id: 'together',
      title: 'Together AI',
      protocol: 'openai',
      baseUrl: 'https://api.together.xyz/v1',
      model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    },
    {
      id: 'huggingface',
      title: 'Hugging Face',
      protocol: 'openai',
      baseUrl: 'https://router.huggingface.co/v1',
      model: 'openai/gpt-oss-120b',
    },
    {
      id: 'qwen',
      title: '千问',
      protocol: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
    },
    {
      id: 'volcengine',
      title: '火山引擎',
      protocol: 'openai',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      model: 'doubao-seed-1-6',
    },
    {
      id: 'qianfan',
      title: '百度千帆',
      protocol: 'openai',
      baseUrl: 'https://qianfan.baidubce.com/v2',
      model: 'ernie-4.5-turbo-128k',
    },
    {
      id: 'vllm',
      title: 'vLLM',
      protocol: 'openai',
      baseUrl: 'http://127.0.0.1:8000/v1',
      model: 'model',
    },
    {
      id: 'mimo',
      title: '小米 MiMo',
      protocol: 'openai',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      model: 'mimo-v2.5-pro',
    },
    {
      id: 'minimax',
      title: 'MiniMax',
      protocol: 'anthropic',
      baseUrl: 'https://api.minimaxi.com/anthropic',
      model: 'MiniMax-M2.7-highspeed',
    },
    {
      id: 'moonshot',
      title: 'Moonshot',
      protocol: 'openai',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2-0711-preview',
    },
    {
      id: 'zhipu',
      title: '智谱',
      protocol: 'openai',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4.6',
    },
    {
      id: 'custom',
      title: t('settings.customProvider'),
      protocol: apiProtocol,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      custom: true,
    },
  ];
  const customByokProvider = byokProviderPresets.find((provider) => provider.custom) ?? {
    id: 'custom',
    title: t('settings.customProvider'),
    protocol: apiProtocol,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    custom: true,
  };
  const byokPresetProtocols = new Set(
    byokProviderPresets
      .filter((provider) => !provider.custom)
      .map((provider) => provider.protocol),
  );
  const byokProviderOptions: ReadonlyArray<ByokProviderPreset> = [
    ...byokProviderPresets.filter((provider) => !provider.custom),
    ...API_PROTOCOL_TABS.filter((tab) => !byokPresetProtocols.has(tab.id)).map((tab) => {
      const fallback = defaultApiProtocolConfig(tab.id);
      return {
        id: `protocol-${tab.id}`,
        title: tab.title,
        protocol: tab.id,
        baseUrl: fallback.baseUrl || DEFAULT_BASE_URL_BY_PROTOCOL[tab.id],
        model: fallback.model || SUGGESTED_MODELS_BY_PROTOCOL[tab.id][0] || '',
      };
    }),
    customByokProvider,
  ];
  const selectedByokProvider =
    cfg.apiProviderBaseUrl === null
      ? customByokProvider
      : byokProviderOptions.find(
        (provider) =>
          !provider.custom &&
          provider.protocol === apiProtocol &&
          provider.baseUrl === cfg.apiProviderBaseUrl,
      ) ?? customByokProvider;
  const baseUrlValid = isValidApiBaseUrl(cfg.baseUrl);
  const baseUrlInvalid = Boolean(cfg.baseUrl.trim() && !baseUrlValid);
  const byokRequiredLabel = (field: ByokRequiredField): string => {
    switch (field) {
      case 'api_key':
        return t('settings.apiKey');
      case 'base_url':
        return t('settings.baseUrl');
      case 'model':
        return apiProtocol === 'azure'
          ? t('settings.azureDeploymentModel')
          : t('settings.model');
      default: {
        const exhaustive: never = field;
        return exhaustive;
      }
    }
  };
  const formatByokMissingFields = (fields: ByokRequiredField[]): string =>
    fields.map(byokRequiredLabel).join(', ');
  const focusByokRequiredField = (field: ByokRequiredField | undefined) => {
    if (!field) return;
    window.setTimeout(() => {
      if (field === 'api_key') {
        apiKeyInputRef.current?.focus();
        return;
      }
      if (field === 'base_url') {
        baseUrlInputRef.current?.focus();
        return;
      }
      if (customModelInputRef.current) {
        customModelInputRef.current.focus();
        return;
      }
      modelSelectRef.current?.focus();
    }, 0);
  };
  const showByokPreconditionNotice = (
    action: ByokPreconditionAction,
    fields: ByokRequiredField[],
  ) => {
    setByokPreconditionNotice({
      action,
      message: t('settings.testMissingFields', {
        fields: formatByokMissingFields(fields),
      }),
    });
    focusByokRequiredField(fields[0]);
  };
  const byokDraftIssueMessage = (issue: ByokDraftIssue): string => {
    switch (issue.code) {
      case 'api_key_required':
      case 'base_url_required':
      case 'model_required':
        return t('settings.testMissingFields', {
          fields: byokRequiredLabel(issue.field),
        });
      case 'api_key_extra_whitespace':
      case 'api_key_malformed':
      case 'api_key_wrong_protocol':
        return t('settings.apiKeyInvalid');
      case 'base_url_invalid':
        return t('settings.baseUrlInvalid');
      default: {
        const exhaustive: never = issue.code;
        return exhaustive;
      }
    }
  };
  const showByokDraftValidationNotice = (
    action: ByokPreconditionAction,
    validation: ByokDraftValidation,
  ) => {
    const blockingFields = blockingByokDraftFields(validation);
    if (blockingFields.length === 0) return;
    const blockingIssues = blockingByokDraftIssues(validation);
    const missingFields = blockingIssues
      .filter((issue) =>
        issue.code === 'api_key_required' ||
        issue.code === 'base_url_required' ||
        issue.code === 'model_required'
      )
      .map((issue) => issue.field);
    if (missingFields.length > 0) {
      showByokPreconditionNotice(action, missingFields);
      return;
    }
    const firstIssue = blockingIssues[0];
    if (!firstIssue) return;
    setByokPreconditionNotice({
      action,
      field: firstIssue.field,
      message: byokDraftIssueMessage(firstIssue),
    });
    focusByokRequiredField(firstIssue.field);
  };
  // Autosave loop. Every committed edit to `cfg` schedules a debounced
  // sync to localStorage + the daemon. We keep a 400ms debounce so rapid
  // typing in text fields doesn't flood the daemon with PUTs while still
  // feeling near-instant for toggles/selects (which fire once and settle).
  // The Composio API key field is intentionally excluded from this loop —
  // see ConnectorSection for the explicit "Save key" gesture.
  // The status here drives the footer indicator: 'idle' = no draft to
  // flush, 'pending' = scheduled, 'saving' = request in flight, 'saved'
  // = recent successful sync, 'error' = recent failure.
  const [autosaveStatus, setAutosaveStatus] =
    useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  // Skip the very first effect tick so just opening the dialog doesn't
  // appear to "save" anything before the user has touched a field.
  const autosaveSkipFirstRef = useRef(true);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveSavedTimerRef = useRef<number | null>(null);
  const autosaveRetryTimerRef = useRef<number | null>(null);
  const autosavePendingFlushRef = useRef(false);
  const autosaveLatestRef = useRef<AppConfig>(cfg);
  // Baseline used by the draft-only detector: the snapshot at the most
  // recent successful autosave (or the initial cfg on mount). Compared
  // against the current snapshot to decide whether the only edits
  // since last save are intentionally-stripped fields like the
  // Composio API key — in which case we must NOT flash "All changes
  // saved", because the draft has not actually been persisted.
  const autosaveLastSavedRef = useRef<AppConfig>(cfg);
  const mediaProvidersChangeVersionRef = useRef(0);
  const lastSyncedMediaProvidersVersionRef = useRef(0);
  const [autosaveRetryTick, setAutosaveRetryTick] = useState(0);
  autosaveLatestRef.current = cfg;
  useEffect(() => {
    if (autosaveSkipFirstRef.current) {
      autosaveSkipFirstRef.current = false;
      autosaveLastSavedRef.current = cfg;
      return;
    }
    setAutosaveStatus('pending');
    if (autosaveSavedTimerRef.current != null) {
      window.clearTimeout(autosaveSavedTimerRef.current);
      autosaveSavedTimerRef.current = null;
    }
    if (autosaveRetryTimerRef.current != null) {
      window.clearTimeout(autosaveRetryTimerRef.current);
      autosaveRetryTimerRef.current = null;
    }
    if (autosaveTimerRef.current != null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosavePendingFlushRef.current = true;
    autosaveTimerRef.current = window.setTimeout(() => {
      autosavePendingFlushRef.current = false;
      autosaveTimerRef.current = null;
      const snapshot = autosaveLatestRef.current;
      const mediaProvidersVersion = mediaProvidersChangeVersionRef.current;
      const persistOptions = {
        forceMediaProviderSync: mediaProvidersVersion > lastSyncedMediaProvidersVersionRef.current,
      };
      // Draft-only edit (e.g. the user is mid-typing the Composio API
      // key, which only commits via the explicit "Save key" gesture):
      // the persisted shape would be identical to what is already on
      // disk, so a save would be a no-op that mis-reports "Saved" and
      // makes users trust that a sensitive key was persisted when it
      // was not. Skip the persist and settle the indicator to idle.
      // The forced media-provider sync path still runs because that
      // is a real outbound effect even when the persisted shape
      // hasn't changed.
      if (
        !persistOptions.forceMediaProviderSync
        && isAutosaveDraftOnlyChange(snapshot, autosaveLastSavedRef.current)
      ) {
        setAutosaveStatus('idle');
        return;
      }
      setAutosaveStatus('saving');
      void (async () => {
        try {
          await onPersist(snapshot, persistOptions);
          autosaveLastSavedRef.current = snapshot;
          lastSavedAppearanceRef.current = {
            theme: snapshot.theme ?? 'system',
            accentColor: resolveAccentColor(snapshot.accentColor),
          };
          // If a newer edit landed while the request was in flight,
          // leave the status as 'pending' so the next debounce tick
          // owns the indicator instead of flashing "Saved".
          if (autosaveLatestRef.current !== snapshot) {
            setAutosaveStatus('pending');
            return;
          }
          if (persistOptions.forceMediaProviderSync) {
            lastSyncedMediaProvidersVersionRef.current = mediaProvidersVersion;
            setPendingMediaProviderEditIds(new Set());
          }
          setAutosaveStatus('saved');
          autosaveSavedTimerRef.current = window.setTimeout(() => {
            autosaveSavedTimerRef.current = null;
            // Settle to idle after a moment so the indicator doesn't
            // stay on "Saved" forever and become noise.
            setAutosaveStatus((curr) => (curr === 'saved' ? 'idle' : curr));
          }, 1800);
        } catch {
          if (
            persistOptions.forceMediaProviderSync
            && autosaveLatestRef.current === snapshot
            && mediaProvidersChangeVersionRef.current === mediaProvidersVersion
            && lastSyncedMediaProvidersVersionRef.current < mediaProvidersVersion
          ) {
            setAutosaveStatus('pending');
            autosaveRetryTimerRef.current = window.setTimeout(() => {
              autosaveRetryTimerRef.current = null;
              if (
                autosaveLatestRef.current !== snapshot
                || mediaProvidersChangeVersionRef.current !== mediaProvidersVersion
                || lastSyncedMediaProvidersVersionRef.current >= mediaProvidersVersion
              ) {
                return;
              }
              setAutosaveRetryTick((tick) => tick + 1);
            }, 1500);
            return;
          }
          setAutosaveStatus('error');
        }
      })();
    }, 400);
    return () => {
      if (autosaveTimerRef.current != null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [cfg, onPersist, autosaveRetryTick]);
  // Flush any pending autosave on unmount so a fast-closing dialog
  // never strands an in-flight edit. We also clear the "Saved" toast
  // timer to avoid setState after unmount.
  useEffect(() => {
    return () => {
      if (autosavePendingFlushRef.current) {
        const mediaProvidersVersion = mediaProvidersChangeVersionRef.current;
        // Best-effort flush; if it rejects, localStorage already has
        // the latest copy from the synchronous saveConfig call inside
        // onPersist.
        autosavePendingFlushRef.current = false;
        void Promise.resolve(onPersist(autosaveLatestRef.current, {
          forceMediaProviderSync: mediaProvidersVersion > lastSyncedMediaProvidersVersionRef.current,
        })).catch(() => undefined);
      }
      if (autosaveSavedTimerRef.current != null) {
        window.clearTimeout(autosaveSavedTimerRef.current);
        autosaveSavedTimerRef.current = null;
      }
      if (autosaveRetryTimerRef.current != null) {
        window.clearTimeout(autosaveRetryTimerRef.current);
        autosaveRetryTimerRef.current = null;
      }
    };
  }, [onPersist]);

  // Global Escape closes the dialog. With no footer button anymore the
  // close affordances are: top-right X · backdrop click · Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const protocolProviders = useMemo(
    () => KNOWN_PROVIDERS.filter((p) => p.protocol === apiProtocol),
    [apiProtocol],
  );
  const selectedProviderIndex =
    cfg.apiProviderBaseUrl == null
      ? -1
      : protocolProviders.findIndex(
          (p) => p.baseUrl === cfg.apiProviderBaseUrl && p.baseUrl === cfg.baseUrl,
        );
  const selectedProvider = selectedProviderIndex >= 0 ? protocolProviders[selectedProviderIndex] : undefined;
  const showProviderPreset =
    protocolProviders.length > 0 && !isFixedOriginGateway(apiProtocol);
  // Fixed-origin gateways resolve their Base URL automatically; nothing for the
  // user to edit, so hide the field entirely.
  const showBaseUrlField = !isFixedOriginGateway(apiProtocol);
  const byokRequiresApiKey = byokProviderRequiresApiKey(
    apiProtocol,
    selectedProvider,
    cfg.baseUrl,
  );
  const byokProviderConfigured = (provider: ByokProviderPreset): boolean => {
    if (provider.custom) {
      return canRunProviderConnectionTest(currentApiProtocolConfig(cfg), {
        requiresApiKey: byokRequiresApiKey,
      }) && isValidApiBaseUrl(cfg.baseUrl);
    }
    const providerDraft = cfg.byokProviderConfigDrafts?.[
      byokProviderDraftKey(provider.protocol, provider.baseUrl, provider.baseUrl)
    ]?.apiConfig;
    const activeProvider = selectedByokProvider?.id === provider.id;
    const entry = activeProvider
      ? currentApiProtocolConfig(cfg)
      : providerDraft ?? (
        provider.protocol === apiProtocol
          ? undefined
          : cfg.apiProtocolConfigs?.[provider.protocol]
      );
    if (!entry || entry.baseUrl !== provider.baseUrl) return false;
    const knownProvider = KNOWN_PROVIDERS.find((item) => item.baseUrl === provider.baseUrl);
    return canRunProviderConnectionTest(entry, {
      requiresApiKey: byokProviderRequiresApiKey(
        provider.protocol,
        knownProvider,
        entry.baseUrl,
      ),
    }) && isValidApiBaseUrl(entry.baseUrl);
  };
  const byokFirstPartyBaseUrl = useMemo(
    () => byokFirstPartyBaseUrlHint(
      apiProtocol,
      cfg.baseUrl,
      protocolProviders,
    ),
    [apiProtocol, cfg.baseUrl, protocolProviders],
  );
  const byokKeyValidationBaseUrl = byokFirstPartyBaseUrl?.baseUrl;
  const byokDraftValidation = useMemo(
    () => validateByokDraft(
      apiProtocol,
      {
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      },
      {
        requiresApiKey: byokRequiresApiKey,
        keyValidationBaseUrl: byokKeyValidationBaseUrl,
      },
    ),
    [
      apiProtocol,
      byokKeyValidationBaseUrl,
      byokRequiresApiKey,
      cfg.apiKey,
      cfg.baseUrl,
      cfg.model,
    ],
  );
  const byokBlockingDraftIssues = useMemo(
    () => blockingByokDraftIssues(byokDraftValidation),
    [byokDraftValidation],
  );
  const apiKeyDraftInvalid = byokBlockingDraftIssues.some((issue) =>
    issue.field === 'api_key' && issue.code !== 'api_key_required'
  );
  const byokModelFetchDraftValidation = useMemo(
    () => validateByokDraft(
      apiProtocol,
      {
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
      },
      {
        requiresApiKey: byokRequiresApiKey,
        requireModel: false,
        keyValidationBaseUrl: byokKeyValidationBaseUrl,
      },
    ),
    [
      apiProtocol,
      byokKeyValidationBaseUrl,
      byokRequiresApiKey,
      cfg.apiKey,
      cfg.baseUrl,
      cfg.model,
    ],
  );
  const providerModelsKey = useMemo(
    () => providerModelsCacheKey(
      apiProtocol,
      cfg.baseUrl,
      cfg.apiKey,
      cfg.apiVersion ?? '',
    ),
    [apiProtocol, cfg.baseUrl, cfg.apiKey, cfg.apiVersion],
  );
  const fetchedApiModelOptions =
    activeProviderModelsCache[providerModelsKey] ?? [];
  const commitProviderModelsInputs = () => {
    if (
      byokFirstPartyBaseUrl?.hostTypo ||
      blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0
    ) {
      setProviderModelsCommittedKey(null);
      return;
    }
    setProviderModelsCommittedKey(providerModelsKey);
  };
  const onByokKeyCommit = () => {
    // Normalize the stored key on blur so the value that flows into the
    // connection-test / model-fetch requests below (and back to the daemon
    // via autosave) is already free of pasted whitespace / zero-width
    // characters — otherwise a key like "sk-ant-...\n" would only raise a
    // non-blocking warning yet still go out malformed over the wire.
    const cleanedApiKey = cleanByokApiKey(cfg.apiKey);
    if (cleanedApiKey !== cfg.apiKey) {
      // Writing the cleaned key changes cfg.apiKey, which re-runs the reset
      // effects above: one nulls providerModelsCommittedKey, the other bumps
      // providerTestRevisionRef / clears providerAutoTestKeyRef. So committing
      // the model key or starting the auto-test here would be clobbered — the
      // model commit before the auto-fetch effect reads it, and the auto-test
      // result dropped by the stale-revision guard. Defer both until the
      // cleaned value has landed (effect below), otherwise account models
      // never auto-load and the auto-test success/error never reaches the UI
      // for the exact dirty-paste case this handles.
      deferAfterKeyCleanRef.current = true;
      updateApiConfig({ apiKey: cleanedApiKey });
      return;
    }
    commitProviderModelsInputs();
    handleAutoTestProvider();
  };
  useEffect(() => {
    if (!deferAfterKeyCleanRef.current) return;
    deferAfterKeyCleanRef.current = false;
    if (
      byokFirstPartyBaseUrl?.hostTypo ||
      blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0
    ) {
      setProviderModelsCommittedKey(null);
    } else {
      setProviderModelsCommittedKey(providerModelsKey);
    }
    // Runs after the provider-test reset effect (declaration order) bumped the
    // revision for the cleaned key, so this auto-test is not flagged stale.
    handleAutoTestProvider();
  }, [
    byokFirstPartyBaseUrl?.hostTypo,
    byokModelFetchDraftValidation,
    cfg.apiKey,
    providerModelsKey,
  ]);
  useEffect(() => {
    if (cfg.mode !== 'api') return;
    if (visualStabilityMode) return;
    if (providerTestState.status === 'running') return;
    if (byokFirstPartyBaseUrl?.hostTypo) return;
    if (blockingByokDraftIssues(byokDraftValidation).length > 0) return;
    const key = providerConnectionTestKey(apiProtocol, cfg);
    if (providerAutoTestKeyRef.current === key) return;
    const timer = window.setTimeout(() => {
      handleAutoTestProvider();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    apiProtocol,
    byokFirstPartyBaseUrl?.hostTypo,
    byokDraftValidation,
    cfg.apiKey,
    cfg.apiVersion,
    cfg.baseUrl,
    cfg.mode,
    cfg.model,
    providerTestState.status,
    visualStabilityMode,
  ]);
  useEffect(() => {
    if (cfg.mode !== 'api') return;
    if (visualStabilityMode) return;
    if (isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)) return;
    if (byokFirstPartyBaseUrl?.hostTypo) return;
    if (blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0) return;
    // AIHubMix needs no key and prefills its base URL, so there's nothing to
    // debounce-commit — fetch as soon as the tab is selected. Every other
    // protocol waits until the key/baseUrl inputs are committed (on blur) so we
    // don't fire on each keystroke.
    if (apiProtocol !== 'aihubmix' && providerModelsCommittedKey !== providerModelsKey) return;
    const timer = window.setTimeout(() => {
      void handleFetchProviderModels({ silent: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    apiProtocol,
    byokFirstPartyBaseUrl?.hostTypo,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.mode,
    cfg.apiVersion,
    byokModelFetchDraftValidation,
    providerModelsCommittedKey,
    providerModelsKey,
    visualStabilityMode,
  ]);
  const currentProviderModelsResult =
    providerModelsState.status === 'done' &&
    providerModelsState.cacheKey === providerModelsKey
      ? providerModelsState.result
      : null;
  const loadedAccountModelCount =
    currentProviderModelsResult?.ok && currentProviderModelsResult.models?.length
      ? currentProviderModelsResult.models.length
      : 0;
  const apiKeyAuthFailed =
    currentProviderModelsResult?.ok === false &&
    currentProviderModelsResult.kind === 'auth_failed';
  const providerModelsFailureMessage =
    currentProviderModelsResult?.ok === false && !apiKeyAuthFailed
      ? t('settings.fetchModelsFailed', {
          detail:
            currentProviderModelsResult.detail ||
            currentProviderModelsResult.kind,
        })
      : null;
  const providerTestBaseUrlInvalid =
    providerTestState.status === 'done' &&
    !providerTestState.result.ok &&
    providerTestState.result.kind === 'invalid_base_url';
  const providerTestApiKeyAuthFailed =
    providerTestState.status === 'done' &&
    !providerTestState.result.ok &&
    providerTestState.result.kind === 'auth_failed';
  const apiKeyFieldAuthFailed =
    providerTestApiKeyAuthFailed ||
    (apiKeyAuthFailed && providerTestState.status === 'idle');
  const baseUrlErrorMessage = baseUrlInvalid
    ? t('settings.baseUrlInvalid')
    : providerTestBaseUrlInvalid || byokFirstPartyBaseUrl?.hostTypo
      ? (
        providerTestState.status === 'done' &&
        providerTestState.result.detail?.trim()
          ? providerTestState.result.detail.trim()
          : t('settings.testInvalidBaseUrl')
      )
      : null;
  const suggestedApiModelIds = useMemo(
    () => Array.from(new Set(
      selectedProvider?.models?.length
        ? selectedProvider.models
        : SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol],
    )),
    [apiProtocol, selectedProvider],
  );
  const apiModelOptions = useMemo(
    () => mergeProviderModelOptions(
      fetchedApiModelOptions,
      suggestedApiModelIds,
    ),
    [fetchedApiModelOptions, suggestedApiModelIds],
  );
  // Shared hook: live AIHubMix catalogue for aihubmix, static registry for
  // other providers (same list the chat composer's image picker uses).
  const byokImageModelOptions = useByokImageModelOptions(apiProtocol);
  const byokVideoModelOptions = useByokVideoModelOptions(apiProtocol);
  const byokSpeechModelOptions = useByokSpeechModelOptions(apiProtocol);
  const fetchedApiModelIds = useMemo(
    () => new Set(fetchedApiModelOptions.map((model) => model.id.trim())),
    [fetchedApiModelOptions],
  );
  const apiModelIds = useMemo(
    () => apiModelOptions.map((m) => m.id),
    [apiModelOptions],
  );
  const providerDefaultModel =
    selectedProvider?.model.trim() || suggestedApiModelIds[0] || '';
  useEffect(() => {
    if (cfg.mode !== 'api') return;
    if (apiModelCustomEditing) return;
    // Respect an explicit user pick — even when it equals the provider preset
    // id, the user deliberately chose it and discovery must not rewrite it.
    if (apiModelUserSelectedRef.current) return;
    if (fetchedApiModelOptions.length === 0) return;
    const currentModel = cfg.model.trim();
    if (currentModel && fetchedApiModelIds.has(currentModel)) return;
    if (currentModel && currentModel !== providerDefaultModel) return;

    const preference = resolveByokModelPreference({
      currentModel: '',
      accountModels: fetchedApiModelOptions,
      providerDefaultModel,
    });
    if (preference.source !== 'account') return;
    if (preference.model === currentModel) return;
    updateApiConfig({ model: preference.model });
  }, [
    apiModelCustomEditing,
    cfg.mode,
    cfg.model,
    fetchedApiModelIds,
    fetchedApiModelOptions,
    providerDefaultModel,
  ]);
  const apiModelCustomActive =
    shouldShowCustomModelInput(
      cfg.model,
      apiModelIds,
      apiModelCustomEditing,
    );
  const baseUrlReadOnly =
    (apiProtocol === 'anthropic' || apiProtocol === 'google') &&
    cfg.apiProviderBaseUrl !== null &&
    Boolean(cfg.baseUrl.trim()) &&
    !baseUrlInvalid;
  const baseUrlPlaceholder =
    apiProtocol === 'azure'
      ? t('settings.azureBaseUrlPlaceholder')
      : apiProtocol === 'ollama'
        ? 'http://localhost:11434'
        : undefined;
  useEffect(() => {
    if (!focusByokRequiredFieldAfterProtocolSwitchRef.current) return;
    focusByokRequiredFieldAfterProtocolSwitchRef.current = false;
    focusByokRequiredField(
      missingByokConnectionFields(cfg, {
        requiresApiKey: byokRequiresApiKey,
      })[0],
    );
  }, [apiModelCustomActive, cfg, apiProtocol, byokRequiresApiKey]);

  // Header title/subtitle follow the active sidebar section so the dialog
  // header always reflects what the user is looking at, instead of being
  // pinned to one section's copy. The execution section's header doubles
  // as the section heading — there is no inner h3 inside the Local CLI /
  // BYOK content so "Local CLI" only renders once (in the seg-control tab),
  // not twice (heading + tab).
  const sectionHeader: Record<SettingsSection, { title: string; subtitle: string }> = {
    execution: { title: t('settings.title'), subtitle: t('settings.subtitle') },
    instructions: {
      title: t('settings.instructionsTitle'),
      subtitle: t('settings.instructionsSubtitle'),
    },
    media: { title: t('settings.mediaProviders'), subtitle: t('settings.mediaProvidersHint') },
    composio: { title: t('connectors.title'), subtitle: t('connectors.subtitle') },
    orbit: { title: t('settings.orbit.title'), subtitle: t('settings.orbit.lede') },
    routines: {
      title: t('routines.title'),
      subtitle: t('routines.subtitle'),
    },
    integrations: { title: t('settings.mcpServerTitle'), subtitle: t('settings.mcpServerHint') },
    mcpClient: { title: t('settings.externalMcpTitle'), subtitle: t('settings.externalMcpHint') },
    language: { title: t('settings.language'), subtitle: t('settings.languageHint') },
    appearance: { title: t('settings.appearance'), subtitle: t('settings.appearanceHint') },
    critiqueTheater: {
      title: t('critiqueTheater.settingsNav'),
      subtitle: t('critiqueTheater.settingsNavHint'),
    },
    notifications: { title: t('settings.notifications'), subtitle: t('settings.notificationsHint') },
    privacy: { title: t('settings.privacy'), subtitle: t('settings.privacyHint') },
    pet: { title: t('pet.title'), subtitle: t('pet.subtitle') },
    designSystems: {
      title: t('settings.designSystems'),
      subtitle: t('settings.designSystemsHint'),
    },
    projectLocations: {
      title: t('settings.projectLocations'),
      subtitle: t('settings.projectLocationsHint'),
    },
    memory: { title: t('settings.memory'), subtitle: t('settings.memoryHint') },
    // 'library' is opened via EntryShell route — SettingsDialog doesn't
    // render it but SettingsSection must accept the token (see type def).
    library: { title: '', subtitle: '' },
    about: { title: t('settings.about'), subtitle: t('settings.aboutHint') },
  };
  const activeHeader = sectionHeader[activeSection];
  const visibleAgents = agents.filter(isVisibleLocalCliAgent);
  const installedAgents = orderAgentsWithOpenDesignFirst(
    visibleAgents.filter((a) => a.available),
  );
  const unavailableAgents = visibleAgents.filter((a) => !a.available);
  const initialAgentScanRunning = agentsLoading && agents.length === 0;
  const agentModelOptionLabel = (
    model: ProviderModelOption | undefined,
    fallback: string,
  ) => {
    if (!model) return fallback;
    const label = model.label?.trim();
    const id = model.id.trim();
    if (label && label !== id) {
      return label.toLowerCase().includes(id.toLowerCase())
        ? label
        : `${label} (${id})`;
    }
    return label || id;
  };
  const agentModelSummary = (agent: AgentInfo) => {
    if (!Array.isArray(agent.models) || agent.models.length === 0) return null;
    const choice = cfg.agentModels?.[agent.id] ?? {};
    const modelValue = choice.model ?? agent.models[0]?.id ?? '';
    if (!modelValue) return t('settings.modelCustom');
    return agentModelOptionLabel(
      agent.models.find((m) => m.id === modelValue),
      modelValue,
    );
  };
  const renderAgentModelConfig = (selected: AgentInfo) => {
    const hasModels =
      Array.isArray(selected.models) && selected.models.length > 0;
    const hasReasoning =
      Array.isArray(selected.reasoningOptions) &&
      selected.reasoningOptions.length > 0;
    // AMR's live catalog only lands a beat after sign-in. While the user is
    // signed in but the model list hasn't arrived yet, show the picker in a
    // loading state instead of hiding it — so the dropdown appears at sign-in
    // and simply fills in, rather than popping in seconds later.
    if (selected.id === 'amr' && !hasModels && (amrCardStatus?.loggedIn ?? false)) {
      return (
        <div className="agent-card-config">
          <label className="field">
            <span className="field-label">
              {t('settings.modelPicker')}
              <span
                className="agent-model-source-badge live"
                aria-hidden="true"
              >
                {t('settings.modelSourceLive')}
              </span>
            </span>
            <div className="agent-model-select-wrap">
              <div
                className="settings-model-select agent-model-select-loading"
                role="status"
                aria-busy="true"
                data-testid={`settings-agent-model-loading-${selected.id}`}
              >
                <Icon name="spinner" size={13} className="icon-spin" />
                <span>{t('common.loading')}</span>
              </div>
            </div>
          </label>
          <p className="hint agent-model-row-hint">
            {t('settings.modelPickerLiveHint')}
          </p>
        </div>
      );
    }
    if (!hasModels && !hasReasoning) return null;
    const choice = cfg.agentModels?.[selected.id] ?? {};
    const knownModelIds = selected.models?.map((m) => m.id) ?? [];
    // Adapters opt out via `supportsCustomModel: false` on their
    // RuntimeAgentDef when their CLI has no `--model` flag (Antigravity,
    // upstream issue #35) or when free-text ids silently fail at spawn
    // (AMR routes through ACP `session/set_model` and validates against
    // a live catalog). Undefined === allow, matching today's UX.
    const allowCustomModel = selected.supportsCustomModel !== false;
    const configuredModel =
      typeof choice.model === 'string' && choice.model
        ? choice.model
        : null;
    const setChoice = (
      next: { model?: string; reasoning?: string },
    ) => {
      setCfg((c) => {
        const prev = c.agentModels?.[selected.id] ?? {};
        return {
          ...c,
          agentModels: {
            ...(c.agentModels ?? {}),
            [selected.id]: { ...prev, ...next },
          },
        };
      });
    };
    const modelValue =
      selected.id === 'amr' &&
      configuredModel &&
      !knownModelIds.includes(configuredModel)
        ? selected.models?.[0]?.id ?? ''
        : configuredModel ?? selected.models?.[0]?.id ?? '';
    const reasoningValue =
      choice.reasoning ??
      selected.reasoningOptions?.[0]?.id ?? '';
    const customActive =
      allowCustomModel &&
      hasModels &&
      shouldShowCustomModelInput(
        modelValue,
        knownModelIds,
        agentCustomModelIds.has(selected.id),
      );
    const selectValue = customActive
      ? CUSTOM_MODEL_SENTINEL
      : modelValue;
    const modelSource = selected.modelsSource ?? 'fallback';
    const modelSourceLabel =
      modelSource === 'live'
        ? t('settings.modelSourceLive')
        : t('settings.modelSourceFallback');
    const modelSourceHint =
      modelSource === 'live'
        ? selected.supportsCustomModel === false
          ? t('settings.modelPickerLiveCatalogOnlyHint')
          : t('settings.modelPickerLiveHint')
        : t('settings.modelPickerFallbackHint');
    return (
      <div className="agent-card-config">
        {hasModels ? (
          <>
            <label className="field">
              <span className="field-label">
                {t('settings.modelPicker')}
                <span
                  className={`agent-model-source-badge ${modelSource}`}
                  aria-hidden="true"
                >
                  {modelSourceLabel}
                </span>
              </span>
              <div className="agent-model-select-wrap">
                <SearchableModelSelect
                  className="inline-switcher__select settings-model-select"
                  value={selectValue}
                  aria-label={t('settings.modelPicker')}
                  searchPlaceholder={t('designs.searchPlaceholder')}
                  searchInputTestId={`settings-agent-model-search-${selected.id}`}
                  popoverTestId={`settings-agent-model-popover-${selected.id}`}
                  minSearchableOptions={5}
                  popoverMinWidth={340}
                  models={selected.models!}
                  onChange={(nextValue) => {
                    if (nextValue === CUSTOM_MODEL_SENTINEL) {
                      setAgentCustomModelIds((prev) => {
                        const next = new Set(prev);
                        next.add(selected.id);
                        return next;
                      });
                      setChoice({ model: '' });
                    } else {
                      setAgentCustomModelIds((prev) => {
                        if (!prev.has(selected.id)) return prev;
                        const next = new Set(prev);
                        next.delete(selected.id);
                        return next;
                      });
                      setChoice({ model: nextValue });
                    }
                  }}
                  additionalOptions={
                    allowCustomModel
                      ? [
                          {
                            value: CUSTOM_MODEL_SENTINEL,
                            label: t('settings.modelCustom'),
                          },
                        ]
                      : undefined
                  }
                />
              </div>
            </label>
            <p className="hint agent-model-row-hint">
              {modelSourceHint}
            </p>
          </>
        ) : null}
        {customActive ? (
          <label className="field">
            <span className="field-label">
              {t('settings.modelCustomLabel')}
            </span>
            <input
              type="text"
              value={modelValue}
              placeholder={t('settings.modelCustomPlaceholder')}
              onChange={(e) =>
                setChoice({ model: e.target.value.trim() })
              }
            />
          </label>
        ) : null}
        {hasReasoning ? (
          <label className="field">
            <span className="field-label">
              {t('settings.reasoningPicker')}
            </span>
            <div className="agent-model-select-wrap">
              <select
                value={reasoningValue}
                onChange={(e) =>
                  setChoice({ reasoning: e.target.value })
                }
              >
                {selected.reasoningOptions!.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron-down"
                size={12}
                className="agent-model-select-chevron"
              />
            </div>
          </label>
        ) : null}
      </div>
    );
  };

  const settingsSidebarToggleLabel = settingsSidebarCollapsed
    ? 'Expand settings sidebar'
    : 'Collapse settings sidebar';
  const settingsFullscreenLabel = settingsFullscreen
    ? t('common.exitFullscreen')
    : t('common.fullscreen');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={
          'modal modal-settings' +
          (settingsSidebarCollapsed ? ' settings-sidebar-collapsed' : '') +
          (settingsFullscreen ? ' settings-fullscreen' : '')
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-right chrome strip — anchored to the modal corner so the
            autosave indicator and the close button float above the
            sidebar/content rhythm without competing with the title.
            We use `position: absolute` instead of putting these inside
            `.modal-head` so the welcome variant's tall hero (kicker /
            title / subtitle / pet teaser) keeps its centred reading
            measure, and the close button always lands at the same
            optical location regardless of how much copy the header
            renders. */}
        <div className="settings-chrome" aria-hidden={false}>
          {/* Autosave status pill. Only renders something while a save
              is in flight or has just completed — idle = invisible so
              first-open feels calm. The chrome strip itself stays
              mounted so the close button never shifts when the pill
              appears, and the pill is announced via aria-live for
              assistive tech. */}
          <div
            className={`settings-autosave is-${autosaveStatus}`}
            role="status"
            aria-live="polite"
          >
            {autosaveStatus === 'saving' || autosaveStatus === 'pending' ? (
              <>
                <Icon name="spinner" size={12} className="icon-spin" />
                <span>{t('settings.autosaveSaving')}</span>
              </>
            ) : autosaveStatus === 'saved' ? (
              <>
                <Icon name="check" size={12} />
                <span>{t('settings.autosaveSaved')}</span>
              </>
            ) : autosaveStatus === 'error' ? (
              <>
                <Icon name="close" size={12} />
                <span>{t('settings.autosaveError')}</span>
              </>
            ) : null}
          </div>
          <button
            type="button"
            className="settings-chrome-btn settings-fullscreen-toggle"
            onClick={() => setSettingsFullscreen((current) => !current)}
            aria-label={settingsFullscreenLabel}
            aria-pressed={settingsFullscreen}
            title={settingsFullscreenLabel}
          >
            <Icon
              name={settingsFullscreen ? 'minimize' : 'maximize'}
              size={15}
              strokeWidth={2}
            />
          </button>
          <button
            type="button"
            className="settings-chrome-btn settings-close"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
        <header className="modal-head" id="settings-dialog-title">
          {welcome ? (
            <>
              <span className="kicker">{t('settings.welcomeKicker')}</span>
              <h2>{t('settings.welcomeTitle')}</h2>
              <p className="subtitle">{t('settings.welcomeSubtitle')}</p>
            </>
          ) : (
            <>
              <span className="kicker">{t('settings.kicker')}</span>
              <div className="modal-head-line">
                <h2>{activeHeader.title}</h2>
                <p className="subtitle">{activeHeader.subtitle}</p>
              </div>
            </>
          )}
        </header>

        <div className="modal-body">
          <button
            type="button"
            className="settings-sidebar-toggle"
            onClick={() => setSettingsSidebarCollapsed((current) => !current)}
            aria-label={settingsSidebarToggleLabel}
            aria-pressed={settingsSidebarCollapsed}
            aria-controls="settings-sidebar"
            title={settingsSidebarToggleLabel}
          >
            <Icon
              name={settingsSidebarCollapsed ? 'chevron-right' : 'chevron-left'}
              size={15}
              strokeWidth={2}
            />
          </button>
          <aside
            id="settings-sidebar"
            className="settings-sidebar"
            aria-label="Settings sections"
            aria-hidden={settingsSidebarCollapsed ? true : undefined}
          >
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'execution' ? ' active' : ''}`}
              onClick={() => setActiveSection('execution')}
            >
              <Icon name="sliders" size={18} />
              <span>
                <strong>{t('settings.envConfigure')}</strong>
                <small>{`${t('settings.localCli')} / ${t('settings.modeApiMeta')}`}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'instructions' ? ' active' : ''}`}
              onClick={() => setActiveSection('instructions')}
            >
              <Icon name="edit" size={18} />
              <span>
                <strong>{t('settings.instructionsTitle')}</strong>
                <small>{t('settings.instructionsNavSub')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'memory' ? ' active' : ''}`}
              onClick={() => setActiveSection('memory')}
            >
              <Icon name="history" size={18} />
              <span>
                <strong>{t('settings.memory')}</strong>
                <small>{t('settings.memoryHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'media' ? ' active' : ''}`}
              onClick={() => setActiveSection('media')}
            >
              <Icon name="image" size={18} />
              <span>
                <strong>{t('settings.mediaProviders')}</strong>
                <small>Image / video / audio</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'mcpClient' ? ' active' : ''}`}
              onClick={() => setActiveSection('mcpClient')}
            >
              <Icon name="sparkles" size={18} />
              <span>
                <strong>{t('settings.externalMcpTitle')}</strong>
                <small>{t('settings.externalMcpHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'composio' ? ' active' : ''}`}
              onClick={() => setActiveSection('composio')}
            >
              <Icon name="sliders" size={18} />
              <span>
                <strong>{t('connectors.title')}</strong>
                <small>{t('settings.connectorsNavHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'integrations' ? ' active' : ''}`}
              onClick={() => setActiveSection('integrations')}
            >
              <Icon name="link" size={18} />
              <span>
                <strong>{t('settings.mcpServerTitle')}</strong>
                <small>{t('settings.mcpServerHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'language' ? ' active' : ''}`}
              onClick={() => setActiveSection('language')}
            >
              <Icon name="languages" size={18} />
              <span>
                <strong>{t('settings.language')}</strong>
                <small>{t('settings.languageHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'appearance' ? ' active' : ''}`}
              onClick={() => setActiveSection('appearance')}
            >
              <Icon name="sun-moon" size={18} />
              <span>
                <strong>{t('settings.appearance')}</strong>
                <small>{t('settings.appearanceHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'critiqueTheater' ? ' active' : ''}`}
              onClick={() => setActiveSection('critiqueTheater')}
            >
              <Icon name="comment" size={18} />
              <span>
                <strong>{t('critiqueTheater.settingsNav')}</strong>
                <small>{t('critiqueTheater.settingsNavHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'notifications' ? ' active' : ''}`}
              onClick={() => setActiveSection('notifications')}
            >
              <Icon name="bell" size={18} />
              <span>
                <strong>{t('settings.notifications')}</strong>
                <small>{t('settings.notificationsHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'pet' ? ' active' : ''}`}
              onClick={() => setActiveSection('pet')}
            >
              <Icon name="sparkles" size={18} />
              <span>
                <strong>{t('pet.navTitle')}</strong>
                <small>{t('pet.navHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'designSystems' ? ' active' : ''}`}
              onClick={() => setActiveSection('designSystems')}
            >
              <Icon name="draw" size={18} />
              <span>
                <strong>{t('settings.designSystems')}</strong>
                <small>{t('settings.designSystemsHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'projectLocations' ? ' active' : ''}`}
              onClick={() => setActiveSection('projectLocations')}
            >
              <Icon name="folder" size={18} />
              <span>
                <strong>{t('settings.projectLocations')}</strong>
                <small>{t('settings.projectLocationsHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'privacy' ? ' active' : ''}`}
              onClick={() => setActiveSection('privacy')}
            >
              <Icon name="eye" size={18} />
              <span>
                <strong>{t('settings.privacy')}</strong>
                <small>{t('settings.privacyHint')}</small>
              </span>
            </button>
            <button
              type="button"
              className={`settings-nav-item${activeSection === 'about' ? ' active' : ''}`}
              onClick={() => setActiveSection('about')}
            >
              <Icon name="settings" size={18} />
              <span>
                <strong>{t('settings.about')}</strong>
                <small>{t('settings.aboutHint')}</small>
              </span>
            </button>
          </aside>
          <div className="settings-content" ref={settingsContentRef}>
          {activeSection === 'execution' ? (
            <>
              <div
                className="seg-control"
                role="tablist"
                aria-label={t('settings.modeAria')}
                style={{ ['--seg-cols' as string]: 2 } as CSSProperties}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={cfg.mode === 'daemon'}
                  className={
                    'seg-btn seg-btn--inline' +
                    (cfg.mode === 'daemon' ? ' active' : '')
                  }
                  disabled={!daemonLive}
                  onClick={() => setMode('daemon')}
                  title={
                    daemonLive
                      ? t('settings.modeDaemonHelp')
                      : t('settings.modeDaemonOffline')
                  }
                >
                  <span className="seg-title">{t('settings.localCli')}</span>
                  <span className="seg-meta">
                    {daemonLive
                      ? t('settings.modeDaemonInstalledMeta', { count: installedCount })
                      : t('settings.modeDaemonOfflineMeta')}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cfg.mode === 'api'}
                  className={
                    'seg-btn seg-btn--inline' +
                    (cfg.mode === 'api' ? ' active' : '')
                  }
                  onClick={() => setMode('api')}
                >
                  <span className="seg-title">{t('settings.modeApiMeta')}</span>
                  <span className="seg-meta">{t('settings.modeApi')}</span>
                </button>
              </div>
              {cfg.mode === 'api' ? (
                <div
                  className="protocol-chips protocol-chips--providers"
                  role="tablist"
                  aria-label={t('settings.protocolAria')}
                >
                  <div className="protocol-chip-group protocol-chip-group--providers">
                    <div className="protocol-chip-group-options">
                      {byokProviderOptions.map((provider) => {
                        const active = selectedByokProvider?.id === provider.id;
                        const configured = byokProviderConfigured(provider);
                        const statusLabel = configured
                          ? t('settings.mediaProviderConfigured')
                          : t('settings.mediaProviderUnset');
                        return (
                          <button
                            key={provider.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-label={provider.title}
                            className={'protocol-chip protocol-chip--provider' + (active ? ' active' : '')}
                            title={`${provider.title} - ${statusLabel}`}
                            onClick={() => {
                              const byokProviderId = byokProtocolToTracking(provider.protocol);
                              if (byokProviderId) {
                                trackSettingsByokProviderOptionClick(analytics.track, {
                                  page_name: 'settings',
                                  area: 'configure_execution_mode_byok',
                                  element: 'byok_provider_option',
                                  action: 'select_byok_provider',
                                  provider_id: byokProviderId,
                                  is_selected: active,
                                });
                              }
                              if (!active) {
                                setByokProvider(provider);
                              }
                            }}
                          >
                            <span
                              className={`protocol-chip-status${configured ? ' is-configured' : ' is-unset'}`}
                              aria-hidden
                            />
                            <span>{provider.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
          {cfg.mode === 'daemon' ? (
            <section className="settings-section">
              <div className="section-head">
                <div>
                  <p className="hint">{t('settings.codeAgentHint')}</p>
                </div>
              </div>
              {initialAgentScanRunning ? (
                <div className="agent-scan-card" role="status" aria-live="polite">
                  <div className="agent-scan-card__stage">
                    <span className="agent-scan-card__ring" aria-hidden />
                    <strong>{t('settings.rescanRunning')}</strong>
                    <span>{t('settings.codeAgentHint')}</span>
                    <div className="agent-scan-card__progress" aria-hidden>
                      <span />
                    </div>
                  </div>
                  <div className="agent-scan-card__rows" aria-hidden>
                    <span><i /><b /><em /></span>
                    <span><i /><b /><em /></span>
                    <span><i /><b /><em /></span>
                  </div>
                </div>
              ) : agents.length === 0 ? (
                <div className="empty-card">
                  {t('settings.noAgentsDetected')}
                </div>
              ) : (
                <>
                  <div className="agent-group">
                    <div className="agent-group-head">
                      <h4>
                        {t('settings.agentInstalledGroup', {
                          count: installedAgents.length,
                        })}
                      </h4>
                      <div className="agent-group-head-actions">
                        {agentRescanNotice ? (
                          <span
                            className={
                              'settings-rescan-status settings-rescan-status-inline ' +
                              agentRescanNotice.kind
                            }
                            role={
                              agentRescanNotice.kind === 'error'
                                ? 'alert'
                                : 'status'
                            }
                          >
                            {agentRescanNotice.kind === 'success'
                              ? t('settings.rescanSuccess', {
                                  count: agentRescanNotice.count,
                                })
                              : t('settings.rescanFailed')}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={
                            'ghost icon-btn settings-rescan-btn agent-group-rescan-btn' +
                            (agentRescanRunning ? ' loading' : '')
                          }
                          onClick={() => void handleRefreshAgents()}
                          disabled={agentRescanRunning}
                          title={t('settings.rescanTitle')}
                        >
                          {agentRescanRunning ? (
                            <>
                              <Icon
                                name="spinner"
                                size={13}
                                className="icon-spin"
                              />
                              <span>{t('settings.rescanRunning')}</span>
                            </>
                          ) : (
                            t('settings.rescan')
                          )}
                        </button>
                      </div>
                    </div>
                    {installedAgents.length > 0 ? (
                      <div className="agent-grid agent-grid-installed">
                        {installedAgents.map((a) => {
                          const active = cfg.agentId === a.id;
                          const running =
                            active && agentTestState.status === 'running';
                          const isAmrAgent = a.id === 'amr';
                          const description = AGENT_SHORT_DESCRIPTIONS[a.id];
                          const agentName = displayAgentName(a);
                          const diagnosticHandlers = diagnosticHandlersForAgent(a);
                          const modelSummary = agentModelSummary(a);
                          const amrBenefits = [
                            t('settings.amrBenefitOfficial'),
                            t('settings.amrBenefitManyModels'),
                          ];
                          const versionLabel =
                            isAmrAgent
                              ? ''
                              : cleanAgentVersionLabel(a.name, a.version);
                          const metaLabel =
                            a.authStatus === 'missing'
                              ? t('settings.agentAuthRequired')
                              : a.authStatus === 'unknown'
                                ? t('settings.agentAuthUnknown')
                                : versionLabel
                                  ? versionLabel
                                  : a.id === 'amr'
                                    ? ''
                                    : t('common.installed');
                          const metaTitle =
                            a.authStatus === 'missing' ||
                            a.authStatus === 'unknown'
                              ? (a.authMessage ?? a.path ?? '')
                              : (a.path ?? '');
                          const amrHighlighted = isAmrAgent && amrHighlightActive;
                          const amrCardEmail =
                            isAmrAgent && active && amrCardStatus?.loggedIn
                              ? amrCardStatus.user?.email || t('settings.amrSignedIn')
                              : '';
                          const amrCardProfileBadge =
                            isAmrAgent && active && amrCardStatus?.loggedIn
                              ? amrProfileBadgeLabel(amrCardStatus.profile)
                              : null;
                          const amrWalletVisible =
                            isAmrAgent && active && amrCardStatus?.loggedIn === true;
                          const amrStatusBalance =
                            amrWalletVisible
                              ? formatVelaBalanceUsd(amrCardStatus?.account?.balanceUsd)
                              : null;
                          const amrWalletBalance =
                            amrWalletVisible && amrWalletSnapshot?.status === 'available'
                              ? formatAmrWalletBalance(amrWalletSnapshot.balanceUsd)
                              : null;
                          const amrCardBalanceLabel =
                            isAmrAgent && active && amrCardStatus?.loggedIn
                              ? amrStatusBalance ?? amrWalletBalance
                              : null;
                          const amrCardPlanLabel =
                            isAmrAgent && active && amrCardStatus?.loggedIn
                              ? amrCardStatus.account?.plan?.trim() || null
                              : null;
                          const amrCardCanUpgrade =
                            isAmrAgent && active && amrCardStatus?.loggedIn
                              ? canUpgradeVelaPlan(amrCardStatus.account?.plan)
                              : false;
                          const amrRevealPendingCancelAction =
                            isAmrAgent &&
                            active &&
                            hoveredAgentCardId === a.id &&
                            amrCardStatus?.loggedIn !== true &&
                            amrCardStatus?.loginInFlight === true;
                          const cardEl = (
                            <div
                              key={a.id}
                              ref={isAmrAgent ? amrCardRef : undefined}
                              data-testid={`settings-agent-card-${a.id}`}
                              className={
                                'agent-card agent-card-installed' +
                                (active ? ' active' : '') +
                                (amrHighlighted ? ' agent-card--amr-highlight' : '')
                              }
                              onMouseEnter={() => {
                                if (!isAmrAgent || !active) return;
                                setHoveredAgentCardId(a.id);
                              }}
                              onMouseLeave={() => {
                                if (hoveredAgentCardId !== a.id) return;
                                setHoveredAgentCardId(null);
                              }}
                            >
                              <div className="agent-card-main">
                                <button
                                  type="button"
                                  className="agent-card-select"
                                  data-testid={`settings-agent-select-${a.id}`}
                                  onClick={() => {
                                    trackSettingsLocalCliClick(analytics.track, {
                                      page_name: 'settings',
                                      area: 'configure_execution_mode_local_cli',
                                      element: 'cli_provider',
                                      cli_provider_id: agentIdToTracking(a.id),
                                      install_status: 'installed',
                                    });
                                    if (isAmrAgent) {
                                      recordAmrEntry(
                                        analytics.track,
                                        'settings_amr_agent_card',
                                        new Date(),
                                        {
                                          metricsConsent:
                                            cfg.telemetry?.metrics === true,
                                        },
                                      );
                                    }
                                    setCfg((c) => ({ ...c, agentId: a.id }));
                                  }}
                                  aria-pressed={active}
                                  >
                                    <AgentIcon id={a.id} size={32} />
                                    <div className="agent-card-body">
                                      <div
                                        className={
                                          'agent-card-name' +
                                          (isAmrAgent
                                            ? ' agent-card-name--amr'
                                            : '')
                                        }
                                      >
                                        <span className="agent-card-title">
                                          {agentName}
                                        </span>
                                        {isAmrAgent ? (
                                          <span
                                            className="agent-card-benefits"
                                            aria-hidden="true"
                                          >
                                            {amrBenefits.map((benefit) => (
                                              <span
                                                key={benefit}
                                                className="agent-card-benefit"
                                              >
                                                {benefit}
                                              </span>
                                            ))}
                                          </span>
                                        ) : description ? (
                                          <>
                                            <span
                                              className="agent-card-name-divider"
                                              aria-hidden="true"
                                            >
                                              ·
                                            </span>
                                            <span className="agent-card-tagline">
                                              {description}
                                            </span>
                                          </>
                                        ) : null}
                                        {isAmrAgent && amrCardPlanLabel ? (
                                          <VisuallyHidden>
                                            {`, ${t('settings.amrPlan')} ${amrCardPlanLabel}`}
                                          </VisuallyHidden>
                                        ) : null}
                                      </div>
                                      {metaLabel ? (
                                        <div className="agent-card-meta">
                                          <span title={metaTitle}>
                                            {metaLabel}
                                          </span>
                                        </div>
                                      ) : null}
                                      {amrCardEmail ? (
                                        <div className="agent-card-amr-email">
                                          <span className="agent-card-amr-email-text" title={amrCardEmail}>
                                            {amrCardEmail}
                                          </span>
                                          {amrCardPlanLabel ? (
                                            <span
                                              className="agent-card-plan-badge-slot"
                                              aria-hidden="true"
                                            >
                                              <PlanBadge
                                                plan={amrCardPlanLabel}
                                                size="sm"
                                                className="agent-card-plan-badge"
                                                title={
                                                  amrCardPlanLabel
                                                    ? `${t('settings.amrPlan')} ${amrCardPlanLabel}`
                                                    : undefined
                                                }
                                              />
                                            </span>
                                          ) : null}
                                          {amrCardProfileBadge ? (
                                            <span className="agent-card-amr-profile-badge">
                                              {amrCardProfileBadge}
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : null}
                                      {amrWalletVisible ? (
                                        <div className="agent-card-amr-meta-row">
                                          <span className="agent-card-amr-balance">
                                            <span className="agent-card-amr-balance-label">
                                              {t('settings.amrBalance')}
                                            </span>
                                            <span className="agent-card-amr-balance-value">
                                              {amrWalletValueLabel({
                                                balance: amrCardBalanceLabel,
                                                loadingLabel: t('common.loading'),
                                                ready: amrWalletReady || Boolean(amrCardBalanceLabel),
                                                snapshot: amrWalletSnapshot,
                                                unavailableLabel: t('settings.amrWalletUnavailable'),
                                              })}
                                            </span>
                                          </span>
                                        </div>
                                      ) : null}
                                      {!active && modelSummary ? (
                                        <div className="agent-card-model-summary">
                                          <span>{t('settings.modelPicker')}</span>
                                          <strong>{modelSummary}</strong>
                                        </div>
                                      ) : null}
                                  </div>
                                </button>
                                {isAmrAgent ? (
                                  active && amrCardStatusReady ? (
                                    <span
                                      className="amr-auth-anchor"
                                      onMouseEnter={() => setAmrCoachmarkDismissed(true)}
                                    >
                                      {amrCoachmarkArmed &&
                                      amrCardStatus?.loggedIn === false &&
                                      !amrCoachmarkDismissed ? (
                                        <span className="amr-coachmark" aria-hidden="true">
                                          <span className="amr-coachmark__ring" />
                                          <svg
                                            className="amr-coachmark__cursor"
                                            width="22"
                                            height="22"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                          >
                                            <path
                                              d="M9.4 13V8a1.8 1.8 0 0 1 3.6 0v4.6c.35-.55 1-.95 1.75-.95.65 0 1.25.32 1.6.85.32-.5.9-.8 1.55-.8.8 0 1.5.5 1.78 1.2.35-.3.8-.5 1.3-.5 1.1 0 2 .9 2 2v3.05a5.6 5.6 0 0 1-5.6 5.6h-2.5a5 5 0 0 1-3.75-1.7l-4.2-4.75a1.85 1.85 0 0 1 2.65-2.6L9.4 16Z"
                                              fill="#fff"
                                              stroke="#1a1a1a"
                                              strokeWidth="1.1"
                                              strokeLinejoin="round"
                                            />
                                          </svg>
                                        </span>
                                      ) : null}
                                      {amrCardCanUpgrade ? (
                                        <button
                                          type="button"
                                          className="agent-card-amr-upgrade"
                                          data-testid="settings-agent-card-amr-upgrade"
                                          onClick={() =>
                                            void openExternalUrl(
                                              attributedAmrSettingsUrl(
                                                amrPlansUrlForProfile(
                                                  amrCardStatus?.profile,
                                                ),
                                                'settings_amr_upgrade',
                                              ),
                                            )
                                          }
                                        >
                                          {t('settings.amrUpgrade')}
                                        </button>
                                      ) : null}
                                      <AmrLoginPill
                                        className="agent-card-amr-auth"
                                        hideSignedOutStatus
                                        hideSignedInStatus
                                        initialStatus={amrCardStatus}
                                        skipInitialRefresh
                                        signInLabel={t('settings.amrAuthorize')}
                                        showConsoleAction={amrCardStatus?.loggedIn === true}
                                        iconOnlySignOut
                                        amrEntrySourceDetail="settings_amr_authorize"
                                        metricsConsent={cfg.telemetry?.metrics === true}
                                        installationId={cfg.installationId}
                                        revealPendingCancelAction={amrRevealPendingCancelAction}
                                        onStatusChange={setAmrCardStatus}
                                      />
                                    </span>
                                  ) : (
                                    <div
                                      className="agent-card-amr-auth agent-card-amr-auth--placeholder"
                                      aria-hidden="true"
                                    />
                                  )
                                ) : null}
                                {active && !isAmrAgent ? (
                                  <button
                                    type="button"
                                    className={
                                      'ghost icon-btn settings-test-btn agent-card-test-btn' +
                                      (running ? ' loading' : '')
                                    }
                                    onClick={() => void handleTestAgent()}
                                    disabled={running}
                                    title={t('settings.testTitle')}
                                  >
                                    {running ? (
                                      <>
                                        <Icon
                                          name="spinner"
                                          size={13}
                                          className="icon-spin"
                                        />
                                        <span>{t('settings.test')}</span>
                                      </>
                                    ) : (
                                      t('settings.test')
                                    )}
                                  </button>
                                ) : null}
                              </div>
                              {(a.diagnostics ?? []).map((diagnostic, i) => (
                                <AgentDiagnosticRow
                                  key={`${diagnostic.reason}-${i}`}
                                  diagnostic={diagnostic}
                                  handlers={diagnosticHandlers}
                                />
                              ))}
                              {active ? renderAgentModelConfig(a) : null}
                            </div>
                          );
                          if (active && agentTestState.status !== 'idle') {
                            const resultRow = (
                              <div
                                key={`${a.id}__test-result`}
                                className="agent-test-result-row"
                              >
                                {agentTestState.status === 'running' ? (
                                  <p
                                    className="settings-test-status running"
                                    role="status"
                                    aria-live="polite"
                                  >
                                    {t('settings.testRunning')}
                                  </p>
                                ) : (
                                  <>
                                    <p
                                      className={
                                        'settings-test-status ' +
                                        testStatusVariant(agentTestState.result)
                                      }
                                      role={
                                        agentTestState.result.ok
                                          ? 'status'
                                          : 'alert'
                                      }
                                    >
                                      {renderTestMessage(
                                        agentTestState.result,
                                        'cli',
                                      )}
                                    </p>
                                    {!agentTestState.result.ok ? (
                                      <div className="settings-test-actions">
                                        <div className="settings-test-actions-row">
                                          <button
                                            type="button"
                                            className="ghost icon-btn settings-test-btn"
                                            onClick={() => void handleTestAgent()}
                                          >
                                            <Icon name="reload" size={13} />
                                            <span>{t('settings.testRetry')}</span>
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                    {cfg.agentId === 'codex' && (() => {
                                      const repair = codexPathRepairState(
                                        agentTestState.result,
                                      );
                                      if (!repair) return null;
                                      const codexStrings = codexPathStrings(locale);
                                      return (
                                        <div className="settings-test-actions">
                                          <span className="settings-test-actions-hint">
                                            {codexStrings.repairHint}
                                          </span>
                                          <div className="settings-test-actions-row">
                                            {repair.canUseDetected ? (
                                              <button
                                                type="button"
                                                className="settings-test-btn"
                                                onClick={() =>
                                                  applyCodexDetectedPath(
                                                    repair.detectedPath,
                                                  )
                                                }
                                              >
                                                {codexStrings.useDetected}
                                              </button>
                                            ) : null}
                                            <button
                                              type="button"
                                              className="ghost icon-btn settings-rescan-btn"
                                              onClick={clearCodexCustomPath}
                                            >
                                              {codexStrings.clearCustom}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
                                )}
                              </div>
                            );
                            return [cardEl, resultRow];
                          }
                          return [cardEl];
                        })}
                      </div>
                    ) : (
                      <div className="empty-card">
                        {t('settings.noAgentsDetected')}
                      </div>
                    )}
                  </div>
                  {unavailableAgents.length > 0 ? (
                    <details
                      className="agent-install-collapse"
                      open={installedAgents.length > 0 ? undefined : true}
                    >
                      <summary className="agent-install-collapse-summary">
                        <span>
                          {t('settings.agentInstallGroup', {
                            count: unavailableAgents.length,
                          })}
                        </span>
                      </summary>
                      <div className="agent-grid agent-grid-unavailable">
                        {unavailableAgents.map((a) => {
                          const installUrl = sanitizeHttpsUrl(a.installUrl);
                          const docsUrl = sanitizeHttpsUrl(a.docsUrl);
                          const hasLinks = Boolean(installUrl || docsUrl);
                          const description = AGENT_SHORT_DESCRIPTIONS[a.id];
                          const agentName = displayAgentName(a);
                          const diagnosticHandlers = diagnosticHandlersForAgent(a);
                          const cardLabel = `${agentName} · ${t('common.notInstalled')}`;
                          return (
                            <div
                              key={a.id}
                              className="agent-card disabled agent-card-unavailable"
                              role="group"
                              aria-label={cardLabel}
                            >
                              <div className="agent-card-unavailable-row">
                                <AgentIcon id={a.id} size={30} />
                                <div className="agent-card-body">
                                  <div className="agent-card-name">
                                    {agentName}
                                  </div>
                                  {description ? (
                                    <div className="agent-card-description">
                                      {description}
                                    </div>
                                  ) : null}
                                </div>
                                {hasLinks ? (
                                  <div className="agent-card-actions agent-card-actions--inline">
                                    {docsUrl ? (
                                      <a
                                        href={docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="agent-card-link agent-card-link--muted agent-card-link--icon"
                                        onClick={markAgentInstallIntent}
                                        title={t('settings.agentInstall.docs')}
                                        aria-label={t('settings.agentInstall.docs')}
                                      >
                                        <Icon name="file" size={15} />
                                      </a>
                                    ) : null}
                                    {installUrl ? (
                                      <a
                                        href={installUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="agent-card-link agent-card-link--ghost"
                                        onClick={(event) => {
                                          markAgentInstallIntent();
                                          if (a.id === 'amr') {
                                            event.currentTarget.href = attributedAmrSettingsUrl(
                                              installUrl,
                                              'settings_amr_install',
                                            );
                                          }
                                        }}
                                      >
                                        {t('settings.agentInstall.install')}
                                      </a>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              {/* Why is it unavailable? not-on-path vs a broken
                                  shim vs a bad *_BIN override each get a
                                  distinct, actionable line. It spans the full
                                  card width on its own row below the
                                  logo/name/links so it never crowds the inline
                                  Docs/Install actions. */}
                              {(a.diagnostics ?? []).map((diagnostic, i) => (
                                <AgentDiagnosticRow
                                  key={`${diagnostic.reason}-${i}`}
                                  diagnostic={diagnostic}
                                  handlers={diagnosticHandlers}
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                  {/*
                    Show the install guide only when the user has *no*
                    working agent picked yet. Older logic surfaced it
                    whenever any agent on the support list was missing,
                    which fired for almost everyone (few people install
                    all 14 supported CLIs) — the four-step quickstart
                    then sat between the agent grid and the model picker
                    forever, even after the user had successfully picked
                    Claude Code months ago. Once a working agent is
                    selected, the guide has done its job and only adds
                    noise.
                  */}
                  {!agents.find(
                    (a) => a.id === cfg.agentId && a.available,
                  ) ? (
                    <div className="agent-install-guide">
                      <p className="hint agent-install-path-hint">
                        {t('settings.agentInstall.pathHint')}
                      </p>
                      <ol className="agent-install-steps">
                        <li>{t('settings.agentInstall.stepOpenLinks')}</li>
                        <li>{t('settings.agentInstall.stepAuth')}</li>
                        <li>{t('settings.agentInstall.stepRescan')}</li>
                        <li>{t('settings.agentInstall.stepSelect')}</li>
                      </ol>
                    </div>
                  ) : null}
                </>
              )}
              {(() => {
                const selected = agents.find(
                  (a) => a.id === cfg.agentId && a.available,
                );
                if (!selected) return null;
                const hasModels =
                  Array.isArray(selected.models) && selected.models.length > 0;
                const choice = cfg.agentModels?.[selected.id] ?? {};
                const knownModelIds = selected.models?.map((m) => m.id) ?? [];
                const configuredModel =
                  typeof choice.model === 'string' && choice.model
                    ? choice.model
                    : null;
                const modelValue =
                  selected.id === 'amr' &&
                  configuredModel &&
                  !knownModelIds.includes(configuredModel)
                    ? selected.models?.[0]?.id ?? ''
                    : configuredModel ?? selected.models?.[0]?.id ?? '';
                return (
                  <details className="agent-cli-env settings-memory-advanced">
                    <summary className="agent-cli-env-summary">
                      <span className="agent-cli-env-summary-title">
                        {t('settings.memoryModelInlineLabel')}
                      </span>
                    </summary>
                    <div className="agent-cli-env-body">
                      <MemoryModelInline
                        mode="daemon"
                        apiProtocol={apiProtocol}
                        chatApiKey={cfg.apiKey}
                        chatBaseUrl={cfg.baseUrl}
                        chatApiVersion={cfg.apiVersion ?? ''}
                        chatModel={modelValue}
                        cliAgentId={selected.id}
                        cliModelOptions={
                          hasModels ? selected.models!.map((m) => m.id) : []
                        }
                      />
                    </div>
                  </details>
                );
              })()}
              {(() => {
                /*
                  Per-agent CLI environment overrides — proxy URLs, custom
                  config dirs, and a binary path override. The previous
                  layout listed every supported agent's variables in one
                  long always-expanded block; for users on Claude Code
                  the Codex fields were just visual filler (and vice
                  versa), and the section hijacked Settings real estate
                  on every open even though nine in ten users never
                  touch it. Now: filtered to the *currently selected*
                  agent only, and folded into a collapsed disclosure
                  that opens to "Advanced: proxy & custom paths" — power
                  users who route through LiteLLM or installed the
                  binary out-of-PATH still have one click access; new
                  users no longer wonder "are these fields I forgot to
                  fill in?".
                */
                const cliEnvFields = AGENT_CLI_ENV_FIELDS.filter(
                  (field) => field.agentId === cfg.agentId,
                );
                if (cliEnvFields.length === 0) return null;
                return (
                  <details
                    className="agent-cli-env"
                    data-testid="settings-cli-env"
                  >
                    <summary className="agent-cli-env-summary">
                      <span className="agent-cli-env-summary-title">
                        {t('settings.cliEnvTitle')}
                      </span>
                    </summary>
                    <div className="agent-cli-env-body">
                      <p className="hint">{t('settings.cliEnvHint')}</p>
                      <div className="agent-cli-env-grid">
                        {cliEnvFields.map((field) => (
                          <label
                            className="field"
                            key={`${field.agentId}:${field.envKey}`}
                          >
                            <span className="field-label">
                              {t(field.labelKey)}
                              {'labelSuffix' in field
                                ? ` (${field.labelSuffix})`
                                : ''}
                            </span>
                            <input
                              type={
                                'secret' in field && field.secret
                                  ? 'password'
                                  : 'text'
                              }
                              value={
                                cfg.agentCliEnv?.[field.agentId]?.[
                                  field.envKey
                                ] ?? ''
                              }
                              placeholder={field.placeholder}
                              spellCheck={false}
                              autoComplete="off"
                              onChange={(e) =>
                                setCfg((c) =>
                                  updateAgentCliEnvValue(
                                    c,
                                    field.agentId,
                                    field.envKey,
                                    e.target.value,
                                  ),
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>
                );
              })()}
            </section>
          ) : (
            /*
              BYOK panel — wrap the per-protocol form in a bordered card so
              the chips above (Anthropic / OpenAI / Azure / Gemini / Ollama)
              visually own the content below. Without the card, the chip
              row and the form looked like two unrelated stripes; users
              had no anchor for "this is what I configured for the active
              tab", and switching tabs felt like the whole right column
              just reshuffled. The card lives on the same white-with-soft-
              border pattern as `.agent-model-row` so the two BYOK / CLI
              panels feel like the same family.
            */
            <section className="settings-section settings-section-card settings-section-byok">
              <div className="section-head">
                <div>
                  <div className="settings-byok-title">
                    <h3>{API_PROTOCOL_LABELS[apiProtocol]}</h3>
                    <span className="settings-byok-info-wrap">
                      <button
                        type="button"
                        className="settings-byok-info-button"
                        aria-label={t('settings.byokNoFileToolsNotice')}
                        aria-describedby="settings-byok-no-file-tools-tooltip"
                        data-testid="settings-byok-no-file-tools-trigger"
                      >
                        <Icon name="info" size={13} />
                      </button>
                      <span
                        id="settings-byok-no-file-tools-tooltip"
                        className="settings-byok-info-tooltip"
                        role="tooltip"
                        data-testid="settings-byok-no-file-tools-notice"
                      >
                        {t('settings.byokNoFileToolsNotice')}
                      </span>
                    </span>
                  </div>
                </div>
                <ByokConnectionTestControl
                  baseUrlValid={baseUrlValid}
                  canRunConnectionTest={
                    !byokFirstPartyBaseUrl?.hostTypo &&
                    canRunProviderConnectionTest(cfg, {
                      requiresApiKey: byokRequiresApiKey,
                    })
                  }
                  labels={{
                    readyToTest: t('settings.byokReadyToTest'),
                    test: t('settings.test'),
                    testRetry: t('settings.testRetry'),
                    testRunning: t('settings.testRunning'),
                    testTitle: t('settings.testTitle'),
                  }}
                  providerTestState={providerTestState}
                  renderTestMessage={(result) => renderTestMessage(result, 'api')}
                  suppressResultStatus={
                    providerTestBaseUrlInvalid || providerTestApiKeyAuthFailed
                  }
                  suppressReadyState={Boolean(
                    byokPreconditionNotice ||
                      apiKeyFieldAuthFailed ||
                      providerTestBaseUrlInvalid ||
                      byokBlockingDraftIssues.length > 0,
                  )}
                  onTestProvider={() => handleTestProvider()}
                />
              </div>
              {byokPreconditionNotice && !byokPreconditionNotice.field ? (
                <p
                  className="settings-test-status error"
                  role="alert"
                  aria-live="polite"
                  data-action={byokPreconditionNotice.action}
                >
                  {byokPreconditionNotice.message}
                </p>
              ) : null}
              {showProviderPreset ? (
                <ByokProviderPicker
                  label={t('settings.providerPreset')}
                  customProviderLabel={t('settings.customProvider')}
                  providers={protocolProviders}
                  selectedProviderIndex={selectedProviderIndex}
                  onCustomProviderSelect={() => {
                    setApiModelCustomEditing(false);
                    updateApiConfig({
                      baseUrl: '',
                      model: '',
                      apiProviderBaseUrl: null,
                    });
                  }}
                  onProviderSelect={(p) => {
                    setApiModelCustomEditing(false);
                    updateApiConfig({
                      baseUrl: p.baseUrl,
                      model: p.model,
                      apiProviderBaseUrl: p.baseUrl,
                    });
                  }}
                />
              ) : null}
              <ByokKeyField
                apiKey={cfg.apiKey}
                apiKeyConsoleLink={apiKeyConsoleLink}
                apiProtocol={apiProtocol}
                inputRef={apiKeyInputRef}
                labels={{
                  apiHint: t('settings.apiHint'),
                  apiKey: t('settings.apiKey'),
                  apiKeyCleaned: t('settings.apiKeyCleaned'),
                  apiKeyGetLink: t('settings.apiKeyGetLink', {
                    host: apiKeyConsoleLink.host,
                  }),
                  apiKeyInvalid: t('settings.apiKeyInvalid'),
                  hide: t('settings.hide'),
                  hideKey: t('settings.hideKey'),
                  required: t('settings.required'),
                  show: t('settings.show'),
                  showKey: t('settings.showKey'),
                }}
                requiresApiKey={byokRequiresApiKey}
                showApiKeyInvalid={Boolean(
                  apiKeyFieldAuthFailed ||
                    byokPreconditionNotice?.field === 'api_key' ||
                    apiKeyDraftInvalid,
                )}
                showApiKey={showApiKey}
                onBlur={onByokKeyCommit}
                onChange={(value) => updateApiConfig({ apiKey: value })}
                onFocus={() => {
                  const byokProviderId = byokProtocolToTracking(apiProtocol);
                  if (byokProviderId) {
                    trackSettingsByokFieldClick(analytics.track, {
                      page_name: 'settings',
                      area: 'configure_execution_mode_byok',
                      element: 'api_key',
                      provider_id: byokProviderId,
                      has_value: Boolean(cfg.apiKey?.trim()),
                    });
                  }
                }}
                onToggleShowApiKey={() => setShowApiKey((v) => !v)}
              />
              {showBaseUrlField ? (
                <ByokProviderBaseUrl
                  apiProtocol={apiProtocol}
                  inputRef={baseUrlInputRef}
                  baseUrl={cfg.baseUrl}
                  baseUrlError={baseUrlErrorMessage}
                  baseUrlInvalid={Boolean(baseUrlErrorMessage)}
                  baseUrlPlaceholder={baseUrlPlaceholder}
                  baseUrlReadOnly={baseUrlReadOnly}
                  labels={{
                    baseUrl: t('settings.baseUrl'),
                    required: t('settings.required'),
                    customize: t('settings.baseUrlCustomize'),
                    invalid: t('settings.baseUrlInvalid'),
                    defaultHint: t('settings.baseUrlDefaultHint'),
                    azureHint: t('settings.azureBaseUrlHint'),
                  }}
                  onBlur={commitProviderModelsInputs}
                  onChange={(value) => updateApiConfig({ baseUrl: value, apiProviderBaseUrl: null })}
                  onCustomize={() => {
                    updateApiConfig({ apiProviderBaseUrl: null });
                    window.setTimeout(() => baseUrlInputRef.current?.focus(), 0);
                  }}
                  onFocus={() => {
                    const byokProviderId = byokProtocolToTracking(apiProtocol);
                    if (byokProviderId) {
                      trackSettingsByokFieldClick(analytics.track, {
                        page_name: 'settings',
                        area: 'configure_execution_mode_byok',
                        element: 'base_url',
                        provider_id: byokProviderId,
                        has_value: Boolean(cfg.baseUrl?.trim()),
                      });
                    }
                  }}
                />
              ) : null}
              <label className="field">
                <span className="field-label">{t('settings.maxTokens')}</span>
                <input
                  type="number"
                  min={MIN_MAX_TOKENS}
                  max={MAX_MAX_TOKENS}
                  step={1}
                  placeholder={String(modelMaxTokensDefault(cfg.model))}
                  value={maxTokensInput}
                  onChange={(e) => updateMaxTokensInput(e.target.value)}
                  onBlur={() => setMaxTokensInput(cfg.maxTokens == null ? '' : String(cfg.maxTokens))}
                />
                <p className="hint">{t('settings.maxTokensHint')}</p>
              </label>
              <ByokModelField
                customActive={apiModelCustomActive}
                customInputRef={customModelInputRef}
                labels={{
                  customModel: t('settings.modelCustom'),
                  customModelLabel: apiProtocol === 'azure'
                    ? t('settings.azureCustomDeploymentName')
                    : t('settings.modelCustomLabel'),
                  customModelPlaceholder: apiProtocol === 'azure'
                    ? 'e.g. gpt-4o-production'
                    : t('settings.modelCustomPlaceholder'),
                  fetchModelsUnsupported: t('settings.fetchModelsUnsupported'),
                  model: apiProtocol === 'azure'
                    ? t('settings.azureDeploymentModel')
                    : t('settings.model'),
                  required: t('settings.required'),
                  searchPlaceholder: t('designs.searchPlaceholder'),
                  suggestedModelsHint: t('settings.suggestedModelsHint'),
                }}
                model={cfg.model}
                modelSelectRef={modelSelectRef}
                models={apiModelOptions.map((m) => ({
                  id: m.id,
                  label: apiModelOptionLabel(
                    m,
                    !hidesAccountModelSourceLabel(apiProtocol) &&
                    loadedAccountModelCount > 0
                      ? fetchedApiModelIds.has(m.id)
                        ? t('settings.modelSourceAccount')
                        : t('settings.modelSourceSuggested')
                      : undefined,
                  ),
                }))}
                modelsLoadedFromAccountMessage={
                  loadedAccountModelCount > 0
                    ? t(
                        hidesAccountModelSourceLabel(apiProtocol)
                          ? 'settings.modelsLoadedCount'
                          : 'settings.modelsLoadedFromAccount',
                        {
                          count: loadedAccountModelCount,
                        },
                      )
                    : null
                }
                providerModelsFailureMessage={providerModelsFailureMessage}
                showAzureModelFetchHint={apiProtocol === 'azure'}
                showFetchModelsUnsupportedHint={
                  apiProtocol !== 'azure' &&
                  isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)
                }
                showSuggestedModelsHint={apiProtocol !== 'azure' && !selectedProvider}
                azureModelFetchHint={t('settings.azureModelFetchHint')}
                onCustomModelChange={(value) => updateApiConfig({ model: value })}
                onCustomModelSelect={() => {
                  apiModelUserSelectedRef.current = true;
                  setApiModelCustomEditing(true);
                  updateApiConfig({ model: '' });
                }}
                onFocus={() => {
                  const byokProviderId = byokProtocolToTracking(apiProtocol);
                  if (byokProviderId) {
                    trackSettingsByokFieldClick(analytics.track, {
                      page_name: 'settings',
                      area: 'configure_execution_mode_byok',
                      element: 'model',
                      provider_id: byokProviderId,
                      has_value: Boolean(cfg.model?.trim()),
                    });
                  }
                }}
                onModelSelect={(nextValue) => {
                  apiModelUserSelectedRef.current = true;
                  setApiModelCustomEditing(false);
                  updateApiConfig({ model: nextValue });
                }}
              />
              <details className="agent-cli-env settings-memory-advanced">
                <summary className="agent-cli-env-summary">
                  <span className="agent-cli-env-summary-title">
                    {t('settings.memoryModelInlineLabel')}
                  </span>
                  <span className="settings-memory-summary-value">
                    {cfg.model.trim()
                      ? t('settings.memoryModelInlineSameAsChatWithModel', {
                          model: cfg.model.trim(),
                        })
                      : t('settings.memoryModelInlineSameAsChat')}
                  </span>
                </summary>
                <div className="agent-cli-env-body">
                  <MemoryModelInline
                    mode="api"
                    apiProtocol={apiProtocol}
                    chatApiKey={cfg.apiKey}
                    chatBaseUrl={cfg.baseUrl}
                    chatApiVersion={cfg.apiVersion ?? ''}
                    chatModel={cfg.model}
                    apiModelOptions={apiModelOptions}
                  />
                </div>
              </details>
              {apiProtocol === 'azure' ? (
                <label className="field">
                  <span className="field-label">{t('settings.apiVersion')}</span>
                  <input
                    type="text"
                    value={cfg.apiVersion ?? ''}
                    placeholder="2024-10-21"
                    onBlur={commitProviderModelsInputs}
                    onChange={(e) => updateApiConfig({ apiVersion: e.target.value.trim() })}
                  />
                </label>
              ) : null}
              {apiProtocol === 'senseaudio' || apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokImageModel')}</span>
                  <SearchableModelSelect
                    className="inline-switcher__select settings-model-select settings-model-select--byok"
                    aria-label={t('settings.byokImageModel')}
                    searchPlaceholder={t('designs.searchPlaceholder')}
                    popoverClassName="settings-byok-select-popover"
                    minSearchableOptions={Number.POSITIVE_INFINITY}
                    // Live catalogue from the shared hook: AIHubMix's image
                    // models for aihubmix, the static SenseAudio registry
                    // otherwise. The default-empty option (first entry) resolves
                    // to the registry default on the daemon side.
                    models={[
                      {
                        id: '',
                        label: byokImageModelOptions[0]?.label
                          ? `${byokImageModelOptions[0].label} (${t('settings.byokModelDefaultOption')})`
                          : t('settings.byokModelDefaultOption'),
                      },
                      ...byokImageModelOptions.map((m) => ({ id: m.id, label: m.label })),
                    ]}
                    value={cfg.byokImageModel ?? ''}
                    onChange={(value) =>
                      updateApiConfig({ byokImageModel: value })
                    }
                  />
                </label>
              ) : null}
              {apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokVideoModel')}</span>
                  <select
                    value={cfg.byokVideoModel ?? ''}
                    onChange={(e) =>
                      updateApiConfig({ byokVideoModel: e.target.value })
                    }
                  >
                    {/* Empty resolves to the default video model on the daemon
                        side. The LLM can still override per-call via the tool's
                        `model` arg. */}
                    <option value="">
                      {byokVideoModelOptions[0]?.label
                        ? `${byokVideoModelOptions[0].label} (${t('settings.byokModelDefaultOption')})`
                        : t('settings.byokModelDefaultOption')}
                    </option>
                    {byokVideoModelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokSpeechModel')}</span>
                  <select
                    value={cfg.byokSpeechModel ?? ''}
                    onChange={(e) => updateApiConfig({ byokSpeechModel: e.target.value })}
                  >
                    <option value="">
                      {byokSpeechModelOptions[0]?.label
                        ? `${byokSpeechModelOptions[0].label} (${t('settings.byokModelDefaultOption')})`
                        : t('settings.byokModelDefaultOption')}
                    </option>
                    {byokSpeechModelOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {apiProtocol === 'aihubmix' ? (
                <label className="field">
                  <span className="field-label">{t('settings.byokSpeechVoice')}</span>
                  <select
                    value={cfg.byokSpeechVoice ?? ''}
                    onChange={(e) => updateApiConfig({ byokSpeechVoice: e.target.value })}
                  >
                    <option value="">alloy (default)</option>
                    {['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>
          )}
            </>
          ) : null}

          {activeSection === 'media' ? (
            <MediaProvidersSection
              cfg={cfg}
              setCfg={setCfg}
              mediaProvidersNotice={mediaProvidersNotice}
              onReloadMediaProviders={onReloadMediaProviders}
              pendingLocalProviderIds={pendingMediaProviderEditIds}
              onChange={(providerId) => {
                mediaProvidersChangeVersionRef.current += 1;
                setPendingMediaProviderEditIds((current) => {
                  if (current.has(providerId)) return current;
                  const next = new Set(current);
                  next.add(providerId);
                  return next;
                });
              }}
            />
          ) : null}
          {activeSection === 'integrations' ? <IntegrationsSection /> : null}

          {activeSection === 'mcpClient' ? <McpClientSection surface="settings" /> : null}

          {activeSection === 'composio' ? (
            <ConnectorSection
              cfg={cfg}
              setCfg={setCfg}
              composioConfigLoading={composioConfigLoading}
              onPersistComposioKey={onPersistComposioKey}
              onConnectorAuthResult={({ connectorId, action, result, errorCode }) =>
                trackSettingsConnectorAuthResult(analytics.track, {
                  page_name: 'settings',
                  area: 'connectors',
                  connector_id: connectorId,
                  action,
                  result,
                  ...(errorCode ? { error_code: errorCode } : {}),
                })
              }
            />
          ) : null}

          {activeSection === 'routines' ? <RoutinesSection onClose={onClose} /> : null}

          {activeSection === 'orbit' ? (
            <OrbitSection
              cfg={cfg}
              setCfg={setCfg}
              composioApiKeyConfigured={Boolean(cfg.composio?.apiKeyConfigured)}
              daemonMediaProviders={daemonMediaProviders}
              daemonMediaProvidersFetchState={daemonMediaProvidersFetchState}
              onOpenComposioSection={() => setActiveSection('composio')}
              onLeaveForOrbitProject={(runConfig) => {
                // Persist any in-flight Orbit edits (toggle / time) before
                // navigating away so they aren't silently lost. The autosave
                // loop is best-effort; this synchronous flush guarantees the
                // run-config landed on the daemon before we tear the dialog
                // down. Closing the dialog drops the user on the
                // /projects/orbit view where the agent run streams in.
                void onPersist(runConfig);
                onClose();
              }}
            />
          ) : null}

          {activeSection === 'language' ? <LanguageSection /> : null}

          {activeSection === 'appearance' ? (
            <AppearanceSection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'critiqueTheater' ? (
            <CritiqueTheaterSection />
          ) : null}

          {activeSection === 'notifications' ? (
            <NotificationsSection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'pet' ? (
            <PetSettings cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'designSystems' ? (
            <DesignSystemsSection
              cfg={cfg}
              setCfg={setCfg}
              onDesignSystemsChanged={onDesignSystemsChanged}
              onDesignSystemImportRebuildJob={onDesignSystemImportRebuildJob}
            />
          ) : null}

          {activeSection === 'projectLocations' ? (
            <ProjectLocationsSection cfg={cfg} setCfg={setCfg} onProjectsRefresh={onProjectsRefresh} />
          ) : null}

          {activeSection === 'instructions' ? (
            <InstructionsSection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'memory' ? (
            <MemorySection
              onOpenConnectors={() => setActiveSection('composio')}
              chatAgentId={cfg.mode === 'daemon' ? cfg.agentId ?? null : null}
              chatModel={selectedMemoryChatModel}
            />
          ) : null}

          {activeSection === 'privacy' ? (
            <PrivacySection cfg={cfg} setCfg={setCfg} />
          ) : null}

          {activeSection === 'about' ? (
            <AboutSection appVersionInfo={appVersionInfo} about={about} />
          ) : null}
          {about.toast ? (
            <Toast
              message={about.toast}
              onDismiss={about.dismissToast}
            />
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
