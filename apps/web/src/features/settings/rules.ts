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
import type {
  ComposioCredentialState,
  MediaProviderRowState,
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
