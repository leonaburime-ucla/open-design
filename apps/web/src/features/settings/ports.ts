// Ports the settings slice depends on. Each interface is the boundary a
// cluster's hook is injected with; `dependencies.ts` (the only feature file
// allowed to import `providers/`) binds the real transport to it (ADR 0002).
import type {
  AmrWalletSnapshot,
  ConnectorDetail,
  ProjectLocation,
  ScanProjectLocationsResponse,
  UpdateProjectLocationsRequest,
} from '@open-design/contracts';
import type {
  AgentTestRequest,
  AppConfig,
  ConnectionTestResponse,
  OrbitRunStartResponse,
  OrbitStatusResponse,
  ProviderModelsRequest,
  ProviderModelsResponse,
  ProviderTestRequest,
  SkillSummary,
} from '../../types';
import type { AmrLoginStatus, AmrLoginStatusEventReason, CodexInstallStatus, McpInstallInfo } from './types';

/** Transport the Orbit automation section depends on. */
export interface OrbitPort {
  /** `GET /api/orbit/status`. Resolves `null` on failure — see the provider. */
  fetchStatus: () => Promise<OrbitStatusResponse | null>;
  /** The design-templates registry, unfiltered; the caller selects `scenario === 'orbit'`. */
  fetchTemplates: () => Promise<SkillSummary[]>;
  /** The connector catalogue, used to gate Orbit on "at least one connected integration". */
  fetchConnectors: () => Promise<ConnectorDetail[]>;
  /** Persist the given config to the daemon, then trigger a manual Orbit run. */
  runOrbit: (
    config: AppConfig,
    options?: {
      daemonProviders?: AppConfig['mediaProviders'] | null;
      syncMediaProviders?: boolean;
      locale?: string | null;
    },
  ) => Promise<OrbitRunStartResponse>;
  /** Poll on a fixed interval while a run is in flight. Returns unsubscribe. */
  subscribeStatusPolling: (onTick: () => void) => () => void;
  /** Re-check the connector count when the window regains focus. Returns unsubscribe. */
  subscribeWindowFocus: (onFocus: () => void) => () => void;
  /** Run a callback once after a delay (the "Copied" flash reset). Returns cancel. */
  scheduleTimeout: (onTimeout: () => void, delayMs: number) => () => void;
}

/** Browser-subscription bridge the media-providers section depends on. All of
 *  its actual data transport (`onReloadMediaProviders`) is injected as a
 *  caller callback rather than owned by this port — the section itself
 *  fetches nothing. */
export interface MediaProvidersPort {
  /** Auto-dismiss the reload-success notice after a delay. Returns cancel. */
  scheduleReloadNoticeTimeout: (onTimeout: () => void, delayMs: number) => () => void;
}

/** Transport the Integrations (MCP install snippet) section depends on. */
export interface IntegrationsPort {
  /** `GET /api/mcp/install-info`. Throws on a non-2xx response or transport failure. */
  fetchInstallInfo: () => Promise<McpInstallInfo>;
  /** `GET /api/mcp/install/codex/status`. Resolves `null` on failure — see the provider. */
  fetchCodexStatus: () => Promise<CodexInstallStatus | null>;
  /** `POST /api/mcp/install/codex`. Throws with the daemon's error message on failure. */
  installCodex: () => Promise<void>;
  /** `DELETE /api/mcp/install/codex`. Throws with the daemon's error message on failure. */
  uninstallCodex: () => Promise<void>;
  /** Auto-dismiss the "Copied" badge after a delay. Returns cancel. */
  scheduleCopyResetTimeout: (onTimeout: () => void, delayMs: number) => () => void;
  /** Close the client picker on outside click or Escape. Returns unsubscribe. */
  subscribePickerDismiss: (getContainer: () => HTMLElement | null, onClose: () => void) => () => void;
  /** Open a client deeplink (Cursor's one-click install) via a hidden anchor click. */
  openDeeplink: (url: string) => void;
}

/** Transport the About section depends on for the "View release notes" link.
 *  The updater status subscription/actions themselves reach `../../lib/updater`
 *  directly (a host-bridge module, not a `providers/` transport route) — only
 *  the registry's external-URL opener needs a port binding. */
export interface AboutPort {
  /** Open a URL in the system browser (desktop) or a new tab (web). */
  openExternalUrl: (url: string) => void;
}

/** Browser-subscription bridge the BYOK field-focus/precondition-notice
 *  cluster of the execution-mode section depends on. It owns no data
 *  transport of its own — only the deferred-focus timer. */
export interface ByokFieldFocusPort {
  /** Run `onFocus` once after `delayMs`, so the precondition notice renders
   *  before focus moves to the offending field. Returns cancel. */
  scheduleFocusTimeout: (onFocus: () => void, delayMs: number) => () => void;
}

/** Transport the AMR account cluster (execution mode's vela sign-in/wallet
 *  card) depends on. */
