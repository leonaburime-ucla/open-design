// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved body is untyped JS-in-TS (unknown-typed `catch (err)` casts, loose
// array literals); typing it is a later effort and new sibling code must NOT
// copy this.
/** @module server/bootstrap/boot-reconcile
 * Boot-time database reconcile + registry seed pass.
 *
 * The first thing the daemon does after opening its SQLite database, before it
 * registers any HTTP routes. Owns every one-shot startup side-effect that must
 * run against a freshly-opened `db`:
 *
 *   - Flip `critique_runs` rows left `running` by a prior daemon crash to
 *     `interrupted` (staleAfterMs from CritiqueConfig, not a hardcoded value).
 *   - Reconcile + rehydrate media tasks (interrupt in-flight, GC expired
 *     terminal rows, repopulate the in-memory `mediaTasks` registry).
 *   - Register every bundled `_official` plugin (idempotent upsert) and seed the
 *     plugin-registry marketplace manifests from disk.
 *   - Start the snapshot GC loop + run one immediate sweep.
 *   - Warm the agent-capability probe cache (and configure Orbit) in the
 *     background.
 *   - Recover stale live-artifact refreshes.
 *
 * The daemon-init singletons this pass closes over — the SQLite `db`, the shared
 * `OrbitService`, and the once-loaded `CritiqueConfig` — are passed in
 * explicitly rather than closed over, so this module has no dependency back on
 * server.ts. Directory constants come from `../core/runtime-paths.js`.
 *
 * Extracted from apps/daemon/src/server.ts (strangler-fig bootstrap slice); the
 * body is byte-identical apart from the `db`/`orbitService`/`critiqueCfg`
 * references becoming parameters and the one dynamic `import()` path gaining a
 * `../../` prefix for its new depth.
 */

import fs from 'node:fs';

import { reconcileStaleRuns } from '../../critique/persistence.js';
import { reconcileMediaTasksOnBoot, listRecentMediaTasks } from '../../media/tasks.js';
import { TASK_TTL_AFTER_DONE_MS, mediaTasks, hydrateMediaTask } from '../../media/task-registry.js';
import { registerBundledPlugins, startSnapshotGc, pruneExpiredSnapshots } from '../../plugins/index.js';
import { readAppConfig } from '../../app-config.js';
import { detectAgents } from '../../agents.js';
import { recoverStaleLiveArtifactRefreshes } from '../../live-artifacts/store.js';
import {
  BUNDLED_PLUGINS_DIR,
  PROJECT_ROOT,
  PLUGIN_REGISTRY_DIR,
  PROJECTS_DIR,
  RUNTIME_DATA_DIR,
} from '../core/runtime-paths.js';
import {
  OFFICIAL_MARKETPLACE_ID,
  bundledPluginRegistrySource,
  marketplaceSeedManifestText,
  defaultMarketplaceSeedConfig,
} from '../marketplace/index.js';

/**
 * Run every one-shot boot-time reconcile and registry-seed side-effect against
 * a freshly-opened daemon database. Awaits the blocking steps (bundled-plugin
 * registration, marketplace seed, live-artifact recovery) and fires the warm
 * agent-capability probe in the background. Best-effort throughout: each
 * fallible step is individually try/caught so a single failure (e.g. ENOENT on
 * a plugin registry dir) never aborts daemon startup.
 *
 * @param deps.db - The opened SQLite database handle (better-sqlite3).
 * @param deps.orbitService - The shared OrbitService singleton to configure from
 *   the persisted app config once it loads.
 * @param deps.critiqueCfg - The once-loaded CritiqueConfig; supplies the stale-run
 *   reconcile timeout.
 * @returns The bundled-plugin marketplace entries registered during this pass
 *   (consumed downstream by the plugin-marketplace routes). Resolves once the
 *   blocking boot steps complete; the warm probe stays in flight in the
 *   background.
 */
