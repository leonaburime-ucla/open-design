/** @module http
 * Public API for the daemon's HTTP module: the JSON route spec/Result types, request parsing,
 * response serialization, the same-origin guard, the Express-mounting Adapter, and the legacy
 * "compat" error helpers used by hand-mounted routes (`server.ts`). Re-exports only from
 * subdirectory barrels — see `README.md` for the capability-barrel shape and import conventions.
 */
export type {
  Handler,
  HttpMethod,
  InputParser,
  JsonRouteSpec,
  Result,
  RouteInputContext,
} from './core/index.js';
export { err, ok } from './core/index.js';

export { rawInput, validationError } from './request/index.js';

export { sendApiError, sendJson, statusForError } from './response/index.js';

export type { OriginContext } from './origin/index.js';
export { guardSameOrigin } from './origin/index.js';

export type { AdapterContext } from './adapter/index.js';
export { defineJsonRoute, mountJsonRoute } from './adapter/index.js';

// Legacy compat error helpers (separate code/message/init call shape), used by server.ts's
// hand-mounted routes predating JsonRouteSpec. `sendApiError` above (from `response/`) takes a
// single `ApiError` object; this compat `sendApiError` takes `(code, message, init)` — same job,
// different call-site generation, so it is re-exported here under a distinct name to avoid a
// duplicate export.
export {
  createCompatApiError,
  createCompatApiErrorResponse,
  sendApiError as sendCompatApiError,
} from './compat/index.js';
