// UI-only types for the settings slice. Wire DTOs live in
// `@open-design/contracts` (re-exported through the web `../../types` barrel);
// these are the view-model shapes the slice's rules, hooks, and components pass
// around. Per ADR 0002 they are never redeclared wire DTOs — they compose the
// app's existing types into slice-local view models.
import type { ProviderModelOption } from '../../types';

/**
 * Hand-rolled per-provider model cache: a fingerprint key (protocol + base URL +
 * hashed secret) mapped to the model options discovered for that provider. The
 * settings/BYOK surfaces and the inline model switchers ride this same cache so
 * a discovery fetch is shared across them; the ADR keeps it hand-rolled (no
 * TanStack/SWR) and behavior-preserving.
 */
export type ProviderModelsCache = Record<string, ProviderModelOption[]>;

/**
 * The Composio credential lifecycle the connector credentials surface renders.
 * Splitting "saved key plus draft" (`saved-pending`) out from a bare `saved`
 * keeps the configured badge anchored while the hint text differentiates an
 * unsaved replacement from a fully-saved value (issue #741).
 */
export type ComposioCredentialState =
  | 'empty'
  | 'pending-new'
  | 'saved'
  | 'saved-pending';

/** A transient run notice shown by the Orbit section (success/error banner). */
export interface OrbitNotice {
  kind: 'success' | 'error';
  message: string;
}

/**
 * Proportional widths (0-100) for the Orbit run-result meter's three
 * segments. Each non-zero segment is floored to a small sliver so it stays
 * visible even when its share rounds to 0%.
 */
export interface OrbitMeterSegments {
  succeeded: number;
  skipped: number;
  failed: number;
}

/** The Composio-gate copy/CTA i18n keys, branched on saved-key presence. */
export interface OrbitConfigGateCopyKeys {
  bodyKey: 'settings.orbit.gateBody' | 'settings.orbit.gateBodyNoKey';
  actionKey: 'settings.orbit.gateAction' | 'settings.orbit.gateActionNoKey';
}
