/** @module prompt/index
 * Public surface for chat prompt construction: live-instruction prompt assembly,
 * project/design-file attachment hints, Codex image-generation prompt overrides,
 * stable-prompt-cache diagnostics, prompt-file staging on disk, and CLI
 * argv/command-line budget checks per shell target. Depends only on `core/`.
 */
export type { DesignSystemSelectionSource, StablePromptCacheMissReason } from './chat-prompt-inputs.js';
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
} from './chat-prompt-inputs.js';
export {
  checkPromptArgvBudget,
  checkWindowsCmdShimCommandLineBudget,
  checkWindowsDirectExeCommandLineBudget,
} from './prompt-budget.js';
export type { PreparedPromptFile } from './prompt-file.js';
export { preparePromptFileForAgent } from './prompt-file.js';
