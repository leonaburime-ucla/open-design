import type {
  TrackingRunFailureCategory,
  TrackingRunFailureDetail,
  TrackingRunFailureStage,
  TrackingRunRetryStrategy,
  TrackingRunRetrySuppressedReason,
  TrackingRunResult,
} from '@open-design/contracts/analytics';

/** @module run/core/retry — Retry backoff constants and policy decision logic for safe run retries. */

// Counts automatic same-run retry attempts, not the initial run. Issue #3543
// scopes the first implementation to at most one automatic same-run retry, so
// the default caps retries at a single attempt (attemptCount >= 1 suppresses
// with attempt_limit_reached).
/** Maximum number of automatic same-run retry attempts allowed per run (not counting the initial attempt). */
export const DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS = 1;
/** Retry strategy label emitted in analytics for all automatic same-run transient retries. */
export const SAFE_RUN_RETRY_STRATEGY: TrackingRunRetryStrategy = 'same_run_transient';

// Backoff before a same-run retry restart. An immediate retry of a transient
// failure — especially a 429 — tends to re-hit the same limit, so the policy
// waits before restarting. `rate_limit` gets a larger base than other
// transient classes because the upstream is explicitly asking us to slow down.
// The delay grows exponentially by attempt index and is capped, then equal
// jitter (half fixed + half random) is applied to avoid synchronized retries
// across concurrent runs.
/** Base backoff delay in milliseconds for rate-limit retries; larger than the transient base because the upstream is explicitly asking us to slow down. */
export const RATE_LIMIT_RETRY_BASE_DELAY_MS = 1_000;
/** Base backoff delay in milliseconds for non-rate-limit transient retries. */
export const TRANSIENT_RETRY_BASE_DELAY_MS = 500;
/** Exponential multiplier applied per retry attempt index to grow the backoff delay. */
export const RETRY_BACKOFF_MULTIPLIER = 2;
/** Maximum backoff delay in milliseconds after exponential growth and before jitter is applied. */
export const MAX_RETRY_BACKOFF_DELAY_MS = 8_000;

function backoffBaseDelayMs(category: TrackingRunFailureCategory | undefined): number {
  return category === 'rate_limit'
    ? RATE_LIMIT_RETRY_BASE_DELAY_MS
    : TRANSIENT_RETRY_BASE_DELAY_MS;
}

// Pure, deterministic when `random` is supplied. `attemptIndex` is 1-based (the
// index of the attempt about to be scheduled), so the first retry uses the base
// delay and each subsequent attempt doubles it up to the cap. Equal jitter
// returns a value in [delay/2, delay].
/**
 * Computes an exponentially backed-off delay with equal jitter for a retry attempt.
 * @param attemptIndex - 1-based index of the attempt about to be scheduled.
 * @param category - Failure category used to select the base delay; rate-limit failures use a larger base.
 * @param random - Optional jitter source; defaults to `Math.random` for production use.
 * @returns Backoff duration in milliseconds, capped at `MAX_RETRY_BACKOFF_DELAY_MS`.
 */
export function computeRetryBackoffMs(
  attemptIndex: number,
  category: TrackingRunFailureCategory | undefined,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, Math.floor(attemptIndex) - 1);
  const raw = backoffBaseDelayMs(category) * RETRY_BACKOFF_MULTIPLIER ** exponent;
  const capped = Math.min(raw, MAX_RETRY_BACKOFF_DELAY_MS);
  const half = capped / 2;
  const sample = random();
  const jitter = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0;
  return Math.round(half + jitter * half);
}

/** Failure signal fields extracted from a run's error state, used by the retry policy. */
export interface RunRetryFailureSignal {
  failure_category?: TrackingRunFailureCategory;
  failure_detail?: TrackingRunFailureDetail;
  failure_stage?: TrackingRunFailureStage;
  retryable?: boolean;
}

/** Observable side-effects from the current run attempt that can suppress a retry to avoid double-work. */
export interface RunRetrySideEffectState {
  cancelRequested?: boolean;
  userVisibleOutputSeen?: boolean;
  toolCallSeen?: boolean;
  artifactWriteSeen?: boolean;
  liveArtifactSeen?: boolean;
}

