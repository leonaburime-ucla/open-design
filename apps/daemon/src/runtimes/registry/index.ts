/** @module registry/index
 * Public surface for the agent registry: the combined built-in + local-profile
 * `RuntimeAgentDef` list and lookup by id. `local-profiles.ts`'s raw file-reading
 * helper is intentionally not re-exported here — `registry.ts` wraps it into the
 * public `readLocalAgentProfileDefs(baseDefs)` shape and that wrapper is the one
 * external code should use. Depends on `defs/` (the per-CLI def catalog) and `core/`.
 */
export { AGENT_DEFS, getAgentDef, readLocalAgentProfileDefs } from './registry.js';
