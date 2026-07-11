import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { VisuallyHidden } from '@open-design/components';
import {
  agentIdToTracking,
  byokProtocolToTracking,
  executionModeToTracking,
  settingsSectionToTracking,
} from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import { recordAmrEntry } from '../analytics/amr-attribution';
import {
  trackSettingsByokModelsFetchResult,
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
import {
  canUpgradeVelaPlan,
  formatVelaBalanceUsd,
  type VelaLoginStatus,
} from '../providers/daemon';
import {
  amrPlansUrlForProfile,
  amrProfileBadgeLabel,
} from '../runtime/amr-guidance';
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
  agentModelOptionLabel,
  AGENT_CLI_AUTH_ENV_KEYS,
  AGENT_CLI_BASE_URL_ENV_KEYS,
  AGENT_CLI_ENV_FIELDS,
  AGENT_SHORT_DESCRIPTIONS,
  amrWalletValueLabel,
  AMR_PROFILE_AGENT_ID,
  AMR_PROFILE_ENV_KEY,
  apiModelOptionLabel,
  API_KEY_CONSOLE_LINKS,
  AboutSection,
  AppearanceSection,
  applyApiProtocolConfig,
  buildByokProviderOptions,
  byokDraftBaseUrlHost,
  byokErrorKindFromIssues,
  byokFieldMissingFromIssues,
  byokFirstPartyBaseUrlHint,
  byokProviderDraftKey,
  byokProviderKeyForConfig,
  ByokProviderChips,
  canFetchProviderModels,
  canRunProviderConnectionTest,
  cleanAgentVersionLabel,
  codexPathRepairState,
  codexPathStrings,
  ConnectorSection,
  configForManualOrbitRun,
  currentApiProtocolConfig,
  CritiqueTheaterSection,
  customByokProviderPreset,
  defaultApiProtocolConfig,
  displayAgentName,
  formatConnectionTestMessage,
  hidesAccountModelSourceLabel,
  InstructionsSection,
  IntegrationsSection,
  isByokProviderConfigured,
  isOrbitRunDisabled,
  isProviderModelDiscoveryUnsupported,
  isValidApiBaseUrl,
  LanguageSection,
  LocalCliSection,
  MediaProvidersSection,
  mergeProviderModelOptions,
  missingByokConnectionFields,
  missingByokModelFetchFields,
  NotificationsSection,
  OrbitSection,
  persistByokProviderConfigDraft,
  PrivacySection,
  ProjectLocationsSection,
  providerFamilyLabel,
  providerModelsCacheKey,
  reconcileAmrModelChoice,
  reconcileAmrProfileEnv,
  sanitizeHttpsUrl,
  sanitizeSettingsSavePayload,
  selectByokProvider,
  shouldEnableSettingsSave,
  shouldShowCustomModelInput,
  siblingProviderForProtocol,
  switchApiProtocolConfig,
  testStatusVariant,
  updateAgentCliEnvValue,
  updateCurrentApiProtocolConfig,
  useAmrHighlight,
  useWiredAbout,
  useWiredAmrAccount,
  useWiredByokConnectionTest,
  useWiredByokFieldFocus,
  useWiredDaemonAgents,
  formatAmrWalletBalance,
  type AgentRefreshOptions,
  type ByokFieldMissing,
  type ByokFirstPartyBaseUrlHint,
  type ByokProviderPreset,
  type ByokRequiredField,
  type ProviderModelsCache,
  type RescanNotice,
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
  ProviderModelsResponse,
} from '../types';
import { fetchProviderModels } from '../providers/provider-models';
import { openExternalUrl } from '../providers/registry';
import { useByokImageModelOptions, useByokVideoModelOptions, useByokSpeechModelOptions } from '../media/aihubmix-image-models';
import { isVisualStabilityMode } from '../utils/visualStability';
import { byokProviderRequiresApiKey } from '../utils/byokProvider';
import { Toast } from './Toast';
import { PetSettings } from './pet/PetSettings';
import { McpClientSection } from './McpClientSection';
import { DesignSystemsSection } from './DesignSystemsSection';
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
  blockingByokDraftIssues,
  cleanByokApiKey,
  resolveByokModelPreference,
  validateByokDraft,
  type ByokDraftField,
} from './byok/validation';
import {
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
  resolveAccentColor,
} from '../state/appearance';
import { isAutosaveDraftOnlyChange } from '../App';

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
  const apiProtocol = cfg.apiProtocol ?? 'anthropic';
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
  const {
    amrCardRef,
    amrHighlightActive,
    amrCoachmarkArmed,
    amrCoachmarkDismissed,
    dismissCoachmark,
  } = useAmrHighlight({ initialHighlight, activeSection });
  const [hoveredAgentCardId, setHoveredAgentCardId] = useState<string | null>(null);

  const {
    amrCardStatus,
    setAmrCardStatus,
    amrCardStatusReady,
    amrWalletSnapshot,
    amrWalletReady,
    refreshAmrWalletSnapshot,
  } = useWiredAmrAccount({
    agents,
    onAmrLoginStatusChange,
    onAmrAgentUnavailable: () => setHoveredAgentCardId(null),
  });

  const {
    apiKeyInputRef,
    baseUrlInputRef,
    modelSelectRef,
    customModelInputRef,
    byokPreconditionNotice,
    setByokPreconditionNotice,
    focusByokRequiredField,
    showByokDraftValidationNotice,
  } = useWiredByokFieldFocus({ apiProtocol, t });
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
  const providerModelsAbortRef = useRef<AbortController | null>(null);
  const providerModelsRevisionRef = useRef(0);
  const providerModelsFirstResetRef = useRef(true);
  const providerModelsSkipNextResetRef = useRef(false);
  const deferAfterKeyCleanRef = useRef(false);
  const focusByokRequiredFieldAfterProtocolSwitchRef = useRef(false);
  const visualStabilityMode = isVisualStabilityMode();
  // Tracks whether the current BYOK model value came from an explicit user
  // pick (combobox selection or custom entry) rather than an auto-populated
  // provider preset. The account-model auto-switch must never overwrite a
  // deliberate choice, even when that choice equals the provider preset id.
  const apiModelUserSelectedRef = useRef(false);
  const [apiModelCustomEditing, setApiModelCustomEditing] = useState(false);
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
  // Releasing the abort controller on unmount avoids the "setState after
  // unmount" warning if the dialog closes while a model-fetch is still
  // running. The connection-test cluster's own abort controller is released
  // by an equivalent unmount effect inside `useByokConnectionTest`.
  useEffect(() => {
    return () => {
      providerModelsAbortRef.current?.abort();
    };
  }, []);

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
  // Local-CLI agent list cluster (rescan / connection test / docs-install
  // links, including the post-AMR-sign-in model-catalog chase) — moved to
  // the settings slice's `useWiredDaemonAgents` hook; its transport reaches
  // only the injected `DaemonAgentPort` (ADR 0002).
  const {
    agentRescanRunning,
    agentRescanNotice,
    agentTestState,
    setAgentTestState,
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
    selectAgent,
    openAmrUpgrade,
    canUpgradeVelaPlan,
    formatVelaBalanceUsd,
    applyCodexDetectedPath,
    clearCodexCustomPath,
    onAgentModelChange,
    onAgentModelCustomTextChange,
    onAgentReasoningChange,
  } = useWiredDaemonAgents({
    cfg,
    setCfg,
    agents,
    agentsLoading,
    onRefreshAgents,
    amrLoggedIn: amrCardStatus?.loggedIn === true,
  });

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

  const apiKeyConsoleLink = API_KEY_CONSOLE_LINKS[apiProtocol];
  const customByokProvider = customByokProviderPreset(t, apiProtocol, cfg.baseUrl, cfg.model);
  const byokProviderOptions = buildByokProviderOptions(customByokProvider);
  const selectedByokProvider = selectByokProvider(
    byokProviderOptions,
    cfg,
    apiProtocol,
    customByokProvider,
  );
  const baseUrlValid = isValidApiBaseUrl(cfg.baseUrl);
  const baseUrlInvalid = Boolean(cfg.baseUrl.trim() && !baseUrlValid);
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
  const byokProviderConfigured = (provider: ByokProviderPreset): boolean =>
    isByokProviderConfigured(provider, cfg, {
      byokRequiresApiKey,
      selectedByokProviderId: selectedByokProvider?.id,
    });
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
  // BYOK connection-test cluster: the "Test connection" state machine + its
  // debounced auto-test. Called here (rather than up near the other
  // execution-mode hooks) because it needs `byokDraftValidation`/
  // `byokFirstPartyBaseUrl`, which are still-inline derived-config values
  // computed just above (SKILL.md's "hook call site moves later in the
  // render" note — safe because nothing before this point reads the
  // controller it returns).
  const { providerTestState, handleTestProvider, handleAutoTestProvider } =
    useWiredByokConnectionTest({
      apiProtocol,
      cfg,
      t,
      track: analytics.track,
      byokDraftValidation,
      byokFirstPartyBaseUrl,
      visualStabilityMode,
      focusByokRequiredField,
      setByokPreconditionNotice,
      showByokDraftValidationNotice,
    });
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
                <ByokProviderChips
                  ariaLabel={t('settings.protocolAria')}
                  options={byokProviderOptions}
                  selectedId={selectedByokProvider?.id}
                  isConfigured={byokProviderConfigured}
                  configuredLabel={t('settings.mediaProviderConfigured')}
                  unsetLabel={t('settings.mediaProviderUnset')}
                  onSelect={(provider, active) => {
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
                />
              ) : null}
          {cfg.mode === 'daemon' ? (
            <LocalCliSection
              cfg={cfg}
              setCfg={setCfg}
              agents={agents}
              apiProtocol={apiProtocol}
              locale={locale}
              amrAccount={{
                amrCardStatus,
                setAmrCardStatus,
                amrCardStatusReady,
                amrWalletSnapshot,
                amrWalletReady,
                refreshAmrWalletSnapshot,
              }}
              amrHighlight={{
                amrCardRef,
                amrHighlightActive,
                amrCoachmarkArmed,
                amrCoachmarkDismissed,
                dismissCoachmark,
              }}
              daemonAgents={{
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
                selectAgent,
                openAmrUpgrade,
                canUpgradeVelaPlan,
                formatVelaBalanceUsd,
                applyCodexDetectedPath,
                clearCodexCustomPath,
                onAgentModelChange,
                onAgentModelCustomTextChange,
                onAgentReasoningChange,
              }}
              hoveredAgentCardId={hoveredAgentCardId}
              setHoveredAgentCardId={setHoveredAgentCardId}
            />
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
                  renderTestMessage={(result) =>
                    formatConnectionTestMessage(result, 'api', {
                      agentId: cfg.agentId,
                      model: cfg.model,
                      locale,
                      t,
                    })
                  }
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
