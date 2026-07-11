// Pure rules for the settings slice: provider-model cache keying/merging, the
// Composio credential-state derivation, the Orbit automation section's
// business logic (template selection, last-run resolution, meter/gate
// derivation), and the media-providers section's catalogue sort/row-state
// derivation. No React, no transport, no DOM, so they test against
// `../../types`/`@open-design/contracts` with zero doubles (ADR 0002).
import type { AmrWalletSnapshot, ConnectorDetail } from '@open-design/contracts';
import { validateBaseUrl } from '@open-design/contracts/api/connectionTest';
import { useT } from '../../i18n';
import type { Locale } from '../../i18n';
import {
  DEFAULT_ORBIT,
  isStoredMediaProviderEntryPresent,
  KNOWN_PROVIDERS,
} from '../../state/config';
import type { KnownProvider } from '../../state/config';
import { resolveFixedOriginBaseUrl } from '../../state/apiProtocols';
import type { MediaProvider } from '../../media/models';
import type {
  AgentInfo,
  AgentModelChoice,
  ApiProtocol,
  ApiProtocolConfig,
  AppConfig,
  AppVersionInfo,
  ConnectionTestResponse,
  MediaProviderCredentials,
  OrbitRunSummary,
  OrbitStatusResponse,
  ProviderModelOption,
  ProviderModelsResponse,
  SkillSummary,
} from '../../types';
import type { CompletionNotificationResult } from '../../utils/notifications';
import type { UpdaterModel } from '../../lib/updater';
import type { ByokDraftIssue } from '../../components/byok/validation';
import type {
  AboutUpdateControl,
  AgentRefreshOptions,
  ByokFieldMissing,
  ByokFirstPartyBaseUrlHint,
  ByokRequiredField,
  ComposioCredentialState,
  MediaProviderRowState,
  McpClient,
  McpInstallInfo,
  McpStdioServerConfig,
  NotificationSoundTrackingId,
  NotificationTestStatusKey,
  OrbitConfigGateCopyKeys,
  OrbitMeterSegments,
  SettingsSection,
} from './types';
import {
  ACCOUNT_MODEL_SOURCE_LABEL_HIDDEN,
  AGENT_CLI_AUTH_ENV_KEYS,
  AGENT_CLI_BASE_URL_ENV_KEYS,
  AMR_PROFILE_AGENT_ID,
  AMR_PROFILE_ENV_KEY,
} from './constants';

type Translate = ReturnType<typeof useT>;

/**
 * FNV-1a fingerprint of a secret. Only the length + hash leave this module, so a
 * provider's API key can key the model cache without the raw secret ever
 * appearing in a cache key.
 */
function fingerprintSecret(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * The cache key for a provider's discovered models: protocol + normalized base
 * URL + fingerprinted API key (+ Azure api-version when it matters). Identical
 * credentials collapse to the same key so a discovery fetch is reused; a changed
 * secret invalidates it.
 */
export function providerModelsCacheKey(
  protocol: ApiProtocol,
  baseUrl: string,
  apiKey: string,
  apiVersion = '',
): string {
  return [
    protocol,
    baseUrl.trim().replace(/\/+$/, ''),
    fingerprintSecret(apiKey.trim()),
    protocol === 'azure' ? apiVersion.trim() : '',
  ].join('\n');
}

/**
 * Merge freshly-fetched provider models with the protocol's suggested model ids
 * into one de-duplicated option list, fetched models first. Empty/duplicate ids
 * are dropped and each label falls back to its id.
 */
export function mergeProviderModelOptions(
  fetchedModels: readonly ProviderModelOption[],
  suggestedModelIds: readonly string[],
): ProviderModelOption[] {
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];
  const add = (model: ProviderModelOption) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: model.label.trim() || id });
  };
  for (const model of fetchedModels) add(model);
  for (const id of suggestedModelIds) add({ id, label: id });
  return out;
}

/**
 * Derive the Composio credential lifecycle state from the stored config. A saved
 * key with a fresh draft is `saved-pending`; a saved key alone is `saved`; a
 * draft with nothing saved is `pending-new`; otherwise `empty`.
 */
export function deriveComposioCredentialState(
  composio: { apiKey?: string; apiKeyConfigured?: boolean } | null | undefined,
): ComposioCredentialState {
  const hasPendingEdit = Boolean(composio?.apiKey?.trim());
  const hasSavedKey = Boolean(composio?.apiKeyConfigured);
  if (hasSavedKey && hasPendingEdit) return 'saved-pending';
  if (hasSavedKey) return 'saved';
  if (hasPendingEdit) return 'pending-new';
  return 'empty';
}

// ---------------------------------------------------------------------------
// Orbit automation section
// ---------------------------------------------------------------------------

/**
 * Coalesce the config's saved template id to the built-in default. The Orbit
 * template select no longer offers a "no template" option, so a legacy config
 * that stored `null`/`''` is presented as if it were on the default.
 */
export function configForManualOrbitRun(config: AppConfig): AppConfig {
  const effectiveTemplateSkillId = config.orbit?.templateSkillId || DEFAULT_ORBIT.templateSkillId || '';
  if (!effectiveTemplateSkillId) return config;
  return {
    ...config,
    orbit: {
      ...(config.orbit ?? DEFAULT_ORBIT),
      templateSkillId: effectiveTemplateSkillId,
    },
  };
}

/** Disable the Orbit "Run it now" CTA while busy or with no connected integration. */
export function isOrbitRunDisabled(isBusy: boolean, connectedCount: number | null): boolean {
  return isBusy || connectedCount === null || connectedCount === 0;
}

/**
 * Relative "N minutes/hours/days ago" label for an ISO timestamp, `null` for
 * an unparsable/missing input. `now` is read at call time (matching the prior
 * inline implementation) rather than injected, since this is a display-only
 * formatter re-evaluated on each render.
 */
export function formatOrbitRelativeTime(
  iso: string | undefined | null,
  t: Translate,
): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  const absMin = Math.round(Math.abs(diffMs) / 60_000);
  if (absMin < 1) return t('common.justNow');
  if (absMin < 60) return t('common.minutesAgo', { n: absMin });
  const absHr = Math.round(absMin / 60);
  if (absHr < 24) return t('common.hoursAgo', { n: absHr });
  const absDay = Math.round(absHr / 24);
  return t('common.daysAgo', { n: absDay });
}

/** The effective template-skill id: the config's saved id, or the fallback default. */
export function deriveEffectiveOrbitTemplateId(
  templateSkillId: string | null | undefined,
  defaultTemplateSkillId: string | null | undefined,
): string {
  return templateSkillId || defaultTemplateSkillId || '';
}

