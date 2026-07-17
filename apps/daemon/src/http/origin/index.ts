/** @module origin/index
 * Same-origin security layer: `guardSameOrigin` and its `OriginContext` input shape. Depends
 * only on `core/` (plus the daemon-wide `isLocalSameOrigin` primitive outside this module).
 */
export * from './origin-guard.js';
