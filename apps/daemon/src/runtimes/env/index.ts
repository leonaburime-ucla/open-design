/** @module env/index
 * Public surface for resolving the environment passed to a spawned agent CLI
 * process (proxy-aware merge, sandbox env application, AMR trace/vela profile
 * env injection). Depends only on `core/`.
 */
export { spawnEnvForAgent, openDesignAmrTraceEnv } from './env.js';
