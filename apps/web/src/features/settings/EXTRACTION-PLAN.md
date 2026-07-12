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

`DesignSystemsSection.tsx` (651 lines) and `pet/PetSettings.tsx` (1132 lines)
still live under `apps/web/src/components/` (`PrivacySection.tsx` and
`ProjectLocationsSection.tsx` are done — clusters 9 and 10 below).
SettingsDialog.tsx already renders each as a
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

### 3. BYOK connection-test cluster — **done**
- **Owned**: `providerTestState`, `providerTestAbortRef`,
  `providerTestRevisionRef`, `providerTestFirstResetRef`,
  `providerAutoTestKeyRef`, `byokLastUnsuccessfulTestKeyRef`,
  `handleTestProvider`, `handleAutoTestProvider`, the reset-on-cfg-change
  effect, and the auto-test debounce effect. `renderTestMessage` was already
  extracted to `rules.ts`'s `formatConnectionTestMessage` by the earlier
  concurrent pass — no further work needed there. Transport already isolated
  in `providers/connection-test.ts` (`testApiProvider`).
- **Coupling**: takes cluster 2's `useWiredByokFieldFocus` output
  (`focusByokRequiredField`/`setByokPreconditionNotice`/
  `showByokDraftValidationNotice`) and the still-inline derived-config
  cluster's `byokDraftValidation`/`byokFirstPartyBaseUrl` as hook params, per
  SKILL.md's "hook takes other clusters' outputs as params" pattern.
- **Landed shape**: `ByokConnectionTestPort` (`ports.ts`) — `testProvider(input,
  signal)` mirroring `DaemonAgentPort.testAgent`'s shape, plus a
  `scheduleAutoTestTimeout` timer bridge (the debounce effect's
  `window.setTimeout` had to move behind a port to satisfy the guard's
  transport/DOM-global rule — added alongside `testApiProvider` in
  `providers/connection-test.ts` as `scheduleByokAutoTestTimeout`, mirroring
  `providers/agents.ts`'s `scheduleAgentRescanNoticeTimeout` precedent of a
  timer bridge living alongside its domain's fetch wrappers); bound in
  `dependencies.ts`. `hooks/useByokConnectionTest.hooks.ts` owns the
  state/refs/effects/handlers exactly as before extraction; `visualStabilityMode`
  is computed once in the orchestrator (also read by cluster 4's own debounce
  effect) and passed through as a hook input rather than recomputed. The
  orchestrator's `useWiredByokConnectionTest(...)` call site sits right after
  `byokDraftValidation`/`apiKeyDraftInvalid` are computed (~cluster 5
  territory), later in the render than the removed functions' original
  declaration point — safe because nothing before that point in the render
  reads the controller (SKILL.md's "hook call site moves later in the render"
  note). The shared abort-on-unmount effect that used to release both
  `providerTestAbortRef` and `providerModelsAbortRef` was split: cluster 3's
  half moved into the hook's own unmount effect (mirroring
  `useDaemonAgents.hooks.ts`'s `agentTestAbortRef` cleanup), and the
  orchestrator's effect now only releases `providerModelsAbortRef` (cluster
  4, untouched otherwise).
- **Risk**: medium — realized as expected (the `window.setTimeout` guard trip
  was the only surprise, fixed with the timer-bridge port field above).
- **Status**: **done**. `pnpm --filter @open-design/web typecheck`, the new
  `useByokConnectionTest.hooks.ts` unit tests (16 tests against a hand-written
  fake `ByokConnectionTestPort`) plus the full `tests/features/settings` suite
  (264 tests across 27 files) and the 3 existing `SettingsDialog.*.test.tsx`
  files (155 tests) all green; `pnpm guard` prints the boundary-check-passed
  line.

