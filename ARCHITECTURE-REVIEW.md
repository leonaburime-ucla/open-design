# Open Design — Architecture Review & Decomposition Proposal

**Date:** 2026-07-01
**Basis:** Static analysis of commit `ed1df234` (current `main`).
**Method:** Two independent graph extractions — `graphify` (95,517 nodes / 120,575 edges) and `codebase-memory-mcp` / cbm (206,875 nodes / 301,575 edges, AST-local complexity metrics) — cross-checked against direct source measurement.
**Scope:** 8,656 tracked files · 2,150 TypeScript/TSX source files.

---

## 0. TL;DR for maintainers

Open Design is a **healthy modular monorepo at the workspace level** (clean `apps/` `packages/` `tools/` split, a real shared-contract package, no forbidden cross-app imports) that has **rotted at the module level inside its two biggest apps**. The daemon and the web app have each grown a handful of 5,000–10,000-line "god files" that fuse orchestration, business logic, and I/O into single units with cyclomatic complexity in the 200–500 range.

The problem is **not** that the wrong architecture was chosen. It's that **no module architecture was enforced inside `apps/daemon` and `apps/web`**, so both regressed to framework-oriented layouts (group-by-technical-kind) with no domain seams.

**Do not pitch a big-bang rewrite.** For a live 8.6k-file project a rewrite is a credibility-killer. The defensible pitch is a **strangler-fig decomposition** of the named offenders, plus **fitness functions** (automated boundary lint) so the wins don't regress. This document names the offenders and the target architecture per app.

---

## 1. What is *already* good (say this first — it earns trust)

- **Workspace boundaries are real and clean.** `apps/web` → `apps/daemon/src` direct imports: **0**. The AGENTS.md rule that web/daemon integrate only via HTTP + `packages/contracts` is actually being honored in code, not just docs.
- **A shared kernel exists.** `packages/contracts` is a pure-TS DTO/SSE/error layer — this is the correct home for the anti-corruption boundary and it's already load-bearing.
- **Sidecar concerns are already factored** into `sidecar-proto` / `sidecar` / `platform` with a documented three-way split.
- **The daemon already has the *skeleton* of a service layer** (`routes/`, `runtimes/`, `services/`, `connectors/`, `storage/`, `registry/`, `integrations/`). The bones of hexagonal are present — they're just bypassed by the god files.

> **Analyst's note on data hygiene (mention this — it signals rigor):** I discarded three categories of false positive before drawing conclusions:
> - The graph's top "god nodes" by raw edge count (`test` fan-in 790, `push` 752, `filter` 713, `now` 626) are **method-name collisions** resolved across unrelated files, not real hubs.
> - The architecture tool's `daemon↔web` "boundary call_count" of ~1000 each way is the **same collision noise** — verified against zero real imports.
> - Every reported "import cycle" is an **Astro page self-reference** (`index.astro -> index.astro`), a known extractor artifact, not a real dependency cycle.
>
> All findings below rest on **AST-local metrics** (per-file LOC, per-function cyclomatic/cognitive complexity, hook counts) which are collision-proof.

---

## 2. Worst-offender files (ranked, evidence-backed)

### High-confidence, AST-local metrics

| Rank | File | LOC | Worst function (cyclomatic / cognitive) | Smell |
|------|------|-----|------------------------------------------|-------|
| 1 | `apps/web/src/components/FileViewer.tsx` | **10,645** | `HtmlViewer` 398 / 529 | God component: **205 hook calls**, 164 top-level declarations in one file |
| 2 | `apps/daemon/src/server.ts` | **9,025** | `startServer` **493 / 1065** | God module: **118 top-level functions**, **169 imports**, is *both* the composition root *and* holds business logic (`startChatRun`, stream bookkeeping) |
| 3 | `apps/daemon/src/cli.ts` | **8,914** | `runAutomation` 145 / 472 | Monolithic CLI: every `od` subcommand in one file |
| 4 | `apps/web/src/components/SettingsDialog.tsx` | **7,790** | `SettingsDialog` 200 / 291 | Every settings panel in one component |
| 5 | `apps/web/src/components/ProjectView.tsx` | **7,159** | `ProjectView` 438 / 707 | God component: **181 hook calls** |
| 6 | `apps/web/src/components/ChatComposer.tsx` | 4,855 | — | Feature-fused component |
| 7 | `apps/web/src/components/FileWorkspace.tsx` | 4,394 | `FileWorkspace` 145 / 167 | — |
| 8 | `apps/web/src/components/DesignSystemFlow.tsx` | 4,362 | — | — |
| 9 | `apps/daemon/src/media/index.ts` | 4,055 | — | Barrel doing real work |
| 10 | `apps/daemon/src/design-systems/index.ts` | 3,295 | — | Barrel doing real work |

