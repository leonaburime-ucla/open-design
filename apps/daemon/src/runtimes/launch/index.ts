/** @module launch/index
 * Public surface for turning a resolved agent executable into a launchable
 * process: launch-env application, launch resolution, binary-path resolution for
 * spawn(), and system-terminal launching. `resolution.ts` reaches `registry/` for
 * `getAgentDef`; the rest of this subdir depends only on `core/`.
 */
export type { AgentLaunchKind, AgentLaunchResolution } from './launch.js';
export { resolveAgentLaunch, applyAgentLaunchEnv } from './launch.js';
export { resolveAgentBin } from './resolution.js';
export type { TerminalLaunchResult } from './terminal-launch.js';
export { launchAgentInSystemTerminal } from './terminal-launch.js';
