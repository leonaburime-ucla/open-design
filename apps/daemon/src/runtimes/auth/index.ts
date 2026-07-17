/** @module auth/index
 * Public surface for agent auth/service-failure classification: probing whether
 * an installed agent CLI is authenticated, per-CLI auth-failure guidance text, and
 * OpenCode's on-disk service-failure log parsing. opencode-log.ts depends on
 * auth.ts (same subdir, unrestricted); this subdir depends only on `core/`.
 */
export type { AgentAuthProbeResult, AgentServiceFailureCode } from './auth.js';
export type { OpenCodeServiceFailure } from './opencode-log.js';
export {
  antigravityAuthGuidance,
  antigravityQuotaGuidance,
  classifyAgentAuthFailure,
  classifyAgentServiceFailure,
  claudeAuthGuidance,
  cursorAuthGuidance,
  deepseekAuthGuidance,
  isAntigravityAuthFailureText,
  isClaudeAuthFailureText,
  isCursorAuthFailureText,
  isDeepSeekAuthFailureText,
  isReasonixAuthFailureText,
  probeAgentAuthStatus,
  reasonixAuthGuidance,
} from './auth.js';
export {
  extractOpenCodeServiceFailure,
  readLatestOpenCodeLogTail,
  readOpenCodeServiceFailure,
  resolveOpenCodeLogDir,
} from './opencode-log.js';