/** The Orbit design-templates registry, filtered to `scenario === 'orbit'` and
 *  sorted featured-first, then by name. */
export function filterAndSortOrbitTemplates(all: readonly SkillSummary[]): SkillSummary[] {
  const filtered = all.filter((s) => s.scenario === 'orbit');
  filtered.sort((a, b) => {
    const af = a.featured ?? 0;
    const bf = b.featured ?? 0;
    if (af !== bf) return bf - af;
    return a.name.localeCompare(b.name);
  });
  return filtered;
}

/** The currently-selected template row, or `null` if not (yet) resolvable. */
export function findOrbitTemplate(
  templates: readonly SkillSummary[] | null,
  effectiveTemplateSkillId: string,
): SkillSummary | null {
  if (!effectiveTemplateSkillId || !templates) return null;
  return templates.find((s) => s.id === effectiveTemplateSkillId) ?? null;
}

/** Count of connectors with `status === 'connected'`, driving the Orbit config gate. */
export function countConnectedConnectors(connectors: readonly ConnectorDetail[]): number {
  return connectors.filter((c) => c.status === 'connected').length;
}

/**
 * Next value for the "legacy unscoped last run" template-id tracker. Mirrors
 * the functional `setState` update the Orbit hook's effect used to run
 * inline: once a legacy (pre-template-scoping) last run is detected and no
 * template-scoped history exists yet, the tracker locks onto the first
 * effective template id it observes and holds it until the legacy condition
 * clears (`currentValue` here IS that hold — the caller reads it back from
 * state before calling in on the next effect run).
 */
export function nextLegacyLastRunTemplateSkillId(
  status: OrbitStatusResponse | null,
  effectiveTemplateSkillId: string,
  currentValue: string | null,
): string | null {
  const hasTemplateScopedHistory = Object.keys(status?.lastRunsByTemplate ?? {}).length > 0;
  const hasLegacyUnscopedLastRun = Boolean(status?.lastRun && !status.lastRun.templateSkillId);
  if (!hasLegacyUnscopedLastRun || hasTemplateScopedHistory) return null;
  return currentValue ?? (effectiveTemplateSkillId || null);
}

/**
 * The last run to display for the effective template: template-scoped history
 * when the daemon supports it (falling back to a matching legacy unscoped run),
 * otherwise the bare unscoped last run.
 */
export function deriveOrbitLastRun(
  status: OrbitStatusResponse | null,
  effectiveTemplateSkillId: string,
  legacyLastRunTemplateSkillId: string | null,
): OrbitRunSummary | null {
  const supportsTemplateScopedHistory = status?.lastRunsByTemplate !== undefined;
  if (!supportsTemplateScopedHistory) return status?.lastRun ?? null;

  const templateScopedLastRun = effectiveTemplateSkillId
    ? status?.lastRunsByTemplate?.[effectiveTemplateSkillId] ?? null
    : null;
  const hasLegacyUnscopedLastRun = Boolean(
    status?.lastRun
    && !status.lastRun.templateSkillId
    && legacyLastRunTemplateSkillId
    && legacyLastRunTemplateSkillId === effectiveTemplateSkillId,
  );
  return templateScopedLastRun ?? (hasLegacyUnscopedLastRun ? status?.lastRun ?? null : null);
}

/** Proportional (0-100, min-3 sliver) widths for the run-result meter's three segments. */
export function computeOrbitMeterSegments(lastRun: OrbitRunSummary | null): OrbitMeterSegments {
  const total = lastRun
    ? Math.max(lastRun.connectorsSucceeded + lastRun.connectorsSkipped + lastRun.connectorsFailed, 1)
    : 1;
  const segPct = (n: number): number => {
    if (!lastRun || n <= 0) return 0;
    const pct = (n / total) * 100;
    return pct < 3 ? 3 : pct;
  };
  return {
    succeeded: lastRun ? segPct(lastRun.connectorsSucceeded) : 0,
    skipped: lastRun ? segPct(lastRun.connectorsSkipped) : 0,
    failed: lastRun ? segPct(lastRun.connectorsFailed) : 0,
  };
}

/** The live-artifact preview href for a last run, or `null` when unavailable (legacy run). */
export function orbitLiveArtifactHref(lastRun: OrbitRunSummary | null): string | null {
  return lastRun?.artifactId && lastRun?.artifactProjectId
    ? `/api/live-artifacts/${encodeURIComponent(lastRun.artifactId)}/preview?projectId=${encodeURIComponent(lastRun.artifactProjectId)}`
    : null;
}

/** i18n key for the last run's trigger pill. */
export function orbitTriggerLabelKey(
  lastRun: OrbitRunSummary | null,
): 'settings.orbit.triggerManual' | 'settings.orbit.triggerScheduled' {
  return lastRun?.trigger === 'manual' ? 'settings.orbit.triggerManual' : 'settings.orbit.triggerScheduled';
}

/** The Composio-gate body/action i18n keys, branched on saved-key presence. */
export function orbitConfigGateCopyKeys(composioApiKeyConfigured: boolean): OrbitConfigGateCopyKeys {
  return composioApiKeyConfigured
    ? { bodyKey: 'settings.orbit.gateBody', actionKey: 'settings.orbit.gateAction' }
    : { bodyKey: 'settings.orbit.gateBodyNoKey', actionKey: 'settings.orbit.gateActionNoKey' };
}

// ---------------------------------------------------------------------------
// Media providers section
// ---------------------------------------------------------------------------

/**
 * The "available" catalogue: providers with a real daemon integration,
 * sorted configured-first, then alphabetically by label.
 */
