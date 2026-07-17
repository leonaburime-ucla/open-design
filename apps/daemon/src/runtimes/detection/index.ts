/** @module detection/index
 * Public surface for agent-installation detection: scanning the registry for
 * installed/authed CLIs (batch and streaming) and building the per-agent
 * diagnostic explaining why a CLI isn't invocable. Depends on `registry/`,
 * `launch/`, `env/`, `auth/`, and `core/`.
 */
export { detectAgents, detectAgentsStream } from './detection.js';
export type { NotInvocableCause } from './diagnostics.js';
export {
  buildExecutableDiagnostic,
  buildNotInvocableDiagnostic,
  buildAuthDiagnostic,
} from './diagnostics.js';
