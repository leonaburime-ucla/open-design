/**
 * @module orbit
 *
 * Public API for the Orbit subsystem: scheduled/managed agent "Orbit" runs and
 * their status/summary reporting. Groups the previously flat top-level
 * `orbit.ts` (run service, prompt/template rendering, status types) and
 * `orbit-agent-summary.ts` (final-explanation extraction and no-live-artifact
 * summary) behind one folder barrel. External daemon code imports only from
 * here, never a file inside this folder.
 */
export * from './orbit.js';
export * from './orbit-agent-summary.js';