### 4. BYOK model-discovery cluster — **done**
- **Owned**: `providerModelsState`, `providerModelsCommittedKey` (+ its
  lazy-initializer seeded from `initial`), `providerModelsAbortRef`,
  `providerModelsRevisionRef`, `providerModelsFirstResetRef`,
  `providerModelsSkipNextResetRef`, `deferAfterKeyCleanRef`,
  `handleFetchProviderModels`, `commitProviderModelsInputs`,
  `onByokKeyCommit`, the reset effect, the deferred-after-key-clean effect,
  and the auto-fetch debounce effect. Transport already isolated in
  `providers/provider-models.ts` (`fetchProviderModels`); added
  `scheduleProviderModelsAutoFetchTimeout` alongside it (mirrors cluster 3's
  `scheduleByokAutoTestTimeout`).
- **Coupling**: took cluster 2's notice/focus hook, cluster 3's
  `handleAutoTestProvider` (re-tests the connection right after a key
  commit, same as before extraction), and cluster 5's still-inline
  `byokModelFetchDraftValidation`/`byokFirstPartyBaseUrl`/`providerModelsKey`
  as hook params, plus the `activeProviderModelsCache`/
  `activeSetProviderModelsCache` pair (left owned by the orchestrator,
  passed through unchanged) and `updateApiConfig` (the orchestrator's
  generic cfg-patch helper, used by `onByokKeyCommit`'s dirty-paste-key
  clean path).
- **Landed shape**: `ByokModelDiscoveryPort` (`ports.ts`) —
  `fetchModels(input, signal)` mirroring `ByokConnectionTestPort.testProvider`'s
  shape, plus `scheduleAutoFetchTimeout`; bound in `dependencies.ts`.
  `hooks/useByokModelDiscovery.hooks.ts` owns the state/refs/effects/handlers
  exactly as before extraction. Unlike cluster 3's controller (read-only),
  this one's controller exposes `providerModelsState`/
  `providerModelsCommittedKey` AND their setters, plus a
  `skipNextProviderModelsReset` function — because the still-inline
  `setByokProvider` handler (BYOK-provider-switch cluster, not yet
  extracted) snapshots and restores this cluster's state as part of its
  per-provider form draft (`ByokProviderFormDraft`) and flags a same-render
  skip-next-reset before calling `setCfg`. The orchestrator's
  `useWiredByokModelDiscovery(...)` call site sits right after
  `providerModelsKey` is computed (~cluster 5 territory), later in the
  render than the removed code's original declaration point — safe because
  nothing before that point in the render reads the controller (same
  "hook call site moves later" pattern as cluster 3); `setByokProvider`'s
  own reads/writes of the exposed state/setters/skip-flag are all inside a
  callback invoked after the full render commits, so the later `const`
  declaration order is fine. `ProviderModelsState` (previously a
  SettingsDialog-local type) moved to `types.ts`.
- **Verified difference from cluster 3**: this cluster's reset-on-cfg-change
  effect unconditionally aborts and resets to `idle` on any relevant cfg
  change (even mid-fetch) — unlike cluster 3's gentler reset, which leaves a
  `running` test alone. Preserved verbatim; a first draft of this cluster's
  unit test wrongly assumed cluster 3's behavior and had to be corrected.
- **Risk**: medium — realized as expected. One extra fix needed:
  `SettingsDialog.execution.test.tsx` and `InlineModelSwitcher.test.tsx`
  both `vi.mock('../../src/providers/provider-models', ...)` with an
  explicit export list, which didn't include the new
  `scheduleProviderModelsAutoFetchTimeout` — `dependencies.ts`'s binding
  resolved to `undefined` and threw at import time until both mocks were
  updated to include it.
- **Status**: **done**. `pnpm --filter @open-design/web typecheck`; the new
  `useByokModelDiscovery.hooks.ts` unit tests (22 tests against a
  hand-written fake `ByokModelDiscoveryPort`) plus the full
  `tests/features/settings` suite (286 tests across 29 files); the existing
  `SettingsDialog.*.test.tsx` suites (243 tests) and `InlineModelSwitcher.test.tsx`
  all green; `pnpm guard` prints the boundary-check-passed line.
  `SettingsDialog.tsx` went from 2466 → 2163 lines.

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

