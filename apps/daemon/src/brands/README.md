# Brands Capability Barrel

## What Changed (Refactor History)

1. `apps/daemon/src/brand-routes.ts` moved into `brands/routes/`.
2. The former `brands/index.ts` god file was split into extraction, transcript, finalization, preview, and catalog concerns.
3. Shared storage, schema, validation, DESIGN.md, id/path, cancellation, and filesystem primitives moved into `core/`.
4. Existing asset, kit, system, memory, generation, and engine code moved behind concern barrels.
5. The root `brands/index.ts` is now the only runtime public API and explicitly re-exports the prior brand API plus the former route registrar exports.

## Why This Shape (Architecture Reasoning)

`core/` is the foundation kernel. It owns shared brand types, persisted store primitives, schema/validation, URL/id helpers, cancellation guards, and project-file readers. Every other concern can import core directly, and core imports no sibling concern.

The non-foundation graph is acyclic. `routes/` sits at the top and calls catalog, extraction, finalization, preview, and transcript surfaces. `extraction/` owns start/continue/programmatic harvest orchestration and depends on lower-level generation, finalization, preview, transcript, kit, assets, and catalog barrels. `finalize/` owns registration and project sync, depending on system, kit, assets, memory, and transcript. `preview/` depends on kit and assets. `system/` depends on the deterministic `engine/` and asset/font support. Shared cancellation and id helpers were moved down to core instead of creating an extraction/finalize cycle.

## Import Conventions

- Runtime code outside `brands/` imports only from `apps/daemon/src/brands/index.ts`.
- Files directly under `brands/` may reach subdirectories only through subdir barrels.
- Non-core sibling imports must follow the `allowedEdges` entry registered in `scripts/check-barrel-imports.ts`.
- Cross-sibling imports use `../<sibling>/index.js`, never a private sibling file.
- Subdirectories must not import the brands root barrel.
- The root barrel uses explicit named re-exports so the public API is reviewable.
- Tests are exempt from the runtime guard by design; public-surface tests should still prefer the root barrel, while true white-box tests may import internal files.

## Known Limitations & Staged Migration

- The deterministic `engine/` was already a nested module with its own README. This refactor preserves that structure and only routes its brand/asset imports through the new concern boundaries.
- Some asset and engine files still carry existing `@ts-nocheck` annotations. This slice preserves behavior and does not attempt a type-hardening cleanup.
- The root barrel intentionally preserves the old public brand export names. Internal storage helpers stay internal; external runtime callers that need brand metadata use `readBrandDetail`.

## Directory Structure

```text
brands/
  index.ts        public capability barrel
  core/           shared types, store, validation, ids, cancellation, file readers
  assets/         Chrome/prefetch/font/logo/imagery/seed fallback harvesting
  generation/     provisional Brand synthesis from harvested material
  kit/            localized brand.html rendering
  engine/         deterministic token/component/artifact engine
  system/         generated system artifact rebuild/read helpers
  catalog/        brand list/detail/delete/logo lookup facade
  preview/        live in-project brand.html preview rendering
  transcript/     synthetic programmatic extraction transcript lifecycle
  finalize/       validation, system registration, project sync, memory reflow
  extraction/     start/continue/programmatic/browser-html extraction orchestration
  routes/         Express HTTP route registrar
  memory/         memory-entry conversion and reflow integration
```

## Types

Shared domain types that would otherwise create cycles live in `core/types.ts`: deterministic `PrefetchResult` candidates, `SeedToken`, and transcript agent identity. Contract DTOs such as `Brand`, `BrandMeta`, and `BrandFinalizeResponse` remain in `@open-design/contracts`; daemon-only workflow option types live with the concern that owns the workflow.
