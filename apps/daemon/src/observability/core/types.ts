/**
 * @module observability/core/types
 *
 * The shared type vocabulary of the observability domain: Langfuse delivery
 * config/state, the trace-safe object-manifest entry shapes, the run/message/
 * artifact/tool/turn summaries and the `ReportContext` / `FeedbackReportContext`
 * inputs the payload builders consume. Every other subdir (`payload`, `report`,
 * `manifest`, `bridge`) imports these structures from the foundation kernel; the
 * types themselves depend only on sibling daemon domains (`app-config`,
 * `telemetry`, `run`), never on another observability subdir.
 */

import type { TelemetryPrefs } from '../../app-config.js';
import type { PromptStackTelemetry } from '../../telemetry/index.js';
import type {
  RunFailureClassification,
  RunTelemetryTimestamps,
  RunTimingAnalytics,
} from '../../run/index.js';

export interface LangfuseConfig {
  authHeader: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
}

export type LangfuseDeliveryStatus =
  | 'not_expected'
  | 'queued'
  | 'accepted'
  | 'failed';

export type LangfuseDropReason =
  | 'metrics_consent_off'
  | 'content_consent_off'
  | 'missing_sink_config'
  | 'payload_too_large'
  | 'relay_429'
  | 'relay_413'
  | 'relay_5xx'
  | 'langfuse_4xx'
  | 'langfuse_5xx'
  | 'network_error';

export interface LangfuseDeliveryState {
  langfuse_expected: boolean;
  langfuse_delivery_status: LangfuseDeliveryStatus;
  langfuse_drop_reason?: LangfuseDropReason;
}

export type TelemetrySinkConfig =
  | {
      kind: 'relay';
      relayUrl: string;
      timeoutMs: number;
      retries: number;
    }
  | ({
      kind: 'langfuse';
    } & LangfuseConfig);

export interface RunSummary {
  runId: string;
  status: 'succeeded' | 'failed' | 'canceled';
  startedAt: number;
  endedAt: number;
  error?: string;
  errorCode?: string;
  failure?: RunFailureClassification;
  timings?: RunTimingAnalytics;
  timingMarks?: RunTelemetryTimestamps;
  stderr?: {
    tail: string;
    lineCount: number;
    truncated: boolean;
  };
  stdout?: {
    tail: string;
    lineCount: number;
    truncated: boolean;
  };
  diagnostics?: unknown;
}

export interface MessageSummary {
  messageId: string;
  prompt: string;
  output: string;
  usage?: {
    inputTokens?: number;
    inputTokensProvider?: number;
    inputTokensEffective?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    uncachedInputTokens?: number;
    estimatedContextTokens?: number;
    cacheHitRatio?: number;
    cacheTokenSource?: 'anthropic' | 'openai' | 'unavailable';
  };
}

export interface ArtifactSummary {
  slug: string;
  type: string;
  sizeBytes: number;
  sha256?: string;
  createdAt?: string;
}

export type ObjectManifestCompleteness = 'complete' | 'partial' | 'unavailable';

export type ObjectManifestStatus = 'ok' | 'partial' | 'unavailable';

export type ObjectManifestSensitivity = 'public' | 'internal' | 'private' | 'sensitive';

export type ObjectManifestAccessScope = 'owner' | 'project' | 'workspace' | 'evaluator';

export type ObjectManifestRetentionPolicy =
  | 'ephemeral'
  | 'observability_90d'
  | 'project_lifetime'
  | 'eval_fixture'
  | 'legal_hold';

export interface TraceSafeObjectManifestBase {
  object_class: 'attachment' | 'artifact' | 'input_text_snapshot';
  storage_ref: string;
  status: ObjectManifestStatus;
  reason?: string;
  project_id: string | null;
  run_id: string;
  workspace_id: string | null;
  size_bytes?: number;
  sha256?: string;
  mime_type?: string;
  extension?: string;
  redacted: boolean;
  truncated: boolean;
  stored_in_open_design: boolean;
  retention_policy: ObjectManifestRetentionPolicy;
  access_scope: ObjectManifestAccessScope;
  sensitivity: ObjectManifestSensitivity;
  source: 'user_upload' | 'agent_generated' | 'user_prompt';
  expires_at: string | null;
  approved_by: string | null;
  open_in_open_design_url?: null;
  preview_status?: string;
  access_policy?: 'open_design_auth_required';
}

export interface AttachmentManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'attachment';
  attachment_id: string;
}

export interface ArtifactManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'artifact';
  artifact_id: string;
  type: string;
  artifact_kind?: string;
  build_status?: string;
  preview_status?: string;
  export_status?: string;
}