export function sortAvailableMediaProviders(
  providers: readonly MediaProvider[],
  mediaProviders: AppConfig['mediaProviders'] | undefined,
): MediaProvider[] {
  return providers
    .filter((p) => p.integrated)
    .slice()
    .sort((a, b) => {
      const aConfigured = isStoredMediaProviderEntryPresent(mediaProviders?.[a.id]);
      const bConfigured = isStoredMediaProviderEntryPresent(mediaProviders?.[b.id]);
      if (aConfigured !== bConfigured) return aConfigured ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

/** The "coming soon" catalogue: providers with no daemon integration yet, alphabetical. */
export function sortComingSoonMediaProviders(providers: readonly MediaProvider[]): MediaProvider[] {
  return providers
    .filter((p) => !p.integrated)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Reject a docs URL that is not `https:`. Duplicated from the orchestrator's
 * module-private `sanitizeHttpsUrl` (used by several of its own sections) —
 * a small enough pure helper that a slice-local copy is cheaper than
 * threading a shared import across the ADR 0002 boundary.
 */
export function sanitizeMediaProviderDocsUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Per-row derived display state (saved badge, key tail, clearability) for one media-provider card. */
export function deriveMediaProviderRowState(
  entry: MediaProviderCredentials,
): MediaProviderRowState {
  const hasPendingEdit = Boolean(entry.apiKey.trim());
  const isSavedState = Boolean((hasPendingEdit || entry.apiKeyConfigured) && !hasPendingEdit);
  const tail = entry.apiKeyTail?.trim();
  const clearable = isStoredMediaProviderEntryPresent(entry);
  return { hasPendingEdit, isSavedState, tail, clearable };
}

// ---------------------------------------------------------------------------
// Integrations (MCP install snippet) section
// ---------------------------------------------------------------------------

/** Path hint per OS. Localizes the "where to paste" copy so a Windows user
 *  does not see ~/.cursor/mcp.json (which their shell will not expand) or a
 *  Linux user does not see %APPDATA% paths. */
export function homeConfigPath(
  platform: McpInstallInfo['platform'],
  posix: string,
  windows: string,
): string {
  return platform === 'win32' ? windows : posix;
}

export function commandPaletteShortcut(platform: McpInstallInfo['platform']): string {
  return platform === 'darwin' ? '⌘⇧P' : 'Ctrl+Shift+P';
}

export function settingsShortcut(platform: McpInstallInfo['platform']): string {
  return platform === 'darwin' ? '⌘,' : 'Ctrl+,';
}

/**
 * btoa() requires every input character be representable in Latin-1
 * (codepoints 0-255). A Mac/Linux home directory like
 * "/Users/Émile/.fnm/.../node" trips that and throws InvalidCharacterError.
 * UTF-8-encode the string into bytes first, then map each byte back to a
 * Latin-1 char before base64'ing.
 */
export function utf8Btoa(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function buildMcpStdioServerConfig(info: McpInstallInfo): McpStdioServerConfig {
  const env = info.env && Object.keys(info.env).length > 0 ? info.env : undefined;
  return {
    command: info.command,
    args: info.args,
    ...(env ? { env } : {}),
  };
}

export function buildCodexEnvToml(info: McpInstallInfo): string {
  const entries = Object.entries(info.env ?? {});
  if (entries.length === 0) return '';
  return `

[mcp_servers.open-design.env]
${entries.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}`;
}

export function buildSharedMcpJson(info: McpInstallInfo): string {
  const inner = buildMcpStdioServerConfig(info);
  const innerJson = JSON.stringify(inner, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `    ${line}`))
    .join('\n');
  return `{
  "mcpServers": {
    "open-design": ${innerJson}
  }
}`;
}

/**
 * The Integrations client picker's rows: how to render each client's
 * method/instruction/snippet. A function of `t` (i18n) so it stays pure — no
 * React, just a translate callback the caller already has.
 *
 * Each entry's snippet is what the user copies; some clients also support a
 * richer `deeplink` flow that triggers a one-click install with an in-client
 * approval dialog.
 *
 * Schemas drift between clients in deliberate ways. VS Code keys servers
 * under "servers" with a required "type" field; Zed uses "context_servers";
 * Cursor, Windsurf, and Antigravity share "mcpServers"; Claude Code is best
 * served by its CLI which writes to the local config for you. Verified
 * against each tool's official docs in May 2026.
 *
 * Important: every snippet uses absolute paths to the daemon's current
 * Node-compatible runtime and built cli.js, fetched at runtime. macOS and
 * Linux ship a system /usr/bin/od (octal-dump) that shadows any `od` we
 * might add to PATH, and most Open Design users run from source where `od`
 * is not installed globally. The installer panel must NOT reference bare `od`.
 */
export function buildMcpClients(t: Translate): McpClient[] {
  return [
    {
      id: 'claude',
      label: 'Claude Code',
      buildMethod: () => t('settings.mcpMethodCli'),
      buildInstruction: () => t('settings.mcpInstructionCli'),
      buildSnippet: (info) => {
        const inner = JSON.stringify(buildMcpStdioServerConfig(info));
        return `claude mcp add-json --scope user open-design '${inner}'`;
      },
      buildSnippetLang: () => 'bash',
    },
    {
      id: 'codex',
      label: 'Codex',
      buildMethod: () => t('settings.mcpMethodToml'),
      buildInstruction: (info) => {
        const path = homeConfigPath(
          info.platform,
          '~/.codex/config.toml',
          '%USERPROFILE%\\.codex\\config.toml',
        );
        return t('settings.mcpInstructionCodex', { path });
      },
      buildSnippet: (info) => `[mcp_servers.open-design]\ncommand = ${JSON.stringify(info.command)}\nargs = ${JSON.stringify(info.args)}${buildCodexEnvToml(info)}`,
      buildSnippetLang: () => 'toml',
    },
    {
      id: 'cursor',
      label: 'Cursor',
      buildMethod: () => t('settings.mcpMethodOneClick'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionCursor', {
          path: homeConfigPath(info.platform, '~/.cursor/mcp.json', '%USERPROFILE%\\.cursor\\mcp.json'),
        }),
      buildSnippet: buildSharedMcpJson,
      buildSnippetLang: () => 'json',
      buildDeeplink: (info) => {
        const inner = buildMcpStdioServerConfig(info);
        const encoded = utf8Btoa(JSON.stringify(inner));
        return `cursor://anysphere.cursor-deeplink/mcp/install?name=open-design&config=${encoded}`;
      },
      deeplinkLabel: () => t('settings.mcpDeeplinkInstallCursor'),
    },
    {
      id: 'vscode',
      label: 'VS Code',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionCopilot', {
          shortcut: commandPaletteShortcut(info.platform),
        }),
      buildSnippet: (info) => `{\n  "servers": {\n    "open-design": {\n      "type": "stdio",\n      "command": ${JSON.stringify(info.command)},\n      "args": ${JSON.stringify(info.args)}${info.env && Object.keys(info.env).length > 0 ? `,\n      "env": ${JSON.stringify(info.env)}` : ''}\n    }\n  }\n}`,
      buildSnippetLang: () => 'json',
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: () => t('settings.mcpInstructionAntigravity'),
      buildSnippet: buildSharedMcpJson,
      buildSnippetLang: () => 'json',
    },
    {
      id: 'zed',
      label: 'Zed',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionZed', {
          shortcut: settingsShortcut(info.platform),
        }),
      buildSnippet: (info) => `{\n  "context_servers": {\n    "open-design": {\n      "source": "custom",\n      "command": ${JSON.stringify(info.command)},\n      "args": ${JSON.stringify(info.args)}${info.env && Object.keys(info.env).length > 0 ? `,\n      "env": ${JSON.stringify(info.env)}` : ''}\n    }\n  }\n}`,
      buildSnippetLang: () => 'json',
    },
    {
      id: 'windsurf',
      label: 'Windsurf',
      buildMethod: () => t('settings.mcpMethodJson'),
      buildInstruction: (info) =>
        t('settings.mcpInstructionWindsurf', {
          path: homeConfigPath(info.platform, '~/.codeium/windsurf/mcp_config.json', '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json'),
        }),
      buildSnippet: buildSharedMcpJson,
      buildSnippetLang: () => 'json',
    },
  ];
}