export async function runBootReconcileAndSeed({ db, orbitService, critiqueCfg }) {
  // Boot reconcile: any critique_runs row left in 'running' state by a prior
  // daemon crash gets flipped to 'interrupted' with rounds_json.recoveryReason
  // = 'daemon_restart' so the spec's daemon-restart-mid-run failure mode is
  // honored on every boot. staleAfterMs comes from CritiqueConfig, not a
  // hardcoded constant.
  const reconciledStaleRuns = reconcileStaleRuns(db, { staleAfterMs: critiqueCfg.totalTimeoutMs });
  if (reconciledStaleRuns > 0) {
    console.warn(`[critique] reconcileStaleRuns flipped ${reconciledStaleRuns} stale running row(s) to interrupted`);
  }
  const mediaReconcile = reconcileMediaTasksOnBoot(db, {
    terminalTtlMs: TASK_TTL_AFTER_DONE_MS,
  });
  if (mediaReconcile.interrupted > 0 || mediaReconcile.deleted > 0) {
    console.warn(
      `[media] reconcileMediaTasksOnBoot interrupted ${mediaReconcile.interrupted} task(s), ` +
        `deleted ${mediaReconcile.deleted} expired terminal task(s)`,
    );
  }
  mediaTasks.clear();
  for (const row of listRecentMediaTasks(db, { terminalTtlMs: TASK_TTL_AFTER_DONE_MS })) {
    hydrateMediaTask(row);
  }

  if (process.env.OD_CODEX_DISABLE_PLUGINS === '1') {
    console.log('[od] Codex plugins disabled via OD_CODEX_DISABLE_PLUGINS=1');
  }

  let bundledMarketplaceEntries = [];
  // Plan §3.I3 / spec §23.3.5 — register every plugin under
  // <resourceRoot>/plugins/_official/** in packaged runs, or
  // <projectRoot>/plugins/_official/** in workspace runs, as bundled plugins. The walker
  // is idempotent (upserts on every boot) so a daemon upgrade rotates
  // the bundled set in lockstep with the code. ENOENT is silent —
  // running the daemon outside the dev tree just skips this step.
  try {
    const result = await registerBundledPlugins({
      db,
      bundledRoot: BUNDLED_PLUGINS_DIR,
      marketplaceProvenance: {
        sourceMarketplaceId: OFFICIAL_MARKETPLACE_ID,
        marketplaceTrust:    'official',
        entryNamePrefix:     'open-design',
      },
    });
    bundledMarketplaceEntries = result.registered.map((plugin) => ({
      name:        `open-design/${plugin.id}`,
      title:       plugin.title,
      title_i18n:  plugin.manifest.title_i18n,
      description: plugin.manifest.description,
      description_i18n: plugin.manifest.description_i18n,
      version:     plugin.version,
      source:      bundledPluginRegistrySource(plugin.source, BUNDLED_PLUGINS_DIR, PROJECT_ROOT),
      publisher:   { id: 'open-design', url: 'https://open-design.ai' },
      homepage:    plugin.manifest.homepage,
      license:     plugin.manifest.license,
      tags:        plugin.manifest.tags,
      capabilitiesSummary: Array.isArray(plugin.manifest.od?.capabilities)
        ? plugin.manifest.od.capabilities
        : undefined,
    }));
    if (result.registered.length > 0) {
      console.log(`[plugins] registered ${result.registered.length} bundled plugin(s)`);
    }
    if (result.warnings.length > 0) {
      for (const w of result.warnings) console.warn(`[plugins] bundled warn: ${w}`);
    }
  } catch (err) {
    console.warn(`[plugins] bundled registration failed: ${(err)?.message ?? err}`);
  }

  try {
    const seedDirs = await fs.promises.readdir(PLUGIN_REGISTRY_DIR, { withFileTypes: true }).catch((err) => {
      if (err?.code === 'ENOENT') return [];
      throw err;
    });
    const { ensureMarketplaceManifest } = await import('../../plugins/marketplaces.js');
    for (const dirent of seedDirs) {
      if (!dirent.isDirectory()) continue;
      const id = dirent.name;
      const manifestText = await marketplaceSeedManifestText(id, bundledMarketplaceEntries, PLUGIN_REGISTRY_DIR);
      if (!manifestText) continue;
      const configured = defaultMarketplaceSeedConfig(id);
      const result = ensureMarketplaceManifest(db, {
        id,
        url: configured.url,
        trust: configured.trust,
        manifestText,
      });
      if (result.ok) {
        console.log(`[plugins] seeded ${id} registry source (${result.row.manifest.plugins.length} plugin(s))`);
      } else {
        console.warn(`[plugins] ${id} registry seed failed: ${result.message}`);
      }
    }
  } catch (err) {
    console.warn(`[plugins] registry seed failed: ${(err)?.message ?? err}`);
  }

  // Plan §3.A5 / spec §16 Phase 5 / PB2: periodic snapshot GC. Disabled
  // when OD_SNAPSHOT_GC_INTERVAL_MS is 0; otherwise one-time bootstrap
  // sweep + interval. The function returns a NOOP_HANDLE when disabled
  // so we don't have to branch on the result.
  const snapshotGc = startSnapshotGc({ db });
  // One immediate sweep so a daemon that just gained the ALTER doesn't
  // wait the full interval before reaping pre-existing expired rows.
  try {
    const initialSweep = pruneExpiredSnapshots(db);
    if (initialSweep.removed > 0) {
      console.log(`[plugins] snapshot GC startup sweep removed ${initialSweep.removed} row(s)`);
    }
  } catch (err) {
    console.warn(`[plugins] snapshot GC startup sweep failed: ${(err)?.message ?? err}`);
  }
  void snapshotGc; // keep handle alive for the daemon's lifetime

  // Warm agent-capability probes (e.g. whether the installed Claude Code
  // build advertises --include-partial-messages) so the first /api/chat
  // hits a populated cache even if /api/agents hasn't been called yet.
  void readAppConfig(RUNTIME_DATA_DIR)
    .then((config) => {
      orbitService.configure(config.orbit);
      return detectAgents(config.agentCliEnv ?? {});
    })
    .catch(() => detectAgents().catch(() => {}));

  await recoverStaleLiveArtifactRefreshes({ projectsRoot: PROJECTS_DIR }).catch((error) => {
    console.warn('[od] Failed to recover stale live artifact refreshes:', error);
  });

  // The bundled-plugin marketplace entries computed above are also consumed
  // downstream by registerPluginMarketplaceRoutes, so hand them back to
  // startServer rather than keeping them internal to this pass.
  return bundledMarketplaceEntries;
}
