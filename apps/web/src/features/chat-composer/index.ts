// Public API of the chat-composer slice. The ChatComposer orchestrator (which
// lives outside the slice) imports ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the slice boundary, and
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import that
// reaches past it (ADR 0002).

// UI-only view models and the public imperative-handle contract.
export type {
  ChatComposerDraftOptions,
  ChatComposerHandle,
  ChatSendMeta,
  DesignToolboxResource,
  DesignToolboxResourceBase,
  DesignToolboxResourceIndex,
  DesignToolboxResourceKind,
  MentionTab,
  SlashCommand,
  ToolsTab,
  TrackedWorkspaceLinkedDir,
  TranslateFn,
} from './types';

// Constants.
export { MAX_ELEMENT_HTML_CHARS, USER_PLUGIN_SOURCE_KINDS } from './constants';

// Pure rules.
export {
  assignChatAttachmentOrders,
  buildComposerMentionEntities,
  buildDesignToolboxResources,
  dedupeWorkspaceContextItems,
  designToolboxDefaultResources,
  designToolboxDefaultSkills,
  designToolboxResourceIsActive,
  designToolboxResourceMatchesQuery,
  escapeRegExp,
  isDesignToolboxSkill,
  isFiniteAttachmentOrder,
  looksLikeImage,
  mcpServerMatchesQuery,
  mcpTemplateMatchesQuery,
  nextChatAttachmentOrder,
  normalizeChatAttachmentOrders,
  pluginMatchesQuery,
  skillMentionRank,
  sortChatAttachmentsByOrder,
  sortChatCommentAttachmentsByOrder,
  stripInlineMentionLabels,
  stripInlineMentionToken,
  trackedWorkspaceLinkedDirsForContexts,
} from './rules';

// Pure formatters.
export {
  designToolboxActionPrompt,
  designToolboxCompactLine,
  designToolboxContextLine,
  designToolboxDraftLine,
  designToolboxResourceIndexLines,
  designToolboxResourceKindLabel,
  designToolboxResourcePrompt,
  designToolboxSkillBadge,
  designToolboxSkillIcon,
  designToolboxSkillPrompt,
  designToolboxWorkspaceKindLabel,
  formatElementHtmlBlock,
  lastPathSegment,
  pluginSourceLabel,
  prettySize,
  projectFileMentionDescription,
  projectFileMentionTitle,
  workspaceContextDescription,
  workspaceContextIcon,
  workspaceContextKindLabel,
  workspaceContextSearchText,
  workspaceContextTitle,
} from './formatters';

// Feature-local hook (with its controller type) the orchestrator wires.
export {
  useWiredComposerDraft,
  type ComposerDraftController,
  type ComposerDraftOptions,
} from './hooks/useComposerDraft.hooks';

// Dumb components the orchestrator composes.
export { DesignToolboxPanel } from './components/DesignToolboxPanel';
export { MentionPopover } from './components/MentionPopover';
export { SlashPopover } from './components/SlashPopover';
export { StagedCommentAttachments } from './components/StagedCommentAttachments';
export { StagedRunContexts } from './components/StagedRunContexts';
export { ToolsImportPanel } from './components/ToolsImportPanel';
export { ToolsMcpPanel } from './components/ToolsMcpPanel';
export { ToolsPluginsPanel } from './components/ToolsPluginsPanel';
export { ToolsSkillsPanel } from './components/ToolsSkillsPanel';
