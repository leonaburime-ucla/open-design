# `integrated` — combined buildable trunk of all in-flight refactors

**To any AI or human reading this: read this file first to understand this branch.**

## What this branch is

`integrated` is the **working development trunk** that combines **every in-flight refactor** of `nexu-io/open-design` into one **buildable** tree, so development continues from the latest state instead of scattered branches. It is the author's forward baseline — new work (e.g. the `server/` decomposition, the next god-file barrels) is built on top of this.

It combines, all reconciled and green:

1. **The `server.ts` decomposition** (strangler-fig slices 1–4). `apps/daemon/src/server.ts` is the **decomposed ~3,400-line** version; helpers live in `http/`, `routes/`, `runtimes/`, `run-*.ts`, etc.
2. **All 12 capability-barrel domains**: `design-systems, mcp, memory, library, automation, run, project, telemetry, codex, export, agents, cli` — each under `apps/daemon/src/<domain>/` with a `core/` kernel + concern subdirs + barrels. **Zero flat `<domain>-*.ts` files remain.**

## Validation status (as of 2026-07-04)

- ✅ `pnpm --filter @open-design/daemon typecheck` (src **and** tests) — **GREEN**.
- ✅ Capability barrel guard — **12/12 domains enforced** (`scripts/check-barrel-imports.ts`).
- ⚠️ `pnpm guard` overall reports one unrelated failure: residual `.js` in the author's local `AI-Dev-Shop/` tooling (untracked, not part of this repo). Not a daemon issue.

## How the two stacks were reconciled

The server-decomposition stack and the 12 barrel stacks are ~95% orthogonal — they collided on **exactly one file, `server.ts`** (both rewrote it). Resolved by keeping the decomposed `server.ts`; ~13 cross-barrel import paths were repointed to make the combined tree typecheck (files that moved into one domain's barrel were referenced via flat/wrong-depth paths by another domain).

## Relationship to upstream

This trunk is ~57 commits ahead of `origin/main` and deliberately diverges — it front-runs PRs that are still open individually upstream. It is a personal integration baseline, not a single PR. Local `main` still tracks upstream as the clean backup. When the individual PRs merge upstream, reconcile against them.

## Next-target roadmap (un-barreled god-files, by leverage)

`server.ts` (in-flight: `server/` folder decomposition) → `db.ts` (2.3k) → `langfuse-*` (3.3k) → `tools-*` (3.3k) → `deploy.ts` (2.0k) → `acp.ts` (1.7k) → mid-size (`skills.ts`, `finalize-design.ts`, `brand-*`, `app-config.ts`, `lint-artifact.ts`).
