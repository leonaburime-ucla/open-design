/** @module runs/index
 * Public surface for chat-run execution: the run service factory, run-lifecycle
 * timeout/bookkeeping helpers (inactivity, quiet-period, shutdown-grace timeouts;
 * stream-json bookkeeping; close-status classification), and run-artifact
 * inspection (design-system file/module counters, question-form detection,
 * activation-milestone derivation). Depends only on `core/`.
 */
export { TERMINAL_RUN_STATUSES, createChatRunService } from './runs.js';
export {
  assertValidRuntimeDefInactivityTimeoutMs,
  resolveChatRunInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveActiveInactivityTimeoutMs,
  classifyChatRunCloseStatus,
  applyClaudeStreamJsonRunBookkeeping,
  resolveChatRunShutdownGraceMs,
  resolveAcpStageTimeoutMs,
  looksLikeGeminiJsonEventStream,
  bufferedAntigravityGeminiFirstTokenAt,
} from './chat-run-lifecycle.js';
export type { RunEventLike } from './run-artifacts.js';
export {
  isArtifactPath,
  isDesignSystemFile,
  isPreviewModulePath,
  didRunCreateDesignSystemFile,
  countDesignSystemPreviewModules,
  countNewArtifacts,
  runAskedUserQuestion,
  reconstructAssistantText,
  deriveActivationMilestones,
} from './run-artifacts.js';
