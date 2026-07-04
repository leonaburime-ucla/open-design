/** @module core/index
 * Foundational plugin layer: installed-plugin registry storage, applied snapshots,
 * event buffering, trust/capability helpers, connector probes, and shared pipeline
 * primitives. This kernel is importable by every plugin concern and imports no
 * sibling plugin subdirectory.
 */
export * from './connector-gate.js';
export * from './connector-probe.js';
export * from './context-craft.js';
export * from './ensure-core-stages.js';
export * from './events.js';
export * from './persistence.js';
export * from './registry.js';
export * from './snapshots.js';
export * from './trust.js';
export * from './until.js';
