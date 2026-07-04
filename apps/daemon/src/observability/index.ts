/**
 * @module observability
 *
 * Langfuse telemetry / trace-forwarding for completed agent runs — the
 * observability domain, organized as a capability barrel.
 *
 * Layers (foundation → leaves):
 * - `core`     — shared constants, the Langfuse/trace type vocabulary, and the
 *                env-driven sink config readers. The foundation kernel.
 * - `payload`  — pure construction of Langfuse trace / feedback batches.
 * - `report`   — network delivery of those batches (relay or direct Langfuse).
 * - `manifest` — trace-safe object-upload manifest construction.
 * - `bridge`   — daemon-facing glue that assembles a `ReportContext` from live
 *                daemon state and fires the report.
 *
 * This root barrel is the ONLY entrypoint external daemon code may import from;
 * it re-exports the exact public surface the three predecessor modules
 * (`langfuse-trace.ts`, `langfuse-bridge.ts`, `trace-object-manifest.ts`)
 * exposed. See `scripts/check-barrel-imports.ts` (`observability` domain) for
 * the enforced boundary and `apps/daemon/src/design-systems/` for the pattern.
 */

// --- core: constants + config readers (values) ---
export { INPUT_MAX_BYTES } from './core/index.js';
export {
  readLangfuseConfig,
  readTelemetrySinkConfig,
  deriveLangfuseDeliveryState,
} from './core/index.js';

// --- core: shared type vocabulary ---
export type {
  LangfuseConfig,
  LangfuseDeliveryStatus,
  LangfuseDropReason,
  LangfuseDeliveryState,
  TelemetrySinkConfig,
  RunSummary,
  MessageSummary,
  ArtifactSummary,
  ObjectManifestCompleteness,
  ObjectManifestStatus,
  ObjectManifestSensitivity,
  ObjectManifestAccessScope,
  ObjectManifestRetentionPolicy,
  TraceSafeObjectManifestBase,
  AttachmentManifestEntry,
  ArtifactManifestEntry,
  InputTextSnapshotManifestEntry,
  TraceObjectSummary,
  ToolCallSummary,
  AgentEventSummary,
  EventsSummary,
  RuntimeInfo,
  TurnInfo,
  ReportContext,
  ReportRunOpts,
  FeedbackReportContext,
} from './core/index.js';

// --- payload: trace / feedback batch builders ---
export { buildTracePayload, buildFeedbackPayload } from './payload/index.js';

// --- report: network delivery ---
export { reportRunCompleted, reportRunFeedback } from './report/index.js';

// --- manifest: trace object-upload manifests ---
export { buildTraceObjectManifests } from './manifest/index.js';
export type {
  BuildTraceObjectManifestsOptions,
  TraceArtifactObjectSource,
  TraceObjectSource,
  TraceObjectUploadManifests,
} from './manifest/index.js';

// --- bridge: daemon report entrypoints ---
export {
  reportRunCompletedFromDaemon,
  reportRunFeedbackFromDaemon,
} from './bridge/index.js';
export type {
  ReportRunCompletedFromDaemonOpts,
  ReportRunFeedbackFromDaemonOpts,
  FeedbackReportOutcome,
} from './bridge/index.js';
