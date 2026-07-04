/** @module core/programmatic
 * Programmatic-extraction attempt guards shared by extraction and finalization.
 * Keeping cancellation state checks in core avoids a finalize/extraction dependency cycle.
 */

import { randomUUID } from 'node:crypto';

import { readMeta } from './store.js';

/** Error thrown when the active deterministic extraction attempt has been canceled or superseded. */
export class ProgrammaticExtractionAbortError extends Error {
  constructor() {
    super('programmatic brand extraction aborted');
    this.name = 'ProgrammaticExtractionAbortError';
  }
}

/** Throw when the caller's abort signal has been tripped. */
export function throwIfProgrammaticExtractionAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new ProgrammaticExtractionAbortError();
}

/** Allocate a unique attempt id for one deterministic extraction pass. */
export function newBrandExtractionAttemptId(): string {
  return randomUUID();
}

/** Return true when an extraction attempt can still commit terminal writes. */
export function programmaticExtractionAttemptIsCurrent(input: {
  brandsRoot: string;
  id: string;
  extractionAttemptId?: string | undefined;
}): boolean {
  if (!input.extractionAttemptId) return true;
  return readMeta(input.brandsRoot, input.id)?.extractionAttemptId === input.extractionAttemptId;
}

/** Throw when a deterministic extraction attempt was aborted or superseded. */
export function throwIfProgrammaticExtractionNotCurrent(input: {
  brandsRoot: string;
  id: string;
  extractionAttemptId?: string | undefined;
  abortSignal?: AbortSignal | undefined;
}): void {
  throwIfProgrammaticExtractionAborted(input.abortSignal);
  if (!programmaticExtractionAttemptIsCurrent(input)) throw new ProgrammaticExtractionAbortError();
}

/** Type guard for errors thrown by programmatic extraction cancellation checks. */
export function isProgrammaticExtractionAbortError(err: unknown): boolean {
  return err instanceof ProgrammaticExtractionAbortError;
}
