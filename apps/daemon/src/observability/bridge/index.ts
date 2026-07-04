/**
 * @module observability/bridge
 *
 * Daemon report entrypoints. The daemon calls these to forward a completed run
 * or a turn-rating to Langfuse without touching the trace/report internals.
 */

export { reportRunCompletedFromDaemon, reportRunFeedbackFromDaemon } from './bridge.js';
export type {
  ReportRunCompletedFromDaemonOpts,
  ReportRunFeedbackFromDaemonOpts,
  FeedbackReportOutcome,
} from './bridge.js';