// ---------------------------------------------------------------------------
// Notifications section
// ---------------------------------------------------------------------------

/**
 * Map the runtime SoundId (hyphenated, used by `utils/notifications.ts`) onto
 * the analytics contract's underscored enum. Sounds that don't have a
 * tracking entry drop to `undefined` so we never emit an off-enum value.
 */
export function soundIdToTracking(id: string): NotificationSoundTrackingId {
  switch (id) {
    case 'ding':
      return 'ding';
    case 'chime':
      return 'chime';
    case 'two-tone-up':
      return 'two_tone_up';
    case 'pluck':
      return 'pluck';
    case 'buzz':
      return 'buzz';
    case 'two-tone-down':
      return 'two_tone_down';
    case 'thud':
      return 'thud';
    default:
      return undefined;
  }
}

/** i18n key for the "send test notification" status line, keyed off the result. */
export function testNotificationStatusText(
  result: CompletionNotificationResult,
): NotificationTestStatusKey {
  if (result === 'shown') return 'settings.notifyTestSent';
  if (result === 'permission-denied') return 'settings.notifyDesktopBlocked';
  if (result === 'unsupported') return 'settings.notifyDesktopUnsupported';
  return 'settings.notifyTestFailed';
}

export function deriveAboutUpdateControl(
  model: UpdaterModel,
  appVersionInfo: AppVersionInfo | null,
): AboutUpdateControl {
  if (appVersionInfo?.packaged === false) {
    return {
      primaryAction: null,
      primaryLabelKey: null,
      showReleaseLink: true,
      statusKey: 'settings.updateStatusDevelopment',
      statusTone: 'neutral',
    };
  }

  if (model.environment !== 'desktop' || !model.enabled || !model.supported) {
    return {
      primaryAction: null,
      primaryLabelKey: null,
      showReleaseLink: true,
      statusKey: 'settings.updateStatusUnsupported',
      statusTone: 'warning',
    };
  }

  switch (model.status?.state) {
    case 'checking':
      return {
        primaryAction: null,
        primaryLabelKey: 'updater.checking',
        showReleaseLink: true,
        statusKey: 'settings.updateStatusChecking',
        statusTone: 'neutral',
      };
    case 'not-available':
      return {
        primaryAction: 'check',
        primaryLabelKey: 'settings.updateRecheck',
        showReleaseLink: true,
        statusKey: 'settings.updateStatusUpToDate',
        statusTone: 'success',
      };
    case 'available':
      return {
        primaryAction: model.canDownload ? 'download' : null,
        primaryLabelKey: model.canDownload ? 'updater.download' : null,
        showReleaseLink: true,
        statusKey: model.availableVersion
          ? 'settings.updateStatusAvailable'
          : 'settings.updateStatusAvailableUnknown',
        statusTone: 'warning',
        ...(model.availableVersion ? { statusVars: { version: model.availableVersion } } : {}),
      };
    case 'downloading': {
      const percent = model.downloadProgress?.percent;
      return {
        primaryAction: null,
        primaryLabelKey: 'updater.downloading',
        showReleaseLink: true,
        statusKey: typeof percent === 'number'
          ? 'settings.updateStatusDownloadingPercent'
          : 'settings.updateStatusDownloading',
        statusTone: 'neutral',
        ...(typeof percent === 'number' ? { statusVars: { percent } } : {}),
      };
    }
    case 'downloaded': {
      if (model.installerOpened && model.canQuitAfterInstallerOpen) {
        return {
          primaryAction: 'quit',
          primaryLabelKey: 'updater.quitButton',
          showReleaseLink: false,
          statusKey: 'settings.updateQuitFailed',
          statusTone: 'warning',
        };
      }
      const canInstallUpdate = model.canOpenInstaller || model.canApplyInPlace;
      return {
        primaryAction: canInstallUpdate ? 'install' : null,
        primaryLabelKey: canInstallUpdate
          ? model.updateKind === 'payload'
            ? 'updater.installRestart'
            : 'settings.updateNow'
          : null,
        showReleaseLink: true,
        statusKey: model.availableVersion
          ? 'settings.updateStatusReady'
          : 'settings.updateStatusReadyUnknown',
        statusTone: 'success',
        ...(model.availableVersion ? { statusVars: { version: model.availableVersion } } : {}),
      };
    }
    case 'installing':
      return {
        primaryAction: null,
        primaryLabelKey: 'updater.installingRestart',
        showReleaseLink: false,
        statusKey: 'settings.updateStatusInstalling',
        statusTone: 'neutral',
      };
    case 'error':
      return {
        primaryAction: 'check',
        primaryLabelKey: 'settings.updateRetry',
        showReleaseLink: true,
        statusKey: 'settings.updateStatusFailed',
        statusTone: 'error',
      };
    case 'unsupported':
      return {
        primaryAction: null,
        primaryLabelKey: null,
        showReleaseLink: true,
        statusKey: 'settings.updateStatusUnsupported',
        statusTone: 'warning',
      };
    case 'idle':
    default:
      return {
        primaryAction: 'check',
        primaryLabelKey: 'settings.updateCheck',
        showReleaseLink: true,
        statusKey: 'settings.updateStatusNotChecked',
        statusTone: 'neutral',
      };
  }
}

