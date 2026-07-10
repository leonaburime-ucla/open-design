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
