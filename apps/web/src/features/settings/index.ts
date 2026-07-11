// Public API of the settings slice. Consumers outside the slice (the
// SettingsDialog orchestrator, and the model-switcher/entry surfaces that share
// its provider-model cache) import ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the settings-slice boundary,
// and `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import
// that reaches past it (ADR 0002).

// Pure provider-model cache rules + the cache view-model type. These are shared
// across the settings/BYOK surfaces, AvatarMenu, InlineModelSwitcher, and
// EntryShell, which previously reached them through a re-export leaked out of
// SettingsDialog; they now resolve through this barrel.
export { mergeProviderModelOptions, providerModelsCacheKey } from './rules';
export type { ProviderModelsCache } from './types';

// Composio credential-state rule + the connectors section it powers. The
// SettingsDialog orchestrator and the standalone IntegrationsView both mount
// ConnectorSection through this barrel instead of reaching a component that
// used to live inside the SettingsDialog god-file.
export { deriveComposioCredentialState } from './rules';
export type { ComposioCredentialState } from './types';
export { ConnectorSection } from './components/ConnectorSection';

// Orbit automation section + its pure rules. Its transport
// (`persistConfigAndRunOrbit`, `fetchOrbitStatus`) lives in `providers/orbit`
// directly — outside `features/**` a provider is reachable without going
// through a slice barrel, and the SettingsDialog orchestrator imports it from
// there for its backward-compatible re-export.
export { configForManualOrbitRun, isOrbitRunDisabled } from './rules';
export { OrbitSection } from './components/OrbitSection';

// Media-providers section. Its reload transport is an injected caller
// callback (no port); the only owned transport is the reload-notice
// auto-dismiss timer bridge in `providers/media-providers`.
export { MediaProvidersSection } from './components/MediaProvidersSection';

// Integrations section: the per-client MCP install snippet + the Codex
// one-click install toggle it nests. Transport lives in `providers/mcp`
// (install-info fetch, Codex probe/install/uninstall) alongside the
// pre-existing MCP OAuth/server adapters; the picker-dismiss and
// copy-reset/deeplink browser bridges live in `providers/mcp/install-bridge`.
export { IntegrationsSection } from './components/IntegrationsSection';

// Notifications section: the completion sound toggle/pickers, the desktop
// notification permission flow, and the test-notification action. Its
// business logic reaches the browser Notification/Web Audio APIs through
// `utils/notifications` directly (a synchronous browser call, not the
// transport/DOM subscription the guard's port-binding rule targets); the
// section component layers analytics tracking on top of the hook's actions.
export { NotificationsSection } from './components/NotificationsSection';

// Appearance section: the theme segmented control + accent-color swatch
// picker, with the live-preview document effect. Reaches `state/appearance`
// directly (a synchronous document-mutation helper, not the transport/DOM
// subscription the guard's port-binding rule targets); the section component
// layers analytics tracking on top of the hook's actions.
export { AppearanceSection } from './components/AppearanceSection';

// Critique Theater rollout toggle. Reaches `components/Theater`'s
// useCritiqueTheaterEnabled/setCritiqueTheaterEnabled directly (that pair
// already encapsulates the browser localStorage read/write + the
// daemon-side project-metadata PATCH); the section component layers
// analytics tracking on top of the hook's action.
export { CritiqueTheaterSection } from './components/CritiqueTheaterSection';

// Execution mode (BYOK provider config / local-CLI agent picker / AMR wallet)
// pure rules + data. This is the largest remaining cluster of the
// SettingsDialog decomposition: the JSX/state still live in the
// orchestrator, but every pure derivation moved here so the orchestrator's
// handlers and effects call through the barrel instead of declaring these
// locally. Types are defined in-slice per ADR 0002.
export {
  agentRefreshOptionsForConfig,
  amrWalletValueLabel,
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
  currentApiProtocolConfig,
  defaultApiProtocolConfig,
  deriveAboutUpdateControl,
  displayAgentName,
  hidesAccountModelSourceLabel,
  isProviderModelDiscoveryUnsupported,
  isValidApiBaseUrl,
  missingByokConnectionFields,
  missingByokModelFetchFields,
  nextApiProtocolConfig,
  persistByokProviderConfigDraft,
  providerConnectionTestKey,
  providerFamilyLabel,
  reconcileAmrModelChoice,
  reconcileAmrProfileEnv,
  sanitizeHttpsUrl,
  sanitizeSettingsSavePayload,
  shouldEnableSettingsSave,
  shouldShowCustomModelInput,
  siblingProviderForProtocol,
  switchApiProtocolConfig,
  testStatusVariant,
  apiModelOptionLabel,
  updateAgentCliEnvValue,
  updateCurrentApiProtocolConfig,
} from './rules';
export type {
  AboutUpdateControl,
  AgentRefreshOptions,
  ByokFieldMissing,
  ByokFirstPartyBaseUrlHint,
  ByokRequiredField,
  SettingsSection,
} from './types';

// AMR account cluster (vela sign-in status + wallet-balance card) of the
// execution-mode section. `formatAmrWalletBalance` is the locale-aware
// currency formatter the card renders; `useWiredAmrAccount` owns the
// status/wallet state + its window-resync/login-status-event bridges.
export { formatAmrWalletBalance } from './rules';
export { useWiredAmrAccount } from './hooks/useAmrAccount.hooks';
export type { AmrAccountController, AmrAccountInput } from './hooks/useAmrAccount.hooks';
export type { AmrAgentPresence, AmrLoginStatus } from './types';
export {
  ACCOUNT_MODEL_SOURCE_LABEL_HIDDEN,
  AGENT_CLI_AUTH_ENV_KEYS,
  AGENT_CLI_BASE_URL_ENV_KEYS,
  AGENT_CLI_ENV_FIELDS,
  AGENT_SHORT_DESCRIPTIONS,
  AMR_PROFILE_AGENT_ID,
  AMR_PROFILE_ENV_KEY,
  AMR_SIGN_IN_RESCAN_ATTEMPTS,
  AMR_SIGN_IN_RESCAN_RETRY_MS,
  API_KEY_CONSOLE_LINKS,
  OPEN_DESIGN_RELEASES_URL,
} from './constants';

// About section: app-version/updater status row, diagnostics export, and
// reset-onboarding. The updater subscription/actions reach `lib/updater`
// directly (a host bridge, not a `providers/` route); only the release-notes
// external-URL open goes through the injected `AboutPort`. The orchestrator
// calls `useWiredAbout` itself (not the dumb `AboutSection`) so the toast
// survives a section switch, mirroring the original `<Toast>` placement
// outside the section's conditional block.
export { AboutSection } from './components/AboutSection';
export { useWiredAbout } from './hooks/useAbout.hooks';
export type { AboutController, AboutInput } from './hooks/useAbout.hooks';

// Language section: the locale picker grid. `locale`/`setLocale` are
// app-wide state already owned by `I18nProvider`; the feature-local hook's
// only job is layering the picker's analytics tracking on top.
export { LanguageSection } from './components/LanguageSection';

// Custom-instructions section: a single free-text field on `cfg.customInstructions`.
export { InstructionsSection } from './components/InstructionsSection';