export function codexPathStrings(locale: Locale) {
  if (locale === 'zh-CN') {
    return {
      repairHint: '当前保存的 Codex 路径不适合继续使用。',
      useDetected: '使用检测到的 Codex',
      clearCustom: '清空自定义路径',
      configuredSuccess: (path: string) => `本次测试使用的是已配置的 Codex 路径：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `已配置的 Codex 路径无效或不可执行：${configuredPath}。本次测试改用 PATH 中的 Codex CLI：${detectedPath}。建议更新 CODEX_BIN 或清空自定义路径。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `已配置的 Codex 路径启动失败：${configuredPath}。本次测试改用 PATH 中的 Codex CLI：${detectedPath}。建议更新 CODEX_BIN 或清空自定义路径。`,
    };
  }
  if (locale === 'zh-TW') {
    return {
      repairHint: '目前儲存的 Codex 路徑不適合繼續使用。',
      useDetected: '使用偵測到的 Codex',
      clearCustom: '清除自訂路徑',
      configuredSuccess: (path: string) => `本次測試使用的是已設定的 Codex 路徑：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `已設定的 Codex 路徑無效或不可執行：${configuredPath}。本次測試改用 PATH 中的 Codex CLI：${detectedPath}。建議更新 CODEX_BIN 或清除自訂路徑。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `已設定的 Codex 路徑啟動失敗：${configuredPath}。本次測試改用 PATH 中的 Codex CLI：${detectedPath}。建議更新 CODEX_BIN 或清除自訂路徑。`,
    };
  }
  if (locale === 'ja') {
    return {
      repairHint: '保存されている Codex のパスは、このテストで使用すべきバイナリではありません。',
      useDetected: '検出された Codex を使用',
      clearCustom: 'カスタムパスをクリア',
      configuredSuccess: (path: string) => `このテストでは設定済みの Codex パスを使用しました：${path}。`,
      invalidFallback: (configuredPath: string, detectedPath: string) =>
        `設定された Codex パスが無効か実行できません：${configuredPath}。このテストでは PATH 上の Codex CLI（${detectedPath}）を使用しました。CODEX_BIN を更新するか、カスタムパスをクリアしてください。`,
      failedFallback: (configuredPath: string, detectedPath: string) =>
        `設定された Codex パスの起動に失敗しました：${configuredPath}。このテストは PATH 上の Codex CLI（${detectedPath}）で成功しました。CODEX_BIN を更新するか、カスタムパスをクリアしてください。`,
    };
  }
  return {
    repairHint: 'The saved Codex path is not the binary this test should keep using.',
    useDetected: 'Use detected Codex',
    clearCustom: 'Clear custom path',
    configuredSuccess: (path: string) =>
      `This test used the configured Codex path: ${path}.`,
    invalidFallback: (configuredPath: string, detectedPath: string) =>
      `Configured Codex path is invalid or not executable: ${configuredPath}. This test used the PATH Codex CLI at ${detectedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`,
    failedFallback: (configuredPath: string, detectedPath: string) =>
      `Configured Codex path failed: ${configuredPath}. This test succeeded with the PATH Codex CLI at ${detectedPath}. Update CODEX_BIN or clear the custom path to use the detected binary.`,
  };
}

export function sanitizeHttpsUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function hidesAccountModelSourceLabel(protocol: ApiProtocol): boolean {
  return ACCOUNT_MODEL_SOURCE_LABEL_HIDDEN.has(protocol);
}

export function byokFieldMissingFromIssues(issues: readonly ByokDraftIssue[]): ByokFieldMissing {
  const missingFields = new Set<ByokRequiredField>();
  for (const issue of issues) {
    if (
      issue.code === 'api_key_required' ||
      issue.code === 'base_url_required' ||
      issue.code === 'model_required'
    ) {
      missingFields.add(issue.field);
    }
  }
  if (missingFields.size === 0) return 'none';
  if (missingFields.size > 1) return 'multiple';
  return Array.from(missingFields)[0] ?? 'none';
}

export function byokErrorKindFromIssues(issues: readonly ByokDraftIssue[]): string | undefined {
  return issues[0]?.code;
}

export function byokTrackingTestResult(result: ConnectionTestResponse): 'success' | 'failed' | 'timeout' {
  if (result.ok) return 'success';
  return result.kind === 'timeout' ? 'timeout' : 'failed';
}

// Map a test result to the visual severity of its inline status node so
// the same green/red/amber palette as the Rescan status applies.
export function testStatusVariant(
  result: ConnectionTestResponse,
): 'success' | 'warn' | 'error' {
  if (result.ok) return 'success';
  if (result.kind === 'rate_limited') return 'warn';
  return 'error';
}

export function shouldShowCustomModelInput(
  modelValue: string,
  knownModelIds: readonly string[],
  explicitCustomMode: boolean,
): boolean {
  return (
    explicitCustomMode ||
    !modelValue ||
    !knownModelIds.includes(modelValue)
  );
}

export function canRunProviderConnectionTest(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options: { requiresApiKey?: boolean } = {},
): boolean {
  const requiresApiKey = options.requiresApiKey ?? true;
  return (
    (!requiresApiKey || Boolean(config.apiKey.trim())) &&
    Boolean(config.baseUrl.trim()) &&
    Boolean(config.model.trim())
  );
}

export function canFetchProviderModels(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl'>,
  protocol: ApiProtocol,
): boolean {
  return (
    !isProviderModelDiscoveryUnsupported(protocol, config.baseUrl) &&
    protocol !== 'azure' &&
    protocol !== 'ollama' &&
    (protocol === 'bedrock' || Boolean(config.apiKey.trim())) &&
    Boolean(config.baseUrl.trim()) &&
    isValidApiBaseUrl(config.baseUrl)
  );
}

export function isProviderModelDiscoveryUnsupported(
  protocol: ApiProtocol,
  baseUrl: string,
): boolean {
  if (protocol === 'azure' || protocol === 'ollama') return true;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'token-plan-cn.xiaomimimo.com';
  } catch {
    return false;
  }
}

export function missingByokConnectionFields(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options: { requiresApiKey?: boolean } = {},
): ByokRequiredField[] {
  const requiresApiKey = options.requiresApiKey ?? true;
  const missing: ByokRequiredField[] = [];
  if (requiresApiKey && !config.apiKey.trim()) missing.push('api_key');
  if (!config.baseUrl.trim()) missing.push('base_url');
  if (!config.model.trim()) missing.push('model');
  return missing;
}

export function missingByokModelFetchFields(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl'>,
  protocol?: ApiProtocol,
): ByokRequiredField[] {
  const missing: ByokRequiredField[] = [];
  // AIHubMix publishes its catalogue on a public endpoint, so its model list
  // loads without a key (the user shouldn't need to paste a key just to browse
  // models). Bedrock uses a static model seed until AWS auth lands in BYOK.
  // Every other protocol fetches /v1/models behind the key.
  if (protocol !== 'aihubmix' && protocol !== 'bedrock' && !config.apiKey.trim()) missing.push('api_key');
  if (!config.baseUrl.trim()) missing.push('base_url');
  return missing;
}

export function providerConnectionTestKey(
  protocol: ApiProtocol,
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model' | 'apiVersion'>,
): string {
  return [
    protocol,
    config.baseUrl.trim().replace(/\/+$/, ''),
    config.apiKey.trim(),
    config.model.trim(),
    protocol === 'azure' ? config.apiVersion?.trim() ?? '' : '',
  ].join('\n');
}

