/** @module compat/index
 * Legacy compatibility layer: `createCompatApiError`, `createCompatApiErrorResponse`, and the
 * separate-arguments `sendApiError` used by hand-mounted routes predating `JsonRouteSpec`
 * (notably `server.ts`). No dependencies on other subdirectories.
 */
export * from './api-errors.js';
