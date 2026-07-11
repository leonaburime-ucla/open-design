# SettingsDialog.tsx extraction plan

One-time full inventory (SKILL.md Phase 1 step 4), written before any extraction
in this pass. `SettingsDialog.tsx` was at 3987 lines when this plan's profiling
read started (git `e2fb1a6c7`). Already-extracted sections (do NOT redo):
OrbitSection, MediaProvidersSection, IntegrationsSection, AppearanceSection,
CritiqueTheaterSection, NotificationsSection, About/Language/custom-instructions
sections, the AMR account cluster, the local-CLI agent-list cluster
(`useWiredDaemonAgents`), the AMR-card highlight nudge (`useAmrHighlight`).
`MemorySection` and `McpClientSection` are intentionally left as-is — they
already consume their own sibling slices (`features/memory`,
`features/mcp-client`).

**UPDATE (same pass, before cluster 1 execution started):** a concurrent
hourly pass landed `ea6b4abda` ("decompose the Local CLI agent grid JSX into
LocalCliSection + AgentModelPicker") while this plan was being written, taking
the file from 3987 → 3004 lines. That commit fully covers clusters 6, 7, and
8 below (agent-model-config rendering, Codex path-repair actions, and the
agent-grid portion of the JSX breakdown — the BYOK-form portion of cluster 8's
JSX, i.e. the `ByokKeyField`/`ByokProviderBaseUrl`/`ByokProviderPicker`/
`ByokConnectionTestControl` composition, was *already* dumb-component-ized
before this plan was written; only the agent-grid half was still inline).
It also renamed the old inline `renderTestMessage` to a `rules.ts` function
`formatConnectionTestMessage` (partial progress on cluster 3 — the function
is extracted, but the state/refs/effects/handlers around it are not). Those
three clusters are marked done below; their entries are kept (not deleted)
as a record of what landed and where, per "correct just that cluster's entry."
Re-profiled against the current file (3004 lines) before writing clusters
2-5, 9-13, which remain accurate.

**Line numbers are a snapshot at the commit noted per-cluster and will drift
as clusters land — re-`grep` the anchor identifiers named per cluster before
starting work on it, don't trust the numbers blindly.**

## What's left, by location

### Still inline in SettingsDialog.tsx (reduces the file's own line count)

This is the "execution" section (BYOK API-mode + Local-CLI agent list), by far
the largest remaining chunk of code physically inside the orchestrator —
roughly lines 420-2304 (state/handlers/derived values) + 2606-3861 (its JSX).//
Broken into clusters below, ordered to extract low-coupling pieces first and
defer the most-entangled derived-state cluster until its dependents exist.

### Standalone leaf components NOT yet moved into the slice

`PrivacySection.tsx`, `ProjectLocationsSection.tsx`, `DesignSystemsSection.tsx`
(651 lines), `pet/PetSettings.tsx` (1132 lines) still live under
`apps/web/src/components/`. SettingsDialog.tsx already renders each as a
2-6 line composition (`<XSection cfg={cfg} setCfg={setCfg} .../>`), so they
don't inflate the orchestrator's own line count or violate the "thin shell"
end state directly — but the overall ADR-0002 goal is every section living in
the slice, and the job's PROFILE explicitly calls these out. Treated as
lower-priority clusters, tackled after the inline BYOK work is done, smallest
first.

---

## Cluster list

### 1. BYOK provider presets + option derivation — **pending**
- **Owns**: `ByokProviderPreset` interface (top of file), the ~170-line
  `byokProviderPresets` literal array, `customByokProvider`,
  `byokPresetProtocols`, `byokProviderOptions`, `selectedByokProvider`,
  `byokProviderConfigured` (anchor: search `byokProviderPresets`,
  `byokProviderConfigured` — currently ~lines 228-235, 1223-1430, 1717-1743).
  JSX consumer: the provider protocol-chips block (~2651-2702).
- **Coupling**: reads `cfg`, `apiProtocol`, `t` only. No shared mutable state
  with other BYOK clusters — the safest possible first cut.
- **Target shape**: `constants.ts` gets the static preset list data (minus the
  `t()`-dependent `custom` entry, which stays a function); `rules.ts` gets
  `buildByokProviderOptions(t, apiProtocol, cfg)`,
  `selectByokProvider(options, cfg)`, `isByokProviderConfigured(...)` as pure
  functions; a new dumb component `components/ByokProviderChips.tsx` for the
  protocol-chips JSX (props: options, selected, onSelect, track callback).
- **Risk**: low.
- **Status**: **done**. Landed as `BYOK_PROVIDER_PRESETS` (`constants.ts`),
  `customByokProviderPreset`/`buildByokProviderOptions`/`selectByokProvider`/
  `isByokProviderConfigured` (`rules.ts`), `ByokProviderPreset` (`types.ts`),
  and the `ByokProviderChips` dumb component. The orchestrator now composes
  these through the barrel; the protocol-chips JSX is a single
  `<ByokProviderChips ... onSelect={(provider, active) => {...tracking...}} />`
  call. Tests added to `tests/features/settings/rules.test.ts`.

### 2. BYOK field-focus + precondition-notice bridge — **done**
- **Owns**: `byokRequiredLabel`, `formatByokMissingFields`,
  `focusByokRequiredField` (uses 4 input refs + `window.setTimeout`),
  `byokPreconditionNotice` state, `showByokPreconditionNotice`,
  `byokDraftIssueMessage`, `showByokDraftValidationNotice`.
- **Coupling**: consumed by BOTH cluster 3 (connection test) and cluster 4
  (model discovery) — this must land before/alongside those two, or they take
  it as a hook-composition param per SKILL.md Phase 6's "hook takes other
  clusters' outputs as params" pattern.
- **Landed shape**: `providers/byok-focus.ts` (`scheduleByokFieldFocusTimeout`,
  mirrors `providers/media-providers.ts`'s SSR-guarded timer bridge) +
  `ByokFieldFocusPort` (`ports.ts`) bound in `dependencies.ts`; the three pure
  label helpers (`byokRequiredLabel`, `formatByokMissingFields`,
  `byokDraftIssueMessage`) moved to `rules.ts` taking `t`/`apiProtocol`
  explicitly as params (no more closure capture); `ByokPreconditionAction`/
  `ByokPreconditionNotice` moved to `types.ts` (was a SettingsDialog-local
  `type ByokPreconditionAction = 'test'`); `hooks/useByokFieldFocus.hooks.ts`
  owns the 4 refs + `byokPreconditionNotice` state +
  `focusByokRequiredField`/`showByokPreconditionNotice`/
  `showByokDraftValidationNotice`. The orchestrator destructures the
  controller (refs keep their original local names so the JSX below —
  `ByokKeyField`/`ByokProviderBaseUrl`/the model-picker block — is untouched);
  `showByokPreconditionNotice` itself isn't destructured since (same as
  before extraction) nothing outside the hook calls it directly. Also moved
  `const apiProtocol = cfg.apiProtocol ?? 'anthropic'` earlier in the
  component (right after `cfg`'s `useState`) since the hook needs it and the
  original declaration site was ~700 lines below the hook's call site — pure
  reordering of a `cfg`-only derivation, no behavior change. Clusters 3/4
  (still inline) now call the hook's returned `focusByokRequiredField`/
  `showByokDraftValidationNotice`/`setByokPreconditionNotice` instead of
  locally-declared versions.
- **Risk**: medium (shared by two other pending clusters) — realized as
  expected, no surprises.
- **Status**: **done**. `pnpm --filter @open-design/web typecheck`,
  `tests/features/settings` (247 tests), and the 4 existing
  `SettingsDialog.*.test.tsx` files (218 tests) all green; `pnpm guard`
  prints the boundary-check-passed line.

### 3. BYOK connection-test cluster — **pending**
- **Owns**: `providerTestState`, `providerTestAbortRef`,
  `providerTestRevisionRef`, `providerTestFirstResetRef`,
  `providerAutoTestKeyRef`, `byokLastUnsuccessfulTestKeyRef`,
  `handleTestProvider`, `handleAutoTestProvider`, `renderTestMessage`, the
  reset-on-cfg-change effect (~564-581), the auto-test debounce effect
  (~1870-1893). Transport already isolated in `providers/connection-test.ts`
  (`testApiProvider`).
- **Coupling**: needs cluster 2's notice/focus hook and `byokDraftValidation`
  (from cluster 5) as params.
- **Target shape**: `ports.ts` gets a `ByokConnectionTestPort` (mirrors
  `DaemonAgentPort`'s shape: `testProvider(input, signal)`); `dependencies.ts`
  binds `testApiProvider`; `hooks/useByokConnectionTest.hooks.ts` owns the
  state/refs/effects/handlers, taking the focus/notice hook's output as a
  param per SKILL.md Phase 6.
- **Risk**: medium.
- **Status**: pending.

### 4. BYOK model-discovery cluster — **pending**
- **Owns**: `providerModelsState`, `providerModelsCommittedKey`,
  `providerModelsAbortRef`, `providerModelsRevisionRef`,
  `providerModelsFirstResetRef`, `providerModelsSkipNextResetRef`,
  `deferAfterKeyCleanRef`, `handleFetchProviderModels`,
  `commitProviderModelsInputs`, `onByokKeyCommit`, the reset effect
  (~582-602), the auto-fetch debounce effect (~1894-1920), the
  deferred-after-key-clean effect (~1850-1869). Transport already isolated in
  `providers/provider-models.ts` (`fetchProviderModels`).
- **Coupling**: needs cluster 2's notice/focus hook, cluster 5's
  `byokModelFetchDraftValidation`, and the `activeProviderModelsCache` /
  `activeSetProviderModelsCache` pair (already prop-derived in the
  orchestrator from `sharedProviderModelsCache`/`onProviderModelsCacheChange`
  — pass through as hook params, don't relocate the cache-selection logic
  itself unless it turns out to have a natural owning hook).
- **Target shape**: mirrors cluster 3 —
  `ByokModelDiscoveryPort` in `ports.ts`, binding in `dependencies.ts`,
  `hooks/useByokModelDiscovery.hooks.ts`.
- **Risk**: medium.
- **Status**: pending.

### 5. BYOK derived-config cluster (the composing hook) — **pending**
- **Owns**: everything derived from `cfg`/`apiProtocol` that clusters 3+4 (and
  the JSX) read: `protocolProviders`, `selectedProviderIndex`,
  `selectedProvider`, `showProviderPreset`, `showBaseUrlField`,
  `byokRequiresApiKey`, `byokFirstPartyBaseUrl`, `byokKeyValidationBaseUrl`,
  `byokDraftValidation`, `byokBlockingDraftIssues`, `apiKeyDraftInvalid`,
  `byokModelFetchDraftValidation`, `providerModelsKey`,
  `fetchedApiModelOptions`, `suggestedApiModelIds`, `apiModelOptions`,
  `fetchedApiModelIds`, `apiModelIds`, `providerDefaultModel`,
  `apiModelCustomEditing`/`apiModelUserSelectedRef`, `apiModelCustomActive`,
  `baseUrlReadOnly`, `baseUrlPlaceholder`, `baseUrlInvalid`,
  `baseUrlErrorMessage`, `apiKeyAuthFailed`, `providerModelsFailureMessage`,
  `providerTestBaseUrlInvalid`, `providerTestApiKeyAuthFailed`,
  `apiKeyFieldAuthFailed`, `loadedAccountModelCount`,
  `currentProviderModelsResult`, plus the account-default-model auto-switch
  effect (~1992-2018) and the focus-after-protocol-switch effect
  (~2036-2044).
- **Coupling**: the most entangled cluster — nearly every derived value here
  is a one-line `useMemo` already wrapping an existing pure `rules.ts`
  function (already compliant with Phase 8.5's "trivial wrapper" end state on
  a function-by-function basis), so the work here is mostly *relocation*
  (moving these `useMemo`s into a hook body) rather than new extraction. Do
  this LAST among the BYOK clusters, once 2-4 exist, since it's the natural
  composing hook that takes clusters 2-4's hook outputs as params (SKILL.md
  Phase 6's escalation order step 0).
- **Target shape**: `hooks/useByokProviderConfig.hooks.ts` (or fold into a
  parent `useByokExecutionMode` that also composes 2-4 — decide once inside
  the cluster which grouping reads cleanest; note the deviation here if the
  real shape differs).
- **Risk**: high (widest blast radius of the BYOK clusters).
- **Status**: pending.

### 6. Agent model config rendering — **done**
- Landed in `ea6b4abda` as `AgentModelPicker` (concurrent pass, see UPDATE
  note above). Do not redo.

### 7. Codex path-repair actions — **done**
- Landed in `ea6b4abda`: `applyCodexDetectedPath`/`clearCodexCustomPath` are
  now passed into `LocalCliSection`'s `daemonAgents` prop bag rather than
  living inline. Do not redo.

### 8. Execution-section JSX breakdown — **done (agent-grid half); BYOK-form
  half was already done before this plan)**
- Landed in `ea6b4abda`: the agent-scan/agent-list/AMR-card JSX is now
  `<LocalCliSection cfg setCfg agents apiProtocol locale amrAccount={...}
  amrHighlight={...} daemonAgents={...} hoveredAgentCardId
  setHoveredAgentCardId />` (anchor: search `LocalCliSection` — currently
  ~line 2415). The BYOK-form JSX (API key / base URL / model-preset /
  connection-test) was already composed from existing dumb components
  (`ByokKeyField`, `ByokProviderBaseUrl`, `ByokProviderPicker`,
  `ByokConnectionTestControl`) even before this pass. What's still genuinely
  inline in the "execution" JSX block now: the mode-toggle seg-control
  (~2321-2361, small) and the protocol-chips block that cluster 1 targets
  (~2362-2405). Do not redo the agent-grid/BYOK-form composition.

### 9. PrivacySection relocation — **pending**
- **Owns**: `apps/web/src/components/PrivacySection.tsx` (219 lines). Quick
  check before starting: confirm it's genuinely prop-only (cfg/setCfg +
  analytics) with no internal fetch/window use — if so this is close to a
  pure file-move + barrel wiring, the cheapest of the four leaf relocations.
- **Risk**: low.
- **Status**: pending.

### 10. ProjectLocationsSection relocation — **pending**
- **Owns**: `apps/web/src/components/ProjectLocationsSection.tsx` (239
  lines). Has its own `useState`/`useEffect` (loading/saving/status/error) —
  check for `fetch`/daemon calls that need a new `providers/` route before
  moving in; do not redeclare any DTO already in `packages/contracts`.
- **Risk**: low-medium.
- **Status**: pending.

### 11. DesignSystemsSection relocation — **pending**
- **Owns**: `apps/web/src/components/DesignSystemsSection.tsx` (651 lines) —
  large: search/filter/rename/import/craft-applies state. This is its own
  multi-cluster decomposition (mirror this same plan-file pattern *inside*
  this cluster when picked up — don't try to do it in one sub-pass).
- **Risk**: medium-high (large surface).
- **Status**: pending.

### 12. PetSettings relocation — **pending**
- **Owns**: `apps/web/src/components/pet/PetSettings.tsx` (1132 lines) — the
  single largest remaining leaf component, bigger than most already-completed
  top-level sections. Needs its own full profiling pass before extraction
  (treat as a nested instance of Phase 1 step 4) when picked up.
- **Risk**: high (largest single remaining component in the whole area).
- **Status**: pending.

### 14. Autosave loop cluster — **pending** (missed in the first pass of this
  plan; added on re-profiling after the concurrent `ea6b4abda` rebase)
- **Owns**: `autosaveStatus` state, `autosaveSkipFirstRef`,
  `autosaveTimerRef`, `autosaveSavedTimerRef`, `autosaveRetryTimerRef`,
  `autosavePendingFlushRef`, `autosaveLatestRef`, `autosaveLastSavedRef`,
  `mediaProvidersChangeVersionRef`, `lastSyncedMediaProvidersVersionRef`,
  `autosaveRetryTick` state, the main debounced-save effect (~400 lines with
  the retry/media-provider-sync branches), and the unmount-flush effect.
  Anchor: search `autosaveStatus` (currently ~lines 1461-1650).
- **Coupling**: reads `cfg`, `onPersist`, `isAutosaveDraftOnlyChange` (already
  imported from `../App`), and `lastSavedAppearanceRef` (owned by the
  appearance-revert effect right above it, ~lines 373-419 — small, could move
  together or stay a shared ref passed as a hook param).
- **Target shape**: `hooks/useAutosave.hooks.ts` — no new transport (calls
  `onPersist` which is already an injected prop, not a `providers/` import,
  so this hook likely needs no port at all, or a trivial
  `scheduleTimeout`/`clearTimeout` DOM-timer port mirroring the pattern
  already used by `OrbitPort.scheduleTimeout` if `window.setTimeout` needs to
  move out of `features/**`).
- **Risk**: medium (long effect, but single-owner and not shared by other
  BYOK clusters — safe to do independently of clusters 2-5).
- **Status**: pending.

### 13. `SettingsConfigProvider` cross-cutting context — **pending, deferred**
- The ADR (`docs/adr/0002-frontend-vertical-slice-decomposition.md:28`)
  suggests lifting `cfg`/autosave into a context so sections stop
  prop-drilling. Today every already-extracted section takes `cfg`/`setCfg`
  as direct 1-hop props from the orchestrator — not deep drilling — so this
  is a nice-to-have, not a blocker for any other cluster. Defer until
  clusters 1-12 are done; touching every section's call site at once is a
  wide, low-payoff-per-risk change to take on mid-chain. Re-evaluate once the
  rest of the plan is clear.
- **Risk**: medium (wide blast radius, but mechanical).
- **Status**: pending / deferred.

---

## Parallelization notes (SKILL.md Phase 1 step 5)

Clusters 9 and 10 (PrivacySection, ProjectLocationsSection relocations) share
no state and could run as parallel worktree-isolated subagents once picked up
— neither touches BYOK state or each other's files. Clusters 3 and 4
(connection-test / model-discovery) look parallelizable but both need
cluster 2 to exist first and both read `byokPreconditionNotice` — land
cluster 2 serially, then consider parallelizing 3 and 4 with an explicit
warning to each subagent that the other is touching adjacent `useEffect`
blocks in the same file region (the "two clusters deleting adjacent
functions" silent-failure shape SKILL.md warns about).