export function byokFirstPartyBaseUrlHint(
  protocol: ApiProtocol,
  baseUrl: string,
  protocolProviders: readonly KnownProvider[],
): ByokFirstPartyBaseUrlHint | undefined {
  if (
    protocol !== 'anthropic' &&
    protocol !== 'openai' &&
    protocol !== 'google'
  ) {
    return undefined;
  }
  const firstPartyBaseUrl = protocolProviders.find(
    (provider) => provider.baseUrl.trim(),
  )?.baseUrl;
  if (!firstPartyBaseUrl) return undefined;

  const firstPartyHost = byokDraftBaseUrlHost(firstPartyBaseUrl);
  const draftHost = byokDraftBaseUrlHost(baseUrl);
  if (!firstPartyHost || !draftHost) return undefined;
  if (draftHost === firstPartyHost) {
    return { baseUrl: firstPartyBaseUrl, hostTypo: false };
  }
  if (!draftHost.startsWith(firstPartyHost)) return undefined;

  const suffix = draftHost.slice(firstPartyHost.length);
  return suffix && !suffix.startsWith('.')
    ? { baseUrl: firstPartyBaseUrl, hostTypo: true }
    : undefined;
}

export function byokDraftBaseUrlHost(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function cleanAgentVersionLabel(
  name: string,
  version: string | null | undefined,
): string {
  if (!version) return '';
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return version
    .replace(new RegExp(`\\s*\\(${escapedName}\\)\\s*$`, 'i'), '')
    .replace(new RegExp(`\\s+${escapedName}\\s*$`, 'i'), '')
    .trim();
}

export function displayAgentName(agent: Pick<AgentInfo, 'id' | 'name'>): string {
  return agent.id === 'amr' ? 'Open Design' : agent.name;
}

export function defaultApiProtocolConfig(protocol: ApiProtocol): ApiProtocolConfig {
  const provider = KNOWN_PROVIDERS.find((p) => p.protocol === protocol);
  return {
    apiKey: '',
    baseUrl: provider?.baseUrl ?? '',
    model: provider?.model ?? '',
    apiVersion: '',
    apiProviderBaseUrl: provider ? provider.baseUrl : null,
  };
}

export function providerFamilyLabel(provider: KnownProvider): string {
  return provider.label.replace(/\s+—\s+(Anthropic|OpenAI)$/u, '');
}

export function siblingProviderForProtocol(
  providerBaseUrl: string | null | undefined,
  protocol: ApiProtocol,
): KnownProvider | null {
  if (!providerBaseUrl) return null;
  const currentProvider = KNOWN_PROVIDERS.find(
    (p) => p.baseUrl === providerBaseUrl,
  );
  if (!currentProvider) return null;

  const currentFamily = providerFamilyLabel(currentProvider);
  return (
    KNOWN_PROVIDERS.find(
      (p) => p.protocol === protocol && providerFamilyLabel(p) === currentFamily,
    ) ?? null
  );
}

export function nextApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): ApiProtocolConfig {
  const savedConfig = config.apiProtocolConfigs?.[protocol];
  if (savedConfig) return savedConfig;

  const currentConfig = currentApiProtocolConfig(config);
  const siblingProvider = siblingProviderForProtocol(
    currentConfig.apiProviderBaseUrl,
    protocol,
  );
  if (siblingProvider) {
    return {
      ...defaultApiProtocolConfig(protocol),
      baseUrl: siblingProvider.baseUrl,
      model: siblingProvider.model,
      apiProviderBaseUrl: siblingProvider.baseUrl,
    };
  }

  if (currentConfig.apiProviderBaseUrl === null) {
    return {
      ...currentConfig,
      apiKey: '',
      apiVersion: protocol === 'azure' ? currentConfig.apiVersion : '',
      apiProviderBaseUrl: null,
    };
  }

  return {
    ...defaultApiProtocolConfig(protocol),
  };
}

export function currentApiProtocolConfig(config: AppConfig): ApiProtocolConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
    apiVersion: config.apiVersion ?? '',
    apiProviderBaseUrl: config.apiProviderBaseUrl ?? null,
    byokImageModel: config.byokImageModel ?? '',
    byokVideoModel: config.byokVideoModel ?? '',
    byokSpeechModel: config.byokSpeechModel ?? '',
    byokSpeechVoice: config.byokSpeechVoice ?? '',
  };
}

export function persistByokProviderConfigDraft(
  config: AppConfig,
  draftKey: string,
  apiConfig: ApiProtocolConfig,
): AppConfig {
  return {
    ...config,
    byokProviderConfigDrafts: {
      ...(config.byokProviderConfigDrafts ?? {}),
      [draftKey]: {
        apiConfig,
        maxTokens: config.maxTokens,
      },
    },
  };
}

export function byokProviderDraftKey(
  protocol: ApiProtocol,
  apiProviderBaseUrl: string | null | undefined,
  baseUrl: string,
): string {
  return `${protocol}:${apiProviderBaseUrl ?? `custom:${baseUrl}`}`;
}

export function byokProviderKeyForConfig(config: AppConfig): string {
  const apiConfig = currentApiProtocolConfig(config);
  return byokProviderDraftKey(
    config.apiProtocol ?? 'anthropic',
    apiConfig.apiProviderBaseUrl,
    apiConfig.baseUrl,
  );
}

export function applyApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
  apiConfig: ApiProtocolConfig,
): AppConfig {
  return {
    ...config,
    apiProtocol: protocol,
    apiKey: apiConfig.apiKey,
    baseUrl: resolveFixedOriginBaseUrl(protocol, apiConfig.baseUrl),
    model: apiConfig.model,
    apiProviderBaseUrl: apiConfig.apiProviderBaseUrl ?? null,
    apiVersion: protocol === 'azure' ? (apiConfig.apiVersion ?? '') : '',
    // byokImageModel applies to the protocols that inject the daemon-side
    // generate_image tool (SenseAudio, AIHubMix) — flipping to another BYOK
    // tab shouldn't carry an image-model choice into, say, the OpenAI form.
    // Mirrors the apiVersion guarding above.
    byokImageModel:
      protocol === 'senseaudio' || protocol === 'aihubmix'
        ? (apiConfig.byokImageModel ?? '')
        : '',
    // byokVideoModel only applies to AIHubMix today (the only BYOK chat with a
    // video-model picker; SenseAudio's video tool uses a fixed model).
    byokVideoModel:
      protocol === 'aihubmix' ? (apiConfig.byokVideoModel ?? '') : '',
    // Speech model + voice also AIHubMix-only today.
    byokSpeechModel:
      protocol === 'aihubmix' ? (apiConfig.byokSpeechModel ?? '') : '',
    byokSpeechVoice:
      protocol === 'aihubmix' ? (apiConfig.byokSpeechVoice ?? '') : '',
  };
}