export interface InputTextSnapshotManifestEntry extends TraceSafeObjectManifestBase {
  object_class: 'input_text_snapshot';
  input_text_snapshot_id: string;
  type: 'text';
}

export interface TraceObjectSummary {
  new_file_count: number;
  modified_file_count: number;
  recovered_file_count: number;
  candidate_file_count: number;
  uploaded_file_count: number;
  skipped_file_count: number;
  skip_reasons: Record<string, number>;
}

export interface ToolCallSummary {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number;
  input?: string;
  output?: string;
  isError?: boolean;
}

export interface AgentEventSummary {
  id: string;
  name: string;
  timestamp: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  level?: 'DEFAULT' | 'WARNING' | 'ERROR';
  statusMessage?: string;
}

export interface EventsSummary {
  toolCalls: number;
  errors: number;
  durationMs: number;
}

export interface RuntimeInfo {
  /** Node.js runtime version (`process.version`, e.g. 'v22.22.0'). */
  nodeVersion?: string;
  /** OS family (`os.platform()`, e.g. 'darwin' | 'win32' | 'linux'). */
  os?: string;
  /** OS kernel/release version (`os.release()`). */
  osRelease?: string;
  /** CPU architecture (`os.arch()`, e.g. 'arm64' | 'x64'). */
  arch?: string;
  /** Open Design app version reported by the daemon. */
  appVersion?: string;
  /** Build channel (development / prerelease / beta / stable). */
  appChannel?: string;
  /** Whether the daemon is running inside a packaged build. */
  packaged?: boolean;
  /** Front-end carrier — `desktop` (Electron), `web` (browser), or unknown. */
  clientType?: 'desktop' | 'web' | 'unknown';
}

export interface TurnInfo {
  /** Model id at the time of this turn (e.g. 'claude-sonnet-4-5'). */
  model?: string;
  /** Reasoning level / effort knob if the agent supports it. */
  reasoning?: string;
  /** Skill id selected for this turn (if any). */
  skillId?: string;
  /** Design system id selected for this turn (if any). */
  designSystemId?: string;
  /** sha256 digest of the injected design-system prompt context. */
  designSystemDigest?: string;
  /** Source that supplied the effective design-system selection. */
  designSystemSelectionSource?: string;
  /** Resume-session stable prompt cache diagnostics. */
  promptCache?: {
    stablePromptHash: string;
    hit: boolean;
    missReason: string | null;
  };
}

export interface ReportContext {
  installationId: string | null;
  projectId: string;
  conversationId: string;
  agentId?: string;
  run: RunSummary;
  message: MessageSummary;
  artifacts: ArtifactSummary[];
  attachmentManifest?: AttachmentManifestEntry[];
  artifactManifest?: ArtifactManifestEntry[];
  inputTextSnapshotManifest?: InputTextSnapshotManifestEntry[];
  manifestCompleteness?: ObjectManifestCompleteness;
  traceObjectSummary?: TraceObjectSummary;
  tools?: ToolCallSummary[];
  agentEvents?: AgentEventSummary[];
  eventsSummary: EventsSummary;
  prefs: TelemetryPrefs;
  langfuse?: LangfuseDeliveryState;
  /** Per-turn config (model + skill + DS). May vary turn-to-turn within a session. */
  turn?: TurnInfo;
  /** Process- / build-level info collected once per daemon process. */
  runtime?: RuntimeInfo;
  /** Redacted section-level prompt diagnostics captured before agent spawn. */
  promptTelemetry?: PromptStackTelemetry;
  extraTags?: string[];
}

export interface ReportRunOpts {
  config?: TelemetrySinkConfig | LangfuseConfig | null;
  fetchImpl?: typeof fetch;
}

/**
 * Payload sent to Langfuse when a user thumbs-up/down's an assistant turn.
 *
 * The `runId` doubles as the Langfuse trace id (same convention used by
 * buildTracePayload), so the score lands on the existing trace if the run
 * was previously reported. If the run wasn't reported (e.g. content
 * consent was off at run completion, then turned on before the user
 * scored), Langfuse will accept the score anyway and the trace will
 * materialize when/if the daemon backfills it.
 */
export interface FeedbackReportContext {
  runId: string;
  installationId: string | null;
  prefs: TelemetryPrefs;
  rating: 'positive' | 'negative';
  reasonCodes: string[];
  /** Raw "other" free text the user typed. Trimmed; empty string when absent. */
  customReason: string;
  hasCustomReason: boolean;
  /** Optional context bag that ends up in Langfuse score metadata. */
  metadata?: Record<string, unknown>;
}
