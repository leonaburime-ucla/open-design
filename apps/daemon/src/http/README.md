# http

Daemon module for mounting JSON routes on Express: the `Result`/route-spec types, request
normalization, response serialization, the same-origin guard, and the Adapter that wires them
together — plus a small "compat" layer of legacy error helpers still used by hand-mounted routes
in `server.ts`.

It follows the **capability barrel pattern** established by the `design-systems` module — a
machine-enforced module layout for refactoring flat/god-file daemon subsystems. If you are here
to evaluate that pattern applied to a second module, read "What changed", "Why this shape", and
"Import conventions" below; the per-directory reference table is at the end.

---

## What changed (refactor history)

The module was originally a flat directory of six source files alongside `index.ts`
(`adapter.ts`, `api-errors.ts`, `origin-guard.ts`, `parse.ts`, `response.ts`, `types.ts`), with
`index.ts` re-exporting five of them via `export *`. `api-errors.ts` was **not** on the barrel at
all — `server.ts` reached directly into `./http/api-errors.js`, exactly the "public vs. internal
indistinguishable" anti-pattern the capability-barrel refactor exists to fix.

The refactor used a strangler-fig pattern — **no logic changes, only structural moves** —
followed by machine enforcement:

1. Created `core/`, `request/`, `response/`, `origin/`, `compat/`, `adapter/` subdirectories.
2. Moved each flat source file to the subdirectory matching its concern, fixing the relative
   import paths the move broke (`origin-guard.ts` also gained one extra `../` hop to reach
   `origin-validation.ts`, which lives at the daemon-source root, not inside `http/`).
3. Added `@module` docblocks and per-symbol JSDoc to every file.
4. Added per-subdirectory barrel `index.ts` files with summary docblocks, and rebuilt the root
   `index.ts` to re-export only from those subdir barrels, with explicit named exports instead of
   `export *`.
5. Routed `api-errors.ts`'s three helpers onto the root barrel for the first time (under `compat/`),
   and updated `server.ts` to import them from `./http/index.js` instead of the private file it
   used to reach into. `compat/api-errors.ts` defines its own `sendApiError(res, status, code,
   message, init)` (separate-arguments call shape), which collides by name with `response/`'s
   `sendApiError(res, status, error: ApiError)` (single-object call shape); the root barrel
   re-exports the compat one as `sendCompatApiError`, and `server.ts` imports it aliased back to
   its original local name (`sendCompatApiError as sendApiError`) so its ~20 existing call sites
   needed no further changes.
6. Updated `routes/active-context.ts`, the module's other external importer, which already used
   the barrel path (`../http/index.js`) and needed no change.
7. Added `scripts/check-barrel-imports.ts` (run by `pnpm guard`) to enforce the import rules
   below, plus `scripts/check-barrel-imports.test.ts` covering each rule. This scan machinery
   (and its `CAPABILITY_BARREL_DOMAINS` registry) did not yet exist on this fork's `main` when
   this module was refactored — `design-systems`, the pattern's original reference module, is
   mid-migration to this same shape on a separate, not-yet-merged branch. `http` is therefore the
   first domain actually registered here; see "Known limitations" below.

No cycle needed breaking: `adapter/` is the only subdirectory with cross-subdir dependencies
(`request/`, `response/`, `origin/`, all one level deep), and none of its dependencies import
each other or import `adapter/` back.

The public API surface (`index.ts` exports) is unchanged for every name it already exported.
Three names are newly *reachable through the barrel* that previously required a private deep
import (`createCompatApiError`, `createCompatApiErrorResponse`, `sendCompatApiError`) — see point
5 above; this is an intentional widening, not an accidental one, and is exactly what the
`server.ts` fix in this refactor exists to correct.

---

## Why this shape (architecture reasoning)

At six files, `http/` is far smaller than `design-systems/`'s original thirteen, but the same
forces were present in miniature: `api-errors.ts` had drifted into a deep-import-only file with
no enforced boundary, and nothing stopped a future addition from creating a real cross-file
cycle as the module grew. Rather than wait for the module to get bigger before applying
structure, the pattern was applied now, while the concerns are still easy to name correctly:

- **`request/`** (parse.ts) — turns a raw Express `Request` into the framework-independent
  `RouteInputContext`, and builds the standard validation-error shape.
- **`response/`** (response.ts) — writes a JSON body or an `ApiError` envelope onto an Express
  `Response`, and maps error codes to HTTP statuses.
- **`origin/`** (origin-guard.ts) — the same-origin security check, wrapped in the module's
  `Result` pipeline.
- **`compat/`** (api-errors.ts) — the legacy, separate-arguments error helpers `server.ts`'s
  hand-mounted routes still call directly, kept isolated from the newer `JsonRouteSpec` call
  shape in `response/` rather than merged with it.
- **`adapter/`** (adapter.ts) — the top orchestration layer: the only code in the module that
  touches Express `req`/`res` on the mounting side, wiring `request/` + `origin/` + a route's own
  `handle` + `response/` into one Express handler.
- **`core/`** (types.ts) — the `Result` envelope and route-spec types every other subdirectory
  needs.

`allowedEdges` came out to exactly three, all from `adapter/`: `adapter → request`,
`adapter → response`, `adapter → origin`. `request/`, `response/`, `origin/`, and `compat/` have
no edges to each other — each is a leaf concern reachable only through `core/` (which none of
them actually need to import today, since none currently share a symbol beyond what's already in
`core/types.ts`) and through `adapter/`'s orchestration. A short, one-directional edge list is
the sign the split matches the module's real concerns rather than an arbitrary one.

---

## Import conventions

