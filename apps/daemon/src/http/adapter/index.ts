/** @module adapter/index
 * Orchestration layer: `defineJsonRoute` and `mountJsonRoute`, the only code in the module that
 * touches Express `req`/`res` directly. Depends on `core/` (foundation) and `request/`,
 * `response/`, `origin/` through their barrels.
 */
export * from './adapter.js';
