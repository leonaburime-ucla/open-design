// Public API of the settings slice. Consumers outside the slice (the
// SettingsDialog orchestrator, and the model-switcher/entry surfaces that share
// its provider-model cache) import ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the settings-slice boundary,
// and `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import
// that reaches past it (ADR 0002).

// Pure provider-model cache rules + the cache view-model type. These are shared
// across the settings/BYOK surfaces, AvatarMenu, InlineModelSwitcher, and
// EntryShell, which previously reached them through a re-export leaked out of
// SettingsDialog; they now resolve through this barrel.
export { mergeProviderModelOptions, providerModelsCacheKey } from './rules';
export type { ProviderModelsCache } from './types';

// Composio credential-state rule + the connectors section it powers. The
// SettingsDialog orchestrator and the standalone IntegrationsView both mount
// ConnectorSection through this barrel instead of reaching a component that
// used to live inside the SettingsDialog god-file.
export { deriveComposioCredentialState } from './rules';
export type { ComposioCredentialState } from './types';
export { ConnectorSection } from './components/ConnectorSection';

// Orbit automation section + its pure rules. Its transport
// (`persistConfigAndRunOrbit`, `fetchOrbitStatus`) lives in `providers/orbit`
// directly — outside `features/**` a provider is reachable without going
// through a slice barrel, and the SettingsDialog orchestrator imports it from
// there for its backward-compatible re-export.
export { configForManualOrbitRun, isOrbitRunDisabled } from './rules';
export { OrbitSection } from './components/OrbitSection';

// Media-providers section. Its reload transport is an injected caller
// callback (no port); the only owned transport is the reload-notice
// auto-dismiss timer bridge in `providers/media-providers`.
export { MediaProvidersSection } from './components/MediaProvidersSection';
