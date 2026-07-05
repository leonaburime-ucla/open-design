// @ts-nocheck
import express from 'express';
import multer from 'multer';
import { sendMulterError, uniqueUploadFileName } from './upload/multer-helpers.js';
import JSZip from 'jszip';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { randomId, sanitizeSlug } from './identifiers.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';

import { normalizeRunContextSelection, renderRunContextPrompt } from './prompts/run-context.js';

import { resolveProjectRoot } from './project/index.js';
import {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceRoot,
  resolveDataDir,
} from './daemon-paths.js';
export {
  resolveDaemonCliPath,
  resolveDaemonPluginPreviewsDir,
  resolveDaemonResourceRoot,
  resolveDataDir,
} from './daemon-paths.js';
import {
  isStaticSpaFallbackRequest,
  registerStaticSpaFallback,
  resolveStaticSpaFallbackPath,
} from './static-spa.js';
export {
  isStaticSpaFallbackRequest,
  resolveStaticSpaFallbackPath,
} from './static-spa.js';
import {
  createCompatApiError,
  createCompatApiErrorResponse,
  sendApiError,
} from './http/api-errors.js';
export {
  createCompatApiError,
  createCompatApiErrorResponse,
} from './http/api-errors.js';
import { createSseResponse } from './http/sse.js';
export { createSseResponse, SSE_KEEPALIVE_INTERVAL_MS } from './http/sse.js';
import { execCommandViaLoginShell } from './shell/commands.js';
import {
  applyBakedPreviews,
  PLUGIN_PREVIEWS_ROUTE,
} from './plugin-preview-bakes.js';

import {
  UPLOAD_DIR,
  composeLiveInstructionPrompt,
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
  resolveChatExtraAllowedDirs,
  describeStablePromptCache,
  designSystemIdFromPluginSnapshot,
  resolveCodexGeneratedImagesDir,
  resolveEffectiveDesignSystemSelection,
  resolveGrantedCodexImagegenOverride,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
  validateCodexGeneratedImagesDir,
} from './runtimes/chat-prompt-inputs.js';
import {
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefInactivityTimeoutMs,
  bufferedAntigravityGeminiFirstTokenAt,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveAcpStageTimeoutMs,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunInactivityTimeoutMs,
} from './runtimes/chat-run-lifecycle.js';
export {
  composeLiveInstructionPrompt,
  formatDesignFilesWorkspaceHint,
  formatProjectAttachmentHint,
  normalizeCommentAttachments,
  renderCommentAttachmentHint,
  resolveChatExtraAllowedDirs,
  describeStablePromptCache,
  designSystemIdFromPluginSnapshot,
  resolveCodexGeneratedImagesDir,
  resolveEffectiveDesignSystemSelection,
  resolveGrantedCodexImagegenOverride,
  resolveResearchCommandContract,
  resolveSafeProjectAttachments,
  resolveSafePromptImagePaths,
  selectPromptImagePaths,
  validateCodexGeneratedImagesDir,
} from './runtimes/chat-prompt-inputs.js';
export {
  applyClaudeStreamJsonRunBookkeeping,
  assertValidRuntimeDefInactivityTimeoutMs,
  bufferedAntigravityGeminiFirstTokenAt,
  classifyChatRunCloseStatus,
  looksLikeGeminiJsonEventStream,
  resolveAcpStageTimeoutMs,
  resolveActiveInactivityTimeoutMs,
  resolveChatRunArtifactQuietPeriodMs,
  resolveChatRunInactivityTimeoutMs,
} from './runtimes/chat-run-lifecycle.js';

export { resolveProjectRoot };

import { SIDECAR_ENV } from '@open-design/sidecar-proto';
import {
  detectAgents,
  getAgentDef,
  isKnownModel,
  sanitizeCustomModel,
} from './agents.js';

import {
  consumedImportNonces,
  getDesktopAuthSecret,
  isDesktopAuthGateActive,
  isDesktopAuthRegistered,
  pruneExpiredImportNonces,
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  verifyDesktopImportToken,
} from './auth/index.js';
import { normalizeDaemonBindHost } from './daemon-startup.js';
export {
  isDesktopAuthGateActive,
  isDesktopAuthRegistered,
  resetDesktopAuthForTests,
  setDesktopAuthSecret,
  signDesktopImportToken,
  verifyDesktopImportToken,
} from './auth/index.js';
import { readCurrentAppVersionInfo } from './app-version.js';
import {
  findSkillById,
  listSkills,
} from './skills.js';
import { validateLinkedDirs } from './linked-dirs.js';

import { openNativeFolderDialog } from './native-folder-dialog.js';
import {
  AssetCacheError,
  assetCacheRewriteUrl,
  createPluginAssetCache,
  isCacheableExternalUrl,
} from './plugin-asset-cache.js';
import {
  defaultMediaExecutionPolicy,
} from './media/policy.js';
import {
  applySandboxRuntimeEnv,
} from './sandbox-mode.js';
import {
  buildUserDesignSystemArchive,
  createUserDesignSystem,
  deleteUserDesignSystem,
  LEGACY_DESIGN_SYSTEM_ARTIFACTS,
  linkUserDesignSystemProject,
  listDesignSystems,
  listUserDesignSystemFiles,
  listUserDesignSystemRevisions,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemStaticFile,
  readUserDesignSystemFile,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
} from './design-systems/index.js';
import { createDesignSystemGenerationJobStore } from './design-systems/index.js';
import { createDesignSystemServerServices } from './design-systems/server-services.js';
import { prepareDesignTokenContractRebuild } from './design-systems/index.js';
import { registerBrandRoutes } from './brand-routes.js';
import {
  applyPlugin,
  buildConnectorProbe,
  dismissSkillPluginCandidate,
  doctorPlugin,
  FIRST_PARTY_ATOMS,
  generateSkillPluginDraft,
  getInstalledPlugin,
  getSnapshot,
  installFromLocalFolder,
  installPlugin,
  listSkillPluginCandidates,
  listInstalledPlugins,
  MissingInputError,
  pluginPromptBlock,
  pruneExpiredSnapshots,
  readPluginLockfile,
  restoreProjectSnapshotLink,
  resolvePluginSnapshot,
  uninstallPlugin,
} from './plugins/index.js';
import { marketplaceRegistryIdFromUrl } from './plugins/marketplaces.js';

import { ingestRoutineConnectorEvolution } from './automation/index.js';

import { loadCritiqueConfigFromEnv } from './critique/config.js';

import { createRunRegistry } from './critique/run-registry.js';
import { handleCritiqueInterrupt } from './critique/interrupt-handler.js';
import { handleCritiqueArtifact } from './critique/artifact-handler.js';

import { subscribe as subscribeFileEvents } from './project/index.js';
import { importFigmaFromBytes } from './figma/figma-import.js';
import { renderDesignSystemPreview } from './design-systems/index.js';
import { renderDesignSystemShowcase } from './design-systems/index.js';
import { createChatRunService } from './runtimes/runs.js';

import {
  createRunArtifactBaselines,
} from './run/index.js';

import { readAnalyticsContext } from './analytics.js';

import {
  mergeNoProxyWithLoopbackDefaults,
  redactSecrets,
  testAgentConnection,
  testProviderConnection,
  validateBaseUrl,
  validateBaseUrlResolved,
} from './agents/index.js';
import { listProviderModels } from './integrations/provider-models.js';
import { importClaudeDesignZip } from './claude-design-import.js';
import {
  defaultBaseUrlForFinalizeProtocol,
  finalizeDesignPackage,
  FinalizePackageLockedError,
  FinalizeUpstreamError,
  isFinalizeProviderProtocol,
} from './finalize-design.js';
import { buildDocumentPreview } from './artifacts/document-preview.js';
import { lintArtifact, renderFindingsForAgent } from './artifacts/lint-artifact.js';

import { skillCwdAliasSegment, stageActiveSkill } from './cwd-aliases.js';
import { buildDesktopArtifactExportInput, buildDesktopPdfExportInput } from './export/index.js';
import { generateMedia } from './media/index.js';
import { listElevenLabsVoiceOptions } from './integrations/elevenlabs-voices.js';
import { searchResearch, ResearchError } from './research/index.js';
import { openBrowser } from './browser/index.js';
import {
  AUDIO_DURATIONS_SEC,
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  MEDIA_ASPECTS,
  MEDIA_PROVIDERS,
  VIDEO_LENGTHS_SEC,
  VIDEO_MODELS,
} from './media/models.js';
import { readMaskedConfig, writeConfig } from './media/config.js';
import {
  listMediaTasksByProject,
} from './media/tasks.js';
import {
  appendTaskProgress,
  createMediaTask,
  getLiveMediaTask,
  mediaTaskSnapshot,
  mediaTasks,
  notifyTaskWaiters,
  persistMediaTask,
  TASK_TTL_AFTER_DONE_MS,
} from './media/task-registry.js';

import {
  PendingAuthCache,
  refreshAccessToken,
} from './mcp/index.js';
import {
  setToken,
} from './mcp/index.js';
import {
  readAppConfig,
  writeAppConfig,
} from './config/index.js';
import { OrbitService, formatLocalProjectTimestamp, renderOrbitTemplateSystemPrompt } from './orbit/index.js';
import { buildOrbitNoLiveArtifactSummary } from './orbit/index.js';
import {
  RoutineService,
} from './automation/index.js';

import { createDiagnosticsExportHandler } from './export/index.js';
import { DIAGNOSTICS_EXPORT_PATH } from '@open-design/diagnostics';
import {
  buildProjectArchive,
  buildBatchArchive,
  createProjectFolder,
  decodeMultipartFilename,
  deleteProjectFile,
  assertSandboxProjectRootAvailable,
  deleteProjectFolder,
  detectEntryFile,
  ensureProject,
  ensureProjectSubdir,
  isSafeId,
  listFiles,
  listProjectFolders,
  mimeFor,
  parseByteRange,
  projectDir,
  readProjectFile,
  renameProjectFile,
  removeProjectDir,
  resolveProjectDir,
  sanitizeName,
  sanitizePath,
  searchProjectFiles,
  resolveProjectDir,
  resolveProjectFilePath,
  writeProjectFile,
} from './project/index.js';
import { validateArtifactManifestInput } from './artifacts/manifest.js';

import {
  appendMessageStatusEvent,
  deleteConversation,
  deletePreviewComment,
  deleteProject as dbDeleteProject,
  deleteTemplate,
  getConversation,
  getDeployment,
  getDeploymentById,
  getProject,
  getTemplate,
  insertConversation,
  insertProject,
  insertRoutineRun,
  insertScheduledRoutineRun,
  insertTemplate,
  findTemplateByNameAndProject,
  updateTemplate,
  listProjectsAwaitingInput,
  listConversations,
  listDeployments,
  listLatestProjectRunStatuses,
  listMessages,
  listPreviewComments,
  listProjects,
  listRoutines,
  listTabs,
  listTemplates,
  getLatestRoutineRun,
  openDatabase,
  setTabs,
  updateConversation,
  updatePreviewCommentStatus,
  updateProject,
  updateRoutineRun,
  upsertDeployment,
  upsertMessage,
  upsertPreviewComment,
} from './db.js';

import {
  createLiveArtifact,
  deleteLiveArtifact,
  ensureLiveArtifactPreview,
  getLiveArtifact,
  listLiveArtifacts,
  listLiveArtifactRefreshLogEntries,
  readLiveArtifactCode,
  updateLiveArtifact,
} from './live-artifacts/store.js';
import {
  refreshLiveArtifact,
} from './live-artifacts/refresh-service.js';

