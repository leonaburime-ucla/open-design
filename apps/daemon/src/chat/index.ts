/**
 * @module chat
 *
 * Barrel for daemon chat-flow modules: assistant-message persistence,
 * chat-request composition, and the streamed-output hygiene helpers
 * (role-marker guard, title-marker stripping, question-form detection).
 * Grouping-only barrel — not a CAPABILITY_BARREL_DOMAINS guard domain.
 * prompt-templates is intentionally NOT here: it is a media prompt-template
 * registry, not chat-flow.
 */
export * from './assistant-message-persistence.js';
export * from './chat-request-composition.js';
export * from './role-marker-guard.js';
export * from './title-marker.js';
export * from './question-form-detect.js';
