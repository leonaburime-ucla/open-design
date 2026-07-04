/**
 * @module observability/payload
 *
 * Trace and feedback batch construction. Exposes the two payload builders the
 * `report` sender needs; the ~30 shaping helpers stay private to this subdir.
 */

export { buildTracePayload, buildFeedbackPayload } from './payload.js';