### 9. PrivacySection relocation — **done**
- **Owns**: `apps/web/src/components/PrivacySection.tsx` (219 lines). Quick
  check before starting: confirm it's genuinely prop-only (cfg/setCfg +
  analytics) with no internal fetch/window use — if so this is close to a
  pure file-move + barrel wiring, the cheapest of the four leaf relocations.
- **Risk**: low.
- **Status**: **done**. Confirmed prop-only (no fetch/window/DOM — only
  `crypto.randomUUID`/`Date.now`/`Math.random`, all plain JS globals the
  guard doesn't forbid). `generateInstallationId` + the telemetry-patch
  merge/mint-id branching (`nextTelemetryConfigPatch`) moved to `rules.ts`;
  `hooks/usePrivacy.hooks.ts` owns `cfg.telemetry`/`installationId`/
  `privacyDecisionAt` derivation + the four actions (`patchTelemetry`,
  `shareUsage`, `declineUsage`, `deleteMyData`) — no port/`useWiredX` needed
  (no transport, mirrors `useCritiqueTheaterSettings`'s no-port shape); the
  `ToggleRow`/`ConsentCard` subcomponents moved as-is (component-internal,
  not exported) into `components/PrivacySection.tsx`. Old
  `components/PrivacySection.tsx` deleted; its test moved to
  `tests/features/settings/PrivacySection.test.tsx` importing the barrel.
  SettingsDialog's own `<PrivacySection cfg={cfg} setCfg={setCfg} />` call
  site is unchanged (only the import source moved to the barrel) since it
  was already a thin composition line — doesn't change the orchestrator's
  line count, as expected for a leaf relocation.

### 10. ProjectLocationsSection relocation — **done**
- **Owns**: `apps/web/src/components/ProjectLocationsSection.tsx` (239
  lines). Has its own `useState`/`useEffect` (loading/saving/status/error) —
  check for `fetch`/daemon calls that need a new `providers/` route before
  moving in; do not redeclare any DTO already in `packages/contracts`.
- **Risk**: low-medium.
- **Status**: **done**. Unlike cluster 9, this component owned its own
  transport (`fetchProjectLocations`/`updateProjectLocations`/
  `scanProjectLocations`/`openProjectLocationFolderDialog`, each a thin
  `fetch()` wrapper previously in `state/project-locations.ts`) — moved
  verbatim to `providers/project-locations.ts` (a flat single-adapter
  resource file) and bound as `ProjectLocationsPort` in `dependencies.ts`.
  `state/project-locations.ts` had exactly one consumer (this component), so
  it was deleted outright rather than kept as a second copy. `locationLabel`/
  `externalLocations`/`toConfigLocations` moved to `rules.ts` verbatim
  (already pure); the `defaultControlLabel` closure was also made pure as
  `projectLocationDefaultControlLabel(t, effectiveDefaultLocationId,
  locationId)` in `rules.ts`, with the hook keeping a one-line closure over
  it for the JSX. `hooks/useProjectLocations.hooks.ts` owns
  `locations`/`drafts`/`loading`/`saving`/`status`/`error` state, the
  `draftsRef` sync effect, the initial-fetch effect, and the
  `handleDefaultLocationChange`/`save`/`runScan`/`handleAddFolder`/
  `removeDraft` handlers. `DraftLocation` is a new in-slice UI type in
  `types.ts`. No existing test file covered this component (verified via
  `find`/`git log -- '*ProjectLocationsSection*'` across history), so there
  was nothing to move; the existing `SettingsDialog.*.test.tsx` suites still
  exercise it indirectly and stay green. SettingsDialog's own
  `<ProjectLocationsSection cfg={cfg} setCfg={setCfg}
  onProjectsRefresh={onProjectsRefresh} />` call site is unchanged (only the
  import source moved to the barrel).

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

### 14. Autosave loop cluster — **done**
- **Owned**: `autosaveStatus` state, `autosaveSkipFirstRef`,
  `autosaveTimerRef`, `autosaveSavedTimerRef`, `autosaveRetryTimerRef`,
  `autosavePendingFlushRef`, `autosaveLatestRef`, `autosaveLastSavedRef`,
  `mediaProvidersChangeVersionRef`, `lastSyncedMediaProvidersVersionRef`,
  `autosaveRetryTick` state, the main debounced-save effect, and the
  unmount-flush effect.
- **Coupling**: took `cfg`, `onPersist`, `isAutosaveDraftOnlyChange` (still
  imported from `../App` by the orchestrator, injected into the hook as a
  param rather than imported inside the slice — keeps the slice app-root-
  free) and `lastSavedAppearanceRef` (owned by the appearance-revert effect
  right above it) as hook params, exactly as anticipated. The one coupling
  this entry's original write-up missed: `pendingMediaProviderEditIds`'s
  *setter* (state itself stays orchestrator-owned, since the Media Providers
  section's JSX also reads it directly) and `mediaProvidersChangeVersionRef`
  (fully absorbed into the hook, previously incremented by an inline
  `MediaProvidersSection onChange` closure ~2046). Resolved by exposing a
  `recordMediaProviderEdit(providerId)` action on the controller that the
  orchestrator's `<MediaProvidersSection onChange={recordMediaProviderEdit}>`
  now calls directly (its signature already matched 1:1) instead of owning
  the version-bump + pending-set-update inline.
- **Landed shape**: `AutosavePort` (`ports.ts`) — a single generic
  `scheduleTimeout(onTimeout, delayMs)` (mirrors `OrbitPort.scheduleTimeout`)
  reused for all three of the loop's timers (debounce/saved-flash/retry),
  since they're functionally identical; bound in `dependencies.ts` via
  `providers/autosave.ts`'s `scheduleAutosaveTimeout` (verbatim copy of
  `scheduleOrbitTimeout`'s SSR-guarded shape). `hooks/useAutosave.hooks.ts`
  owns the state/refs/effects exactly as before extraction, translating
  `window.setTimeout`/`clearTimeout` + numeric-handle refs into
  `port.scheduleTimeout`'s returned cancel-closure + refs typed
  `(() => void) | null`. The `AutosaveController` exposes
  `autosaveLastSavedRef` directly (not just a read) because the
  `initial`-prop AMR-reconciliation effect (declared *before* this hook in
  the render, since it needs the ref to already exist) mutates
  `.current` fields directly — mirrors how `useByokModelDiscovery` exposes
  raw state setters for `setByokProvider` to write through. The
  orchestrator's `useWiredAutosave(...)` call site had to move earlier than
  the block's original declaration point (right after
  `lastSavedAppearanceRef`'s own `useRef`, before the AMR-reconciliation
  effect) — safe because nothing before that point reads the controller,
  same "hook call site moves earlier/later in the render" pattern already
  used by clusters 3/4's siblings. `AutosaveStatus` (previously an inline
  union literal) moved to `types.ts`.
- **Risk**: medium, realized close to expected — the only surprise was the
  `pendingMediaProviderEditIds`-setter/`mediaProvidersChangeVersionRef`
  coupling to the still-far-below Media Providers JSX, not flagged in the
  original write-up above (found by grepping every read site of the refs
  being moved, not just the effect block itself — worth doing that grep
  before every future cluster's extraction, not just this one).
- **Status**: **done**. `pnpm --filter @open-design/web typecheck`; the new
  `useAutosave.hooks.ts` unit tests (7 tests against a hand-written fake
  `AutosavePort`) plus the full `tests/features/settings` suite (293 tests
  across 29 files); the existing `SettingsDialog.orbit/.media/.execution
  .test.tsx` suites (155 tests) all green; `pnpm guard` prints the
  boundary-check-passed line. `SettingsDialog.tsx` went from 2163 → 2012
  lines.

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
