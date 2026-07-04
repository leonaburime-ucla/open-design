/**
 * @module observability/core
 *
 * Foundation kernel of the observability domain. Re-exports the shared size
 * constants, the Langfuse/trace type vocabulary, and the env-driven sink
 * config readers. Every sibling subdir (`payload`, `report`, `manifest`,
 * `bridge`) may import this barrel directly; the kernel imports no sibling.
 */

export * from './constants.js';
export * from './types.js';
export * from './config.js';
