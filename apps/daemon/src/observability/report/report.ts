/**
 * @module observability/report/report
 *
 * Network delivery of Langfuse batches: `reportRunCompleted` builds the trace
 * payload and POSTs it (hosted relay or direct Langfuse), `reportRunFeedback`
 * does the same for user turn-ratings. Owns the transport helpers (batched
 * POST, retry/backoff, per-event error classification, drop-reason mapping) and
 * the one-shot missing-sink warning. Depends on `payload` for the wire batches
 * and on the `core` kernel for sink config, delivery-state and size limits.
 */

import {
  buildTracePayload,
  buildFeedbackPayload,
} from '../payload/index.js';
import {
  deriveLangfuseDeliveryState,
  readTelemetrySinkConfig,
  HARD_BATCH_MAX_BYTES,
} from '../core/index.js';
import type {
  FeedbackReportContext,
  LangfuseConfig,
  LangfuseDeliveryState,
  LangfuseDropReason,
  ReportContext,
  ReportRunOpts,
  TelemetrySinkConfig,
} from '../core/index.js';

let missingTelemetrySinkWarned = false;

async function postLangfuseBatch(
  config: LangfuseConfig,
  batch: unknown[],
  fetchImpl: typeof fetch,
): Promise<LangfuseDeliveryState> {
  const attempts = config.retries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${config.baseUrl}/api/public/ingestion`, {
        method: 'POST',
        headers: {
          Authorization: config.authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({ batch }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (
          attempt < attempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          await waitBeforeRetry(attempt);
          continue;
        }
        console.warn(
          `[langfuse-trace] Ingestion failed ${response.status}: ${body.slice(0, 200)}`,
        );
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: ingestionDropReasonFromStatus(
            response.status,
            'langfuse',
          ),
        };
      }
      // Langfuse legacy ingestion responds with HTTP 207 Multi-Status whose
      // body shape is `{ successes: [...], errors: [...] }`. `response.ok`
      // is true for 207, so per-event validation errors slip through unless
      // we look at the body. Surface them so a malformed payload doesn't
      // silently disappear server-side.
      const body = await response.text().catch(() => '');
      if (body && warnPerEventErrors(body, 'Per-event errors')) {
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: dropReasonFromPerEventErrors(body, 'langfuse'),
        };
      }
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted',
      };
    } catch (error) {
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(`[langfuse-trace] Fetch error: ${String(error)}`);
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
      };
    }
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
  };
}

async function postRelayBatch(
  config: Extract<TelemetrySinkConfig, { kind: 'relay' }>,
  body: string,
  fetchImpl: typeof fetch,
): Promise<LangfuseDeliveryState> {
  const attempts = config.retries + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(config.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Open-Design-Telemetry': 'langfuse-ingestion-v1',
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body,
      });
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '');
        if (
          attempt < attempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          await waitBeforeRetry(attempt);
          continue;
        }
        console.warn(
          `[langfuse-trace] Relay failed ${response.status}: ${responseBody.slice(0, 200)}`,
        );
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: ingestionDropReasonFromStatus(
            response.status,
            'relay',
          ),
        };
      }

      const responseBody = await response.text().catch(() => '');
      if (
        responseBody &&
        warnPerEventErrors(responseBody, 'Relay per-event errors')
      ) {
        return {
          langfuse_expected: true,
          langfuse_delivery_status: 'failed',
          langfuse_drop_reason: dropReasonFromPerEventErrors(
            responseBody,
            'relay',
          ),
        };
      }
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'accepted',
      };
    } catch (error) {
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
      console.warn(`[langfuse-trace] Relay fetch error: ${String(error)}`);
      return {
        langfuse_expected: true,
        langfuse_delivery_status: 'failed',
        langfuse_drop_reason: 'network_error',
      };
    }
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'failed',
    langfuse_drop_reason: 'network_error',
  };
}

function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, Math.min(250 * attempt, 1000)),
  );
}

function normalizeTelemetrySinkConfig(
  config: TelemetrySinkConfig | LangfuseConfig,
): TelemetrySinkConfig {
  if ('kind' in config) return config;
  return { kind: 'langfuse', ...config };
}

function resolveReportConfig(
  opts: ReportRunOpts,
): TelemetrySinkConfig | null {
  if (opts.config === undefined) return readTelemetrySinkConfig();
  if (opts.config == null) return null;
  return normalizeTelemetrySinkConfig(opts.config);
}

function ingestionDropReasonFromStatus(
  status: number,
  sinkKind: TelemetrySinkConfig['kind'],
): LangfuseDropReason {
  if (sinkKind === 'relay') {
    if (status === 429) return 'relay_429';
    if (status === 413) return 'relay_413';
    if (status >= 500) return 'relay_5xx';
    return 'langfuse_4xx';
  }
  if (status >= 500) return 'langfuse_5xx';
  return 'langfuse_4xx';
}

function dropReasonFromPerEventErrors(
  responseBody: string,
  sinkKind: TelemetrySinkConfig['kind'],
): LangfuseDropReason {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_5xx';
  }
  const errors =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { errors?: unknown }).errors
      : undefined;
  if (!Array.isArray(errors)) {
    return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_5xx';
  }
  for (const error of errors) {
    if (!error || typeof error !== 'object' || Array.isArray(error)) continue;
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return ingestionDropReasonFromStatus(status, sinkKind);
    }
  }
  return sinkKind === 'relay' ? 'relay_5xx' : 'langfuse_4xx';
}

function warnPerEventErrors(responseBody: string, label: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return false;
  }
  const errors =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { errors?: unknown }).errors
      : undefined;
  if (Array.isArray(errors) && errors.length > 0) {
    console.warn(
      `[langfuse-trace] ${label} (${errors.length}): ${JSON.stringify(errors).slice(0, 500)}`,
    );
    return true;
  }
  return false;
}

export async function reportRunCompleted(
  ctx: ReportContext,
  opts: ReportRunOpts = {},
): Promise<LangfuseDeliveryState> {
  const notExpected = deriveLangfuseDeliveryState(ctx.prefs, null);
  if (ctx.prefs.metrics !== true) return notExpected;
  if (ctx.prefs.content !== true) return notExpected;

  const config = resolveReportConfig(opts);
  const langfuseDelivery = deriveLangfuseDeliveryState(ctx.prefs, config);
  if (!config) {
    if (!missingTelemetrySinkWarned) {
      // Warn once per daemon process; packaged config is loaded at process
      // start, so repeated run-level warnings would only add noise.
      missingTelemetrySinkWarned = true;
      console.warn(
        '[langfuse-trace] Telemetry metrics are enabled but no relay or Langfuse credentials are configured',
      );
    }
    return langfuseDelivery;
  }

  let batch: unknown[];
  try {
    batch = buildTracePayload({ ...ctx, langfuse: langfuseDelivery });
  } catch (error) {
    console.warn(`[langfuse-trace] Payload build error: ${String(error)}`);
    return {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
    };
  }

  const serialized = JSON.stringify({ batch });
  // Compare actual UTF-8 byte length, not String.length (UTF-16 code units),
  // so the cap matches the byte-oriented contract documented in the spec
  // (and the byte-oriented limit Langfuse enforces server-side).
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > HARD_BATCH_MAX_BYTES) {
    console.warn(
      `[langfuse-trace] Batch too large (${serializedBytes}B > ${HARD_BATCH_MAX_BYTES}B), dropping trace ${ctx.run.runId}`,
    );
    return {
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
    };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (config.kind === 'relay') {
    return postRelayBatch(config, serialized, fetchImpl);
  }
  return postLangfuseBatch(config, batch, fetchImpl);
}
export async function reportRunFeedback(
  ctx: FeedbackReportContext,
  opts: ReportRunOpts = {},
): Promise<void> {
  if (ctx.prefs.metrics !== true) return;
  if (ctx.prefs.content !== true) return;

  const config = resolveReportConfig(opts);
  if (!config) return;

  let batch: unknown[];
  try {
    batch = buildFeedbackPayload(ctx);
  } catch (error) {
    console.warn(`[langfuse-trace] Feedback payload build error: ${String(error)}`);
    return;
  }

  const serialized = JSON.stringify({ batch });
  const serializedBytes = Buffer.byteLength(serialized, 'utf8');
  if (serializedBytes > HARD_BATCH_MAX_BYTES) {
    console.warn(
      `[langfuse-trace] Feedback batch too large (${serializedBytes}B > ${HARD_BATCH_MAX_BYTES}B), dropping feedback for ${ctx.runId}`,
    );
    return;
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (config.kind === 'relay') {
    await postRelayBatch(config, serialized, fetchImpl);
    return;
  }
  await postLangfuseBatch(config, batch, fetchImpl);
}
