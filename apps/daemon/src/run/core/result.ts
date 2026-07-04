// Daemon-side helpers that turn a `runs.statusBody(run)` value into the
// `result` + `error_code` shape that v2 `run_finished` analytics events
// expect.
//
// Extracted from `server.ts` so the invariant — `result === 'failed'`
// MUST emit a non-empty `error_code` — can be exercised by unit tests
// without spinning up the full Express app. Several failure paths in the
// child-process lifecycle call `finish('failed', ...)` directly without
// first emitting an SSE `error` event (ACP fatal, agentStreamError fall
// through, child error with no diagnostic, etc.), leaving `run.errorCode
// === null` in the status body. The fallback chain below derives an
// `AGENT_SIGNAL_*` / `AGENT_EXIT_*` / `AGENT_TERMINATED_UNKNOWN` value
// for those cases so the wire emission always carries an `error_code`
// when result=failed; dashboards keyed on it never see a blank cell.

/** @module run/core/result — Run result and status-code primitives shared by all run-domain concerns. */

/** Terminal outcome of a run as reported in analytics and SSE events. */
export type RunResult = 'success' | 'failed' | 'cancelled';

/** Minimal run-status shape required to derive analytics result and error codes. */
export interface RunStatusForAnalytics {
  status: string;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
}

/**
 * Maps a raw run status string to the canonical `RunResult` used by analytics.
 * @param status - Raw status string from the run record (e.g. 'succeeded', 'canceled').
 * @returns 'success', 'cancelled', or 'failed'.
 */
export function runResultFromStatus(status: string | undefined): RunResult {
  if (status === 'succeeded') return 'success';
  if (status === 'canceled') return 'cancelled';
  return 'failed';
}

/**
 * Derives a non-empty `error_code` for analytics whenever `result === 'failed'`.
 * Prefers the structured code stamped on the run; falls back to signal, exit
 * code, or a sentinel so dashboards never see a blank cell.
 * @param status - Run status fields including any stamped error code, exit code, and signal.
 * @returns An error code string, or `undefined` when the run succeeded.
 */
export function deriveRunErrorCode(
  status: RunStatusForAnalytics,
): string | undefined {
  const result = runResultFromStatus(status.status);
  if (result === 'success') return undefined;
  // Cancellation usually carries no error; only forward an explicit one
  // when the daemon stamped it (e.g. cancel during error recovery).
  if (result === 'cancelled') return status.errorCode ?? undefined;
  // Failure path: prefer the structured code stamped on the run via
  // `extractErrorDetails`. When the run reached `failed` without going
  // through `emit('error', ...)`, derive the best signal we have.
  const explicit = status.errorCode;
  if (explicit) return explicit;
  if (status.signal) return `AGENT_SIGNAL_${status.signal}`;
  if (typeof status.exitCode === 'number' && status.exitCode !== 0) {
    return `AGENT_EXIT_${status.exitCode}`;
  }
  return 'AGENT_TERMINATED_UNKNOWN';
}
