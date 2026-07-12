# file-workspace slice — decomposition complete

`apps/web/src/components/FileWorkspace.tsx` has been fully decomposed into
the ADR-0002 vertical-slice architecture at `apps/web/src/features/file-workspace/`,
following `dev-skills/fixing-open-design-web/SKILL.md` and mirroring the
`apps/web/src/features/memory/` (`MemorySection`) canary.

## Final numbers

- **FileWorkspace.tsx**: 5,742 lines (session start) → 1,372 lines.
- Every cluster in `EXTRACTION-PLAN.md` is `done`, including both
  sub-clusters of the high-risk tab-activation hub (cluster 3).
- Two independent Phase 8.5 audit passes ran against the file (each with no
  memory of the other's reasoning); every finding from both is resolved —
  fixed where it was a genuine gap, or documented as a deliberate,
  Phase-8-sanctioned exception (analytics cross-cutting concerns, a
  pre-existing product behavior predating this refactor entirely, and
  documented hook-ordering constraints).
- All 12 feature-hook calls are injectable (`FileWorkspaceHooks`), matching
  the `MemorySection.tsx` pattern, with two tests proving the seam works.

## Definition of Done (SKILL.md)

- [x] Green baseline captured before edits (each pass).
- [x] Wire DTOs sourced from `packages/contracts`, never redeclared;
      transport in `providers/` with browser-subscription bridges
      (`providers/dom.ts`).
- [x] Slice owns `ports.ts` (result types in-slice) + `dependencies.ts` (the
      only feature-file provider importer); pure logic in `rules.ts`;
      feature-local `useX(port)` + `useWiredX()` hooks; dumb `components/`;
      one public `index.ts` barrel.
- [x] Orchestrator slimmed, composes via the barrel only, public export
      surface identical (`FileWorkspace`, `DESIGN_FILES_TAB`,
      `DESIGN_SYSTEM_TAB`, `scrollWorkspaceTabsWithWheel`,
      `BrowserOpenRequest`/`BrowserAttentionRequest` — unchanged; the
      `FileWorkspaceHooks` props are additive/optional).
- [x] Zero standalone `function`/named-`const`-arrow declarations at the
      orchestrator's top level (`grep '^\s*function \|^\s*async function
      \|^\s*const \w\+ = ('` returns no matches, same as the
      `MemorySection.tsx` calibration).
- [x] Each feature hook call is injectable via an optional prop defaulting
      to the real wired hook.
- [x] Exact markup/className/i18n keys preserved; no logic changes beyond
      pure structural moves; no CSS migration; no TanStack/SWR.
- [x] `pnpm --filter @open-design/web typecheck`, the file-workspace slice
      tests (`tests/features/file-workspace/`, 500+ tests across 25 files),
      the existing `FileWorkspace.tsx` component tests
      (`tests/components/FileWorkspace.test.tsx`,
      `FileWorkspace.design-system.test.tsx`), and `pnpm guard`
      (`apps/web vertical-slice boundary check passed.`) are all green.
      The one exception — `FileWorkspace.design-system.test.tsx`'s
      "refreshes before downloading the current project archive" — fails
      identically on the pre-decomposition base branch
      (`origin/refactor/web-mcp-client-slice`), confirmed via a direct
      diff-free re-run against that commit; it is a pre-existing test/mock
      mismatch unrelated to this refactor.
- [x] Committed with no co-author trailer.

## Not in scope for this pass

Phase 9.5's coverage-driven refactor loop (≥98% on all four metrics,
aggregate and per file) was not run. The task's own explicit completion
gates (typecheck, slice tests, existing component tests, guard) don't
reference it, and Phase 9.5 is a separate, substantial loop (classify every
uncovered branch, refactor away dead ones, add SSR-guard companions) that
would warrant its own dedicated pass(es) if requested.

## Audit trail

See `EXTRACTION-PLAN.md` for the full cluster-by-cluster history, both
Phase 8.5 audit passes' findings and resolutions, and the injectable-hooks
write-up.
