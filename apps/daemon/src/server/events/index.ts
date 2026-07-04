// Authors: Leon Aburime using Claude Fable 5
/** @module server/events
 * Barrel for the daemon's live event fan-out concern.
 *
 * Re-exports the SSE sink registries and emit helpers that `server.ts` threads
 * through its route/deps wiring. See ./sinks.ts for the responsibility summary.
 */

export {
  activeChatAgentEventSinks,
  activeProjectEventSinks,
  activeChatRunHandles,
  emitChatAgentEvent,
  emitLiveArtifactEvent,
  emitLiveArtifactRefreshEvent,
  emitProjectEvent,
  __forTestChatRunHandles,
  __forTestEmitLiveArtifactEvent,
} from './sinks.js';