export function isValidApiBaseUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const result = validateBaseUrl(trimmed);
  // The internal-IP / SSRF decision belongs to the daemon, which is the single
  // source of truth and honors the operator's OD_ALLOWED_INTERNAL_HOSTS
  // allowlist — a value the browser cannot see (#3225). A `forbidden` result
  // here is a syntactically-valid URL that points at an internal address; keep
  // it UI-valid so the operator can run the connection test / model fetch and
  // get the daemon's authoritative answer (allowed when listed, a clear
  // "Internal IPs blocked" otherwise). Only genuinely malformed URLs stay
  // invalid client-side.
  if (result.forbidden) return true;
  return Boolean(result.parsed && !result.error);
}

export function updateCurrentApiProtocolConfig(
  config: AppConfig,
  patch: Partial<ApiProtocolConfig>,
): AppConfig {
  const protocol = config.apiProtocol ?? 'anthropic';
  const clearedApiKey =
    patch.apiKey !== undefined &&
    !patch.apiKey.trim() &&
    Boolean(currentApiProtocolConfig(config).apiKey.trim());
  const defaultModel = defaultApiProtocolConfig(protocol).model;
  const nextApiConfig: ApiProtocolConfig = {
    ...currentApiProtocolConfig(config),
    ...patch,
    ...(clearedApiKey && defaultModel && patch.model === undefined
      ? { model: defaultModel }
      : {}),
  };
  return applyApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs: {
        ...(config.apiProtocolConfigs ?? {}),
        [protocol]: nextApiConfig,
      },
    },
    protocol,
    nextApiConfig,
  );
}

export function updateAgentCliEnvValue(
  config: AppConfig,
  agentId: string,
  envKey: string,
  rawValue: string,
): AppConfig {
  const value = rawValue.trim();
  const agentCliEnv = { ...(config.agentCliEnv ?? {}) };
  const agentCliEnvIntent = { ...(config.agentCliEnvIntent ?? {}) };
  const nextAgentEnv = { ...(agentCliEnv[agentId] ?? {}) };
  const nextAgentIntent = { ...(agentCliEnvIntent[agentId] ?? {}) };
  if (value) {
    nextAgentEnv[envKey] = value;
  } else {
    delete nextAgentEnv[envKey];
  }

  const hasAuthKey = Object.keys(nextAgentEnv).some((key) => AGENT_CLI_AUTH_ENV_KEYS.has(key));
  if (
    (AGENT_CLI_AUTH_ENV_KEYS.has(envKey) && value) ||
    (AGENT_CLI_BASE_URL_ENV_KEYS.has(envKey) && hasAuthKey)
  ) {
    nextAgentIntent.apiKeyOverride = true;
  } else if (AGENT_CLI_AUTH_ENV_KEYS.has(envKey) && !hasAuthKey) {
    delete nextAgentIntent.apiKeyOverride;
  }

  if (Object.keys(nextAgentEnv).length > 0) {
    agentCliEnv[agentId] = nextAgentEnv;
  } else {
    delete agentCliEnv[agentId];
  }

  if (Object.keys(nextAgentEnv).length > 0 && Object.keys(nextAgentIntent).length > 0) {
    agentCliEnvIntent[agentId] = nextAgentIntent;
  } else {
    delete agentCliEnvIntent[agentId];
  }

  return {
    ...config,
    agentCliEnv: Object.keys(agentCliEnv).length > 0 ? agentCliEnv : {},
    agentCliEnvIntent: Object.keys(agentCliEnvIntent).length > 0 ? agentCliEnvIntent : {},
  };
}

function sameAgentModelChoice(
  left: AgentModelChoice | undefined,
  right: AgentModelChoice | undefined,
): boolean {
  return (left?.model ?? null) === (right?.model ?? null)
    && (left?.reasoning ?? null) === (right?.reasoning ?? null);
}

export function reconcileAmrProfileEnv(
  currentAgentCliEnv: AppConfig['agentCliEnv'] | undefined,
  nextInitialAgentCliEnv: AppConfig['agentCliEnv'] | undefined,
): AppConfig['agentCliEnv'] | undefined {
  const nextAmrProfile = nextInitialAgentCliEnv?.[AMR_PROFILE_AGENT_ID]?.[AMR_PROFILE_ENV_KEY];
  const currentAmrProfile = currentAgentCliEnv?.[AMR_PROFILE_AGENT_ID]?.[AMR_PROFILE_ENV_KEY];
  if (currentAmrProfile === nextAmrProfile) {
    return currentAgentCliEnv;
  }

  const nextAgentCliEnv = { ...(currentAgentCliEnv ?? {}) };
  const nextAmrEnv = { ...(nextAgentCliEnv[AMR_PROFILE_AGENT_ID] ?? {}) };

  if (typeof nextAmrProfile === 'string' && nextAmrProfile.length > 0) {
    nextAmrEnv[AMR_PROFILE_ENV_KEY] = nextAmrProfile;
  } else {
    delete nextAmrEnv[AMR_PROFILE_ENV_KEY];
  }

  if (Object.keys(nextAmrEnv).length > 0) {
    nextAgentCliEnv[AMR_PROFILE_AGENT_ID] = nextAmrEnv;
  } else {
    delete nextAgentCliEnv[AMR_PROFILE_AGENT_ID];
  }

  return Object.keys(nextAgentCliEnv).length > 0 ? nextAgentCliEnv : {};
}

export function reconcileAmrModelChoice(
  currentAgentModels: AppConfig['agentModels'] | undefined,
  previousInitial: AppConfig,
  nextInitial: AppConfig,
): AppConfig['agentModels'] | undefined {
  const previousAmrProfile = previousInitial.agentCliEnv?.[AMR_PROFILE_AGENT_ID]?.[AMR_PROFILE_ENV_KEY];
  const nextAmrProfile = nextInitial.agentCliEnv?.[AMR_PROFILE_AGENT_ID]?.[AMR_PROFILE_ENV_KEY];
  if (previousAmrProfile === nextAmrProfile) return currentAgentModels;

  const previousChoice = previousInitial.agentModels?.[AMR_PROFILE_AGENT_ID];
  const currentChoice = currentAgentModels?.[AMR_PROFILE_AGENT_ID];
  if (!sameAgentModelChoice(currentChoice, previousChoice)) {
    return currentAgentModels;
  }

  const nextChoice = nextInitial.agentModels?.[AMR_PROFILE_AGENT_ID];
  const nextAgentModels = { ...(currentAgentModels ?? {}) };
  if (nextChoice) {
    nextAgentModels[AMR_PROFILE_AGENT_ID] = nextChoice;
  } else {
    delete nextAgentModels[AMR_PROFILE_AGENT_ID];
  }
  return Object.keys(nextAgentModels).length > 0 ? nextAgentModels : {};
}

