/**
 * @module observability/report
 *
 * Langfuse delivery surface: send a completed run's trace, or a turn-rating
 * feedback score, to the configured telemetry sink.
 */

export { reportRunCompleted, reportRunFeedback } from './report.js';
