/** @module amr/index
 * Public surface for AMR-specific runtime support: the in-memory live-model
 * loading cache and the AMR model probe (which resolves launch env via `launch/`,
 * the agent def via `registry/`, and the spawn env via `env/`). This is distinct
 * from `defs/amr.ts`, which is just the AMR CLI's `RuntimeAgentDef` entry.
 */
export { AmrModelLoadingCache, amrModelLoadingCache } from './amr-model-cache.js';
export type { ResolveAmrModelProbeDeps } from './amr-model-probe.js';
export { resolveAmrModelProbe } from './amr-model-probe.js';