/** Full input to `decideSafeRunRetry`, combining run outcome, failure signal, attempt count, and side-effect guards. */
export interface RunRetryPolicyInput {
  result: TrackingRunResult;
  failure?: RunRetryFailureSignal;
  attemptCount: number;
  maxAttempts?: number;
  sideEffects?: RunRetrySideEffectState;
  // Injectable jitter source for deterministic tests; defaults to Math.random.
  random?: () => number;
}

/** Discriminated union output of `decideSafeRunRetry`; either a retry schedule or a suppression reason. */
export type RunRetryPolicyDecision =
  | {
      shouldRetry: true;
      retryAttemptIndex: number;
      retryMaxAttempts: number;
      retryStrategy: TrackingRunRetryStrategy;
      retryReason: 'transient_failure';
      retryDelayMs: number;
    }
  | {
      shouldRetry: false;
      retryAttemptIndex: number;
      retryMaxAttempts: number;
      retryStrategy: TrackingRunRetryStrategy;
      retrySuppressedReason: TrackingRunRetrySuppressedReason;
    };

function normalizeAttemptCount(attemptCount: number): number {
  if (!Number.isFinite(attemptCount) || attemptCount < 0) return 0;
  return Math.floor(attemptCount);
}

function normalizeMaxAttempts(maxAttempts: number | undefined): number {
  if (maxAttempts === undefined) return DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS;
  if (!Number.isFinite(maxAttempts) || maxAttempts < 0) return 0;
  return Math.floor(maxAttempts);
}

function isTransientRetryCategory(
  category: TrackingRunFailureCategory | undefined,
  detail: TrackingRunFailureDetail | undefined,
  stage: TrackingRunFailureStage | undefined,
): boolean {
  if (category === 'rate_limit') return detail !== 'hard_quota';
  if (category === 'upstream_unavailable') return true;
  if (category === 'empty_output') return stage === undefined || stage === 'first_token_wait';
  if (category === 'timeout') return stage === 'first_token_wait';
  return false;
}

/**
 * Decides whether a failed run should be automatically retried and, if so, schedules the delay.
 * Suppresses retries when the run was cancelled, emitted user-visible output, or hit a non-transient failure.
 * @param input - Run outcome, failure classification, attempt count, and observable side effects.
 * @returns A `RunRetryPolicyDecision` with `shouldRetry: true` and a delay, or `shouldRetry: false` with a suppression reason.
 */
export function decideSafeRunRetry(
  input: RunRetryPolicyInput,
): RunRetryPolicyDecision {
  const attemptCount = normalizeAttemptCount(input.attemptCount);
  const retryMaxAttempts = normalizeMaxAttempts(input.maxAttempts);
  const retryAttemptIndex = attemptCount + 1;
  const base = {
    retryAttemptIndex,
    retryMaxAttempts,
    retryStrategy: SAFE_RUN_RETRY_STRATEGY,
  };
  const suppress = (
    retrySuppressedReason: TrackingRunRetrySuppressedReason,
  ): RunRetryPolicyDecision => ({
    ...base,
    shouldRetry: false,
    retrySuppressedReason,
  });

  if (input.result !== 'failed') return suppress('not_failed');

  const sideEffects = input.sideEffects ?? {};
  if (sideEffects.cancelRequested) return suppress('cancel_requested');

  const failure = input.failure;
  if (failure?.failure_detail === 'hard_quota') return suppress('hard_quota');
  if (
    failure?.failure_category !== undefined &&
    !isTransientRetryCategory(
      failure.failure_category,
      failure.failure_detail,
      failure.failure_stage,
    )
  ) {
    return suppress('unsupported_category');
  }
  if (!failure?.retryable) return suppress('not_retryable');
  if (
    !isTransientRetryCategory(
      failure.failure_category,
      failure.failure_detail,
      failure.failure_stage,
    )
  ) {
    return suppress('unsupported_category');
  }
  if (attemptCount >= retryMaxAttempts) return suppress('attempt_limit_reached');
  if (sideEffects.userVisibleOutputSeen) return suppress('user_visible_output_seen');
  if (sideEffects.toolCallSeen) return suppress('tool_call_seen');
  if (sideEffects.artifactWriteSeen) return suppress('artifact_write_seen');
  if (sideEffects.liveArtifactSeen) return suppress('live_artifact_seen');

  return {
    ...base,
    shouldRetry: true,
    retryReason: 'transient_failure',
    retryDelayMs: computeRetryBackoffMs(
      retryAttemptIndex,
      failure.failure_category,
      input.random,
    ),
  };
}
