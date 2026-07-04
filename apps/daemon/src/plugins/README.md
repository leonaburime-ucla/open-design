# plugins

Daemon module for Open Design plugin registry, installation, marketplace, atom execution, snapshot, preview, asset, and sharing behavior.

---

## What changed (refactor history)

The plugin module was previously a flat `apps/daemon/src/plugins/` folder with a root barrel that used broad `export *` re-exports, while four plugin-owned helpers still lived directly under `apps/daemon/src/`:

1. Created `core/`, `atoms/`, `catalog/`, `install/`, `runtime/`, `assets/`, `previews/`, and `sharing/` concern subdirectories.
2. Moved every plugin source file into its owning concern.
3. Promoted `plugin-asset-cache.ts`, `plugin-preview-bakes.ts`, `plugin-registry-view.ts`, and `plugin-share.ts` into the plugin domain.
4. Added subdirectory barrels and replaced the root barrel with explicit named re-exports.
5. Updated daemon runtime and public-surface test imports to use `plugins/index.js`.
6. Registered the domain in `scripts/check-barrel-imports.ts`.

This is a structural move only. The exported names from the old root barrel plus the four promoted root helpers remain available from `plugins/index.js`.

---

## Why this shape (architecture reasoning)

`core/` is the foundation kernel because plugin registry records, applied snapshots, event buffering, trust/capability checks, connector binding checks, and `until` parsing are shared by several plugin concerns. Keeping those primitives in the kernel avoids horizontal cycles between catalog, install, atoms, and runtime code.

The remaining subdirectories group by plugin capability:

- `atoms/` owns built-in atom catalog metadata, worker registration, and concrete atom implementations.
- `catalog/` owns marketplace and installed-plugin read/diagnostic surfaces: list, search, diff, stats, doctor, validation, and registry view creation.
- `install/` owns package lifecycle operations: install, uninstall, lockfile, pack, publish, scaffold, skill candidates, and duplicate-project examples.
- `runtime/` owns apply/snapshot/pipeline execution: prompt blocks, snapshot resolution, run pipeline, simulation, verification, local skills, exports, and snapshot GC.
- `assets/`, `previews/`, and `sharing/` own the three promoted root helper families and stay independent leaves.

The allowed edge set is deliberately small:

- `catalog -> atoms`: diagnostics and registry views need atom metadata.
- `install -> catalog`: skill-candidate generation reuses plugin validation.
- `runtime -> atoms`: applying/running plugins invokes atom surfaces and workers.
- `runtime -> catalog`: verification reuses doctor reports.

Everything else shares through `core/` or stays independent.

---

## Import conventions

These conventions are enforced by `scripts/check-barrel-imports.ts` through the `plugins` `CAPABILITY_BARREL_DOMAINS` entry.

- External daemon runtime code imports from `./plugins/index.js` or the correct relative path to that root barrel.
- `core/` is the foundation. Any plugin subdirectory may import it directly; `core/` imports no plugin sibling.
- Cross-subdirectory imports between non-core concerns must follow the declared allowed edges and must go through the sibling barrel, for example `../atoms/index.js`.
- Subdirectories must not import `../index.js`.
- The root barrel uses explicit named re-exports only. Subdirectory barrels may use `export *` for their private files.
- Tests are exempt from the runtime guard scan by design, but public-surface tests should import exported plugin symbols from `../src/plugins/index.js`.

---

## Known limitations & staged migration

- `core/` contains SQLite-backed registry and snapshot primitives, not only pure helpers. That is intentional for this slice: those storage primitives are the shared foundation that otherwise creates sibling cycles.
- Several implementation files are still large, especially atom and pipeline helpers. This slice keeps behavior unchanged and does not split function bodies.
- The root barrel now enumerates the promoted helper surfaces as public plugin API. A later cleanup can decide whether any `__forTest*` export should remain public or move behind a narrower test hook.

---

## Directory structure

```
plugins/
├── index.ts        Main public barrel with explicit named re-exports
├── core/           Shared registry, snapshots, events, trust, connectors, until parsing
├── atoms/          Built-in atom catalog, worker registry, and atom implementations
├── catalog/        Marketplaces, installed-plugin reads, validation, doctor, stats, search
├── install/        Install/uninstall, lockfiles, pack, publish, scaffold, candidates
├── runtime/        Apply, resolve snapshots, pipeline execution, simulation, verification
├── assets/         Plugin asset cache and URL safety checks
├── previews/       Baked plugin preview discovery and attachment
└── sharing/        Plugin share prompt rendering and folder staging
```

---

## Types

Plugin-specific types remain near their owning concern and are re-exported through that concern barrel and then the root barrel when they are part of the public surface. Cross-concern shared types live in `core/` beside the shared primitive they describe.