export interface AmrAccountPort {
  /** `GET /api/integrations/vela/status`. Resolves `null` on failure. */
  fetchLoginStatus: () => Promise<AmrLoginStatus | null>;
  /** `GET /api/integrations/vela/wallet`. Resolves `null` on failure. */
  fetchWalletSnapshot: (options?: { refresh?: boolean }) => Promise<AmrWalletSnapshot | null>;
  /** Re-check on window focus / tab visibility. Returns unsubscribe. */
  subscribeWindowResync: (onResync: () => void) => () => void;
  /** The cross-component `od:amr-login-status-change` signal (login started
   *  elsewhere, e.g. `AmrLoginPill`/`InlineModelSwitcher`). Returns unsubscribe. */
  subscribeLoginStatusEvent: (onEvent: (reason: AmrLoginStatusEventReason) => void) => () => void;
}

/** Transport the BYOK connection-test cluster of the execution-mode section
 *  depends on: the provider connection test request itself (mirroring
 *  `DaemonAgentPort.testAgent`'s shape) plus the debounced auto-test's timer
 *  bridge. */
export interface ByokConnectionTestPort {
  /** `POST /api/test/connection` (mode: 'provider'). Aborts via the given signal. */
  testProvider: (input: ProviderTestRequest, signal: AbortSignal) => Promise<ConnectionTestResponse>;
  /** Run `onTimeout` once after `delayMs` for the debounced auto-test.
   *  Returns cancel. */
  scheduleAutoTestTimeout: (onTimeout: () => void, delayMs: number) => () => void;
}

/** Transport the BYOK model-discovery cluster of the execution-mode section
 *  depends on: the provider account-model list request itself plus the
 *  debounced auto-fetch's timer bridge. Mirrors `ByokConnectionTestPort`'s
 *  shape. */
export interface ByokModelDiscoveryPort {
  /** `POST /api/provider/models`. Aborts via the given signal. */
  fetchModels: (input: ProviderModelsRequest, signal: AbortSignal) => Promise<ProviderModelsResponse>;
  /** Run `onTimeout` once after `delayMs` for the debounced auto-fetch.
   *  Returns cancel. */
  scheduleAutoFetchTimeout: (onTimeout: () => void, delayMs: number) => () => void;
}

/** Transport the local-CLI agent list cluster (rescan / connection test /
 *  install-doc links) of the execution-mode section depends on. */
export interface DaemonAgentPort {
  /** `POST /api/test/connection` (mode: 'agent'). Aborts via the given signal. */
  testAgent: (input: AgentTestRequest, signal: AbortSignal) => Promise<ConnectionTestResponse>;
  /** Open a URL in the system browser (desktop) or a new tab (web) — used for
   *  agent docs/install links and the AMR-attributed install URL. */
  openExternalUrl: (url: string) => void;
  /** Auto-dismiss the "Rescan agents" success/error notice after a delay.
   *  Returns cancel. */
  scheduleRescanNoticeTimeout: (onTimeout: () => void, delayMs: number) => () => void;
  /** Notify when the user returns to the Settings tab (window focus / tab
   *  visibility), so a pending post-install rescan can fire. Returns
   *  unsubscribe. */
  subscribeInstallReturn: (onReturn: () => void) => () => void;
  /** Whether to surface an "Upgrade" affordance for the AMR card's plan tier.
   *  Pure, but lives in `providers/daemon` alongside the rest of the vela
   *  account helpers, so it is reached through the port like the rest of
   *  this cluster's transport rather than imported directly. */
  canUpgradeVelaPlan: (plan?: string | null) => boolean;
  /** Fixed `$X.XX` formatting for the AMR card's plan-status balance. */
  formatVelaBalanceUsd: (raw?: string | null) => string | null;
}

/** Timer bridge the autosave loop depends on. It owns no data transport of
 *  its own — persistence goes through the caller-injected `onPersist` — only
 *  the debounced-save / "Saved" flash / media-provider-sync-retry timers. */
export interface AutosavePort {
  /** Run `onTimeout` once after `delayMs`. Returns cancel. Reused for all
   *  three of the loop's timers (debounce, saved-flash, retry) — they are
   *  functionally identical, mirroring `OrbitPort.scheduleTimeout`. */
  scheduleTimeout: (onTimeout: () => void, delayMs: number) => () => void;
}

/** Transport the Project Locations section depends on. */
export interface ProjectLocationsPort {
  /** `GET /api/project-locations`. Resolves `[]` on failure — see the provider. */
  fetchLocations: () => Promise<ProjectLocation[]>;
  /** `PUT /api/project-locations`. Resolves `null` on failure. */
  updateLocations: (
    locations: UpdateProjectLocationsRequest['locations'],
  ) => Promise<ProjectLocation[] | null>;
  /** `POST /api/project-locations/scan`. Resolves `null` on failure. */
  scanLocations: () => Promise<ScanProjectLocationsResponse | null>;
  /** `POST /api/dialog/open-folder`. Resolves `null` when canceled or on failure. */
  openFolderDialog: () => Promise<string | null>;
}