**Context:** `apps/web/src/components/` holds **25 components over 1,000 lines each**; `apps/daemon/src` has 399 non-test source files but concentrates its logic in a few of them.

### The single worst function in the codebase

`startServer()` in `apps/daemon/src/server.ts` — **cyclomatic complexity 493, cognitive complexity 1065, fan-out 193 distinct callees, transitive loop depth 13.** For reference, most linters flag a function above cyclomatic 15. This one function is ~30× that. It is the composition root, the HTTP wiring, *and* the chat-run engine, all inlined.

### Complexity leaderboard (functions)

| Function | File | Cyclomatic | Cognitive |
|----------|------|-----------|-----------|
| `startServer` | daemon/src/server.ts | 493 | 1065 |
| `ProjectView` | web/…/ProjectView.tsx | 438 | 707 |
| `HtmlViewer` | web/…/FileViewer.tsx | 398 | 529 |
| `startChatRun` | daemon/src/server.ts | 267 | 637 |
| `registerChatRoutes` | daemon/src/routes/chat.ts | 242 | 435 |
| `SettingsDialog` | web/…/SettingsDialog.tsx | 200 | 291 |

---

## 3. Obvious structural issues

1. **The composition root is also a domain service.** `server.ts` imports from 23 route modules + 16 runtimes and *also* defines `startChatRun` / Claude stream bookkeeping. A composition root should wire dependencies and contain **zero** business logic. This is the highest-leverage single fix.

2. **Framework-oriented ("group-by-kind") layout inside both apps.** `web/src/components/*` is a flat bag of 25+ giant components; the daemon groups by HTTP concern (`routes/`) rather than by domain. Neither layout "screams" the domain (chat/runs, design-systems, skills, artifacts, automation, plugins, media, brands, critique, connectors, research). A newcomer reads the folders and learns the framework, not the product.

3. **The de-facto modules cut across the folder layout.** Leiden community detection over the call/import graph yields 12 clusters — and **every one spans 3–5 top-level dirs** (`apps` + `packages` + `tools` + `scripts` + `e2e`). Cohesion 0.55–0.80. This is the quantitative signature of "the real coupling doesn't match the directory tree." Example cluster top-nodes that belong together but live apart: `startChatRun`, `send`, `attachAcpSession`, `registerChatRoutes` (the chat domain, scattered across `server.ts`, `acp.ts`, `routes/chat.ts`, and web analytics).

4. **God components fuse many features + heavy state.** `FileViewer.tsx` (205 hooks) and `ProjectView.tsx` (181 hooks) are un-reviewable and un-testable in isolation. Every deck/comment/palette/edit/tweaks bridge is crammed into `FileViewer`. State sprawl at this scale guarantees effect-ordering bugs.

5. **The one capability rule is doc-enforced, not structure-enforced.** AGENTS.md mandates every capability ship HTTP + UI + CLI together (a vertical-slice principle). But the structure fights it: the HTTP third lives in `routes/`, the UI third in a flat `components/` bag, the CLI third in a single 8,914-line `cli.ts`. Nothing *structurally* keeps a slice together, so the rule survives only on reviewer diligence.

6. **Barrels that do work.** `media/index.ts` (4,055 LOC) and `design-systems/index.ts` (3,295 LOC) are `index.ts` files carrying real logic — they read as module APIs but are actually god modules, which defeats tree-shaking and hides their weight.

---

## 4. Architecture options, evaluated against *this* codebase

I ran the offenders against the major candidate architectures. None is a silver bullet; the right answer is **different per app**, unified by the existing shared kernel.