These conventions are **machine-enforced** by `scripts/check-barrel-imports.ts` (part of
`pnpm guard`); the domain's `foundation` and `allowedEdges` are declared in that file's
`CAPABILITY_BARREL_DOMAINS` registry, and the config itself is validated as acyclic before any
file is scanned.

- All relative imports use `.js` extensions (Node ESM).
- **`core/` is the foundation kernel.** Any subdirectory may import it directly
  (`'../core/index.js'` or a `'../core/types.js'` path); `core/` itself imports no sibling.
- **A subdirectory may depend on a non-foundation sibling only along a declared, acyclic edge**,
  and only through that sibling's barrel (`'../<sibling>/index.js'`), never a private file.
  Current edges: `adapter → request`, `adapter → response`, `adapter → origin`. A would-be
  two-way edge is a smell — relocate the shared piece to `core/` instead.
- **A subdirectory must not import the domain root barrel** (`'../index.js'`); it re-exports
  every subdir and invites a circular dependency. Reach `core/` or an allowed sibling barrel
  directly.
- **A file directly under the domain root** (the root `index.ts`) may reach a subdir **only
  through that subdir's barrel**, never a private file.
- **The domain root barrel uses explicit named re-exports**, never `export *` — the public
  surface must be enumerable and free of silent name collisions. (`compat/`'s `sendApiError` is
  re-exported as `sendCompatApiError` for exactly this reason — see "What changed" point 5.)
- **External daemon code imports from `'./http/index.js'`** (or the subpath equivalent) — never
  from a subdirectory path directly.
- **Tests are exempt, by design.** The guard scans only `src/` (runtime code); files under
  `apps/daemon/tests/` may white-box import subdir internals. **Convention, not enforced:** a
  test covering a symbol the root barrel *does* export should still import it from
  `'../../src/http/index.js'`, so the public API is exercised the way real consumers use it.

The guard scans static imports, re-exports (`export * from`, `export { } from`), `import type`,
dynamic `import()`, and `import x = require()`. Its `check-barrel-imports.test.ts` suite
exercises each rule plus the config-cycle validator.

---

## Known limitations & staged migration

- **This is the first domain actually registered in `CAPABILITY_BARREL_DOMAINS`.** The pattern's
  original reference module, `design-systems/`, was refactored to this same shape on a separate
  branch (`design-systems-capability-barrels`) that had not merged to this fork's `main` as of
  this PR, and neither had `scripts/check-barrel-imports.ts` itself — it did not exist on `main`
  before this change. This PR ports the guard's scan machinery (unchanged from that branch) and
  registers `http` as its first domain. **Follow-up:** once `design-systems-capability-barrels`
  lands, its entry should be added to the same `CAPABILITY_BARREL_DOMAINS` registry rather than
  re-implemented — the scan machinery already supports multiple domains.
- **`core/` currently has one file and no subdirectory imports it in practice** beyond `types.ts`
  itself: `request/` and `origin/` import specific types from it, `response/` and `compat/`
  don't need to. It is still the correct foundation placement per the pattern (structural home
  for shared types, not a measure of how many siblings currently use it).
- **`compat/` is a deliberately small, closed concern.** It exists only because `server.ts`'s
  routes, written before `JsonRouteSpec` existed, call error helpers with a different argument
  shape than the rest of the module. It is not expected to grow; new routes should use
  `defineJsonRoute`/`mountJsonRoute` from `adapter/` and `response/`'s `sendApiError` instead.

**Staged migration guidance.** Per module: (1) carve concern-based subdirs, (2) add barrels +
`@module` docblocks, (3) register the domain in `CAPABILITY_BARREL_DOMAINS` with its `foundation`
and `allowedEdges`, (4) fix the violations the guard surfaces, (5) land with `pnpm guard` green.

---

## Directory structure

```
http/
├── index.ts     Main public barrel — named re-exports from all subdirectories
├── core/        Result envelope and route-spec types — the foundation every sibling may import
├── request/     Raw Express Request -> RouteInputContext, plus the validation-error builder
├── response/    JSON body / ApiError envelope writes, error-code -> HTTP-status mapping
├── origin/      Same-origin security guard, wrapped in the module's Result pipeline
├── compat/      Legacy separate-arguments error helpers used by server.ts's hand-mounted routes
└── adapter/     Orchestration layer: defineJsonRoute, mountJsonRoute — the only Express-facing code
```

### `core/`

| File | What it does |
|---|---|
| `types.ts` | `Result`/`ok`/`err`, `RouteInputContext`, `InputParser`, `Handler`, `HttpMethod`, `JsonRouteSpec` |

### `request/`

| File | What it does |
|---|---|
| `parse.ts` | `rawInput` (Express `Request` -> `RouteInputContext`), `validationError` (builds a `BAD_REQUEST` `ApiError`) |

### `response/`

| File | What it does |
|---|---|
| `response.ts` | `sendJson`, `sendApiError` (single `ApiError` object), `statusForError` |

### `origin/`

| File | What it does |
|---|---|
| `origin-guard.ts` | `guardSameOrigin`, `OriginContext` |

### `compat/`

| File | What it does |
|---|---|
| `api-errors.ts` | `createCompatApiError`, `createCompatApiErrorResponse`, `sendApiError` (separate `code`/`message`/`init` arguments; re-exported from the root barrel as `sendCompatApiError`) |

### `adapter/`

| File | What it does |
|---|---|
| `adapter.ts` | `defineJsonRoute`, `mountJsonRoute`, `AdapterContext` |

---

## Types

All shared TypeScript types live in `core/types.ts` and are re-exported through `core/index.ts`
→ `index.ts`. Types purely local to one file (e.g. `compat/`'s internal argument shapes) stay in
that file and are not exported from the barrel.
