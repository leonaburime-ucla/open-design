/**
 * @module observability/payload/payload
 *
 * Pure construction of Langfuse ingestion batches from a `ReportContext`
 * (`buildTracePayload`) and of a `score-create` batch from a
 * `FeedbackReportContext` (`buildFeedbackPayload`), plus every private helper
 * that shapes trace observations: byte-aware truncation, cost/token attribution,
 * prompt-stack blame metadata, timing spans, and tool/artifact diagnostics. No
 * network I/O and no daemon data access — it turns already-collected summaries
 * into wire batches. The `report` layer consumes these builders to deliver.
 */

import { randomUUID } from 'node:crypto';

import {
  ARTIFACTS_MAX_ITEMS,
  INPUT_MAX_BYTES,
  OUTPUT_MAX_BYTES,
  PROMPT_STACK_BLAME_MAX_SECTIONS,
  SESSION_ID_MAX,
  TOOL_INPUT_MAX_BYTES,
  TOOL_OUTPUT_MAX_BYTES,
  deriveLangfuseDeliveryState,
  readTelemetrySinkConfig,
} from '../core/index.js';
import type {
  ArtifactManifestEntry,
  AttachmentManifestEntry,
  FeedbackReportContext,
  MessageSummary,
  ReportContext,
  ToolCallSummary,
} from '../core/index.js';
import {
  buildPromptStackFlatMetadata,
  promptStackWithoutContent,
  structuredPromptStackInput,
  readTelemetryEnvironment,
  type PromptStackTelemetry,
  type PromptTelemetrySection,
} from '../../telemetry/index.js';
import type { RunTimingAnalytics } from '../../run/index.js';

// Byte-aware UTF-8 truncation. JS String.length counts UTF-16 code units,
// not bytes — non-ASCII text (CJK, emoji) can occupy 2-4× as many bytes as
// characters, so a `value.length > max` cap silently lets oversized prompts
// through. We truncate on a UTF-8 byte boundary so the result is still
// valid Unicode (no half-encoded characters).
function truncate(value: string | undefined, maxBytes: number): string | undefined {
  if (!value) return undefined;
  const buf = Buffer.from(value, 'utf8');
  if (buf.length <= maxBytes) return value;
  let cut = maxBytes;
  // UTF-8 continuation bytes have the bit pattern 10xxxxxx. Walk backwards
  // until we land on a leading byte (0xxxxxxx, 110xxxxx, 1110xxxx, 11110xxx)
  // so the slice doesn't end mid-character.
  while (cut > 0 && (buf[cut]! & 0xc0) === 0x80) cut -= 1;
  return buf.subarray(0, cut).toString('utf8');
}

function buildTagList(ctx: ReportContext): string[] {
  const tags = ['open-design', `project:${ctx.projectId}`];
  if (ctx.agentId) tags.push(`agent:${ctx.agentId}`);
  if (ctx.turn?.model) tags.push(`model:${ctx.turn.model}`);
  if (ctx.turn?.skillId) tags.push(`skill:${ctx.turn.skillId}`);
  if (ctx.turn?.designSystemId) tags.push(`ds:${ctx.turn.designSystemId}`);
  if (ctx.runtime?.os) tags.push(`os:${ctx.runtime.os}`);
  if (ctx.runtime?.clientType && ctx.runtime.clientType !== 'unknown') {
    tags.push(`client:${ctx.runtime.clientType}`);
  }
  if (ctx.extraTags?.length) tags.push(...ctx.extraTags);
  return tags;
}

function validTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function timingSpanBody(input: {
  traceId: string;
  parentObservationId: string;
  runId: string;
  name: string;
  start: number | undefined;
  end: number | undefined;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> | null {
  const start = validTimestamp(input.start);
  const end = validTimestamp(input.end);
  if (start === undefined || end === undefined || end < start) return null;
  const durationMs = Math.round(end - start);
  return {
    id: `${input.runId}-phase-${input.name}`,
    traceId: input.traceId,
    parentObservationId: input.parentObservationId,
    name: input.name,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString(),
    input: input.input,
    output: {
      duration_ms: durationMs,
      ...(input.output ?? {}),
    },
    metadata: {
      durationMs,
      ...(input.metadata ?? {}),
    },
  };
}

function promptBuildSummary(
  promptTelemetry: PromptStackTelemetry | undefined,
): Record<string, unknown> {
  if (!promptTelemetry) {
    return {
      prompt_stack_available: false,
    };
  }
  return {
    prompt_stack_available: true,
    section_count: promptTelemetry.sectionCount,
    stack_fingerprint: promptTelemetry.stackFingerprint,
    prompt_fingerprint: promptTelemetry.promptFingerprint,
    raw_bytes: promptTelemetry.rawBytes,
    redacted_bytes: promptTelemetry.redactedBytes,
    redacted_content_bytes: promptTelemetry.redactedContentBytes,
  };
}

function objectRefSummary(
  entries: Array<AttachmentManifestEntry | ArtifactManifestEntry> | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!entries?.length) return undefined;
  return entries.map((entry) => ({
    object_class: entry.object_class,
    storage_ref: entry.storage_ref,
    status: entry.status,
    size_bytes: entry.size_bytes,
    sha256: entry.sha256,
    mime_type: entry.mime_type,
    extension: entry.extension,
    redacted: entry.redacted,
    truncated: entry.truncated,
    retention_policy: entry.retention_policy,
    access_scope: entry.access_scope,
    sensitivity: entry.sensitivity,
    source: entry.source,
    ...(entry.object_class === 'attachment'
      ? { attachment_id: entry.attachment_id }
      : { artifact_id: entry.artifact_id, type: entry.type }),
  }));
}

function cappedManifestEntries<T>(entries: T[] | undefined): T[] | undefined {
  return entries ? entries.slice(0, ARTIFACTS_MAX_ITEMS) : undefined;
}

function manifestTruncated(entries: unknown[] | undefined): true | undefined {
  return entries && entries.length > ARTIFACTS_MAX_ITEMS ? true : undefined;
}

function tokenUsageSummary(
  usage: MessageSummary['usage'],
): Record<string, unknown> | undefined {
  if (!usage) return undefined;
  return {
    input: usage.inputTokens,
    input_provider: usage.inputTokensProvider,
    input_effective: usage.inputTokensEffective,
    output: usage.outputTokens,
    total: usage.totalTokens,
    cache_read_input: usage.cacheReadInputTokens,
    cache_creation_input: usage.cacheCreationInputTokens,
    uncached_input: usage.uncachedInputTokens,
    cache_hit_ratio: usage.cacheHitRatio,
    cache_token_source: usage.cacheTokenSource,
  };
}

function latestAgentCostUsd(ctx: ReportContext): number | undefined {
  if (!ctx.agentEvents?.length) return undefined;
  for (let i = ctx.agentEvents.length - 1; i >= 0; i -= 1) {
    const event = ctx.agentEvents[i]!;
    const cost = event.output?.cost_usd;
    if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
      return cost;
    }
  }
  return undefined;
}

