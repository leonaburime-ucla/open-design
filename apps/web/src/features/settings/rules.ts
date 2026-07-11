// Pure rules for the settings slice: provider-model cache keying/merging, the
// Composio credential-state derivation, the Orbit automation section's
// business logic (template selection, last-run resolution, meter/gate
// derivation), and the media-providers section's catalogue sort/row-state
// derivation. No React, no transport, no DOM, so they test against
// `../../types`/`@open-design/contracts` with zero doubles (ADR 0002).
import type { ConnectorDetail } from '@open-design/contracts';
import { useT } from '../../i18n';
import { DEFAULT_ORBIT, isStoredMediaProviderEntryPresent } from '../../state/config';
import type { MediaProvider } from '../../media/models';
import type {
  ApiProtocol,
  AppConfig,
  MediaProviderCredentials,
  OrbitRunSummary,
  OrbitStatusResponse,
  ProviderModelOption,
  SkillSummary,
} from '../../types';
import type { CompletionNotificationResult } from '../../utils/notifications';
import type {
  ComposioCredentialState,
  MediaProviderRowState,
  McpClient,
  McpInstallInfo,
  McpStdioServerConfig,
  NotificationSoundTrackingId,
  NotificationTestStatusKey,
  OrbitConfigGateCopyKeys,
  OrbitMeterSegments,
} from './types';

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
