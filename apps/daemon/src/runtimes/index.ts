/** @module index
 * Public API for the `runtimes` domain: everything the rest of the daemon uses to
 * detect, authenticate, launch, and drive the supported coding-agent CLIs (Claude,
 * Codex, Cursor, Aider, AMR/Vela, …), plus the chat prompt/run/stream machinery
 * built on top of them. External runtime code must import only from this barrel,
 * never from a subdirectory or file inside it directly — that is what lets the
 * subdirectories move freely underneath. See `README.md` for the full shape.
 */

export type {
  DetectedAgent,
  MmdRouteLaunchEnv,
  RuntimeAgentDef,
  RuntimeBuildOptions,
  RuntimeCapabilityMap,
  RuntimeContext,
  RuntimeEnv,
  RuntimeExecOptions,
  RuntimeListModels,
  RuntimeModelOption,
  RuntimeModelSource,
  RuntimePromptBudgetError,
  RuntimeReasoningOption,
} from './core/index.js';
export {
  DEFAULT_MODEL_OPTION,
  agentBinEnvKey,
  agentCapabilities,
  agentSearchDirs,
  buildLiveArtifactsMcpServersForAgent,
  codexAppBundleCandidates,
  execAgentFile,
  expandConfiguredEnv,
  expandHomePath,
  getRememberedLiveModels,
  inspectAgentExecutableResolution,
  installMetaForAgent,
  isKnownModel,
  loadMmdRouteLaunchEnv,
  loadMmdRouteModels,
  mergeMmdRouteModels,
  parseMmdRouteModelIds,
  preferFreshLiveModels,
  rememberLiveModels,
  resolveAgentExecutable,
  resolveAmrOpenCodeExecutable,
  resolveMmdRouteLaunchEnv,
  resolveMmdRoutesFile,
  resolveModelForAgent,
  resolveOnPath,
  sanitizeCustomModel,
  userToolchainBinDirs,
} from './core/index.js';

export type {
  VelaBillingSummary,
  VelaModelJsonSource,
  WaitForAgyModelOptions,
} from './defs/index.js';
export {
  _resetAntigravityModelLockForTests,
  acquireAntigravityModelLock,
  aiderAgentDef,
  ampAgentDef,
  amrAgentDef,
  antigravityAgentDef,
  claudeAgentDef,
  codebuddyAgentDef,
  codexAgentDef,
  codexNeedsDangerFullAccessSandbox,
  copilotAgentDef,
  cursorAgentDef,
  deepseekAgentDef,
  devinAgentDef,
  fetchVelaBillingSummary,
  fetchVelaPresetModels,
  fetchVelaRemoteModelsWithRetry,
  grokBuildAgentDef,
  hermesAgentDef,
  kiloAgentDef,
  kimiAgentDef,
  kiroAgentDef,
  mimoAgentDef,
  normalizeVelaModelId,
  opencodeAgentDef,
  parseCodexDebugModels,
  parseCursorAgentModels,
  parseGrokBuildModels,
  parseVelaModelJson,
  parseVelaModels,
  piAgentDef,
  qoderAgentDef,
  qwenAgentDef,
  reasonixAgentDef,
  traeCliAgentDef,
  vibeAgentDef,
  waitForAgyToReadModel,
  writeAntigravityModelSelection,
} from './defs/index.js';

export type {
  AgentAuthProbeResult,
  AgentServiceFailureCode,
  OpenCodeServiceFailure,
} from './auth/index.js';
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
  extractOpenCodeServiceFailure,
  readLatestOpenCodeLogTail,
  readOpenCodeServiceFailure,
  resolveOpenCodeLogDir,
} from './auth/index.js';

export { spawnEnvForAgent, openDesignAmrTraceEnv } from './env/index.js';

export { AGENT_DEFS, getAgentDef, readLocalAgentProfileDefs } from './registry/index.js';

export type {
  AgentLaunchKind,
  AgentLaunchResolution,
  TerminalLaunchResult,
} from './launch/index.js';
export {
  resolveAgentLaunch,
  applyAgentLaunchEnv,
  resolveAgentBin,
  launchAgentInSystemTerminal,
} from './launch/index.js';

export type { NotInvocableCause } from './detection/index.js';
export {
  detectAgents,
  detectAgentsStream,
  buildExecutableDiagnostic,
  buildNotInvocableDiagnostic,
  buildAuthDiagnostic,
} from './detection/index.js';

export type { ResolveAmrModelProbeDeps } from './amr/index.js';
export {
  AmrModelLoadingCache,
  amrModelLoadingCache,
  resolveAmrModelProbe,
} from './amr/index.js';

export type {
  DesignSystemSelectionSource,
  StablePromptCacheMissReason,
  PreparedPromptFile,
} from './prompt/index.js';
export {
  MAX_CHAT_IMAGE_BYTES,
  UPLOAD_DIR,
  composeLiveInstructionPrompt,
  resolveResearchCommandContract,
  resolveCodexGeneratedImagesDir,
  validateCodexGeneratedImagesDir,
  resolveChatExtraAllowedDirs,
  resolveEffectiveDesignSystemSelection,
  designSystemIdFromPluginSnapshot,
  describeStablePromptCache,
  resolveGrantedCodexImagegenOverride,
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
  resolveSafeProjectAttachments,
  formatProjectAttachmentHint,
  formatDesignFilesWorkspaceHint,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
  preparePromptFileForAgent,
} from './prompt/index.js';

export {
  createClaudeStreamHandler,
  createJsonEventStreamHandler,
  createQoderStreamHandler,
} from './stream/index.js';

export type { RunEventLike } from './runs/index.js';
export {
  TERMINAL_RUN_STATUSES,
  createChatRunService,
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
  isArtifactPath,
  isDesignSystemFile,
  isPreviewModulePath,
  didRunCreateDesignSystemFile,
  countDesignSystemPreviewModules,
  countNewArtifacts,
  runAskedUserQuestion,
  reconstructAssistantText,
  deriveActivationMilestones,
} from './runs/index.js';