import { registerConnectorRoutes } from './connectors/routes.js';
import { registerActiveContextRoutes } from './routes/active-context.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { registerDaemonRoutes } from './routes/daemon.js';
import { registerGenuiRoutes } from './routes/genui.js';
import { registerDesignSystemRoutes } from './routes/design-systems.js';
import { registerHostToolsRoutes } from './routes/host-tools.js';
import { registerPluginAssetRoutes } from './routes/plugins/assets.js';
import { registerPluginMarketplaceRoutes } from './routes/plugins/marketplaces.js';
import { registerPluginEventRoutes, registerPluginRoutes, registerProjectPluginRoutes } from './routes/plugins/index.js';
import { registerMcpRoutes } from './routes/mcp.js';
import { registerXaiRoutes } from './routes/xai.js';
import { registerLiveArtifactRoutes } from './routes/live-artifact.js';
import { registerDesignSystemToolRoutes } from './routes/design-system-tool.js';
import { registerDeployRoutes, registerDeploymentCheckRoutes } from './routes/deploy.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerProjectRoutes, registerProjectArtifactRoutes, registerProjectFileRoutes, registerProjectUploadRoutes } from './routes/project/index.js';
import { registerVelaRoutes } from './routes/vela.js';
import { registerFinalizeRoutes, registerImportRoutes, registerProjectExportRoutes } from './export/index.js';
import { registerHandoffRoutes } from './routes/handoff.js';
import { EmptyTranscriptError, synthesizeHandoffPrompt } from './handoff-design.js';
import { TranscriptExportLockedError } from './export/index.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerTerminalRoutes } from './routes/terminal.js';
import { createTerminalService } from './terminals.js';
import { registerSocialShareRoutes } from './routes/social-share.js';
import { registerOpenDesignPublicMetadataRoutes } from './routes/open-design-public-metadata.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerTelemetryRoutes } from './routes/telemetry.js';
import {
  assembleExample,
  registerAtomRoutes,
  registerStaticResourceRoutes,
  rewriteSkillAssetUrls,
} from './routes/static-resource.js';
export { rewriteSkillAssetUrls } from './routes/static-resource.js';
import { registerRoutineRoutes, routineDbRowToContract } from './routes/routine.js';

import { createStartChatRun } from './runtimes/start-chat-run.js';
import { createComposeDaemonSystemPrompt } from './runtimes/compose-daemon-system-prompt.js';
import { firePipelineForRun } from './runtimes/fire-pipeline-for-run.js';
import { registerApiBearerAuthMiddleware, registerApiOriginGuardMiddleware } from './http/api-security-middleware.js';
import { createPluginRegistryView } from './plugin-registry-view.js';
import { createPluginProjectHandlers } from './routes/plugins/project-handlers.js';
import { createReportRunCompletionTelemetryFallback } from './run-telemetry-fallback.js';
import {
  createPluginInstallationHelpers,
} from './services/plugin-installation.js';
import { createPluginShareTaskStore } from './services/plugin-share-tasks.js';
import { installRouteRegistrationGuard } from './route-registration-guard.js';
import { assertServerContextSatisfiesRoutes } from './route-context-contract.js';
import {
  configureConnectorCredentialStore,
  connectorService,
  FileConnectorCredentialStore,
} from './connectors/service.js';
import { composioConnectorProvider } from './connectors/composio.js';
import { configureComposioConfigStore } from './connectors/composio-config.js';

import {
  buildDeployFileSet,
  checkDeploymentUrl,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  DeployError,
  deployToCloudflarePages,
  deployToVercel,
  isDeployProviderId,
  listCloudflarePagesZones,
  prepareDeployPreflight,
  publicDeployConfigForProvider,
  readDeployConfig,
  VERCEL_PROVIDER_ID,
  writeDeployConfig,
} from './deploy.js';
import {
  configuredAllowedOrigins,
  isLocalSameOrigin,
} from './auth/index.js';
import { registerLibraryRoutes } from './routes/library.js';
import {
  seedLibraryExtensionOrigins,
} from './library/index.js';
import { listLibraryTokenOrigins } from './library/index.js';
import {
  apiTokenFromEnv,
  isApiAuthDisabled,
} from './auth/index.js';
import { createOpenDesignPublicMetadataService } from './services/open-design-public-metadata.js';

/** @typedef {import('@open-design/contracts').ApiErrorCode} ApiErrorCode */
/** @typedef {import('@open-design/contracts').ApiError} ApiError */
/** @typedef {import('@open-design/contracts').ApiErrorResponse} ApiErrorResponse */
/** @typedef {import('@open-design/contracts').ChatRequest} ChatRequest */
/** @typedef {import('@open-design/contracts').ChatSseEvent} ChatSseEvent */
/** @typedef {import('@open-design/contracts').ProxyStreamRequest} ProxyStreamRequest */
/** @typedef {import('@open-design/contracts').ProxySseEvent} ProxySseEvent */
/** @typedef {import('@open-design/contracts').ProjectConversationCreatedSsePayload} ProjectConversationCreatedSsePayload */

// Every daemon filesystem path + its one-time ordered init (data-dir resolve,
// sandbox dirs, legacy migration, managed-data mkdirs) was extracted to the
// fully typechecked ./server/core/runtime-paths.ts (strangler-fig slice 5b).
// Importing it here runs that init before this module's body executes.
import {
  ALL_SKILL_LIKE_ROOTS,
  ARTIFACTS_DIR,
  BRANDS_DIR,
  BUNDLED_PETS_DIR,
  BUNDLED_PLUGINS_DIR,
  CRAFT_DIR,
  CRITIQUE_ARTIFACTS_DIR,
  DAEMON_RESOURCE_ROOT,
  DESIGN_SYSTEMS_DIR,
  DESIGN_TEMPLATES_DIR,
  DESIGN_TEMPLATE_ROOTS,
  FRAMES_DIR,
  LIBRARY_DIR,
  OD_BIN,
  OD_NODE_BIN,
  PLUGIN_LOCKFILE_PATH,
  PLUGIN_PREVIEWS_DIR,
  PLUGIN_REGISTRY_DIR,
  PLUGIN_REGISTRY_ROOTS,
  PROJECTS_DIR,
  PROJECT_ROOT,
  PROMPT_TEMPLATES_DIR,
  RUNTIME_DATA_DIR,
  RUNTIME_DATA_DIR_CANONICAL,
  SANDBOX_MODE_ENABLED,
  SANDBOX_RUNTIME,
  SKILLS_DIR,
  SKILL_ROOTS,
  STATIC_DIR,
  USER_DESIGN_SYSTEMS_DIR,
  USER_DESIGN_TEMPLATES_DIR,
  USER_SKILLS_DIR,
} from './server/core/runtime-paths.js';

function renderPluginBriefTemplate(template, inputs = {}) {
  if (typeof template !== 'string' || template.length === 0) return '';
  return template.replace(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g, (full, key) => {
    if (!Object.hasOwn(inputs, key)) return full;
    const value = inputs[key];
    if (value === undefined || value === null || value === '') return full;
    return String(value);
  });
}

// Bundled-plugin marketplace seeding (consts + 6 helpers) was extracted to
// ./server/marketplace/seed.ts (strangler-fig slice 5a). The helpers now take
// the daemon-init directory singletons (BUNDLED_PLUGINS_DIR / PROJECT_ROOT /
// PLUGIN_REGISTRY_DIR) as explicit args; server.ts threads them at each call
// site below. OFFICIAL_MARKETPLACE_ID is imported back for its startServer use.
import {
  OFFICIAL_MARKETPLACE_ID,
  createMarketplaceFetcher,
} from './server/marketplace/index.js';

// Disk cache + same-origin proxy for external preview media (cross-border CDN
// images/videos referenced by plugin example.html). See plugin-asset-cache.ts.
const pluginAssetCache = createPluginAssetCache({
  cacheDir: path.join(RUNTIME_DATA_DIR, 'plugin-asset-cache'),
});
const orbitService = new OrbitService(RUNTIME_DATA_DIR);
const designSystemGenerationJobs = createDesignSystemGenerationJobStore({
  root: USER_DESIGN_SYSTEMS_DIR,
});
let routineService = null;

// In-memory OAuth state cache. Lives for the daemon process's lifetime.
// Maps the OAuth `state` parameter we generated in /api/mcp/oauth/start
// to the verifier + endpoint info needed to finish the exchange when the
// browser hits /api/mcp/oauth/callback.
const mcpPendingAuth = new PendingAuthCache();

/**
 * Resolve the daemon's public base URL — the origin the user's browser
 * (or the OAuth provider) reaches us at. Order of precedence:
 *
 *   1. `OD_PUBLIC_BASE_URL` env var. Cloud and packaged-electron deployments
 *      set this to the externally-routable URL (e.g. `https://app.example.com`).
 *   2. `req.protocol://req.get('host')` from the inbound request. Works in
 *      local dev and most reverse-proxy setups (Express respects
 *      `trust proxy` so X-Forwarded-* headers are honored).
 *
 * The OAuth callback URI is derived from this — it MUST be reachable from
 * the user's browser, otherwise the redirect after auth lands on
 * ERR_CONNECTION_REFUSED. Misconfiguration is loud: the OAuth provider
 * will reject `redirect_uri` mismatches.
 */
function getPublicBaseUrl(req) {
  const env = process.env.OD_PUBLIC_BASE_URL;
  if (env && /^https?:\/\//i.test(env)) {
    return env.replace(/\/+$/u, '');
  }
  const proto = req.protocol || 'http';
  const host = req.get('host');
  if (!host) return `http://localhost:${process.env.OD_PORT ?? '7456'}`;
  return `${proto}://${host}`;
}

function mcpOAuthCallbackUrl(req) {
  return `${getPublicBaseUrl(req)}/api/mcp/oauth/callback`;
}

/**
 * Refresh an expired token using the OAuth client context that the original
 * authorization-code exchange persisted alongside the token. Refresh tokens
 * are bound (RFC 6749 §6) to the client that received them, so we MUST
 * refresh against the same `tokenEndpoint` / `clientId` / `clientSecret`
 * pair — re-running discovery with a different redirect URI would risk
 * registering a new client_id that the upstream then rejects the refresh
 * for. Tokens persisted before that context was recorded can't be safely
 * refreshed; the caller treats `null` as "needs reconnect".
 */
async function refreshAndPersistToken(dataDir, serverId, current) {
  if (!current.refreshToken) return null;
  if (!current.tokenEndpoint || !current.clientId) return null;
  const tokenResp = await refreshAccessToken({
    tokenEndpoint: current.tokenEndpoint,
    clientId: current.clientId,
    clientSecret: current.clientSecret,
    refreshToken: current.refreshToken,
    scope: current.scope,
    resource: current.resourceUrl,
  });
  const next = {
    accessToken: tokenResp.access_token,
    refreshToken: tokenResp.refresh_token ?? current.refreshToken,
    tokenType: tokenResp.token_type ?? 'Bearer',
    scope: tokenResp.scope ?? current.scope,
    expiresAt:
      typeof tokenResp.expires_in === 'number'
        ? Date.now() + tokenResp.expires_in * 1000
        : undefined,
    savedAt: Date.now(),
    tokenEndpoint: current.tokenEndpoint,
    clientId: current.clientId,
    clientSecret: current.clientSecret,
    authServerIssuer: current.authServerIssuer,
    redirectUri: current.redirectUri,
    resourceUrl: current.resourceUrl,
  };
  await setToken(dataDir, serverId, next);
  return next;
}

