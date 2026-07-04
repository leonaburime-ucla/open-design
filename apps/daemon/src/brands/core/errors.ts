/** @module core/errors
 * Shared error predicates for brand workflows.
 * These helpers keep retry and finalization code from duplicating daemon-wide database shutdown checks.
 */

/** Returns true when an operation failed because the SQLite connection has already closed. */
export function isClosedDatabaseError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('database connection is not open');
}

/** Convert an unknown thrown value into a user-facing error message. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