function phaseCost(
  phase: string,
  costUsd: number | null,
  status: string,
  source: string,
  note?: string,
): Record<string, unknown> {
  return {
    phase,
    cost_usd: costUsd,
    cost_status: status,
    cost_source: source,
    ...(note ? { note } : {}),
  };
}

function buildCostBreakdown(ctx: ReportContext): Record<string, unknown> {
  const costUsd = latestAgentCostUsd(ctx);
  const hasCost = costUsd !== undefined;
  return {
    cost_usd: costUsd ?? null,
    currency: 'USD',
    pricing_version: hasCost ? 'provider_reported' : 'unavailable',
    cost_source: hasCost ? 'agent_usage_event' : 'unavailable',
    cost_status: hasCost ? 'available' : 'unavailable',
    unavailable_reason: hasCost
      ? undefined
      : 'agent runtime did not report total_cost_usd',
    token_usage: tokenUsageSummary(ctx.message.usage),
    phase_costs: {
      prompt_build: phaseCost(
        'prompt-build',
        null,
        'not_metered',
        'not_applicable',
        'local prompt assembly; no provider call in this phase',
      ),
      agent_call: phaseCost(
        'agent-call',
        costUsd ?? null,
        hasCost ? 'available' : 'unavailable',
        hasCost ? 'agent_usage_event' : 'unavailable',
        hasCost
          ? 'provider-reported total for the agent call; not split across stream/tools/artifact internally'
          : 'runtime did not report total_cost_usd',
      ),
      tool_execution: phaseCost(
        'tool-execution',
        null,
        'included_in_agent_call_or_not_metered',
        'not_split',
        'tool spans are local process/tool time; provider token cost is only available at agent-call granularity',
      ),
      artifact_generation: phaseCost(
        'artifact-generation',
        null,
        'included_in_agent_call',
        'not_split',
        'artifact output is generated inside the agent call and is not separately priced',
      ),
      verification: phaseCost(
        'verification',
        null,
        'not_instrumented',
        'unavailable',
        'preview/screenshot/responsive verification is not yet emitted as a structured measured phase',
      ),
    },
  };
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function sectionAttributionBytes(section: PromptTelemetrySection): number {
  return cleanNumber(section.redactedBytes) ?? cleanNumber(section.rawBytes) ?? 0;
}

function redactedContentBytes(section: PromptTelemetrySection): number {
  return Buffer.byteLength(section.redactedContent ?? '', 'utf8');
}

function allocateProportionalTokens(
  total: number | undefined,
  sections: Array<{ section: PromptTelemetrySection; weightBytes: number }>,
): Map<PromptTelemetrySection, number> {
  const out = new Map<PromptTelemetrySection, number>();
  const cleanTotal = cleanNumber(total);
  if (cleanTotal === undefined || cleanTotal <= 0) return out;
  const totalWeight = sections.reduce((sum, item) => sum + item.weightBytes, 0);
  if (totalWeight <= 0) return out;

  let assigned = 0;
  let largest: { section: PromptTelemetrySection; tokens: number } | null = null;
  for (const item of sections) {
    const exact = (cleanTotal * item.weightBytes) / totalWeight;
    const rounded = Math.floor(exact);
    out.set(item.section, rounded);
    assigned += rounded;
    if (!largest || item.weightBytes > sectionAttributionBytes(largest.section)) {
      largest = { section: item.section, tokens: rounded };
    }
  }
  const remainder = Math.round(cleanTotal) - assigned;
  if (largest && remainder > 0) {
    out.set(largest.section, (out.get(largest.section) ?? 0) + remainder);
  }
  return out;
}

function buildPromptStackBlameMetadata(
  promptStack: PromptStackTelemetry | undefined,
  usage: MessageSummary['usage'] | undefined,
  timings: RunTimingAnalytics | undefined,
): Record<string, unknown> {
  if (!promptStack || promptStack.sections.length === 0) return {};
  const weightedSections = promptStack.sections
    .map((section) => ({
      section,
      weightBytes: sectionAttributionBytes(section),
    }))
    .filter((item) => item.weightBytes > 0);
  if (weightedSections.length === 0) return {};

  const totalBytes = weightedSections.reduce((sum, item) => sum + item.weightBytes, 0);
  const sorted = [...weightedSections].sort(
    (a, b) => b.weightBytes - a.weightBytes || a.section.ordinal - b.section.ordinal,
  );
  const cacheCreationBySection = allocateProportionalTokens(
    usage?.cacheCreationInputTokens,
    weightedSections,
  );
  const cacheReadBySection = allocateProportionalTokens(
    usage?.cacheReadInputTokens,
    weightedSections,
  );
  const inputEffectiveBySection = allocateProportionalTokens(
    usage?.inputTokensEffective ?? usage?.inputTokens,
    weightedSections,
  );
  const uncachedBySection = allocateProportionalTokens(
    usage?.uncachedInputTokens,
    weightedSections,
  );

  const sectionRow = ({ section, weightBytes }: { section: PromptTelemetrySection; weightBytes: number }) => {
    const share = totalBytes > 0 ? weightBytes / totalBytes : 0;
    return {
      kind: section.kind,
      ordinal: section.ordinal,
      contentMode: section.contentMode,
      rawBytes: section.rawBytes,
      redactedBytes: section.redactedBytes,
      redactedContentBytes: redactedContentBytes(section),
      attributionBytes: weightBytes,
      attributionShare: Number(share.toFixed(6)),
      truncated: section.truncated,
      ...(section.truncationReason ? { truncationReason: section.truncationReason } : {}),
      estimatedInputEffectiveTokens: inputEffectiveBySection.get(section) ?? undefined,
      estimatedCacheCreationInputTokens: cacheCreationBySection.get(section) ?? undefined,
      estimatedCacheReadInputTokens: cacheReadBySection.get(section) ?? undefined,
      estimatedUncachedInputTokens: uncachedBySection.get(section) ?? undefined,
    };
  };

  const primary = sorted[0]!;
  const primaryShare = totalBytes > 0 ? primary.weightBytes / totalBytes : 0;
  return {
    promptStack_topSectionsByBytes: sorted
      .slice(0, PROMPT_STACK_BLAME_MAX_SECTIONS)
      .map(sectionRow),
    cacheCreationTokensBySection: sorted
      .filter(({ section }) => (cacheCreationBySection.get(section) ?? 0) > 0)
      .map(({ section, weightBytes }) => ({
        kind: section.kind,
        ordinal: section.ordinal,
        attributionBytes: weightBytes,
        estimatedCacheCreationInputTokens: cacheCreationBySection.get(section) ?? 0,
      })),
    promptStack_ttftAttribution: {
      method: 'proportional_by_prompt_section_redacted_bytes',
      estimation_warning:
        'Provider reports aggregate prompt/cache tokens only; section token values are estimates for diagnosis, not billing truth.',
      time_to_first_token_ms: timings?.time_to_first_token_ms,
      spawn_to_first_token_ms: timings?.spawn_to_first_token_ms,
      totalAttributionBytes: totalBytes,
      sectionCount: weightedSections.length,
      primarySectionKind: primary.section.kind,
      primarySectionOrdinal: primary.section.ordinal,
      primarySectionAttributionBytes: primary.weightBytes,
      primarySectionAttributionShare: Number(primaryShare.toFixed(6)),
      primarySectionEstimatedInputEffectiveTokens:
        inputEffectiveBySection.get(primary.section) ?? undefined,
      primarySectionEstimatedCacheCreationInputTokens:
        cacheCreationBySection.get(primary.section) ?? undefined,
      primarySectionEstimatedCacheReadInputTokens:
        cacheReadBySection.get(primary.section) ?? undefined,
      cacheTokenSource: usage?.cacheTokenSource,
    },
  };
}

function durationMs(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function buildToolPerformanceDiagnostics(
  tools: ToolCallSummary[] | undefined,
): Record<string, unknown> {
  const list = tools ?? [];
  const byName = new Map<
    string,
    {
      tool_name: string;
      call_count: number;
      error_count: number;
      total_duration_ms: number;
      max_duration_ms: number;
      min_duration_ms: number;
      failure_types: Set<string>;
    }
  >();

  for (const tool of list) {
    const d = durationMs(tool.startedAt, tool.endedAt);
    const current =
      byName.get(tool.name) ??
      {
        tool_name: tool.name,
        call_count: 0,
        error_count: 0,
        total_duration_ms: 0,
        max_duration_ms: 0,
        min_duration_ms: Number.POSITIVE_INFINITY,
        failure_types: new Set<string>(),
      };
    current.call_count += 1;
    current.total_duration_ms += d;
    current.max_duration_ms = Math.max(current.max_duration_ms, d);
    current.min_duration_ms = Math.min(current.min_duration_ms, d);
    if (tool.isError === true) {
      current.error_count += 1;
      current.failure_types.add('tool_result_error');
    }
    byName.set(tool.name, current);
  }

  return {
    tool_call_count: list.length,
    total_tool_duration_ms: list.reduce(
      (sum, tool) => sum + durationMs(tool.startedAt, tool.endedAt),
      0,
    ),
    retry_count_available: false,
    retry_count: null,
    retry_detection: 'not_instrumented',
    retry_unavailable_reason:
      'tool spans do not yet carry retry-group or attempt indexes',
    by_tool: [...byName.values()].map((entry) => ({
      tool_name: entry.tool_name,
      call_count: entry.call_count,
      error_count: entry.error_count,
      total_duration_ms: entry.total_duration_ms,
      avg_duration_ms:
        entry.call_count > 0
          ? Math.round(entry.total_duration_ms / entry.call_count)
          : 0,
      max_duration_ms: entry.max_duration_ms,
      min_duration_ms:
        Number.isFinite(entry.min_duration_ms) ? entry.min_duration_ms : 0,
      retry_count_available: false,
      retry_count: null,
      failure_types:
        entry.failure_types.size > 0 ? [...entry.failure_types] : ['none'],
    })),
  };
}

function buildArtifactWriteDiagnostics(
  ctx: ReportContext,
): Record<string, unknown> {
  const writeTools = (ctx.tools ?? []).filter((tool) => tool.name === 'Write');
  const totalArtifactSizeBytes = ctx.artifacts.reduce(
    (sum, artifact) => sum + artifact.sizeBytes,
    0,
  );
  const writeDurationMs = writeTools.reduce(
    (sum, tool) => sum + durationMs(tool.startedAt, tool.endedAt),
    0,
  );
  return {
    artifact_count: ctx.artifacts.length,
    total_artifact_size_bytes: totalArtifactSizeBytes,
    write_tool_count: writeTools.length,
    write_tool_duration_ms: writeDurationMs,
    bytes_per_write_ms:
      writeDurationMs > 0
        ? Math.round(totalArtifactSizeBytes / writeDurationMs)
        : null,
    correlation_status:
      ctx.artifacts.length > 0 && writeTools.length > 0
        ? 'heuristic_by_write_tool_total'
        : 'unavailable',
    correlation_unavailable_reason:
      ctx.artifacts.length > 0 && writeTools.length > 0
        ? undefined
        : 'artifact files are not yet linked to individual Write tool ids',
    artifacts: ctx.artifacts.map((artifact) => ({
      slug: artifact.slug,
      type: artifact.type,
      size_bytes: artifact.sizeBytes,
    })),
  };
}

function buildSemanticPhaseDiagnostics(ctx: ReportContext): Record<string, unknown> {
  const marks = ctx.run.timingMarks ?? {};
  const measured: Record<string, unknown> = {};
  const addMeasured = (
    name: string,
    start: number | undefined,
    end: number | undefined,
  ) => {
    const s = validTimestamp(start);
    const e = validTimestamp(end);
    measured[name] =
      s !== undefined && e !== undefined && e >= s
        ? { duration_ms: Math.round(e - s), status: 'measured' }
        : { duration_ms: null, status: 'unmeasured' };
  };
  addMeasured('prompt-build', marks.promptBuildStartAt, marks.promptBuildEndAt);
  addMeasured('launch-preflight', marks.launchPreflightStartAt, marks.launchPreflightEndAt);
  addMeasured('process-spawn', marks.processSpawnStartedAt, marks.processSpawnedAt);
  addMeasured('stdin-write', marks.stdinWriteStartAt, marks.stdinWriteEndAt);
  addMeasured('runtime-init-to-first-model-event', marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt, marks.firstModelEventAt);
  addMeasured('runtime-init-to-first-token', marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt, marks.firstTokenAt);
  addMeasured('agent-call', marks.modelCallStartAt, ctx.run.endedAt);
  addMeasured('stream-output', marks.firstTokenAt, marks.finalizeStartAt ?? ctx.run.endedAt);
  addMeasured('artifact-write', marks.firstArtifactWriteAt, marks.finalizeStartAt ?? ctx.run.endedAt);
  addMeasured('finalize', marks.finalizeStartAt, ctx.run.endedAt);
  return {
    measured,
    semantic_phase_timing_status: 'partial',
    missing_semantic_phases: [
      'brief-intake',
      'route-task-kind',
      'resolve-skill',
      'resolve-design-system',
      'plan',
      'generate-artifact',
      'critique',
      'repair',
      'preview-verify',
      'export-finalize',
      'evaluator',
    ],
    missing_reason:
      'runtime currently emits low-level timing marks but not all product semantic phase boundaries',
  };
}

function buildPerformanceDiagnostics(ctx: ReportContext): Record<string, unknown> {
  return {
    timings: ctx.run.timings,
    tool_performance: buildToolPerformanceDiagnostics(ctx.tools),
    artifact_write: buildArtifactWriteDiagnostics(ctx),
    preview_verify: {
      status: 'not_instrumented',
      screenshot_check: 'not_reported',
      responsive_check: 'not_reported',
      html_parse_check: 'not_reported',
      note: 'artifact self-checks may appear in assistant output, but are not yet structured observations',
    },
    semantic_phases: buildSemanticPhaseDiagnostics(ctx),
  };
}

function buildTimingSpanBodies(
  ctx: ReportContext,
  parentObservationId: string,
  opts: {
    modelCallName?: string;
    promptStack?: PromptStackTelemetry;
  } = {},
): Record<string, unknown>[] {
  const marks = ctx.run.timingMarks ?? {};
  const runStart = ctx.run.startedAt;
  const runEnd = ctx.run.endedAt;
  const queueEnd = marks.promptBuildStartAt ?? marks.startChatRunStartedAt;
  const costBreakdown = buildCostBreakdown(ctx);
  const phaseCosts = costBreakdown.phase_costs as Record<string, unknown>;
  const definitions = [
    {
      name: 'queue',
      start: runStart,
      end: queueEnd,
      input: {
        phase: 'queue',
        from: 'run.startedAt',
        to: 'promptBuildStartAt',
      },
      output: {
        status: queueEnd === undefined ? 'unmeasured' : 'ready_for_prompt_build',
      },
      metadata: { boundary: 'run.startedAt -> promptBuildStartAt' },
    },
    {
      name: 'prompt-build',
      start: marks.promptBuildStartAt,
      end: marks.promptBuildEndAt,
      input: {
        phase: 'prompt-build',
        ingredients: {
          agent: ctx.agentId ?? 'unknown',
          model: ctx.turn?.model ?? 'unknown',
          skill_id: ctx.turn?.skillId ?? null,
          design_system_id: ctx.turn?.designSystemId ?? null,
          design_system_digest: ctx.turn?.designSystemDigest ?? null,
          prompt_cache_hit: ctx.turn?.promptCache?.hit ?? null,
          user_request_available: Boolean(ctx.message.prompt),
          attachment_refs:
            objectRefSummary(cappedManifestEntries(ctx.attachmentManifest)) ?? [],
          attachment_refs_truncated: manifestTruncated(ctx.attachmentManifest),
        },
      },
      output: {
        status:
          marks.promptBuildEndAt === undefined
            ? 'unmeasured'
            : 'prompt_stack_ready',
        content_policy: opts.promptStack
          ? 'redacted_prompt_stack_on_generation_input_with_object_refs'
          : 'metadata_only_or_unavailable',
        ...promptBuildSummary(ctx.promptTelemetry),
      },
      metadata: { boundary: 'promptBuildStartAt -> promptBuildEndAt' },
    },
    {
      name: 'launch-preflight',
      start: marks.launchPreflightStartAt,
      end: marks.launchPreflightEndAt,
      input: {
        phase: 'launch-preflight',
        from: 'promptBuildEndAt',
        to: 'processSpawnStartedAt',
      },
      output: {
        status:
          marks.launchPreflightEndAt === undefined
            ? 'unmeasured'
            : 'ready_to_spawn',
      },
      metadata: { boundary: 'launchPreflightStartAt -> launchPreflightEndAt' },
    },
    {
      name: 'spawn',
      start: marks.processSpawnStartedAt,
      end: marks.processSpawnedAt,
      input: {
        phase: 'spawn',
        agent: ctx.agentId ?? 'unknown',
        runtime: ctx.runtime?.clientType ?? 'unknown',
        cwd_ref: 'project',
        raw_path_included: false,
      },
      output: {
        status:
          marks.processSpawnedAt === undefined ? 'unmeasured' : 'process_spawned',
      },
      metadata: {
        boundary: 'processSpawnStartedAt -> processSpawnedAt',
      },
    },
    {
      name: 'stdin-write',
      start: marks.stdinWriteStartAt,
      end: marks.stdinWriteEndAt,
      input: {
        phase: 'stdin-write',
        prompt_input_format: 'redacted',
      },
      output: {
        status:
          marks.stdinWriteEndAt === undefined ? 'unmeasured' : 'prompt_sent',
      },
      metadata: { boundary: 'stdinWriteStartAt -> stdinWriteEndAt' },
    },
    {
      name: 'runtime-init-to-first-model-event',
      start: marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt,
      end: marks.firstModelEventAt,
      input: {
        phase: 'runtime-init-to-first-model-event',
        from: 'stdinWriteEndAt',
        to: 'firstModelEventAt',
      },
      output: {
        status:
          marks.firstModelEventAt === undefined
            ? 'unmeasured'
            : 'first_model_event_seen',
      },
      metadata: { boundary: 'stdinWriteEndAt/modelCallStartAt/processSpawnedAt -> firstModelEventAt' },
    },
    {
      name: 'runtime-init-to-first-token',
      start: marks.stdinWriteEndAt ?? marks.modelCallStartAt ?? marks.processSpawnedAt,
      end: marks.firstTokenAt,
      input: {
        phase: 'runtime-init-to-first-token',
        from: 'stdinWriteEndAt',
        to: 'firstTokenAt',
      },
      output: {
        status:
          marks.firstTokenAt === undefined ? 'unmeasured' : 'first_token_seen',
      },
      metadata: { boundary: 'stdinWriteEndAt/modelCallStartAt/processSpawnedAt -> firstTokenAt' },
    },
    {
      name: opts.modelCallName ?? 'agent-call',
      start: marks.modelCallStartAt,
      end: runEnd,
      input: {
        phase: opts.modelCallName ?? 'agent-call',
        model: ctx.turn?.model ?? 'unknown',
        agent: ctx.agentId ?? 'unknown',
        tool_call_count: ctx.eventsSummary.toolCalls,
        generation_observation:
          (opts.modelCallName ?? 'agent-call') === 'agent-call',
      },
      output: {
        status: ctx.run.status,
        error_code: ctx.run.errorCode,
        token_usage: tokenUsageSummary(ctx.message.usage),
        cost: phaseCosts.agent_call,
        tool_call_count: ctx.eventsSummary.toolCalls,
      },
      metadata: {
        boundary: 'modelCallStartAt -> run.endedAt',
        toolCallCount: ctx.eventsSummary.toolCalls,
      },
    },
    {
      name: 'stream-output',
      start: marks.firstTokenAt,
      end: marks.finalizeStartAt ?? runEnd,
      input: {
        phase: 'stream-output',
        from: 'firstTokenAt',
        to: 'finalizeStartAt',
      },
      output: {
        status: ctx.run.status,
        output_redacted: true,
        artifact_blocks_redacted: true,
      },
      metadata: { boundary: 'firstTokenAt -> finalizeStartAt' },
    },
    {
      name: 'artifact-write',
      start: marks.firstArtifactWriteAt,
      end: marks.finalizeStartAt ?? runEnd,
      input: {
        phase: 'artifact-write',
        from: 'firstArtifactWriteAt',
        to: 'finalizeStartAt',
      },
      output: {
        status:
          marks.firstArtifactWriteAt === undefined
            ? 'not_seen'
            : 'artifact_write_seen',
        artifact_count: ctx.artifacts.length,
      },
      metadata: { boundary: 'firstArtifactWriteAt -> finalizeStartAt' },
    },
    {
      name: 'finalize',
      start: marks.finalizeStartAt,
      end: runEnd,
      input: {
        phase: 'finalize',
        artifact_manifest_enabled: ctx.prefs.metrics === true && ctx.prefs.content === true,
      },
      output: {
        status: ctx.run.status,
        artifact_count: ctx.artifacts.length,
        attachment_count: ctx.attachmentManifest?.length ?? 0,
        manifest_completeness:
          ctx.manifestCompleteness ??
          (ctx.prefs.metrics === true && ctx.prefs.content === true ? 'unavailable' : 'off'),
      },
      metadata: { boundary: 'finalizeStartAt -> run.endedAt' },
    },
  ];

  return definitions
    .map((definition) =>
      timingSpanBody({
        traceId: ctx.run.runId,
        parentObservationId,
        runId: ctx.run.runId,
        ...definition,
      }),
    )
    .filter((body): body is Record<string, unknown> => body !== null);
}

function usageTotal(usage: MessageSummary['usage']): number {
  if (!usage) return 0;
  const values = [
    usage.inputTokens,
    usage.inputTokensProvider,
    usage.inputTokensEffective,
    usage.outputTokens,
    usage.totalTokens,
    usage.cacheReadInputTokens,
    usage.cacheCreationInputTokens,
    usage.uncachedInputTokens,
    usage.estimatedContextTokens,
  ];
  let total = 0;
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) total += value;
  }
  return total;
}