// Live event fan-out sinks (the three registries + four emit helpers) were
// extracted verbatim to ./server/events/sinks.ts (strangler-fig slice 5a).
// server.ts imports the maps/emitters back for its route + deps wiring and
// re-exports the two __forTest* hooks to preserve its public surface.
import {
  activeChatAgentEventSinks,
  activeProjectEventSinks,
  activeChatRunHandles,
  emitLiveArtifactEvent,
  emitLiveArtifactRefreshEvent,
  emitProjectEvent,
} from './server/events/index.js';
export {
  __forTestChatRunHandles,
  __forTestEmitLiveArtifactEvent,
} from './server/events/index.js';

// Windows ENAMETOOLONG mitigation constants
const CMD_BAT_RE = /\.(cmd|bat)$/i;
const PROMPT_TEMP_FILE = () =>
  '.od-prompt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.md';
const promptFileBootstrap = (fp) =>
  `Your full instructions are stored in the file: ${fp.replace(/\\/g, '/')}. ` +
  'Open that file first and follow every instruction in it exactly — ' +
  'it contains the system prompt, design system, skill workflow, and user request. ' +
  'Do not begin your response until you have read the entire file.';

// Load Critique Theater config once at startup so a bad OD_CRITIQUE_* value
// surfaces immediately as a boot-time RangeError instead of silently at
// run time. Default: enabled=false (M0 dark launch).
const critiqueCfg = loadCritiqueConfigFromEnv();
// Per-run baselines of the project's artifact files, captured before the agent
// runs and diffed at run-finish to derive `artifact_count` agent-agnostically
// (see `run-artifact-fs.ts`). Keyed by run id because the run-start scope and
// the run-finished analytics scope are different closures. The registry also
// flags runs that overlapped another run in the same cwd as `contended`; those
// must not trust the whole-tree diff (it would cross-attribute writes) and fall
// back to the per-run tool-stream count.
const runArtifactBaselines = createRunArtifactBaselines();
// Tracks adapter streamFormat values that have already received a one-time
// warning explaining why the Critique Theater orchestrator was bypassed.
// Adapter denylist for orchestrator routing is implicit: anything that is
// not the 'plain' streamFormat falls through to legacy single-pass.
const critiqueWarnedAdapters = new Set<string>();

// In-process registry of in-flight critique runs so the interrupt endpoint
// can cascade an AbortController to the matching orchestrator invocation.
// Created once per process; not persisted across daemon restarts.
const critiqueRunRegistry = createRunRegistry();

// Agent runtime env + tool-prompt construction were extracted to
// ./server/runtime-env/agent-runtime-env.ts (strangler-fig slice 5a).
// createAgentRuntimeEnv stays here as a thin wrapper that binds the two
// daemon-init singletons (RUNTIME_DATA_DIR + SANDBOX_RUNTIME) so its public
// 4-arg signature is unchanged; createAgentRuntimeToolPrompt is pure and
// re-exported as-is.
// Import createAgentRuntimeToolPrompt as a LOCAL binding (startServer references
// it) AND re-export it to preserve server.ts's public surface. A bare
// `export { … } from` would only re-export without binding it locally.
import { buildAgentRuntimeEnv, createAgentRuntimeToolPrompt } from './server/runtime-env/index.js';
export { createAgentRuntimeToolPrompt };

// Boot-time DB reconcile + registry seed (critique/media reconcile, bundled
// plugin registration, marketplace seed, snapshot GC, warm probes, live-artifact
// recovery) was extracted to ./server/bootstrap/boot-reconcile.ts. startServer
// threads the db + the two daemon-init singletons (orbitService, critiqueCfg) it
// closes over.
import { runBootReconcileAndSeed, startDaemonListener } from './server/bootstrap/index.js';

export function createAgentRuntimeEnv(
  baseEnv: NodeJS.ProcessEnv | Record<string, string | undefined>,
  daemonUrl: string,
  toolTokenGrant: { token?: string } | null = null,
  nodeBin: string = process.execPath,
): NodeJS.ProcessEnv {
  return buildAgentRuntimeEnv(baseEnv, daemonUrl, toolTokenGrant, nodeBin, RUNTIME_DATA_DIR, SANDBOX_RUNTIME);
}

// Project run-status display helpers were extracted verbatim to
// ./project-display-status.ts (strangler-fig slice 3). Imported back for the
// deps object and re-exported to preserve server.ts's public surface.
import {
  composeProjectDisplayStatus,
  normalizeProjectDisplayStatus,
} from './project-display-status.js';
export {
  composeProjectDisplayStatus,
  normalizeProjectDisplayStatus,
} from './project-display-status.js';

// readProjectPluginManifest was extracted verbatim to ./plugin-share.ts
// (strangler-fig slice 3); re-export its __forTest wrapper to preserve surface.
export { __forTestReadProjectPluginManifest } from './plugin-share.js';

// Run-event analytics scanners were extracted verbatim to
// ./run-event-analytics.ts (strangler-fig slice 3). Import the five functions
// server.ts still references and re-export the seven __forTest* wrappers so the
// module's public surface (the daemon test suite imports them from here) is
// unchanged.
import {
  filesystemEmptyAnswerFallbackText,
  filesystemWriteFileNamesFromRunEvents,
  resolveRunProjectKindForAnalytics,
  runRetryEventsForAnalytics,
  scanRunEventsForRetrySideEffects,
} from './run-event-analytics.js';
export {
  __forTestFilesystemEmptyAnswerFallbackText,
  __forTestFilesystemWriteFileNamesFromRunEvents,
  __forTestResolveRunProjectKindForAnalytics,
  __forTestRetryFinalResultForRunStatus,
  __forTestRunRetryEventsForAnalytics,
  __forTestScanRunEventsForFinishedProps,
  __forTestScanRunEventsForRetrySideEffects,
} from './run-event-analytics.js';

// Plugin manifest reading + plugin-share prompt/staging helpers were extracted
// verbatim to ./plugin-share.ts (strangler-fig slice 3). Import back the six
// symbols server.ts references.

const LANGFUSE_TERMINAL_FALLBACK_DELAY_MS = 15_000;

// Assistant-message run-lifecycle persistence, skill-plugin-candidate detection,
// and agent-event mapping were extracted verbatim to
// ./assistant-message-persistence.ts (strangler-fig slice 3). Import back the six
// symbols server.ts references and re-export the three public ones.
import {
  detectSkillPluginCandidateOnRunSuccess,
  hasGeneratedPluginArtifacts,
  isPluginAuthoringRun,
  persistRunEventToAssistantMessage,
  pinAssistantMessageOnRunCreate,
  reconcileAssistantMessageOnRunEnd,
} from './chat/index.js';
export {
  daemonAgentPayloadToPersistedAgentEvent,
  detectSkillPluginCandidateOnRunSuccess,
  upsertSkillPluginCandidateAssistantMessage,
} from './chat/index.js';

// Finalized-run Langfuse telemetry was extracted verbatim to ./run-telemetry.ts
// and the turn-2 form-answer / chat-request composition helpers to
// ./chat-request-composition.ts (strangler-fig slice 3). Import back the symbols
// server.ts references and re-export the public surface.
import {
  createFinalizedMessageTelemetryReporter,
  shouldReportRunCompletionTelemetryFallbackStatus,
  telemetryPromptFromRunRequest,
} from './run-telemetry.js';
export {
  createFinalizedMessageTelemetryReporter,
  shouldReportRunCompletedFromMessage,
  shouldReportRunCompletionTelemetryFallbackStatus,
  telemetryPromptFromRunRequest,
} from './run-telemetry.js';
import {
  composeChatUserRequestForAgent,
  FORM_ANSWERED_GENERIC_OVERRIDE,
  FORM_ANSWERED_SYSTEM_OVERRIDE,
  FORM_ANSWERS_HEADER_RE,
} from './chat/index.js';
export {
  composeChatUserRequestForAgent,
  FORM_ANSWERED_GENERIC_OVERRIDE,
  FORM_ANSWERED_SYSTEM_OVERRIDE,
} from './chat/index.js';

// Cloudflare Pages deployment helpers (project-name resolution, provider
// metadata shape, public deployment view, live link-status reconciliation)
// were extracted verbatim to ./deploy/cloudflare-pages.ts (strangler-fig
// slice 5c) — they are deploy concerns whose only consumer is
// routes/deploy.ts via the ctx.deploy bundle threaded below. server.ts
// imports back the six it threads; cloudflarePagesProjectNameFromUrl and the
// metadata key stay module-internal to the new file.
import {
  checkCloudflarePagesDeploymentLinks,
  cloudflarePagesDeploymentMetadata,
  cloudflarePagesProjectNameForDeploy,
  cloudflarePagesProjectNameFromDeployment,
  publicDeployment,
  publicDeployments,
} from './deploy/cloudflare-pages.js';

// Local-daemon request guards, tool authorization, preview-scope tracking, and
// live-artifact route serving helpers were extracted verbatim to
// ./daemon-request-guards.ts (strangler-fig slice 3). Import back the thirteen
// symbols server.ts references.
import {
  authorizeToolRequest,
  createProjectPreviewScopeRegistry,
  isLoopbackHostname,
  optionalToolGrantFromRequest,
  requestProjectOverride,
  requestRunOverride,
  requireLocalDaemonRequest,
  sanitizeArchiveFilename,
  sendLiveArtifactRouteError,
  setLiveArtifactCodeHeaders,
  setLiveArtifactPreviewHeaders,
} from './daemon-request-guards.js';

// openNativeFolderDialog was extracted to ./native-folder-dialog.ts alongside
// its parse/build helpers (strangler-fig slice). Imported back above for the
// nativeDialog deps bundle.

/**
 * @param {ApiErrorCode} code
 * @param {string} message
 * @param {Omit<ApiError, 'code' | 'message'>} [init]
 */