| Architecture | Fit | Verdict for Open Design |
|---|---|---|
| **DDD — strategic (bounded contexts)** | High | The domains already exist as named clusters. Use strategic DDD to *name and own* them (chat/runs, design-systems, skills, artifacts, automation, plugins, media, brands, critique, connectors, research). `packages/contracts` is your shared kernel / published language. |
| **DDD — tactical (aggregates/repos/entities)** | Low–Med | Overkill for most of this. A local design tool is not transaction-heavy; forcing repositories/aggregates everywhere would add ceremony without payoff. Apply selectively where invariants are real (runs, artifacts storage). |
| **Hexagonal / Clean (ports & adapters)** | **Very high — for the daemon** | The daemon *is* a service surrounded by adapters: agent CLIs, MCP, connectors, SQLite, filesystem, media tools. The skeleton (`runtimes/`, `connectors/`, `storage/`, `integrations/`) already gestures at ports. The fix: extract `startChatRun` & friends out of `server.ts` into application services behind a `RuntimePort`; make `server.ts` pure wiring. |
| **Vertical Slice** | **High — cross-cutting** | This is the *native* grain of the project (the HTTP+UI+CLI closure rule). Adopt it as the organizing principle so a capability is one folder, not three scattered thirds. |
| **Feature-Sliced Design (FSD)** | **Very high — for the web app** | FSD's layers (`app / pages / widgets / features / entities / shared`) are purpose-built to break exactly the god-component problem seen in `FileViewer`/`ProjectView`/`SettingsDialog`. This is the highest-leverage move for `apps/web`. |
| **Screaming Architecture** | High (as a lens) | Useful framing for maintainers: today the folders scream "React components" and "HTTP routes." They should scream "design systems," "chat," "artifacts." Use it to justify the reorg narrative. |
| **Modular monolith / package-per-domain** | Already partially true | You *are* a modular monolith at the workspace layer. The gap is intra-app modularity, not inter-app. Don't over-rotate into microservices/more packages — that would add boundaries you don't need. |

### Recommended target (hybrid, not a rewrite)

- **`apps/daemon` → Hexagonal + domain modules.** Application services per domain behind ports; adapters for each external system; `server.ts` demoted to a thin composition root. Kills the #1 and #3 offenders.
- **`apps/web` → Feature-Sliced Design.** Decompose god components into `features/*` + `entities/*` + `shared/*`. Kills #1, #4, #5 offenders and the hook-sprawl.
- **`apps/daemon/src/cli.ts` → one file per subcommand**, each importing the *same* application service its route uses (this is what the UI/CLI dual-track rule wants structurally).
- **Cross-cutting → keep `packages/contracts` as the shared kernel**, and make the vertical-slice capability the unit of organization on both sides.
- **Lock it in with fitness functions:** `dependency-cruiser` or ESLint boundary rules that (a) forbid new cross-app `src` imports, (b) cap file LOC / function cyclomatic complexity in CI, (c) enforce the layer import direction (adapters → app → domain, never reverse). Without these, the god files grow back.

---

## 5. Suggested sequencing (strangler-fig, lowest-risk first)

1. **Add fitness functions to CI first** (complexity + LOC + boundary caps, initially *warn-only* with a ratchet). This freezes the bleeding and gives maintainers a dashboard before any refactor.
2. **Extract the chat-run engine out of `server.ts`** into a daemon application service. Single highest-leverage change; directly attacks the 493/1065 function.
3. **Split `cli.ts`** into per-subcommand files calling shared services (mechanical, low-risk, high readability payoff).
4. **FSD-decompose `FileViewer.tsx` then `ProjectView.tsx`** feature-by-feature (bridges are already message-passing seams — natural cut lines).
5. **Convert working barrels** (`media/index.ts`, `design-systems/index.ts`) to real modules with a thin re-export index.
6. **Formalize domain modules** in the daemon once services are extracted.

Each step is independently shippable, independently reviewable, and reversible — the opposite of a big-bang rewrite.

---

## 6. Daemon domain-module decomposition — actionable per-domain plan

This is the concrete expansion of §5 step 6. `cli/` (16 subdirs) and `design-systems/` (6 subdirs) already ship the enforced **capability-barrel** pattern; the remaining **125 flat top-level files in `apps/daemon/src`** are the last god-directory (the domain/service layer). Apply the same pattern one domain per PR.

**Basis (2026-07-03 re-run):** ground-truth parse of every `import ... from './x'` across the 125 files (authoritative file-to-file adjacency), cross-checked with cbm Leiden clusters and graphify (God Nodes `startServer`/`AppConfig`; **zero import cycles inside `apps/daemon/src`** — a clean DAG, so acyclic `allowedEdges` fit without breaking cycles first).

