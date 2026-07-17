/** @module stream/index
 * Public surface for the per-CLI structured-event stream handlers: Claude's
 * stream-json protocol, the generic ACP/JSON event stream used by several CLIs,
 * and Qoder's stream format. Depends only on `core/` (and, for claude-stream.ts,
 * the daemon-wide role-marker guard outside this domain).
 */
export { createClaudeStreamHandler } from './claude-stream.js';
export { createJsonEventStreamHandler } from './json-event-stream.js';
export { createQoderStreamHandler } from './qoder-stream.js';