// SSE/AMR error payload builders were extracted verbatim to
// ./http/error-payloads.ts (strangler-fig slice 3). Imported back here for the
// chat-run deps object.
import {
  createAmrModelUnavailablePayload,
  createSseErrorPayload,
  rewriteKnownAgentStreamError,
} from './http/error-payloads.js';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
      );
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const importUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      cb(
        null,
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`,
      );
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

const PLUGIN_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const pluginUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PLUGIN_UPLOAD_MAX_BYTES,
    files: 500,
    fieldSize: 2 * 1024 * 1024,
  },
});

// Figma `.fig` import — memory storage so the offline decoder gets the raw
// bytes without a temp-file round-trip. The decoder unzips + kiwi-decodes
// in-process and writes the snapshot under the project cwd.
const figmaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },  // community kits run large
});

const pluginShareTaskStore = createPluginShareTaskStore({
  randomUUID,
  execCommandViaLoginShell,
  OD_NODE_BIN,
  OD_BIN,
});

// Project-scoped multi-file upload. Lands files directly in the project
// folder (flat — same shape FileWorkspace expects), so the composer's
// pasted/dropped/picked images become referenceable filenames the agent
// can Read or @-mention without any cross-folder gymnastics.
// Bridge between the multer upload-storage destination (built at module
// init) and the per-process project DB (instantiated inside startServer).
// startServer() sets this so the upload destination can route attachments
// into the right project root, including folder-imported projects whose
// files live under metadata.baseDir.
let projectMetadataLookup: ((id: string) => Record<string, unknown> | null) | null = null;

const projectUpload = multer({
  storage: multer.diskStorage({
    destination: async (req, _file, cb) => {
      try {
        // Route uploads into the project's actual root: for folder-imported
        // projects (metadata.baseDir set) attachments need to land alongside
        // the user's files so the agent can read them via the same path
        // it sees. projectMetadataLookup is populated at startServer() boot
        // and keyed by project id; null fallback gives the standard
        // .od/projects/<id>/ behavior for non-imported projects.
        const meta = projectMetadataLookup?.(req.params.id) ?? null;
        // Optional `dir` form field (sent BEFORE the file parts by the web
        // client) routes uploads into a subfolder, so files dropped/picked
        // while viewing a folder land there instead of the project root. The
        // sanitized relative dir is stashed on the request so the route can
        // report each file's true project-relative path.
        const subdir = typeof req.body?.dir === 'string' ? req.body.dir : '';
        const { absDir, relDir } = await ensureProjectSubdir(
          PROJECTS_DIR,
          req.params.id,
          subdir,
          meta,
        );
        (req as any)._uploadRelDir = relDir;
        (req as any)._uploadAbsDir = absDir;
        cb(null, absDir);
      } catch (err) {
        cb(err, '');
      }
    },
    filename: (req, file, cb) => {
      // multer@1 hands us latin1-decoded multipart filenames; restore the
      // original UTF-8 so the response (and the on-disk name) preserves
      // non-ASCII characters instead of mangling them. Then run the shared
      // sanitiser and only add a suffix when that sanitized source name
      // would collide with an existing or same-batch upload.
      file.originalname = decodeMultipartFilename(file.originalname);
      const safe = sanitizeName(file.originalname);
      const uploadDir = typeof (req as any)._uploadAbsDir === 'string' ? (req as any)._uploadAbsDir : '';
      const reserved = (req as any)._uploadReservedNames instanceof Set
        ? (req as any)._uploadReservedNames
        : ((req as any)._uploadReservedNames = new Set());
      cb(null, uniqueUploadFileName(uploadDir, safe, reserved));
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },  // 200MB — covers the largest design assets we expect (PPTX/PDF/raw images)
});

function handleProjectUpload(req, res, next) {
  projectUpload.array('files', 12)(req, res, (err) => {
    if (err) {
      return sendMulterError(res, err);
    }
    next();
  });
}

// uniqueUploadFileName + sendMulterError (pure multipart-upload helpers) were
// extracted to ./upload/multer-helpers.ts (strangler-fig slice). server.ts
// imports them back: uniqueUploadFileName is used by the projectUpload multer
// storage config above, and sendMulterError by handleProjectUpload, the figma
// upload route, and the upload deps bundles. The projectUpload/figmaUpload
// multer singletons stay here (they close over startServer state) pending the
// bootstrap slice.

// The desktop exporter/runtime-context types and the startServer
// options/result contracts were extracted to ./server/core/types.ts
// (strangler-fig slice). Re-exported here (barrel) so daemon-startup.ts and
// the bootstrap regression test keep importing them from './server.js'.
export type {
  DaemonRuntimeContext,
  DesktopArtifactExporter,
  DesktopPdfExporter,
  DesktopSlideRenderer,
  StartServerOptions,
  StartServerResult,
} from './server/core/types.js';

export async function startServer({
  port = 7456,
  host = normalizeDaemonBindHost(process.env.OD_BIND_HOST),
  returnServer = false,
  desktopPdfExporter = null,
  desktopSlideRenderer = null,
  desktopArtifactExporter = null,
  runtime = null,
}: StartServerOptions = {}) {
  host = normalizeDaemonBindHost(host);
  // Mutable runtime values shared with the deferred listener (bootstrap/
  // start-listener.ts): the routes registered below read these through getter
  // refs, and the listener writes the bound port + final URL back here once the
  // socket binds. Boxed in one object so both sides see the same live values.
  const daemonRuntimeState = {
    resolvedPort: port,
    daemonUrl: `http://127.0.0.1:${port}`,
    daemonShuttingDown: false,
  };
  const extraAllowedOrigins = configuredAllowedOrigins();

  // Plan §3.K1 / spec §15.7 — bound-API-token guard.
  //
  // The daemon refuses to bind to a public interface unless an
  // OD_API_TOKEN is set. This is the spec §16 Phase 5 safety floor:
  // a hosted operator can no longer accidentally publish an unsecured
  // daemon by setting OD_BIND_HOST=0.0.0.0 without a token.
  //
  // Loopback hosts (127.0.0.1 / ::1 / localhost) are always allowed —
  // the desktop / dev flow remains unchanged. Setting OD_API_TOKEN is
  // purely additive: when present, every /api/* request must carry a
  // matching `Authorization: Bearer <token>` header (loopback origins
  // are exempted so the desktop UI keeps working).
  const apiToken = apiTokenFromEnv();
  const apiAuthDisabled = isApiAuthDisabled();
  if (!isLoopbackHostname(host) && apiToken.length === 0 && !apiAuthDisabled) {
    throw new Error(
      `OD_BIND_HOST=${host} requires OD_API_TOKEN to be set. ` +
      `Generate one with \`openssl rand -hex 32\` and re-launch. ` +
      `(Loopback hosts 127.0.0.1 / ::1 / localhost do not need a token.) ` +
      `Set OD_DISABLE_API_AUTH=1 only when a trusted reverse proxy already authenticates every request.`,
    );
  }

  const app = express();
  installRouteRegistrationGuard(app);
  // Clipper page captures are self-contained HTML with inlined images plus a
  // Figma IR, which for an image-heavy site (The Economist, news front pages)
  // runs to tens of MB — far past a normal JSON body. Give the ingest route a
  // dedicated generous limit so a full-page capture doesn't 413; the rest of the
  // API stays at the conservative 4mb. Registered first so this parser claims
  // the ingest body before the global one (express.json is a no-op once a body
  // has already been read).
  app.use('/api/library/ingest', express.json({ limit: '128mb' }));
  // Brand extract-from-html carries the full rendered page DOM (+ collected CSS)
  // the web read out of the in-app browser tab after the user cleared an anti-bot
  // wall — well past 4mb for image/markup-heavy sites. Give it a dedicated limit
  // (registered before the global parser so it claims the body first).
  app.use('/api/brands/:id/extract-from-html', express.json({ limit: '32mb' }));
  app.use(express.json({ limit: '4mb' }));
  const projectPreviewScopes = createProjectPreviewScopeRegistry();

  registerApiBearerAuthMiddleware(app, { apiToken, projectPreviewScopes });

  const designSystemServices = createDesignSystemServerServices({
    roots: { SKILL_ROOTS, DESIGN_TEMPLATE_ROOTS, ALL_SKILL_LIKE_ROOTS },
    paths: { PROJECTS_DIR, DESIGN_SYSTEMS_DIR, USER_DESIGN_SYSTEMS_DIR },
    skills: { listSkills, findSkillById },
    designSystems: {
      listDesignSystems,
      readDesignSystem,
      readDesignSystemPackageInfo,
      readDesignSystemStaticFile,
      listUserDesignSystemFiles,
      readUserDesignSystemFile,
      linkUserDesignSystemProject,
      LEGACY_DESIGN_SYSTEM_ARTIFACTS,
    },
    projects: {
      getProject,
      insertProject,
      updateProject,
      readProjectFile,
      writeProjectFile,
      listFiles,
      resolveProjectDir,
      isSafeId,
    },
  });
  const {
    ensureUserDesignSystemWorkspaceProject,
    isProjectUsableDesignSystem,
    listAllDesignSystems,
    listAllDesignTemplates,
    listAllSkillLikeEntries,
    listAllSkills,
    readAvailableDesignSystem,
    readAvailableDesignSystemPackageInfo,
    readAvailableDesignSystemStaticFile,
    readDesignSystemWorkspaceTextFile,
    validateProjectDesignSystemId,
    validateProjectSkillId,
  } = designSystemServices;

  registerApiOriginGuardMiddleware(app, {
    host,
    extraAllowedOrigins,
    getResolvedPort: () => daemonRuntimeState.resolvedPort,
  });
  const db = openDatabase(PROJECT_ROOT, { dataDir: RUNTIME_DATA_DIR });
  // Restore paired browser-extension origins into the in-memory allowlist the
  // /api origin middleware above consults, so a paired clipper survives daemon
  // restarts without re-pairing.
  try {
    seedLibraryExtensionOrigins(listLibraryTokenOrigins(db));
  } catch {
    // best-effort: a fresh db with no library_tokens is fine
  }
  const pluginInstallation = createPluginInstallationHelpers({
    db,
    installFromLocalFolder,
    PLUGIN_REGISTRY_ROOTS,
    PLUGIN_LOCKFILE_PATH,
    PLUGIN_UPLOAD_MAX_BYTES,
  });
  // Wire the upload-destination bridge to this db so multer can route
  // file uploads into baseDir-rooted projects' actual folders.
  projectMetadataLookup = (id) => {
    try { return getProject(db, id)?.metadata ?? null; } catch { return null; }
  };
  configureConnectorCredentialStore(new FileConnectorCredentialStore(RUNTIME_DATA_DIR));
  configureComposioConfigStore(RUNTIME_DATA_DIR);
  composioConnectorProvider.configureCatalogCache(RUNTIME_DATA_DIR);
  composioConnectorProvider.startCatalogRefreshLoop();

  // RoutineService persistence is a thin adapter over the SQLite helpers.
  // Routines are stored as DB rows; the service holds in-memory timers and
  // delegates "list me everything" / "record a run" back to SQLite.
  routineService = new RoutineService({
    list: () => listRoutines(db).map((row) => routineDbRowToContract(row, null)),
    insertRun: (run, options) => {
      const row = {
        id: run.id,
        routineId: run.routineId,
        trigger: run.trigger,
        status: run.status,
        projectId: run.projectId,
        conversationId: run.conversationId,
        agentRunId: run.agentRunId,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        summary: run.summary,
        error: run.error,
        errorCode: run.errorCode,
      };
      if (options?.scheduledSlotAt != null) {
        return Boolean(insertScheduledRoutineRun(db, row, options.scheduledSlotAt));
      }
      insertRoutineRun(db, row);
      return true;
    },
    updateRun: (id, patch) => {
      updateRoutineRun(db, id, patch);
    },
    getLatestRun: (routineId) => getLatestRoutineRun(db, routineId),
  });

  // Boot-time DB reconcile + registry seed. See ./server/bootstrap/boot-reconcile.ts.
  // Returns the bundled-plugin marketplace entries that the plugin-marketplace
  // routes below register.
  const bundledMarketplaceEntries = await runBootReconcileAndSeed({ db, orbitService, critiqueCfg });

  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR));
  }

  // ---- Projects (DB-backed) -------------------------------------------------

  registerMemoryRoutes(app, {
    http: { createSseResponse, requireLocalDaemonRequest },
    paths: { RUNTIME_DATA_DIR, PROJECT_ROOT, PROJECTS_DIR },
    appConfig: { readAppConfig },
  });

  registerAutomationRoutes(app, {
    paths: { RUNTIME_DATA_DIR },
  });

  // Reconcile follow-up — the inline POST /api/projects body that lived
  // on garnet (with baseDir privilege check, linkedDirs validation,
  // template snapshot seeding, plugin snapshot resolution with default
  // scenario fallback) is intentionally dropped here. main moved project
  // route registration into `./routes/project/index.js` via PR #1043, so the
  // simple project-create surface is wired through `registerProjectRoutes`
  // further down. Plugin-snapshot-resolution / default-scenario-fallback
  // from garnet need to be re-integrated into routes/project/index.ts as a
  // follow-up — see reconcile decision log.
  // (legacy POST /api/projects body deleted — see registerProjectRoutes below.)

  const telemetry = registerTelemetryRoutes(app, {
    dataDir: RUNTIME_DATA_DIR,
    readAppConfig,
  });
  const { analyticsService } = telemetry;
  const design = {
    runs: createChatRunService({
      createSseResponse,
      createSseErrorPayload,
      runsLogDir: path.join(RUNTIME_DATA_DIR, 'runs'),
    }),
    analytics: analyticsService,
    getAppVersion: () => telemetry.getCachedAppVersion()?.version ?? '0.0.0',
    readAnalyticsContext,
  };

  // Interactive Terminal sessions (node-pty). In-memory, process-local, and
  // killed on daemon shutdown — see shutdownDaemonRuns below.
  const terminalService = createTerminalService();

  // Tracks runs whose finalized assistant message has already been forwarded
  // to Langfuse so repeated message updates only emit one final trace per run.
  // Terminal fallback reports intentionally do not claim this set; a delayed
  // telemetry-finalized message can still replace the synthetic fallback.
  const reportedRuns = new Set();

  const reportFinalizedMessage = createFinalizedMessageTelemetryReporter({
    design,
    db,
    dataDir: RUNTIME_DATA_DIR,
    reportedRuns,
    getAppVersion: telemetry.getCachedAppVersion,
  });
  const reportRunCompletionTelemetryFallback = createReportRunCompletionTelemetryFallback({
    db,
    reportedRuns,
    reportFinalizedMessage,
    LANGFUSE_TERMINAL_FALLBACK_DELAY_MS,
  });

  const reportFeedback = telemetry.reportFeedback;

  // DNS-aware wrapper. The sync `validateBaseUrl` only inspects the literal
  // hostname string, so a public DNS name pointing at an internal address
  // (`internal.example.com → 10.0.0.5`) still passes. We delegate to
  // `validateBaseUrlResolved` here so every proxy and finalize handler runs
  // the same resolved-IP check before issuing the upstream request.
  const validateExternalApiBaseUrl = (baseUrl) => validateBaseUrlResolved(baseUrl);

  const resolvedPortRef = {
    get current() {
      return daemonRuntimeState.resolvedPort;
    },
  };
  const daemonUrlRef = {
    get current() {
      return daemonRuntimeState.daemonUrl;
    },
  };
  const httpDeps = {
    sendApiError,
    sendMulterError,
    sendLiveArtifactRouteError,
    createSseResponse,
    getPublicBaseUrl,
    requireLocalDaemonRequest,
    isLocalSameOrigin,
    resolvedPortRef,
  };
  const pathDeps = {
    PROJECT_ROOT,
    PROJECTS_DIR,
    ARTIFACTS_DIR,
    LIBRARY_DIR,
    BRANDS_DIR,
    RUNTIME_DATA_DIR,
    RUNTIME_DATA_DIR_CANONICAL,
    DESIGN_SYSTEMS_DIR,
    USER_DESIGN_SYSTEMS_DIR,
    DESIGN_TEMPLATES_DIR,
    USER_DESIGN_TEMPLATES_DIR,
    CRAFT_DIR,
    SKILLS_DIR,
    USER_SKILLS_DIR,
    PROMPT_TEMPLATES_DIR,
    BUNDLED_PETS_DIR,
    OD_BIN,
  };

  app.get('/api/health', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    res.json({ ok: true, version: versionInfo.version });
  });

  app.get('/api/ready', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    const ready = !daemonRuntimeState.daemonShuttingDown;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      ready,
      version: versionInfo.version,
    });
  });

  app.get('/api/version', async (_req, res) => {
    const version = await readCurrentAppVersionInfo();
    res.json({ version });
  });

  registerDaemonRoutes(app, {
    db,
    paths: { RUNTIME_DATA_DIR },
    http: { requireLocalDaemonRequest, sendApiError },
    host,
    getResolvedPort: () => daemonRuntimeState.resolvedPort,
    getDaemonShuttingDown: () => daemonRuntimeState.daemonShuttingDown,
    sandboxRuntime: SANDBOX_RUNTIME,
    env: process.env,
  });

  const openDesignPublicMetadata = createOpenDesignPublicMetadataService();
  registerOpenDesignPublicMetadataRoutes(app, {
    http: httpDeps,
    openDesignPublicMetadata,
  });

  registerPluginEventRoutes(app, {
    http: { requireLocalDaemonRequest },
  });

  registerConnectorRoutes(app, {
    sendApiError,
    authorizeToolRequest,
    projectsRoot: PROJECTS_DIR,
    requireLocalDaemonRequest,
    composio: composioConnectorProvider,
  });

  // Gate the diagnostics export behind requireLocalDaemonRequest so it stays
  // unreachable when daemon binds to a non-loopback address (Tailscale,
  // 0.0.0.0, etc.). The bundle contains daemon/web/desktop logs, host
  // metadata, and crash reports — same threat tier as connector / live-
  // artifact endpoints, which all use the same guard.
  app.get(
    DIAGNOSTICS_EXPORT_PATH,
    requireLocalDaemonRequest,
    createDiagnosticsExportHandler({
      runtime,
      projectRoot: PROJECT_ROOT,
      runsDir: path.join(RUNTIME_DATA_DIR, 'runs'),
      dataDir: RUNTIME_DATA_DIR,
    }),
  );

  const nodeDeps = { fs, path };
  const idDeps = { randomId, randomUUID };
  const uploadDeps = { upload, importUpload, handleProjectUpload };
  const projectStoreDeps = {
    getProject,
    insertProject,
    updateProject,
    dbDeleteProject,
    removeProjectDir,
    validateLinkedDirs,
  };
  const projectFileDeps = {
    ensureProject,
    listFiles,
    listProjectFolders,
    createProjectFolder,
    deleteProjectFolder,
    searchProjectFiles,
    readProjectFile,
    resolveProjectDir,
    resolveProjectFilePath,
    parseByteRange,
    renameProjectFile,
    deleteProjectFile,
    writeProjectFile,
    sanitizeName,
    sanitizePath,
    listTabs,
    setTabs,
  };
  const conversationDeps = {
    insertConversation,
    getConversation,
    listConversations,
    updateConversation,
    deleteConversation,
    listMessages,
    upsertMessage,
    listPreviewComments,
    upsertPreviewComment,
    updatePreviewCommentStatus,
    deletePreviewComment,
  };
  const templateDeps = { getTemplate, listTemplates, deleteTemplate, insertTemplate, findTemplateByNameAndProject, updateTemplate };
  const projectStatusDeps = {
    listLatestProjectRunStatuses,
    listProjectsAwaitingInput,
    normalizeProjectDisplayStatus,
    composeProjectDisplayStatus,
    listProjects,
  };
  const projectEventDeps = { subscribeFileEvents, activeProjectEventSinks };
  const importDeps = { importClaudeDesignZip, projectDir, detectEntryFile };
  const projectExportDeps = {
    buildProjectArchive,
    buildBatchArchive,
    buildDesktopPdfExportInput,
    buildDesktopArtifactExportInput,
    desktopPdfExporter,
    desktopSlideRenderer,
    desktopArtifactExporter,
    daemonUrlRef,
    sanitizeArchiveFilename,
  };
  const artifactDeps = {
    sanitizeSlug,
    lintArtifact,
    renderFindingsForAgent,
    validateArtifactManifestInput,
  };
  const deployDeps = {
    VERCEL_PROVIDER_ID,
    CLOUDFLARE_PAGES_PROVIDER_ID,
    isDeployProviderId,
    publicDeployConfigForProvider,
    readDeployConfig,
    writeDeployConfig,
    listCloudflarePagesZones,
    DeployError,
    listDeployments,
    publicDeployments,
    getDeployment,
    getDeploymentById,
    buildDeployFileSet,
    cloudflarePagesProjectNameForDeploy,
    cloudflarePagesProjectNameFromDeployment,
    checkCloudflarePagesDeploymentLinks,
    checkDeploymentUrl,
    deployToCloudflarePages,
    deployToVercel,
    upsertDeployment,
    publicDeployment,
    cloudflarePagesDeploymentMetadata,
    prepareDeployPreflight,
  };
  const mediaDeps = {
    MEDIA_PROVIDERS,
    IMAGE_MODELS,
    VIDEO_MODELS,
    AUDIO_MODELS_BY_KIND,
    MEDIA_ASPECTS,
    VIDEO_LENGTHS_SEC,
    AUDIO_DURATIONS_SEC,
    readMaskedConfig,
    writeConfig,
    generateMedia,
    mediaTasks,
    createMediaTask: (taskId, projectId, info) => createMediaTask(db, taskId, projectId, info),
    persistMediaTask: (task) => persistMediaTask(db, task),
    appendTaskProgress: (task, line) => appendTaskProgress(db, task, line),
    notifyTaskWaiters: (task) => notifyTaskWaiters(db, task),
    getLiveMediaTask: (taskId) => getLiveMediaTask(db, taskId),
    mediaTaskSnapshot,
    listMediaTasksByProject,
    listElevenLabsVoiceOptions,
  };
  const appConfigDeps = { readAppConfig, writeAppConfig };
  const orbitDeps = { orbitService };
  const nativeDialogDeps = { openBrowser, openNativeFolderDialog };
  const researchDeps = { searchResearch, ResearchError };
  const liveArtifactDeps = {
    createLiveArtifact,
    listLiveArtifacts,
    updateLiveArtifact,
    refreshLiveArtifact,
    emitLiveArtifactEvent,
    emitLiveArtifactRefreshEvent,
    readLiveArtifactCode,
    setLiveArtifactCodeHeaders,
    ensureLiveArtifactPreview,
    setLiveArtifactPreviewHeaders,
    getLiveArtifact,
    listLiveArtifactRefreshLogEntries,
    deleteLiveArtifact,
  };
  const authDeps = {
    authorizeToolRequest,
    consumedImportNonces,
    desktopAuthSecret: getDesktopAuthSecret,
    isDesktopAuthGateActive,
    pruneExpiredImportNonces,
    optionalToolGrantFromRequest,
    requestProjectOverride,
    requestRunOverride,
    verifyDesktopImportToken,
  };
  const finalizeDeps = {
    defaultBaseUrlForFinalizeProtocol,
    finalizeDesignPackage,
    FinalizePackageLockedError,
    FinalizeUpstreamError,
    isFinalizeProviderProtocol,
    redactSecrets,
  };
  const handoffDeps = {
    synthesizeHandoffPrompt,
    FinalizeUpstreamError,
    TranscriptExportLockedError,
    EmptyTranscriptError,
    redactSecrets,
  };
  const validationDeps = { isSafeId, validateExternalApiBaseUrl, validateBaseUrl, validateProjectDesignSystemId, validateProjectSkillId };
  const agentDeps = {
    listProviderModels,
    testProviderConnection,
    testAgentConnection,
    getAgentDef,
    isKnownModel,
    sanitizeCustomModel,
  };
  const critiqueDeps = {
    handleCritiqueArtifact,
    handleCritiqueInterrupt,
    critiqueArtifactsRoot: CRITIQUE_ARTIFACTS_DIR,
    critiqueResponseCapBytes: critiqueCfg.parserMaxBlockBytes,
    critiqueRunRegistry,
  };

  // External services
  registerMcpRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
    mcp: { pendingAuth: mcpPendingAuth, daemonUrlRef },
  });
  registerXaiRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
  });
  // Project workspace
  registerActiveContextRoutes(app, {
    db,
    http: httpDeps,
    projectStore: projectStoreDeps,
  });
  registerHostToolsRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
  });
  // OD Library — global asset registry (clipper ingest, grid, pairing, apply).
  registerLibraryRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    auth: authDeps,
  });
  app.post('/api/projects/:id/figma/import', (req, res) => {
    figmaUpload.single('file')(req, res, async (err) => {
      if (err) return sendMulterError(res, err);
      try {
        const project = getProject(db, req.params.id);
        if (!project) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const figmaUrl = typeof body.figmaUrl === 'string' ? body.figmaUrl.trim() : '';
        if (!req.file) {
          if (figmaUrl) {
            return sendApiError(
              res,
              409,
              'FIGMA_URL_NEEDS_MIGRATION',
              'Figma URL imports must run through the Figma migration flow.',
              { details: { figmaUrl } },
            );
          }
          return sendApiError(res, 400, 'BAD_REQUEST', 'file is required');
        }

        const projectRoot = resolveProjectDir(PROJECTS_DIR, req.params.id, project.metadata);
        const notes = typeof body.notes === 'string' ? body.notes : undefined;
        const result = await importFigmaFromBytes(req.file.buffer, {
          cwd: projectRoot,
          label: decodeMultipartFilename(req.file.originalname || 'figma-import.fig'),
          notes,
        });
        return res.json(result);
      } catch (caught) {
        return sendApiError(
          res,
          400,
          'FIGMA_IMPORT_FAILED',
          caught instanceof Error ? caught.message : String(caught),
        );
      }
    });
  });
  registerSocialShareRoutes(app, { http: httpDeps });
  registerProjectRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    templates: templateDeps,
    status: projectStatusDeps,
    events: projectEventDeps,
    ids: idDeps,
    telemetry: { reportFinalizedMessage },
    appConfig: appConfigDeps,
    agents: agentDeps,
    validation: validationDeps,
  });
  registerTerminalRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    terminals: terminalService,
  });
  registerImportRoutes(app, {
    db,
    http: httpDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    ids: idDeps,
    paths: pathDeps,
    imports: importDeps,
    auth: authDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    projectFiles: projectFileDeps,
    validation: validationDeps,
  });

  // Resource catalog
  registerStaticResourceRoutes(app, {
    http: httpDeps,
    paths: pathDeps,
    resources: {
      listAllSkills,
      listAllDesignTemplates,
      listAllSkillLikeEntries,
      listAllDesignSystems,
      mimeFor,
    },
    tokenContractRebuild: {
      maybeStartForImportedDesignSystem: async (designSystemId) => {
        const preparation = await prepareDesignTokenContractRebuild(
          USER_DESIGN_SYSTEMS_DIR,
          designSystemId,
        );
        if (!preparation.revision) return { decision: preparation.decision };
        const job = designSystemGenerationJobs.rebuildTokenContract({
          designSystemId,
          decision: preparation.decision,
          ...preparation.revision,
        });
        return { decision: preparation.decision, job };
      },
    },
  });
  registerDesignSystemRoutes(app, {
    db,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    designSystems: {
      buildUserDesignSystemArchive,
      createUserDesignSystem,
      deleteUserDesignSystem,
      ensureUserDesignSystemWorkspaceProject,
      listAllDesignSystems,
      listUserDesignSystemFiles,
      listUserDesignSystemRevisions,
      prepareDesignTokenContractRebuild,
      readAvailableDesignSystem,
      readAvailableDesignSystemPackageInfo,
      readAvailableDesignSystemStaticFile,
      readDesignSystemWorkspaceTextFile,
      readUserDesignSystemFile,
      renderDesignSystemPreview,
      renderDesignSystemShowcase,
      updateUserDesignSystem,
      updateUserDesignSystemRevisionStatus,
    },
    generationJobs: designSystemGenerationJobs,
  });
  registerBrandRoutes(app, {
    brandsRoot: BRANDS_DIR,
    userDesignSystemsRoot: USER_DESIGN_SYSTEMS_DIR,
    projectsRoot: PROJECTS_DIR,
    skillsRoot: SKILLS_DIR,
    dataDir: RUNTIME_DATA_DIR,
    db,
    runs: design.runs,
    randomId,
    resolveTranscriptAgent: async () => {
      const config = await readAppConfig(RUNTIME_DATA_DIR);
      let agentId = typeof config.agentId === 'string' && config.agentId
        ? config.agentId
        : null;
      let detectedAgentName: string | null = null;
      if (!agentId) {
        const agents = await detectAgents(config.agentCliEnv ?? {}).catch(() => []);
        const available = agents.find((agent) => agent.available);
        agentId = available?.id ?? null;
        detectedAgentName = available?.name ?? null;
      }
      if (!agentId) return null;
      return {
        agentId,
        agentName: getAgentDef(agentId)?.name ?? detectedAgentName ?? agentId,
      };
    },
  });
  registerProjectArtifactRoutes(app, {
    http: httpDeps,
    uploads: uploadDeps,
    paths: pathDeps,
    node: nodeDeps,
    artifacts: artifactDeps,
  });
  registerLiveArtifactRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    auth: authDeps,
    liveArtifacts: liveArtifactDeps,
    projectStore: projectStoreDeps,
  });
  registerDesignSystemToolRoutes(app, {
    auth: authDeps,
    http: httpDeps,
    paths: pathDeps,
    projects: { getProject: (id: string) => getProject(db, id) },
  });
  app.use('/artifacts', express.static(ARTIFACTS_DIR));
  app.use(
    PLUGIN_PREVIEWS_ROUTE,
    express.static(PLUGIN_PREVIEWS_DIR, { maxAge: '1d', immutable: false }),
  );
  registerDeployRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    deploy: deployDeps,
    projectStore: projectStoreDeps,
  });
  registerFinalizeRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    validation: validationDeps,
    finalize: finalizeDeps,
  });
  registerHandoffRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    validation: validationDeps,
    handoff: handoffDeps,
  });
  registerDeploymentCheckRoutes(app, { db, http: httpDeps, deploy: deployDeps });
  app.use('/frames', express.static(FRAMES_DIR));
  registerProjectExportRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    node: nodeDeps,
    ids: idDeps,
    projectStore: projectStoreDeps,
    exports: projectExportDeps,
    projectFiles: projectFileDeps,
    validation: validationDeps,
  });
  registerProjectFileRoutes(app, {
    db,
    http: httpDeps,
    paths: pathDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    documents: { buildDocumentPreview },
    artifacts: artifactDeps,
    projectPreviewScopes,
  });

  registerMediaRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    auth: authDeps,
    media: mediaDeps,
    appConfig: appConfigDeps,
    orbit: orbitDeps,
    nativeDialogs: nativeDialogDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    research: researchDeps,
  });

  registerVelaRoutes(app, {
    paths: { RUNTIME_DATA_DIR },
    appConfig: { readAppConfig },
    http: { getPublicBaseUrl },
    env: process.env,
  });

  const loadPluginRegistryView = createPluginRegistryView({ db, listAllSkills, listAllDesignSystems });

  const pluginRouteHelpers = {
    PLUGIN_PREVIEWS_DIR,
    applyBakedPreviews,
    assembleExample,
    pluginUpload,
    pluginInstallation,
    sendMulterError,
    decodeMultipartFilename,
    connectorService,
    buildConnectorProbe,
    loadPluginRegistryView,
    requireLocalDaemonRequest,
    getProject,
    sendApiError,
    isLocalSameOrigin,
    resolvedPortRef,
    pluginShareTaskStore,
    ...createPluginProjectHandlers({
      db,
      resolvedPortRef,
      loadPluginRegistryView,
      pluginShareTaskStore,
      OD_BIN,
      OD_NODE_BIN,
      PROJECTS_DIR,
      PLUGIN_REGISTRY_ROOTS,
      randomId,
    }),
  };

  registerPluginRoutes(app, {
    db,
    paths: { PROJECTS_DIR, PLUGIN_REGISTRY_ROOTS, PLUGIN_LOCKFILE_PATH },
    ids: idDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    plugins: {
      listInstalledPlugins,
      getInstalledPlugin,
      installPlugin,
      uninstallPlugin,
      installFromLocalFolder,
      applyPlugin,
      doctorPlugin,
      getSnapshot,
      pruneExpiredSnapshots,
      readPluginLockfile,
      resolvePluginSnapshot,
      MissingInputError,
      pluginPromptBlock,
      listSkillPluginCandidates,
      dismissSkillPluginCandidate,
      generateSkillPluginDraft,
      FIRST_PARTY_ATOMS,
    },
    helpers: pluginRouteHelpers,
  });
  registerAtomRoutes(app, {
    db,
    resources: { FIRST_PARTY_ATOMS },
  });
  registerPluginMarketplaceRoutes(app, {
    db,
    bundledMarketplaceEntries,
    createMarketplaceFetcher: (seedId, entries) =>
      createMarketplaceFetcher(seedId, entries, PLUGIN_REGISTRY_DIR),
    marketplaceRegistryIdFromUrl,
  });
  registerPluginAssetRoutes(app, {
    db,
    pluginAssetCache,
    AssetCacheError,
    assetCacheRewriteUrl,
    isCacheableExternalUrl,
    assembleExample,
  });

  registerGenuiRoutes(app, {
    db,
    design,
    paths: { PROJECTS_DIR },
  });

  registerProjectPluginRoutes(app, {
    db,
    paths: { PROJECTS_DIR, PLUGIN_REGISTRY_ROOTS, PLUGIN_LOCKFILE_PATH },
    ids: idDeps,
    projectStore: projectStoreDeps,
    conversations: conversationDeps,
    plugins: {
      listInstalledPlugins,
      getInstalledPlugin,
      installPlugin,
      uninstallPlugin,
      installFromLocalFolder,
      applyPlugin,
      doctorPlugin,
      getSnapshot,
      pruneExpiredSnapshots,
      readPluginLockfile,
      resolvePluginSnapshot,
      MissingInputError,
      pluginPromptBlock,
      listSkillPluginCandidates,
      dismissSkillPluginCandidate,
      generateSkillPluginDraft,
      FIRST_PARTY_ATOMS,
    },
    helpers: pluginRouteHelpers,
  });
  registerProjectUploadRoutes(app, { http: httpDeps, uploads: uploadDeps, node: nodeDeps });

  const composeDaemonSystemPrompt = createComposeDaemonSystemPrompt({
    db,
    critiqueCfg,
    CRAFT_DIR,
    DESIGN_SYSTEMS_DIR,
    PROJECT_ROOT,
    RUNTIME_DATA_DIR,
    USER_DESIGN_SYSTEMS_DIR,
    ensureUserDesignSystemWorkspaceProject,
    isProjectUsableDesignSystem,
    listAllDesignSystems,
    listAllSkillLikeEntries,
    readAvailableDesignSystem,
    readDesignSystemWorkspaceTextFile,
  });

  const startChatRun = createStartChatRun({
    ARTIFACTS_DIR,
    DESIGN_SYSTEMS_DIR,
    FORM_ANSWERED_GENERIC_OVERRIDE,
    FORM_ANSWERED_SYSTEM_OVERRIDE,
    FORM_ANSWERS_HEADER_RE,
    OD_BIN,
    OD_NODE_BIN,
    PROJECTS_DIR,
    PROJECT_ROOT,
    RUNTIME_DATA_DIR,
    SANDBOX_RUNTIME,
    SKILLS_DIR,
    activeChatAgentEventSinks,
    activeChatRunHandles,
    critiqueCfg,
    critiqueRunRegistry,
    critiqueWarnedAdapters,
    runArtifactBaselines,
    composeChatUserRequestForAgent,
    createAgentRuntimeEnv,
    createAgentRuntimeToolPrompt,
    createAmrModelUnavailablePayload,
    createSseErrorPayload,
    emitProjectEvent,
    filesystemEmptyAnswerFallbackText,
    filesystemWriteFileNamesFromRunEvents,
    hasGeneratedPluginArtifacts,
    isPluginAuthoringRun,
    persistRunEventToAssistantMessage,
    refreshAndPersistToken,
    renderRunContextPrompt,
    resolveRunProjectKindForAnalytics,
    rewriteKnownAgentStreamError,
    scanRunEventsForRetrySideEffects,
    telemetryPromptFromRunRequest,
    composeDaemonSystemPrompt,
    db,
    design,
    // live binding: server.ts reassigns daemonUrl after listen; the chat
    // run must see the final URL, not the value at factory-creation time.
    get daemonUrl() {
      return daemonRuntimeState.daemonUrl;
    },
  });

  orbitService.setRunHandler(async ({
    trigger,
    startedAt,
    prompt,
    systemPrompt,
    template,
  }) => {
    // Each Orbit run gets its own project so the conversation, messages, and
    // live artifact are isolated. The handler does the synchronous prep here
    // (insert project/conversation/run rows, kick off the chat run) and
    // returns immediately with the new project id; the daemon endpoint
    // resolves the HTTP request with that id so the client can navigate to
    // the new project before the agent has finished. Anything that depends
    // on the agent's final status (live artifact discovery, lastRun summary
    // metadata) lives inside the `completion` promise.
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    let agentId = typeof appConfig.agentId === 'string' && appConfig.agentId
      ? appConfig.agentId
      : null;
    if (!agentId) {
      const agents = await detectAgents(appConfig.agentCliEnv ?? {}).catch(() => []);
      agentId = agents.find((agent) => agent.available)?.id ?? null;
    }
    if (!agentId) throw new Error('No available agent is configured for Orbit. Choose an agent in Settings first.');

    const now = Date.now();
    const projectId = `orbit-${randomUUID()}`;
    const conversationId = `orbit-conv-${randomUUID()}`;
    const assistantMessageId = `orbit-assistant-${randomUUID()}`;
    const projectName = `Orbit · ${formatLocalProjectTimestamp(startedAt)}`;

    const orbitDesignSystemId = template?.designSystemRequired === false
      ? null
      : appConfig.designSystemId ?? null;

    insertProject(db, {
      id: projectId,
      name: projectName,
      skillId: 'live-artifact',
      designSystemId: orbitDesignSystemId,
      pendingPrompt: null,
      metadata: { kind: 'orbit', trigger },
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: projectName,
      createdAt: now,
      updatedAt: now,
    });

    const run = design.runs.create({
      projectId,
      conversationId,
      assistantMessageId,
      clientRequestId: `orbit-${trigger}-${randomUUID()}`,
      agentId,
      mediaExecution: defaultMediaExecutionPolicy(),
    });
    upsertMessage(db, conversationId, {
      id: `orbit-user-${run.id}`,
      role: 'user',
      content: prompt,
    });
    upsertMessage(db, conversationId, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      agentId,
      agentName: getAgentDef(agentId)?.name ?? agentId,
      runId: run.id,
      runStatus: 'queued',
      startedAt: now,
    });

    if (template?.dir) {
      const cwd = await ensureProject(PROJECTS_DIR, projectId);
      const result = await stageActiveSkill(
        cwd,
        skillCwdAliasSegment(template.dir),
        template.dir,
        (msg) => console.warn(msg),
      );
      if (!result.staged) {
        console.warn(
          `[od] orbit template skill-stage skipped: ${result.reason ?? 'unknown reason'}; falling back to prompt-embedded instructions`,
        );
      }
    }

    const modelPrefs = appConfig.agentModels?.[agentId] ?? {};
    design.runs.start(run, () => startChatRun({
      agentId,
      projectId,
      conversationId: run.conversationId,
      assistantMessageId: run.assistantMessageId,
      clientRequestId: run.clientRequestId,
      skillId: 'live-artifact',
      designSystemId: orbitDesignSystemId,
      model: modelPrefs.model ?? null,
      reasoning: modelPrefs.reasoning ?? null,
      message: prompt,
      systemPrompt: [
        renderOrbitTemplateSystemPrompt(template),
        systemPrompt,
        'You are Orbit, an autonomous activity-summary agent inside Open Design.',
        'You must discover connectors and connector tools yourself through the OD CLI; the daemon has not chosen tools for you.',
        'You must create and register a Live Artifact as the final deliverable. Do not merely describe what you would do.',
        'Do not ask follow-up questions, do not emit <question-form>, and do not wait for user input. This run is unattended; pick reasonable defaults and complete the artifact.',
        'Keep connector credentials and OD_TOOL_TOKEN private; never print or persist secrets.',
      ].join('\n'),
    }, run));

    const completion = (async () => {
      const finalStatus = await design.runs.wait(run);
      db.prepare(
        `UPDATE messages SET run_status = ?, ended_at = ? WHERE id = ?`,
      ).run(finalStatus.status, Date.now(), assistantMessageId);
      const artifacts = await listLiveArtifacts({ projectsRoot: PROJECTS_DIR, projectId });
      const artifact = artifacts.find((candidate) => candidate.createdByRunId === run.id);
      const status = finalStatus.status === 'succeeded' && !artifact ? 'failed' : finalStatus.status;
      return {
        agentRunId: run.id,
        status,
        ...(artifact?.id ? { artifactId: artifact.id, artifactProjectId: projectId } : {}),
        summary: artifact?.id
          ? `Agent ${finalStatus.status} and registered live artifact ${artifact.title}.`
          : finalStatus.status === 'succeeded'
            ? buildOrbitNoLiveArtifactSummary(run.events)
            : `Agent ${finalStatus.status} but did not register a live artifact for this Orbit run.`,
      };
    })();

    return { projectId, agentRunId: run.id, completion };
  });

  orbitService.setTemplateResolver(async (skillId) => {
    // Orbit templates (live-artifact, etc.) live under design-templates after
    // the split, but earlier projects may still point at functional-skill
    // ids for the same purpose — search both roots so a stored project id
    // keeps resolving through one or the other.
    const skills = await listAllSkillLikeEntries();
    const skill = findSkillById(skills, skillId);
    if (!skill || skill.scenario !== 'orbit') return null;
    return {
      id: skill.id,
      name: skill.name,
      examplePrompt: skill.examplePrompt,
      dir: skill.dir,
      body: skill.body,
      designSystemRequired: skill.designSystemRequired !== false,
    };
  });

  registerRunRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: { PROJECTS_DIR, RUNTIME_DATA_DIR },
    agents: { detectAgents, getAgentDef },
    chat: { startChatRun },
    lifecycle: { isDaemonShuttingDown: () => daemonRuntimeState.daemonShuttingDown },
    plugins: {
      connectorService,
      detectSkillPluginCandidateOnRunSuccess,
      firePipelineForRun,
      loadPluginRegistryView,
      renderPluginBriefTemplate,
    },
    telemetry: {
      reportRunCompletionTelemetryFallback,
      resolveRunProjectKindForAnalytics,
      runArtifactBaselines,
      runRetryEventsForAnalytics,
    },
    messages: {
      pinAssistantMessageOnRunCreate,
      reconcileAssistantMessageOnRunEnd,
    },
  });

  // Each routine fire resolves an agent, prepares project/conversation state,
  // and dispatches into the same chat runner used by manual runs.
  routineService.setRunHandler(async ({ routine, trigger, startedAt, runId }) => {
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    let agentId = routine.agentId
      || (typeof appConfig.agentId === 'string' && appConfig.agentId ? appConfig.agentId : null);
    if (!agentId) {
      const agents = await detectAgents(appConfig.agentCliEnv ?? {}).catch(() => []);
      agentId = agents.find((agent) => agent.available)?.id ?? null;
    }
    if (!agentId) {
      throw new Error('No available agent is configured. Choose an agent in Settings first.');
    }

    const now = startedAt;
    const routineContext = normalizeRunContextSelection(routine.context);
    const routineSkillId = routine.skillId ?? routineContext.skillIds?.[0] ?? null;
    const contextMetadata = {
      ...(routineContext.pluginIds?.length
        ? {
            contextPlugins: routineContext.pluginIds.map((id) => {
              const plugin = getInstalledPlugin(db, id);
              return {
                id,
                title: plugin?.title ?? id,
                ...(plugin?.manifest?.description ? { description: plugin.manifest.description } : {}),
              };
            }),
          }
        : {}),
      ...(routineContext.mcpServerIds?.length
        ? { contextMcpServers: routineContext.mcpServerIds.map((id) => ({ id })) }
        : {}),
      ...(routineContext.connectorIds?.length
        ? { contextConnectors: routineContext.connectorIds.map((id) => ({ id, name: id })) }
        : {}),
    };
    const stamp = formatLocalProjectTimestamp(new Date(now).toISOString());
    let projectId;
    let projectName;
    const scheduledPlaceholderProjectId = `routine-pending-project-${runId}`;
    const scheduledPlaceholderConversationId = `routine-pending-conv-${runId}`;
    let createdProjectId: string | null = null;
    let createdConversationId: string | null = null;
    let previousProjectSnapshotId: string | null = null;
    const createRoutineProject = () => {
      if (createdProjectId) return;
      projectId = `routine-${randomUUID()}`;
      projectName = `${routine.name} · ${stamp}`;
      insertProject(db, {
        id: projectId,
        name: projectName,
        skillId: routineSkillId,
        designSystemId: appConfig.designSystemId ?? null,
        pendingPrompt: null,
        metadata: {
          kind: 'other',
          intent: 'automation',
          automationId: routine.id,
          routineId: routine.id,
          trigger,
          ...contextMetadata,
        },
        createdAt: now,
        updatedAt: now,
      });
      createdProjectId = projectId;
    };
    if (routine.target.mode === 'reuse') {
      const project = getProject(db, routine.target.projectId);
      if (!project) throw new Error(`Routine target project ${routine.target.projectId} not found`);
      assertSandboxProjectRootAvailable(project.metadata);
      projectId = project.id;
      projectName = project.name;
      previousProjectSnapshotId = project.appliedPluginSnapshotId ?? null;
    }

    let conversationId = `routine-conv-${randomUUID()}`;
    let conversationCreatedEvent: ProjectConversationCreatedSsePayload | null = null;
    const routineConversationTitle = () => routine.target.mode === 'reuse'
      ? `${routine.name} · ${stamp}`
      : projectName;
    const createRoutineConversation = () => {
      if (createdConversationId) return;
      if (!projectId) createRoutineProject();
      if (!projectId) throw new Error('Routine project could not be prepared');
      conversationId = `routine-conv-${randomUUID()}`;
      insertConversation(db, {
        id: conversationId,
        projectId,
        title: routineConversationTitle(),
        createdAt: now,
        updatedAt: now,
      });
      createdConversationId = conversationId;
      conversationCreatedEvent = {
        type: 'conversation-created',
        projectId,
        conversationId,
        title: routineConversationTitle(),
        createdAt: now,
      };
    };

    const assistantMessageId = `routine-assistant-${randomUUID()}`;
    let resolvedRoutineSnapshot = null;
    // Tracks any snapshot id that `resolvePluginSnapshot()` already pinned
    // to the reused project before the resolver threw on a later linking
    // step. `finalizeOk()` performs `linkSnapshotToProject()` BEFORE
    // `linkSnapshotToConversation()` / `linkSnapshotToRun()`, so a failure
    // mid-resolve can leave `projects.applied_plugin_snapshot_id` repointed
    // at a snapshot the routine never durably claimed. The rollback path in
    // `discard()` falls back to this id when `resolvedRoutineSnapshot` is
    // still null so the reused project pin is restored either way.
    let partiallyAppliedSnapshotId: string | null = null;
    const primaryPluginId = routineContext.pluginIds?.[0] ?? null;
    const resolveRoutinePluginSnapshot = async () => {
      if (!primaryPluginId || resolvedRoutineSnapshot) return;
      const registry = await loadPluginRegistryView();
      const projectSnapshotBefore = routine.target.mode === 'reuse'
        ? getProject(db, routine.target.projectId)?.appliedPluginSnapshotId ?? null
        : null;
      let resolved;
      try {
        resolved = resolvePluginSnapshot({
          db,
          body: {
            pluginId: primaryPluginId,
            pluginInputs: { prompt: routine.prompt },
          },
          projectId,
          conversationId,
          registry,
          activeProjectDesignSystem:
            typeof appConfig.designSystemId === 'string' && appConfig.designSystemId.length > 0
              ? { id: appConfig.designSystemId }
              : undefined,
        });
      } catch (resolverError) {
        // `resolvePluginSnapshot()` may have already updated the reused
        // project's pin via `linkSnapshotToProject()` before throwing on
        // `linkSnapshotToConversation()` (or `linkSnapshotToRun()`). Capture
        // whatever pin it left behind so `discard()` can roll it back even
        // though `resolvedRoutineSnapshot` will stay null.
        if (routine.target.mode === 'reuse') {
          const after = getProject(db, routine.target.projectId)?.appliedPluginSnapshotId ?? null;
          if (after && after !== projectSnapshotBefore) {
            partiallyAppliedSnapshotId = after;
          }
        }
        throw resolverError;
      }
      if (resolved && !resolved.ok) {
        // Non-throwing resolver failures cannot have called `finalizeOk()`,
        // so the project pin is still the previous one — nothing to roll
        // back beyond the loser cleanup the caller will perform.
        throw new Error(`Automation plugin ${primaryPluginId} could not be applied: ${JSON.stringify(resolved.body)}`);
      }
      resolvedRoutineSnapshot = resolved;
    };
    const run = design.runs.create({
      projectId: projectId ?? scheduledPlaceholderProjectId,
      conversationId: createdConversationId ? conversationId : scheduledPlaceholderConversationId,
      assistantMessageId,
      clientRequestId: `routine-${trigger}-${randomUUID()}`,
      agentId,
      mediaExecution: defaultMediaExecutionPolicy(),
      ...(resolvedRoutineSnapshot?.ok
        ? {
            appliedPluginSnapshotId: resolvedRoutineSnapshot.snapshotId,
            pluginId: resolvedRoutineSnapshot.snapshot.pluginId,
          }
        : {}),
    });
    const persistPreparedRun = async (routineRun = null) => {
      if (!projectId) {
        createRoutineProject();
      }
      if (projectId) {
        run.projectId = projectId;
        if (routineRun) {
          routineRun.projectId = projectId;
        }
      }
      createRoutineConversation();
      run.conversationId = conversationId;
      if (routineRun) {
        routineRun.conversationId = conversationId;
        routineRun.agentRunId = run.id;
      }
      await resolveRoutinePluginSnapshot();
      if (resolvedRoutineSnapshot?.ok) {
        run.appliedPluginSnapshotId = resolvedRoutineSnapshot.snapshotId;
        run.pluginId = resolvedRoutineSnapshot.snapshot.pluginId;
        const { linkSnapshotToRun } = await import('./plugins/snapshots.js');
        linkSnapshotToRun(db, resolvedRoutineSnapshot.snapshotId, run.id);
      }
      upsertMessage(db, conversationId, {
        id: `routine-user-${run.id}`,
        role: 'user',
        content: routine.prompt,
      });
      upsertMessage(db, conversationId, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        agentId,
        agentName: getAgentDef(agentId)?.name ?? agentId,
        runId: run.id,
        runStatus: 'queued',
        startedAt: now,
      });
    };

    const modelPrefs = appConfig.agentModels?.[agentId] ?? {};
    const start = () => {
      // Notify any open `ProjectView` only after the routine run row has
      // been accepted and preparation has completed, so failed setup does not
      // surface phantom conversations (#1361).
      if (conversationCreatedEvent) emitProjectEvent(projectId, conversationCreatedEvent);
      design.runs.start(run, () => startChatRun({
        agentId,
        projectId,
        conversationId: run.conversationId,
        assistantMessageId: run.assistantMessageId,
        clientRequestId: run.clientRequestId,
        skillId: routineSkillId,
        designSystemId: appConfig.designSystemId ?? null,
        context: routineContext,
        model: modelPrefs.model ?? null,
        reasoning: modelPrefs.reasoning ?? null,
        message: routine.prompt,
        systemPrompt: [
          `You are running an unattended scheduled routine named "${routine.name}".`,
          'Do not ask follow-up questions, do not emit <question-form>, and do not wait for user input. Pick reasonable defaults and finish the task.',
        ].join('\n'),
      }, run));
    };

    // Tear-down for the case where the durable routine_run row was never
    // inserted (sibling daemon won the slot, or insertRun threw). The
    // in-memory chat run was created speculatively above, but the deferred
    // `persistPreparedRun()` has not run yet — so no project / conversation
    // / snapshot writes have to be rolled back. Dropping the run keeps it
    // off `/api/runs` instead of leaving a phantom canceled entry there.
    const discardUnstarted = () => {
      design.runs.drop(run);
    };

    const discard = () => {
      if (typeof run.projectId === 'string' && run.projectId.startsWith('routine-pending-')) {
        run.projectId = null;
      }
      if (typeof run.conversationId === 'string' && run.conversationId.startsWith('routine-pending-')) {
        run.conversationId = null;
      }
      design.runs.finish(run, 'canceled');
      if (routine.target.mode === 'reuse') {
        // Prefer the fully-resolved snapshot id; fall back to whatever id
        // `resolvePluginSnapshot()` left pinned on the project if it threw
        // partway through linking — see the comment on
        // `partiallyAppliedSnapshotId` above.
        const snapshotIdToDiscard =
          resolvedRoutineSnapshot?.ok
            ? resolvedRoutineSnapshot.snapshotId
            : partiallyAppliedSnapshotId;
        if (snapshotIdToDiscard) {
          restoreProjectSnapshotLink(
            db,
            projectId,
            snapshotIdToDiscard,
            previousProjectSnapshotId,
            run.id,
          );
        }
      }
      if (createdConversationId) {
        deleteConversation(db, createdConversationId);
      }
      if (createdProjectId) {
        dbDeleteProject(db, createdProjectId);
      }
    };

    const completion = (async () => {
      const finalStatus = await design.runs.wait(run);
      const failureError = finalStatus.status === 'failed'
        ? (typeof finalStatus.error === 'string' && finalStatus.error.trim() ? finalStatus.error.trim() : null)
        : null;
      const failureErrorCode = finalStatus.status === 'failed'
        ? (typeof finalStatus.errorCode === 'string' && finalStatus.errorCode.trim() ? finalStatus.errorCode.trim() : null)
        : null;
      if (failureError) {
        appendMessageStatusEvent(db, assistantMessageId, {
          label: 'error',
          detail: failureError,
        });
      }
      db.prepare(`UPDATE messages SET run_status = ?, ended_at = ? WHERE id = ?`)
        .run(finalStatus.status, Date.now(), assistantMessageId);
      let evolutionSummary = '';
      if (finalStatus.status === 'succeeded' && routineContext.connectorIds?.length) {
        try {
          const evolution = await ingestRoutineConnectorEvolution(RUNTIME_DATA_DIR, {
            routine,
            runId,
            trigger,
            status: finalStatus.status,
            projectId,
            conversationId,
            agentRunId: run.id,
            summary: `Routine "${routine.name}" ${finalStatus.status}.`,
            connectorIds: routineContext.connectorIds,
            messages: listMessages(db, conversationId),
          });
          if (evolution?.proposals?.length) {
            evolutionSummary = ` Created ${evolution.proposals.length} self-evolution proposal(s) from connector context.`;
          }
        } catch (error) {
          evolutionSummary = ` Connector self-evolution ingestion failed: ${error instanceof Error ? error.message : String(error)}.`;
        }
      }
      return {
        status: finalStatus.status,
        summary: failureError
          ? `Routine "${routine.name}" failed: ${failureError}`
          : `Routine "${routine.name}" ${finalStatus.status}.${evolutionSummary}`,
        error: failureError ?? undefined,
        errorCode: failureErrorCode ?? undefined,
      };
    })();

    return {
      projectId: run.projectId,
      conversationId: run.conversationId,
      agentRunId: run.id,
      completion,
      prepare: persistPreparedRun,
      start,
      discard,
      discardUnstarted,
    };
  });
  routineService.start();

  assertServerContextSatisfiesRoutes({
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    ids: idDeps,
    uploads: uploadDeps,
    node: nodeDeps,
    projectStore: projectStoreDeps,
    projectFiles: projectFileDeps,
    conversations: conversationDeps,
    templates: templateDeps,
    status: projectStatusDeps,
    events: projectEventDeps,
    imports: importDeps,
    exports: projectExportDeps,
    artifacts: artifactDeps,
    documents: { buildDocumentPreview },
    auth: authDeps,
    liveArtifacts: liveArtifactDeps,
    deploy: deployDeps,
    media: mediaDeps,
    appConfig: appConfigDeps,
    orbit: orbitDeps,
    nativeDialogs: nativeDialogDeps,
    research: researchDeps,
    mcp: { pendingAuth: mcpPendingAuth, daemonUrlRef },
    plugins: {
      connectorService,
      detectSkillPluginCandidateOnRunSuccess,
      firePipelineForRun,
      loadPluginRegistryView,
      renderPluginBriefTemplate,
    },
    resources: {
      listAllSkills,
      listAllDesignTemplates,
      listAllSkillLikeEntries,
      listAllDesignSystems,
      mimeFor,
    },
    routines: { routineService },
    projectPreviewScopes,
    validation: validationDeps,
    finalize: finalizeDeps,
    handoff: handoffDeps,
    chat: { startChatRun },
    messages: {
      pinAssistantMessageOnRunCreate,
      reconcileAssistantMessageOnRunEnd,
    },
    agents: agentDeps,
    critique: critiqueDeps,
    openDesignPublicMetadata,
    lifecycle: { isDaemonShuttingDown: () => daemonRuntimeState.daemonShuttingDown },
  });

  registerRoutineRoutes(app, {
    db,
    paths: { RUNTIME_DATA_DIR },
    routines: { routineService },
  });

  // proxy routes (anthropic / openai / azure / google / ollama) live
  // in chat-routes.ts now — garnet had a partial duplicate here that
  // referenced helpers (rejectPluginInProxyBody, extractGeminiText, …)
  // dropped during the reconcile merge. Deleted to fix the BYOK crash.
  // Restore the plugin-runs-must-go-through-daemon gate by adding it
  // to chat-routes.ts if needed.

  registerChatRoutes(app, {
    db,
    design,
    http: httpDeps,
    paths: pathDeps,
    chat: { startChatRun },
    agents: agentDeps,
    critique: critiqueDeps,
    validation: validationDeps,
    lifecycle: { isDaemonShuttingDown: () => daemonRuntimeState.daemonShuttingDown },
    telemetry: { reportFinalizedMessage, reportFeedback },
  });

  registerStaticSpaFallback(app, STATIC_DIR);

  // Wait for `listen` to bind so callers always see the resolved URL —
  // critical when port=0 (ephemeral port) and when the embedding sidecar
  // needs to advertise the port to a parent process before any request
  // can flow. Three callers depend on this contract:
  //   - `apps/daemon/src/cli.ts`            → expects `{ url, server, shutdown }`
  //   - `apps/daemon/sidecar/server.ts`     → expects `{ url, server }`
  //   - `apps/daemon/tests/version-route.test.ts` → expects `{ url, server }`
  return await startDaemonListener({
    app,
    host,
    port,
    returnServer,
    state: daemonRuntimeState,
    design,
    terminalService,
    orbitService,
    routineService,
  });
}

// randomId + sanitizeSlug were extracted to ./identifiers.ts (strangler-fig
// slice). server.ts imports them back to keep threading them into the ctx
// deps bundles (ctx.ids etc.) that route modules consume.