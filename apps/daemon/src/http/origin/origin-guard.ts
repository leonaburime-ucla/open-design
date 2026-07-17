/** @module origin/origin-guard
 * Same-origin security guard: wraps the daemon-wide `isLocalSameOrigin` check in the module's
 * `Result` pipeline so the Adapter can treat an origin failure the same as a parse/handle
 * failure. Imports the foundation (`core/`) directly; no sibling deps.
 */
import type { Request } from 'express';
import { createApiError } from '@open-design/contracts';
import { isLocalSameOrigin } from '../../origin-validation.js';
import { err, ok, type Result } from '../core/types.js';

/** The subset of daemon startup state `guardSameOrigin` needs: the resolved local port. */
export interface OriginContext {
  resolvedPortRef: { current: number };
}

/**
 * Adapter wrapper around `isLocalSameOrigin` that yields a `Result` so the
 * HTTP Adapter can fold the origin decision into the same error-handling
 * pipeline as parse/handle failures.
 */
export function guardSameOrigin(req: Request, origin: OriginContext): Result<void> {
  if (isLocalSameOrigin(req, origin.resolvedPortRef.current)) {
    return ok(undefined);
  }
  return err(createApiError('FORBIDDEN', 'cross-origin request rejected'));
}
