/**
 * @module observability/manifest
 *
 * Trace object-upload manifest construction. Exposes the builder and its
 * option/source/result types for the bridge to assemble complete-context
 * telemetry manifests.
 */

export { buildTraceObjectManifests } from './manifest.js';
export type {
  BuildTraceObjectManifestsOptions,
  TraceArtifactObjectSource,
  TraceObjectSource,
  TraceObjectUploadManifests,
} from './manifest.js';
