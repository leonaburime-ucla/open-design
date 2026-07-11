# SettingsDialog.tsx extraction plan

One-time full inventory (SKILL.md Phase 1 step 4), written before any extraction
in this pass. `SettingsDialog.tsx` is at 3987 lines as of this snapshot (git
`e2fb1a6c7`). Already-extracted sections (do NOT redo): OrbitSection,
MediaProvidersSection, IntegrationsSection, AppearanceSection,
CritiqueTheaterSection, NotificationsSection, About/Language/custom-instructions
sections, the AMR account cluster, the local-CLI agent-list cluster
(`useWiredDaemonAgents`), the AMR-card highlight nudge (`useAmrHighlight`).
`MemorySection` and `McpClientSection` are intentionally left as-is — they
already consume their own sibling slices (`features/memory`,
`features/mcp-client`).

**Line numbers are a snapshot at the commit above and will drift as clusters
land — re-`grep` the anchor identifiers named per cluster before starting
work on it, don't trust the numbers blindly.**

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
- **Status**: pending (targeted this pass).

### 2. BYOK field-focus + precondition-notice bridge — **pending**
- **Owns**: `byokRequiredLabel`, `formatByokMissingFields`,
  `focusByokRequiredField` (uses 4 input refs + `window.setTimeout`),
  `byokPreconditionNotice` state, `showByokPreconditionNotice`,
  `byokDraftIssueMessage`, `showByokDraftValidationNotice`.
- **Coupling**: consumed by BOTH cluster 3 (connection test) and cluster 4
  (model discovery) — this must land before/alongside those two, or they take
  it as a hook-composition param per SKILL.md Phase 6's "hook takes other
  clusters' outputs as params" pattern.
- **Target shape**: `window.setTimeout` scheduling can't live in
  `features/**` — add a small SSR-guarded `scheduleFocus(el, delayMs)` (or
  reuse an existing DOM provider if one exists; check `providers/` first)
  bridge, then a `hooks/useByokFieldFocus.hooks.ts` owning the 4 refs +
  `focusByokRequiredField` + the notice state + the two `show*` helpers.
  Pure label helpers (`byokRequiredLabel`, `formatByokMissingFields`,
  `byokDraftIssueMessage`) go in `rules.ts` (they already take `t` as a
  param-like closure today — will need `t` passed explicitly since rules.ts
  has no i18n access).
- **Risk**: medium (shared by two other pending clusters).
- **Status**: pending.

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

### 6. Agent model config rendering — **pending**
- **Owns**: `agentModelSummary`, `renderAgentModelConfig` (~2091-2304) — a
  large JSX-returning function per agent card. Depends on `cfg`/`setCfg` (via
  its internal `setChoice`), `agentCustomModelIds`/`setAgentCustomModelIds`
  (already from `useWiredDaemonAgents`), `amrCardStatus` (already from
  `useWiredAmrAccount`), `t`, `SearchableModelSelect`/`Icon`,
  `CUSTOM_MODEL_SENTINEL`, `shouldShowCustomModelInput` (existing rule).
- **Coupling**: self-contained — only reads other clusters' hook outputs, does
  not need to be read by them.
- **Target shape**: `components/AgentModelConfigFields.tsx` (dumb component,
  props in/JSX out) + `agentModelSummaryLabel` as a small rule if the summary
  logic is pure enough (check — it calls `agentModelOptionLabel`, an existing
  rule).
- **Risk**: low-medium.
- **Status**: pending.

### 7. Codex path-repair actions — **pending**
- **Owns**: `applyCodexDetectedPath`, `clearCodexCustomPath` (~1211-1219) —
  two 2-line handlers calling `setCfg` + `setAgentTestState` (the latter
  already from `useWiredDaemonAgents`).
- **Coupling**: low; likely folds into whichever component/hook ends up
  owning the Codex-specific JSX (part of cluster 8's JSX breakdown) rather
  than needing its own hook file.
- **Risk**: low.
- **Status**: pending.

### 8. Execution-section JSX breakdown — **pending**
- **Owns**: the ~1100-line JSX block (~2703-3861): agent-scan loading card,
  installed/unavailable agent groups + cards, the AMR account card
  (`amrCardRef`/`amrHighlightActive`/`AmrLoginPill`), the BYOK connection
  panel (API key / base URL / model fields + test button + test-result
  message), the mode-toggle seg-control (~2606-2650, small, can fold into
  whichever component wraps the section shell).
- **Coupling**: depends on clusters 1-7 existing first (their hooks/dumb
  components are the pieces this JSX gets rebuilt from) — do this last among
  the BYOK-section clusters.
- **Target shape**: several dumb components under `components/` — likely
  `AgentScanCard`, `AgentList`/`AgentCard`, `AmrAccountCard`,
  `ByokConnectionPanel`. Exact split TBD once clusters 1-7 land and the JSX's
  remaining shape is clearer — don't over-plan this before its dependencies
  exist.
- **Risk**: high (largest JSX migration in the file), but should become
  mechanical once the state/logic clusters feeding it are hook-ified.
- **Status**: pending.

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