export function agentRefreshOptionsForConfig(cfg: AppConfig): AgentRefreshOptions {
  return {
    throwOnError: true,
    agentCliEnv: cfg.agentCliEnv ?? {},
  };
}

/**
 * Locale-aware currency formatting for the AMR wallet balance shown on the
 * agent card (distinct from `providers/daemon`'s plain `formatVelaBalanceUsd`,
 * which is a fixed `$X.XX` used by the `AmrLoginPill`). Returns `null` for an
 * absent/unparseable balance so the caller can fall back to a loading or
 * unavailable label.
 */
export function formatAmrWalletBalance(
  locale: Locale,
  balanceUsd: string | null | undefined,
): string | null {
  if (!balanceUsd) return null;
  const amount = Number(balanceUsd);
  if (!Number.isFinite(amount)) return `$${balanceUsd}`;
  return new Intl.NumberFormat(locale, {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount);
}

export function amrWalletValueLabel(input: {
  balance: string | null;
  loadingLabel: string;
  ready: boolean;
  snapshot: AmrWalletSnapshot | null;
  unavailableLabel: string;
}): string {
  if (input.balance) return input.balance;
  if (!input.ready) return input.loadingLabel;
  const code = input.snapshot?.error?.code;
  if (code === 'missing_control_key' || code === 'unauthorized') {
    const message = input.snapshot?.error?.message?.trim();
    if (message) return message;
  }
  return input.unavailableLabel;
}

export function apiModelOptionLabel(
  model: ProviderModelOption,
  sourceLabel?: string,
): string {
  const baseLabel = model.label && model.label !== model.id
    ? `${model.label} (${model.id})`
    : model.id;
  return sourceLabel ? `${baseLabel} · ${sourceLabel}` : baseLabel;
}

export function codexPathRepairState(
  result: ConnectionTestResponse,
): { detectedPath: string; canUseDetected: boolean } | null {
  if (!result.ok) return null;
  if (
    result.usedExecutableSource !== 'fallback_invalid' &&
    result.usedExecutableSource !== 'fallback_failed'
  ) {
    return null;
  }
  const detectedPath = result.detectedExecutablePath?.trim() || '';
  if (!detectedPath) return null;
  return {
    detectedPath,
    canUseDetected: true,
  };
}

/**
 * Returns whether the modal's footer Save button should be enabled for the
 * currently active sidebar section.
 *
 * The mode-completeness check (BYOK requires apiKey + model + valid baseUrl;
 * Local CLI requires a selected available agent) is only meaningful on the
 * execution-mode section, where the user is actively editing those fields.
 * On every other sidebar section (language, appearance, composio, media,
 * integrations, notifications, pet, library, about), partial state from a
 * draft mode toggle (e.g. user clicked BYOK on the execution section without
 * filling in fields, then navigated to language) must NOT block saving
 * changes the user is making in those unrelated sections. Issue #739.
 */
export function shouldEnableSettingsSave(
  cfg: AppConfig,
  activeSection: SettingsSection,
  agents: ReadonlyArray<{ id: string; available: boolean }>,
  isBaseUrlValid: boolean,
): boolean {
  if (activeSection !== 'execution') return true;
  if (cfg.mode === 'daemon') {
    return Boolean(
      cfg.agentId && agents.find((a) => a.id === cfg.agentId)?.available,
    );
  }
  return Boolean(cfg.apiKey.trim() && cfg.model.trim() && isBaseUrlValid);
}

/**
 * Returns the config that should actually be persisted by `onSave`.
 *
 * Counterpart to {@link shouldEnableSettingsSave}: when Save is enabled on a
 * non-execution sidebar section but the user's draft execution config is
 * incomplete (e.g. they toggled BYOK on the execution section, never filled
 * in apiKey, then navigated to Language and clicked Save), the raw `cfg`
 * still carries that broken draft. Persisting it would leave the app in an
 * unusable execution state after the modal closes. This helper reverts the
 * execution-related fields to their `initial` values in that case, so saving
 * an unrelated section change never silently commits an incomplete execution
 * mode.
 *
 * Within the execution section, or when execution is already valid, the
 * config passes through unchanged. Issue #739.
 */
export function sanitizeSettingsSavePayload(
  cfg: AppConfig,
  initial: AppConfig,
  activeSection: SettingsSection,
  agents: ReadonlyArray<{ id: string; available: boolean }>,
  isBaseUrlValid: boolean,
): AppConfig {
  if (activeSection === 'execution') return cfg;
  // Reuse the existing execution-section validity gate so the two helpers
  // share one source of truth for "execution config is complete enough."
  const executionValid = shouldEnableSettingsSave(cfg, 'execution', agents, isBaseUrlValid);
  if (executionValid) return cfg;
  return {
    ...cfg,
    mode: initial.mode,
    apiKey: initial.apiKey,
    apiProtocol: initial.apiProtocol,
    apiVersion: initial.apiVersion,
    apiProtocolConfigs: initial.apiProtocolConfigs,
    byokProviderConfigDrafts: initial.byokProviderConfigDrafts,
    apiProviderBaseUrl: initial.apiProviderBaseUrl,
    baseUrl: initial.baseUrl,
    model: initial.model,
    agentId: initial.agentId,
    agentCliEnv: initial.agentCliEnv,
    maxTokens: initial.maxTokens,
  };
}

export function switchApiProtocolConfig(
  config: AppConfig,
  protocol: ApiProtocol,
): AppConfig {
  const currentProtocol = config.apiProtocol ?? 'anthropic';
  const apiProtocolConfigs = {
    ...(config.apiProtocolConfigs ?? {}),
    [currentProtocol]: currentApiProtocolConfig(config),
  };
  const nextApiConfig = nextApiProtocolConfig(
    {
      ...config,
      apiProtocolConfigs,
    },
    protocol,
  );
  return applyApiProtocolConfig(
    {
      ...config,
      mode: 'api',
      apiProtocolConfigs,
    },
    protocol,
    nextApiConfig,
  );
}

/** Formats a local-CLI agent's model option for its card summary/picker:
 *  prefers the label, appending the id in parens when the label doesn't
 *  already read like it (distinct from `apiModelOptionLabel`, which is the
 *  BYOK provider model picker's own formatter). */
export function agentModelOptionLabel(
  model: ProviderModelOption | undefined,
  fallback: string,
): string {
  if (!model) return fallback;
  const label = model.label?.trim();
  const id = model.id.trim();
  if (label && label !== id) {
    return label.toLowerCase().includes(id.toLowerCase())
      ? label
      : `${label} (${id})`;
  }
  return label || id;
}

