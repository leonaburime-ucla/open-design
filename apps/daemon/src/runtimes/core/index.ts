/** @module core/index
 * Foundational layer: shared runtime types, agent executable/binary resolution,
 * capability map primitives, model-option defaults, MCP server wiring, exec-file
 * invocation, install metadata reads, path expansion, and MMD model-route loading.
 * This is the kernel every other subdirectory may depend on directly; core itself
 * never imports from a sibling subdirectory.
 */
export * from './types.js';
export * from './paths.js';
export * from './metadata.js';
export * from './capabilities.js';
export * from './invocation.js';
export * from './models.js';
export * from './mcp.js';
export * from './executables.js';
export * from './mmd-routes.js';
