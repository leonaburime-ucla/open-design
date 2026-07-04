/**
 * @module observability/core/config
 *
 * Release-safe resolution of the Langfuse telemetry sink from the environment:
 * `readLangfuseConfig` (direct Langfuse credentials), `readTelemetrySinkConfig`
 * (hosted relay first, direct second, disabled last) and
 * `deriveLangfuseDeliveryState` (maps consent + sink availability to the
 * delivery-status/​drop-reason recorded on every run). Pure and dependency-free
 * beyond the kernel constants and types, so it sits in the foundation and is
 * importable directly by `report` and `bridge`.
 */

import type { TelemetryPrefs } from '../../app-config.js';

import {
  DEFAULT_BASE_URL,
  DEFAULT_FETCH_RETRIES,
  DEFAULT_FETCH_TIMEOUT_MS,
} from './constants.js';
import type {
  LangfuseConfig,
  LangfuseDeliveryState,
  TelemetrySinkConfig,
} from './types.js';

export function readLangfuseConfig(
  env: NodeJS.ProcessEnv = process.env,
): LangfuseConfig | null {
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
  if (!publicKey || !secretKey) return null;
  const baseUrl = (env.LANGFUSE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    '',
  );
  const authHeader =
    'Basic ' +
    Buffer.from(`${publicKey}:${secretKey}`, 'utf8').toString('base64');
  return {
    authHeader,
    baseUrl,
    timeoutMs: parsePositiveInt(
      env.LANGFUSE_TIMEOUT_MS,
      DEFAULT_FETCH_TIMEOUT_MS,
    ),
    retries: parseNonNegativeInt(env.LANGFUSE_RETRIES, DEFAULT_FETCH_RETRIES),
  };
}

/**
 * Resolve telemetry delivery in release-safe order: hosted relay first,
 * direct Langfuse credentials second for local smoke tests, disabled last.
 */
export function readTelemetrySinkConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelemetrySinkConfig | null {
  const relayUrl = env.OPEN_DESIGN_TELEMETRY_RELAY_URL?.trim();
  if (relayUrl) {
    return {
      kind: 'relay',
      relayUrl: relayUrl.replace(/\/+$/, ''),
      timeoutMs: parsePositiveInt(
        env.OPEN_DESIGN_TELEMETRY_TIMEOUT_MS ?? env.LANGFUSE_TIMEOUT_MS,
        DEFAULT_FETCH_TIMEOUT_MS,
      ),
      retries: parseNonNegativeInt(
        env.OPEN_DESIGN_TELEMETRY_RETRIES ?? env.LANGFUSE_RETRIES,
        DEFAULT_FETCH_RETRIES,
      ),
    };
  }

  const config = readLangfuseConfig(env);
  return config == null ? null : { kind: 'langfuse', ...config };
}

export function deriveLangfuseDeliveryState(
  prefs: TelemetryPrefs,
  sink: TelemetrySinkConfig | null,
): LangfuseDeliveryState {
  if (prefs.metrics !== true) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'metrics_consent_off',
    };
  }
  if (prefs.content !== true) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'content_consent_off',
    };
  }
  if (!sink) {
    return {
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'missing_sink_config',
    };
  }
  return {
    langfuse_expected: true,
    langfuse_delivery_status: 'queued',
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