**Pattern rules** live in `scripts/check-barrel-imports.ts` (`CAPABILITY_BARREL_DOMAINS`); reference impl `apps/daemon/src/design-systems/` + its `README.md`. Kernel = `core/` (importable directly by any sibling); non-foundation siblings reach each other only through declared acyclic `allowedEdges` via the sibling's `index.ts`; external code imports only the domain root `index.ts` (named re-exports, never `export *`).

### 6.1 Cohesion data (why these groupings)

`internal` = edges within group · `fanOut` = group→outside · `fanIn` = outside→group. High internal + low fanOut = clean barrel.

| Group | files | internal | fanOut | fanIn | verdict |
|---|---|---|---|---|---|
| **memory** | 6 | 7 | 3 | 2 | ⭐ Tier-1 cleanest |
| **automation** | 5 | 5 | 1 | 2 | ⭐ Tier-1 |
| **library** | 5 | 4 | 4 | 4 | ✅ Tier-1 |
| **mcp** | 8 | 4 | 2 | 9 | ✅ Tier-1 (widely consumed) |
| run | 9 | 3 | 3 | 14 | Tier-2 (mostly server.ts's helpers) |
| project | 6 | 5 | 4 | 15 | Tier-2 (projects.ts is core infra) |
| agent-conn | 10 | 7 | 4 | 11 | Tier-2 |
| codex | 5 | 1 | 0 | 1 | Tier-3 (loose namespace) |
| telemetry | 6 | 5 | 14 | 5 | Tier-3 (leaky — extract to core first) |
| export | 8 | 2 | 11 | 7 | Tier-3 (leaky) |

### 6.2 Tier-1 domains (one PR each — independent, order-free)

Intra-group edges from the ground-truth parse. `intra` = deps inside domain · `extra` = deps that stay external.

**`memory/`** ☐ (6 files, ~3,476 LOC)
```
memory.ts (1105)              intra:[memory-extractions]         extra:[]
memory-extractions.ts (242)  intra:[memory]                     extra:[]      ⚠ 2-CYCLE with memory.ts
memory-llm.ts (1318)         intra:[memory, memory-extractions] extra:[agents, app-config]
memory-connectors.ts (1356)  intra:[memory-llm]                 extra:[tool-tokens]
memory-rules.ts (252)        intra:[memory-llm]                 extra:[]
memory-verify.ts (203)       intra:[memory]                     extra:[]
```
`memory.ts ↔ memory-extractions.ts` is a real 2-cycle (graphify missed it) → co-locate. Promoting `memory-llm` into `core/` too yields a pure star.
- `core/` = `memory` + `memory-extractions` + `memory-llm` · siblings `connectors/`, `rules/`, `verify/` (all → core)
- `foundation: 'core'`, `allowedEdges: []`. `routes/memory.ts` + `cli/memory/` stay and import the barrel.

**`automation/`** ☐ (5 files, ~2,072 LOC)
```
automation-templates.ts (337)          intra:[]  extra:[]   (base)
routines.ts (727)                      intra:[]  extra:[]   (base)
automation-proposals.ts (345)          intra:[automation-templates]  extra:[memory]
automation-ingestions.ts (546)         intra:[automation-proposals, automation-templates]  extra:[]
automation-routine-evolution.ts (117)  intra:[routines, automation-ingestions]  extra:[]
```
- `core/` = `automation-templates` + `routines` + `automation-proposals` · `ingestions/` (→core) · `routine-evolution/` (→core routines + ingestions)
- `foundation: 'core'`, `allowedEdges: [['routine-evolution','ingestions']]`. `routes/automation.ts`, `routes/routine.ts`, `cli/automation/` stay.

**`library/`** ☐ (5 files, ~1,750 LOC)
```
library-store.ts (661)   intra:[]                     extra:[]                 (base)
library.ts (420)         intra:[library-store]        extra:[]
library-tokens.ts (136)  intra:[library-store]        extra:[]
library-sync.ts (349)    intra:[library, library-store]  extra:[db, projects]
library-install.ts (184) intra:[]                     extra:[linked-dirs, skills]
```
- `core/` = `library-store` + `library` · siblings `tokens/`, `sync/`, `install/` (all → core)
- `foundation: 'core'`, `allowedEdges: []` (pure star). `routes/library.ts` + `cli/library/` stay.

**`mcp/`** ☐ (7 files after straggler move, ~4,767 LOC)
```
mcp.ts (1859)  mcp-config.ts (1233)  mcp-oauth.ts (602)  mcp-tokens.ts (259)
mcp-install-info.ts (112)  mcp-agent-install.ts (435)  mcp-live-artifacts-server.ts (267)   — all intra:[] extra:[]
mcp-routes.ts (454)  intra:[mcp-install-info, mcp-config, mcp-oauth, mcp-tokens]  extra:[codex-cli, server-context]  → STRAGGLER
```
- `mcp-routes.ts` is an HTTP registrar and the only cross-file consumer → **move to `routes/mcp.ts`** (imports the `mcp/` barrel).
- `core/` = `mcp-config` + `mcp-oauth` + `mcp-tokens` + `mcp-install-info` · `client/` = `mcp.ts` · `agent-install/` · `live-artifacts/`
- `foundation: 'core'`, `allowedEdges: []` (pure star). ⚠ name collision: keep distinct from `runtimes/mcp.ts` and `cli/mcp/`.

### 6.3 Stragglers (merge into the folder that already owns them — not new barrels)
- `db.ts` (2,269 LOC) → `storage/` (joins `daemon-db.ts`, `db-inspect.ts`).
- `*-routes.ts` (`mcp-routes`, `brand-routes`, `import-export-routes`) → `routes/`.
- CLI stragglers (`tools-*-cli.ts`, `artifacts-cli.ts`, `handoff-cli.ts`, `*-cli-help.ts`, `codex-cli.ts`) → evaluate for `cli/`.

**Leave flat (shared kernel — do NOT bury in a domain):** `server.ts`, `app-config.ts`, `constants.ts`, `redact.ts`, `home-expansion.ts`, `installation.ts`, `daemon-paths.ts`, `daemon-url.ts`, `daemon-startup.ts`, `server-context.ts`.

### 6.4 Per-domain recipe (resumable)
1. `mkdir <domain>/{core,<siblings>}`; `git mv` each file into its subdir, dropping the `<domain>-` prefix.
2. Fix intra-domain imports: siblings reach `core/` via `../core/index.js`, other siblings only via declared `allowedEdges` barrels.
3. Add each subdir `index.ts`, then the domain root `index.ts` (named re-exports, no `export *`).
4. Repoint external importers (esp. `server.ts`) to the root barrel; ripgrep old specifiers to find them all.
5. Move tests into the domain test tree mirroring subdirs (design-systems `__tests__/{core,user}/` precedent — do not flatten).
6. Register the domain in `CAPABILITY_BARREL_DOMAINS` (`scripts/check-barrel-imports.ts`) + extend its test if a new edge shape appears.
7. Add `<domain>/README.md` (mirror `design-systems/README.md`).

Drive the mechanical move with the **fixing-open-design** dev-skill; delegate docblock/summary generation to a Sonnet 4.6 subagent (Haiku too inaccurate here).

**Validate per PR:** `pnpm guard` (must print `Capability barrel check passed: N domain(s)…`), `pnpm typecheck`, `pnpm --filter @open-design/daemon test`, `pnpm --filter @open-design/daemon build`.

### 6.5 Backlog (later sessions)
- **Tier-2:** `run/` (weak seam — 14 fanIn from server.ts), `project/` (projects.ts is core infra), `agents/` (agent-connection: agents/acp/pi-rpc/connectionTest[2,659 LOC]/copilot-stream/claude-diagnostics/byok-tools/agent-session-resume/amr-stderr-filter/user-facing-agent-label).
- **Tier-3 (leaky — extract shared helpers to `core/` first):** `telemetry/` (fanOut 14), `export/` (fanOut 11). `codex/` cosmetic (1 internal edge), low priority.

---

## Appendix — data provenance

- Graph A: `graphify-out/GRAPH_REPORT.md` + `graph.json` (95,517 nodes, built at `ed1df234`).
- Graph B: `codebase-memory-mcp`, project `…open-design` (206,875 nodes, `status: ready`), AST-local complexity metrics via Cypher.
- Direct measurement: `wc -l`, `grep` hook/decl counts, import-edge verification.
- Excluded as artifacts: name-collision god nodes, phantom daemon↔web call counts, Astro self-reference cycles (documented in §1).
