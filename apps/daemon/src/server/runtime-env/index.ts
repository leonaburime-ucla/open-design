// Authors: Leon Aburime using Claude Fable 5
/** @module server/runtime-env
 * Barrel for agent sub-process environment + prompt construction.
 *
 * `buildAgentRuntimeEnv` is the singleton-injected env builder that server.ts
 * binds into the public `createAgentRuntimeEnv`; `createAgentRuntimeToolPrompt`
 * is re-exported as-is. See ./agent-runtime-env.ts.
 */

export { buildAgentRuntimeEnv, createAgentRuntimeToolPrompt } from './agent-runtime-env.js';