function redactArtifactBlocks(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.replace(
    /<artifact\b([^>]*)>[\s\S]*?<\/artifact>/gi,
    (_match, attrs: string) =>
      `<artifact${attrs}>[REDACTED:artifact_content]</artifact>`,
  );
}

const CONTENT_TOOL_NAMES = new Set([
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
]);

function redactLocalPaths(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value
    .replace(/\/Users\/[^/\s"']+(?:\/[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]')
    .replace(/[A-Za-z]:\\Users\\[^\\\s"']+(?:\\[^ \n\r\t"'`<>)]*)?/g, '[REDACTED:local_path]');
}

function traceSafeToolPayload(
  toolName: string,
  direction: 'input' | 'output',
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (CONTENT_TOOL_NAMES.has(toolName)) {
    return `[REDACTED:tool_${direction}:content_tool:${toolName}]`;
  }
  return redactLocalPaths(redactArtifactBlocks(value));
}

function shouldCreateGenerationObservation(ctx: ReportContext): boolean {
  if (ctx.run.status === 'succeeded') return true;
  if (usageTotal(ctx.message.usage) > 0) return true;
  if (ctx.eventsSummary.toolCalls > 0) return true;
  return ctx.run.failure?.failure_stage !== 'session_init';
}

export function buildTracePayload(ctx: ReportContext): unknown[] {
  const wantsContent = ctx.prefs.metrics === true && ctx.prefs.content === true;
  const wantsArtifacts = wantsContent;

  const sessionId =
    ctx.conversationId.length <= SESSION_ID_MAX ? ctx.conversationId : undefined;

  const startTimeIso = new Date(ctx.run.startedAt).toISOString();
  const endTimeIso = new Date(ctx.run.endedAt).toISOString();
  const nowIso = new Date().toISOString();

  const inputText = wantsContent
    ? truncate(ctx.message.prompt, INPUT_MAX_BYTES)
    : undefined;
  const outputText = wantsContent
    ? truncate(redactArtifactBlocks(ctx.message.output), OUTPUT_MAX_BYTES)
    : undefined;

  const artifactsList = wantsArtifacts
    ? ctx.artifacts.slice(0, ARTIFACTS_MAX_ITEMS)
    : undefined;
  const artifactsTruncated =
    wantsArtifacts && ctx.artifacts.length > ARTIFACTS_MAX_ITEMS
      ? true
      : undefined;
  const attachmentManifest = wantsArtifacts
    ? cappedManifestEntries(ctx.attachmentManifest)
    : undefined;
  const attachmentManifestTruncated = wantsArtifacts
    ? manifestTruncated(ctx.attachmentManifest)
    : undefined;
  const artifactManifest = wantsArtifacts
    ? cappedManifestEntries(ctx.artifactManifest)
    : undefined;
  const artifactManifestTruncated = wantsArtifacts
    ? manifestTruncated(ctx.artifactManifest)
    : undefined;
  const inputTextSnapshotManifest = wantsArtifacts && wantsContent
    ? cappedManifestEntries(ctx.inputTextSnapshotManifest)
    : undefined;
  const inputTextSnapshotManifestTruncated = wantsArtifacts && wantsContent
    ? manifestTruncated(ctx.inputTextSnapshotManifest)
    : undefined;

  const tokens = ctx.message.usage
    ? {
        input: ctx.message.usage.inputTokens,
        inputProvider: ctx.message.usage.inputTokensProvider,
        inputEffective: ctx.message.usage.inputTokensEffective,
        output: ctx.message.usage.outputTokens,
        total: ctx.message.usage.totalTokens,
        cacheReadInput: ctx.message.usage.cacheReadInputTokens,
        cacheCreationInput: ctx.message.usage.cacheCreationInputTokens,
        uncachedInput: ctx.message.usage.uncachedInputTokens,
        estimatedContext: ctx.message.usage.estimatedContextTokens,
        cacheHitRatio: ctx.message.usage.cacheHitRatio,
        cacheTokenSource: ctx.message.usage.cacheTokenSource,
      }
    : undefined;

  const usage = ctx.message.usage
    ? {
        input: ctx.message.usage.inputTokensEffective ?? ctx.message.usage.inputTokens,
        output: ctx.message.usage.outputTokens,
        total: ctx.message.usage.totalTokens,
        unit: 'TOKENS' as const,
      }
    : undefined;
  const costBreakdown = buildCostBreakdown(ctx);
  const performanceDiagnostics = buildPerformanceDiagnostics(ctx);

  const success = ctx.run.status === 'succeeded';
  const traceId = ctx.run.runId;
  const langfuseDelivery =
    ctx.langfuse ?? deriveLangfuseDeliveryState(ctx.prefs, readTelemetrySinkConfig());
  const agentSpanId = `${ctx.run.runId}-agent`;
  const generationId = `${ctx.run.runId}-gen`;
  const createGeneration = shouldCreateGenerationObservation(ctx);
  const operationSpanId = createGeneration
    ? generationId
    : `${ctx.run.runId}-runtime`;
  const promptStack = ctx.promptTelemetry
    ? wantsContent
      ? ctx.promptTelemetry
      : promptStackWithoutContent(ctx.promptTelemetry)
    : undefined;
  const promptStackFlatMetadata = promptStack
    ? buildPromptStackFlatMetadata(promptStack)
    : {};
  const promptStackBlameMetadata = buildPromptStackBlameMetadata(
    promptStack,
    ctx.message.usage,
    ctx.run.timings,
  );
  const generationInput = promptStack
    ? structuredPromptStackInput(promptStack)
    : inputText;

  // Trace metadata is the queryable + exportable fact-sheet for each turn.
  // Anything we want to slice on for evals or dataset construction lives
  // here. Fields are flat (Langfuse stores it as JSON but indexes shallow
  // keys best). All entries are anonymous — no PII, no credentials.
  const traceMetadata: Record<string, unknown> = {
    success,
    env: readTelemetryEnvironment(),
    status: ctx.run.status,
    error: ctx.run.error ?? undefined,
    error_code: ctx.run.errorCode,
    langfuse_trace_id: traceId,
    ...langfuseDelivery,
    ...(ctx.run.failure ?? {}),
    ...(ctx.run.timings ?? {}),
    stderr: ctx.run.stderr,
    stdout: ctx.run.stdout,
    diagnostics: ctx.run.diagnostics,
    eventsSummary: ctx.eventsSummary,
    tokens,
    cost_usd: costBreakdown.cost_usd,
    currency: costBreakdown.currency,
    pricing_version: costBreakdown.pricing_version,
    cost_source: costBreakdown.cost_source,
    cost_status: costBreakdown.cost_status,
    cost_breakdown: costBreakdown,
    performance_diagnostics: performanceDiagnostics,
    artifacts: artifactsList,
    artifactsTruncated,
    attachment_manifest: attachmentManifest,
    attachment_manifest_truncated: attachmentManifestTruncated,
    artifact_manifest: artifactManifest,
    artifact_manifest_truncated: artifactManifestTruncated,
    input_text_snapshot_manifest: inputTextSnapshotManifest,
    input_text_snapshot_manifest_truncated: inputTextSnapshotManifestTruncated,
    trace_object_summary: ctx.traceObjectSummary,
    manifest_completeness: wantsArtifacts
      ? (ctx.manifestCompleteness ?? 'unavailable')
      : undefined,
    projectId: ctx.projectId || undefined,
    agent: ctx.agentId,
    model: ctx.turn?.model,
    reasoning: ctx.turn?.reasoning,
    skillId: ctx.turn?.skillId,
    designSystemId: ctx.turn?.designSystemId,
    designSystemDigest: ctx.turn?.designSystemDigest,
    designSystemSelectionSource: ctx.turn?.designSystemSelectionSource,
    stablePromptHash: ctx.turn?.promptCache?.stablePromptHash,
    stablePromptCacheHit: ctx.turn?.promptCache?.hit,
    stablePromptCacheMissReason: ctx.turn?.promptCache?.missReason,
    appVersion: ctx.runtime?.appVersion,
    appChannel: ctx.runtime?.appChannel,
    packaged: ctx.runtime?.packaged,
    nodeVersion: ctx.runtime?.nodeVersion,
    os: ctx.runtime?.os,
    osRelease: ctx.runtime?.osRelease,
    arch: ctx.runtime?.arch,
    clientType: ctx.runtime?.clientType,
    ...promptStackFlatMetadata,
    ...promptStackBlameMetadata,
  };

  // Generation-level model parameters mirror the Langfuse schema so the UI
  // shows them in the dedicated Model Parameters card and filters work.
  const modelParameters: Record<string, unknown> | undefined =
    ctx.turn?.reasoning ? { reasoning: ctx.turn.reasoning } : undefined;
  const timingSpanBodies = buildTimingSpanBodies(ctx, operationSpanId, {
    modelCallName: createGeneration ? 'agent-call' : 'runtime-call',
    ...(promptStack ? { promptStack } : {}),
  });
  const toolParentObservationId = timingSpanBodies.some(
    (span) => span.name === 'agent-call',
  )
    ? `${ctx.run.runId}-phase-agent-call`
    : agentSpanId;
  const agentEventParentObservationId = toolParentObservationId;

  const batch: unknown[] = [
    {
      id: randomUUID(),
      type: 'trace-create',
      timestamp: nowIso,
      body: {
        id: traceId,
        name: 'open-design-turn',
        sessionId,
        userId: ctx.installationId ?? undefined,
        tags: buildTagList(ctx),
        input: inputText,
        output: outputText,
        metadata: traceMetadata,
        timestamp: startTimeIso,
      },
    },
    {
      id: randomUUID(),
      type: 'span-create',
      timestamp: nowIso,
      body: {
        id: agentSpanId,
        traceId,
        name: 'agent-run',
        startTime: startTimeIso,
        endTime: endTimeIso,
        input: inputText,
        output: outputText,
        level: success ? 'DEFAULT' : 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        metadata: {
          status: ctx.run.status,
          messageId: ctx.message.messageId || undefined,
          durationMs: ctx.eventsSummary.durationMs,
          toolCalls: ctx.eventsSummary.toolCalls,
          errors: ctx.eventsSummary.errors,
          cost_usd: costBreakdown.cost_usd,
          currency: costBreakdown.currency,
          cost_status: costBreakdown.cost_status,
        },
      },
    },
  ];

  if (createGeneration) {
    batch.push({
      id: randomUUID(),
      type: 'generation-create',
      timestamp: nowIso,
      body: {
        id: generationId,
        traceId,
        parentObservationId: agentSpanId,
        name: 'llm',
        // model / modelParameters are first-class on Langfuse generations
        // (used for token-cost lookup, UI grouping, eval filters), so set
        // them at the body level instead of stuffing them into metadata.
        model: ctx.turn?.model,
        modelParameters,
        startTime: startTimeIso,
        endTime: endTimeIso,
        input: generationInput,
        output: outputText,
        level: success ? 'DEFAULT' : 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        usage,
        metadata: {
          durationMs: ctx.eventsSummary.durationMs,
          cost_usd: costBreakdown.cost_usd,
          currency: costBreakdown.currency,
          pricing_version: costBreakdown.pricing_version,
          cost_source: costBreakdown.cost_source,
          cost_breakdown: costBreakdown,
          performance_diagnostics: performanceDiagnostics,
          ...promptStackFlatMetadata,
          ...promptStackBlameMetadata,
        },
      },
    });
  } else {
    batch.push({
      id: randomUUID(),
      type: 'span-create',
      timestamp: nowIso,
      body: {
        id: operationSpanId,
        traceId,
        parentObservationId: agentSpanId,
        name: 'agent-runtime',
        startTime: startTimeIso,
        endTime: endTimeIso,
        input: generationInput,
        output: outputText,
        level: 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        metadata: {
          durationMs: ctx.eventsSummary.durationMs,
          cost_usd: costBreakdown.cost_usd,
          currency: costBreakdown.currency,
          pricing_version: costBreakdown.pricing_version,
          cost_source: costBreakdown.cost_source,
          cost_breakdown: costBreakdown,
          performance_diagnostics: performanceDiagnostics,
          ...promptStackFlatMetadata,
          ...promptStackBlameMetadata,
          reason: 'no_model_generation',
        },
      },
    });
  }

  for (const span of timingSpanBodies) {
    batch.push({
      id: randomUUID(),
      type: 'span-create',
      timestamp: nowIso,
      body: span,
    });
  }

  if (ctx.agentEvents?.length) {
    for (const event of ctx.agentEvents) {
      batch.push({
        id: randomUUID(),
        type: 'event-create',
        timestamp: nowIso,
        body: {
          id: `${ctx.run.runId}-agent-event-${event.id}`,
          traceId,
          parentObservationId: agentEventParentObservationId,
          name: event.name,
          startTime: new Date(event.timestamp).toISOString(),
          input: event.input,
          output: event.output,
          level: event.level ?? 'DEFAULT',
          statusMessage: event.statusMessage,
          metadata: event.metadata,
        },
      });
    }
  }

  if (ctx.tools?.length) {
    for (const tool of ctx.tools) {
      const toolSpanId = `${ctx.run.runId}-tool-${tool.id}`;
      const toolStartedAt = new Date(tool.startedAt).toISOString();
      const toolEndedAt = new Date(tool.endedAt).toISOString();
      const toolDurationMs = durationMs(tool.startedAt, tool.endedAt);
      const toolInput = wantsContent
        ? truncate(
            traceSafeToolPayload(tool.name, 'input', tool.input),
            TOOL_INPUT_MAX_BYTES,
          )
        : undefined;
      const toolOutput = wantsContent
        ? truncate(
            traceSafeToolPayload(tool.name, 'output', tool.output),
            TOOL_OUTPUT_MAX_BYTES,
          )
        : undefined;
      batch.push({
        id: randomUUID(),
        type: 'span-create',
        timestamp: nowIso,
        body: {
          id: toolSpanId,
          traceId,
          parentObservationId: toolParentObservationId,
          name: `tool:${tool.name}`,
          startTime: toolStartedAt,
          endTime: toolEndedAt,
          input: toolInput,
          output: toolOutput,
          level: tool.isError ? 'ERROR' : 'DEFAULT',
          metadata: {
            toolCallId: tool.id,
            toolName: tool.name,
            durationMs: toolDurationMs,
            hasInput: tool.input !== undefined,
            hasOutput: tool.output !== undefined,
            isError: tool.isError === true,
            failureType: tool.isError === true ? 'tool_result_error' : 'none',
            retryCount: null,
            retryDetection: 'not_instrumented',
          },
        },
      });
    }
  }

  if (artifactsList && (artifactsList.length > 0 || artifactsTruncated)) {
    batch.push({
      id: randomUUID(),
      type: 'event-create',
      timestamp: nowIso,
      body: {
        id: `${ctx.run.runId}-artifacts`,
        traceId,
        parentObservationId: agentSpanId,
        name: 'artifact-summary',
        startTime: endTimeIso,
        input: {
          source: 'agent_generated_artifacts',
          artifact_count: artifactsList.length,
          artifact_manifest_enabled: wantsArtifacts,
        },
        output: {
          artifacts: artifactsList,
          artifactsTruncated,
          manifest_completeness: wantsArtifacts
            ? (ctx.manifestCompleteness ?? 'unavailable')
            : 'off',
        },
        metadata: {
          artifacts: artifactsList,
          artifactsTruncated,
          artifact_write_diagnostics: performanceDiagnostics.artifact_write,
        },
      },
    });
  }

  if (!success || ctx.eventsSummary.errors > 0) {
    batch.push({
      id: randomUUID(),
      type: 'event-create',
      timestamp: nowIso,
      body: {
        id: `${ctx.run.runId}-error`,
        traceId,
        parentObservationId: agentSpanId,
        name: success ? 'error-summary' : 'run-error',
        startTime: endTimeIso,
        level: 'ERROR',
        statusMessage: ctx.run.error ?? undefined,
        metadata: {
          status: ctx.run.status,
          errors: ctx.eventsSummary.errors,
        },
      },
    });
  }

  return batch;
}

// Build a Langfuse `score-create` batch for a user-supplied turn rating.
//
// Langfuse scores let evals filter traces by user feedback. We emit one
// NUMERIC score (`user_rating`, +1 / -1) plus optional CATEGORICAL scores
// for each reason code, so the Langfuse UI's score filters work out of
// the box. Raw custom-reason text rides in the score metadata when the
// user opted into telemetry.content; the consent gate lives in
// reportRunFeedback below, so this builder stays content-agnostic.
//
// Limitation: stable score ids (`${traceId}-rating`, `${traceId}-reason-${code}`)
// mean re-submission overwrites cleanly, but reason codes the user removes
// in a follow-up submission do not get a tombstone. A future change can
// thread `removedReasonCodes` through and emit overwriting "cleared"
// scores for them; not done here to keep this PR scoped to the bridge.
export function buildFeedbackPayload(ctx: FeedbackReportContext): unknown[] {
  const traceId = ctx.runId;
  const nowIso = new Date().toISOString();
  const batch: unknown[] = [];

  const ratingMetadata: Record<string, unknown> = {
    reasonCodes: ctx.reasonCodes,
    reasonCount: ctx.reasonCodes.length,
    hasCustomReason: ctx.hasCustomReason,
    // Raw text — gated upstream by telemetry.content consent.
    customReason: ctx.customReason || undefined,
    installationId: ctx.installationId ?? undefined,
    ...(ctx.metadata ?? {}),
  };

  batch.push({
    id: randomUUID(),
    type: 'score-create',
    timestamp: nowIso,
    body: {
      id: `${traceId}-rating`,
      traceId,
      name: 'user_rating',
      value: ctx.rating === 'positive' ? 1 : -1,
      dataType: 'NUMERIC',
      comment: ctx.rating,
      metadata: ratingMetadata,
    },
  });

  for (const code of ctx.reasonCodes) {
    batch.push({
      id: randomUUID(),
      type: 'score-create',
      timestamp: nowIso,
      body: {
        // Stable per (run, code) so re-submission overwrites cleanly.
        id: `${traceId}-reason-${code}`,
        traceId,
        name: 'user_rating_reason',
        value: code,
        dataType: 'CATEGORICAL',
        // Group the reason under the rating it was submitted with so a
        // "matched_request" tag on a thumbs-down run is still visibly
        // negative in the Langfuse UI.
        comment: ctx.rating,
      },
    });
  }

  return batch;
}
