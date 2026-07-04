/** @module server/core/runtime-paths
 *
 * Single source of truth for every filesystem path the daemon resolves at
 * startup, plus the one-time ordered init those paths require: data-dir
 * resolution, sandbox-runtime dir creation, legacy `.od/` migration, and the
 * managed-data mkdirs. Importing this module runs that init exactly once.
 *
 * Extracted from server.ts (strangler-fig slice 5b). Unlike server.ts (which
 * is `// @ts-nocheck`), this module is fully typechecked — the extraction
 * deliberately claws these load-bearing consts out from under that blanket so
 * a stale import or a wrong path type surfaces at build time instead of as a
 * runtime crash. See the daemon data directory contract in the root AGENTS.md:
 * every daemon-owned data path derives from RUNTIME_DATA_DIR.
 *
 * Init order matters and is preserved from the original preamble:
 *   resolveDataDir → resolveSandboxRuntimeConfig → ensureSandboxRuntimeDirs
 *   → realpath (canonical) → migrateLegacyDataDirSync → mkdir the data roots.
 * Because ES module bodies run at import time, server.ts importing this module
 * near the top of its import section runs this init before its own body — i.e.
 * strictly earlier than when these statements used to run inline, which is
 * safe (the dirs simply exist sooner; nothing here depends on server.ts state).
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveProjectRootFromNestedModule } from '../../project/index.js';
import {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceDir,
  resolveDaemonResourceRoot,
  resolveDataDir,
  resolveProcessResourcesPath,
} from '../../daemon-paths.js';
import { migrateLegacyDataDirSync } from '../../legacy-data-migrator.js';
import {
  ensureSandboxRuntimeDirs,
  isSandboxModeEnabled,
  resolveSandboxRuntimeConfig,
} from '../../sandbox-mode.js';
import { defaultBundledRoot, registryRootsForDataDir } from '../../plugins/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// This module now lives at src/server/core/, several levels below the
// src/ container, so the fixed-depth resolveProjectRoot would mis-resolve.
// resolveProjectRootFromNestedModule walks up to the src/dist container.
export const PROJECT_ROOT = resolveProjectRootFromNestedModule(__dirname);

export const DAEMON_RESOURCE_ROOT = resolveDaemonResourceRoot({
  safeBases: [
    PROJECT_ROOT,
    resolveProcessResourcesPath(),
    process.env.OD_INSTALLATION_DIR,
  ],
});
// Built web app lives in `out/` — that's where Next.js writes the static
// export configured in next.config.ts. The folder name used to be `dist/`
// when this project shipped with Vite; the daemon serves whatever the
// frontend toolchain emits, no further config needed.
export const STATIC_DIR = path.join(PROJECT_ROOT, 'apps', 'web', 'out');
// Baked plugin preview clips (scripts/bake-plugin-previews.mjs). Served at
// PLUGIN_PREVIEWS_ROUTE; their manifest rewrites html plugins' previews to a
// cheap poster + hover-play video in the home gallery.
export const PLUGIN_PREVIEWS_DIR = resolveDaemonPluginPreviewsDir({
  resourceRoot: DAEMON_RESOURCE_ROOT,
  projectRoot: PROJECT_ROOT,
});
export const OD_BIN = resolveDaemonCliPath();
export const OD_NODE_BIN = process.execPath;
export const SKILLS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'skills',
  path.join(PROJECT_ROOT, 'skills'),
);
export const DESIGN_SYSTEMS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'design-systems',
  path.join(PROJECT_ROOT, 'design-systems'),
);
// Renderable templates pulled out of `skills/` by the skills/design-templates
// split (PR #955) so the EntryView Templates tab gets the large rendering
// catalogue and Settings → Skills only carries functional skills the agent
// invokes mid-task. See specs/current/skills-and-design-templates.md.
export const DESIGN_TEMPLATES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'design-templates',
  path.join(PROJECT_ROOT, 'design-templates'),
);
export const CRAFT_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'craft',
  path.join(PROJECT_ROOT, 'craft'),
);
// User-installed skills and design systems live under the runtime data dir
// so they respect OD_DATA_DIR overrides (test isolation, packaged runs).
// Defined after RUNTIME_DATA_DIR is resolved below.
export const FRAMES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'frames',
  path.join(PROJECT_ROOT, 'assets', 'frames'),
);
// Curated pets baked into the repo via `scripts/bake-community-pets.ts`.
// `listCodexPets` scans this in addition to `~/.codex/pets/` so the
// "Recently hatched" grid is non-empty out-of-the-box and users do not
// need to hit the "Download community pets" button to try a few pets.
export const BUNDLED_PETS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'community-pets',
  path.join(PROJECT_ROOT, 'assets', 'community-pets'),
);
export const PROMPT_TEMPLATES_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'prompt-templates',
  path.join(PROJECT_ROOT, 'prompt-templates'),
);
export const BUNDLED_PLUGINS_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  path.join('plugins', '_official'),
  defaultBundledRoot(PROJECT_ROOT),
);
export const PLUGIN_REGISTRY_DIR = resolveDaemonResourceDir(
  DAEMON_RESOURCE_ROOT,
  'plugins/registry',
  path.join(PROJECT_ROOT, 'plugins', 'registry'),
);

export const SANDBOX_MODE_ENABLED = isSandboxModeEnabled(process.env);
export const RUNTIME_DATA_DIR = resolveDataDir(process.env.OD_DATA_DIR, PROJECT_ROOT, {
  requireExplicit: SANDBOX_MODE_ENABLED,
});
export const SANDBOX_RUNTIME = resolveSandboxRuntimeConfig(SANDBOX_MODE_ENABLED, RUNTIME_DATA_DIR);
ensureSandboxRuntimeDirs(SANDBOX_RUNTIME);
export const PLUGIN_LOCKFILE_PATH = path.join(RUNTIME_DATA_DIR, 'od-plugin-lock.json');
// Canonical (realpath-resolved) form of RUNTIME_DATA_DIR for the few callers
// that compare it against a user-supplied realpath() result. On macOS, /var
// is a symlink to /private/var, so an import realpath lands in /private/var
// and would never start-with the raw RUNTIME_DATA_DIR. Keep RUNTIME_DATA_DIR
// itself as the stable, user-shaped path so OD_DATA_DIR resolution stays
// predictable; only this canonical alias is used for symlink-aware checks.
export const RUNTIME_DATA_DIR_CANONICAL = (() => {
  try {
    return fs.realpathSync(RUNTIME_DATA_DIR);
  } catch {
    return RUNTIME_DATA_DIR;
  }
})();
// One-shot legacy data migration. When OD_LEGACY_DATA_DIR is set and the
// new data root is fresh (no app.sqlite), copy the 0.3.x .od/ payload
// across before SQLite opens. Synchronous on purpose: openDatabase below
// would race an async copy. See apps/daemon/src/legacy-data-migrator.ts
// and https://github.com/nexu-io/open-design/issues/710.
migrateLegacyDataDirSync({
  legacyDir: process.env.OD_LEGACY_DATA_DIR,
  dataDir: RUNTIME_DATA_DIR,
});
export const ARTIFACTS_DIR = path.join(RUNTIME_DATA_DIR, 'artifacts');
// Critique Theater artifacts intentionally live outside the static
// `/artifacts` tree. The per-run artifact endpoint is the sanctioned
// read path so project-membership, size, and CSP guards cannot be bypassed.
export const CRITIQUE_ARTIFACTS_DIR = path.join(RUNTIME_DATA_DIR, 'critique-artifacts');
export const PROJECTS_DIR = path.join(RUNTIME_DATA_DIR, 'projects');
export const USER_SKILLS_DIR = path.join(RUNTIME_DATA_DIR, 'skills');
export const USER_DESIGN_SYSTEMS_DIR = path.join(RUNTIME_DATA_DIR, 'design-systems');
// Brand metadata (brand.json + meta.json per brand) lives here; each brand
// also registers a `user:<id>` design system under USER_DESIGN_SYSTEMS_DIR.
export const BRANDS_DIR = path.join(RUNTIME_DATA_DIR, 'brands');
export const PLUGIN_REGISTRY_ROOTS = registryRootsForDataDir(RUNTIME_DATA_DIR);
// User-imported design templates mirror USER_SKILLS_DIR but are scanned
// against DESIGN_TEMPLATES_DIR rather than SKILLS_DIR so the EntryView
// Templates surface and the Settings → Skills surface stay decoupled.
export const USER_DESIGN_TEMPLATES_DIR = path.join(RUNTIME_DATA_DIR, 'design-templates');
// Multi-root tuples used everywhere the daemon resolves a skill / template
// id without knowing which surface it came from. SKILL_ROOTS drives
// Settings → Skills; DESIGN_TEMPLATE_ROOTS drives the EntryView Templates
// gallery; ALL_SKILL_LIKE_ROOTS spans both for chat run system-prompt
// composition and the orbit template resolver, where stored project ids
// can resolve to either root after the split.
export const SKILL_ROOTS = [USER_SKILLS_DIR, SKILLS_DIR];
export const DESIGN_TEMPLATE_ROOTS = [USER_DESIGN_TEMPLATES_DIR, DESIGN_TEMPLATES_DIR];
export const ALL_SKILL_LIKE_ROOTS = [
  USER_SKILLS_DIR,
  USER_DESIGN_TEMPLATES_DIR,
  SKILLS_DIR,
  DESIGN_TEMPLATES_DIR,
];
// Global OD Library data root — owned, content-addressed assets captured by
// the clipper / `od library import`. Derived from RUNTIME_DATA_DIR per the
// daemon data directory contract.
export const LIBRARY_DIR = path.join(RUNTIME_DATA_DIR, 'library');
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
for (const dir of [USER_SKILLS_DIR, USER_DESIGN_SYSTEMS_DIR, BRANDS_DIR, USER_DESIGN_TEMPLATES_DIR, PLUGIN_REGISTRY_ROOTS.userPluginsRoot, LIBRARY_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.mkdirSync(CRITIQUE_ARTIFACTS_DIR, { recursive: true });
