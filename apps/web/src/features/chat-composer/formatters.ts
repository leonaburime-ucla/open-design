// Pure formatters for the chat-composer slice: label/badge/icon rendering,
// workspace-context descriptors, and the design-toolbox prompt builders. No
// React, transport, or DOM — every function takes its data (and, where copy is
// localized, a bound `t`) as arguments, so they test against `contracts` and the
// i18n content helpers with zero doubles.
import type {
  InstalledPluginRecord,
  LibraryAsset,
  LibraryElementMeta,
  WorkspaceContextItem,
} from '@open-design/contracts';
import type { ProjectFile, SkillSummary } from '../../types';
import type { IconName } from '../../components/Icon';
import { assetTitle } from '../../components/LibraryAssetMeta';
import type {
  DesignToolboxResourceIndex,
  DesignToolboxResourceKind,
  TranslateFn,
} from './types';
import type { DesignToolboxAction } from '../../runtime/design-toolbox';
import type { DesignToolboxResource } from './types';
import { MAX_ELEMENT_HTML_CHARS } from './constants';

/**
 * Render a captured element's markup as a composer-input block: a one-line
 * descriptor (selector + rendered size) followed by a fenced HTML code block.
 * Used when an element-pick library asset is pulled into the chat so the user
 * sees — and can edit — the element's HTML inline before sending.
 */
export function formatElementHtmlBlock(
  asset: LibraryAsset,
  element: LibraryElementMeta,
  html: string,
): string {
  const descriptor = element.selector || element.tag || assetTitle(asset);
  const size = element.width && element.height ? ` · ${element.width}×${element.height}` : '';
  const trimmed = html.trim();
  const body =
    trimmed.length > MAX_ELEMENT_HTML_CHARS
      ? `${trimmed.slice(0, MAX_ELEMENT_HTML_CHARS)}\n<!-- …truncated -->`
      : trimmed;
  return `Captured element ${descriptor}${size}\n\n\`\`\`html\n${body}\n\`\`\``;
}

export function workspaceContextIcon(item: WorkspaceContextItem): IconName {
  if (item.kind === 'browser') return 'globe';
  if (item.kind === 'folder' || item.kind === 'design-files') return 'folder';
  if (item.kind === 'project') return 'folder';
  if (item.kind === 'local-code') return 'terminal';
  if (item.kind === 'terminal') return 'terminal';
  if (item.kind === 'side-chat') return 'comment';
  if (item.kind === 'design-system') return 'blocks';
  return 'file';
}

export function workspaceContextTitle(item: WorkspaceContextItem): string {
  return [
    workspaceContextKindLabel(item.kind),
    item.path ? `path: ${item.path}` : null,
    item.absolutePath ? `absolute: ${item.absolutePath}` : null,
    item.url ? `url: ${item.url}` : null,
    item.title ? `title: ${item.title}` : null,
  ].filter(Boolean).join(' | ');
}

export function workspaceContextDescription(item: WorkspaceContextItem): string {
  if (item.kind === 'design-files') return item.path || 'Project files';
  if (item.kind === 'project') return item.absolutePath || item.path || item.title || item.id;
  if (item.kind === 'local-code') return item.absolutePath || item.path || item.title || item.id;
  if (item.kind === 'terminal') return item.title || 'Terminal session';
  return item.url || item.path || item.absolutePath || item.title || item.tabId || item.id;
}

export function lastPathSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || path;
}

export function projectFileMentionTitle(file: ProjectFile, fallback: string): string {
  return file.name || lastPathSegment(fallback);
}

export function projectFileMentionDescription(file: ProjectFile, fallback: string): string {
  const label = projectFileMentionTitle(file, fallback);
  if (fallback && fallback !== label) return fallback;
  return [file.kind, file.mime].filter(Boolean).join(' · ');
}

export function workspaceContextSearchText(item: WorkspaceContextItem): string {
  return [
    item.id,
    item.kind,
    item.label,
    item.tabId ?? '',
    item.path ?? '',
    item.absolutePath ?? '',
    item.url ?? '',
    item.title ?? '',
  ].join(' ');
}

export function workspaceContextKindLabel(kind: WorkspaceContextItem['kind']): string {
  switch (kind) {
    case 'browser':
      return 'Browser';
    case 'design-files':
      return 'Design files';
    case 'design-system':
      return 'Design system';
    case 'folder':
      return 'Folder';
    case 'project':
      return 'Project';
    case 'local-code':
      return 'Local code';
    case 'terminal':
      return 'Terminal';
    case 'side-chat':
      return 'Side chat';
    case 'live-artifact':
      return 'Live artifact';
    case 'file':
    default:
      return 'File';
  }
}

export function designToolboxResourceKindLabel(
  kind: DesignToolboxResourceKind,
  t: TranslateFn,
): string {
  switch (kind) {
    case 'skill':
      return t('chat.designToolbox.kind.skill');
    case 'plugin':
      return t('chat.designToolbox.kind.plugin');
    case 'mcp':
      return t('chat.designToolbox.kind.mcp');
    case 'mcp-template':
      return t('chat.designToolbox.kind.mcpTemplate');
    case 'connector':
      return t('chat.designToolbox.kind.connector');
    case 'file':
      return t('chat.designToolbox.kind.designFile');
  }
}

export function designToolboxSkillBadge(skill: SkillSummary, t: TranslateFn): string {
  if (skill.mode === 'video' || skill.category === 'video-generation') return t('chat.designToolbox.badge.video');
  if (skill.mode === 'image' || skill.category === 'image-generation') return t('chat.designToolbox.badge.image');
  if (skill.category === 'animation-motion') return t('chat.designToolbox.badge.motion');
  if (skill.category === 'creative-direction') return t('chat.designToolbox.badge.polish');
  return skill.mode;
}

export function designToolboxSkillIcon(skill: SkillSummary): IconName {
  if (skill.mode === 'video' || skill.category === 'video-generation') return 'play';
  if (skill.mode === 'image' || skill.category === 'image-generation') return 'image';
  if (skill.category === 'animation-motion') return 'sliders';
  if (skill.category === 'creative-direction') return 'sparkles';
  return 'file';
}

export function designToolboxContextLine(
  workspaceItem: WorkspaceContextItem | null,
  t: TranslateFn,
): string {
  if (!workspaceItem) {
    return t('chat.designToolbox.prompt.contextGeneric');
  }
  const label = workspaceItem.label || workspaceItem.path || workspaceItem.title || workspaceItem.id;
  return t('chat.designToolbox.prompt.contextSpecific', {
    kind: designToolboxWorkspaceKindLabel(workspaceItem.kind, t),
    label,
  });
}

export function designToolboxDraftLine(activeDraft: string, t: TranslateFn): string {
  const trimmed = activeDraft.trim();
  if (!trimmed) return '';
  return t('chat.designToolbox.prompt.preserveDraft', { draft: trimmed });
}

export function designToolboxWorkspaceKindLabel(
  kind: WorkspaceContextItem['kind'],
  t: TranslateFn,
): string {
  switch (kind) {
    case 'browser':
      return t('chat.designToolbox.context.browser');
    case 'design-files':
      return t('chat.designToolbox.context.designFiles');
    case 'design-system':
      return t('chat.designToolbox.context.designSystem');
    case 'folder':
    case 'project':
    case 'local-code':
      return t('chat.designToolbox.context.folder');
    case 'terminal':
      return t('chat.designToolbox.context.terminal');
    case 'side-chat':
      return t('chat.designToolbox.context.sideChat');
    case 'live-artifact':
      return t('chat.designToolbox.context.liveArtifact');
    case 'file':
    default:
      return t('chat.designToolbox.context.file');
  }
}

export function designToolboxActionPrompt({
  action,
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  action: DesignToolboxAction;
  skill: SkillSummary | null;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  const skillLine = skill
    ? t('chat.designToolbox.prompt.selectedSkill', { skill: skill.name })
    : t('chat.designToolbox.prompt.noSkill');
  const resourceLines = designToolboxResourceIndexLines(resourceIndex, t);
  const draftLine = designToolboxDraftLine(activeDraft, t);
  const base = [
    designToolboxContextLine(workspaceItem, t),
    skillLine,
    ...resourceLines,
    draftLine,
  ].filter(Boolean);

  switch (action.id) {
    case 'auto-match':
      return [
        ...base,
        t('chat.designToolbox.prompt.autoMatchIntro'),
        t('chat.designToolbox.prompt.autoMatchStep1'),
        t('chat.designToolbox.prompt.autoMatchStep2'),
        t('chat.designToolbox.prompt.autoMatchStep3'),
        t('chat.designToolbox.prompt.autoMatchStep4'),
      ].join('\n');
    case 'asset-search':
      return [
        ...base,
        t('chat.designToolbox.prompt.assetSearch'),
      ].join('\n');
    case 'icon-workflow':
      return [
        ...base,
        t('chat.designToolbox.prompt.iconWorkflow'),
      ].join('\n');
    case 'image-replace':
      return [
        ...base,
        t('chat.designToolbox.prompt.imageReplace'),
      ].join('\n');
    case 'reference-extract':
      return [
        ...base,
        t('chat.designToolbox.prompt.referenceExtract'),
      ].join('\n');
    case 'motion':
      return [
        ...base,
        t('chat.designToolbox.prompt.motion'),
      ].join('\n');
    case 'motion-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.motionPolish'),
      ].join('\n');
    case 'transition-motion':
      return [
        ...base,
        t('chat.designToolbox.prompt.transitionMotion'),
      ].join('\n');
    case 'plan-outline':
      return [
        ...base,
        t('chat.designToolbox.prompt.planOutline'),
      ].join('\n');
    case 'threejs-scene':
      return [
        ...base,
        t('chat.designToolbox.prompt.threejsScene'),
      ].join('\n');
    case 'anti-ai-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.antiAiPolish'),
      ].join('\n');
    case 'visual-polish':
      return [
        ...base,
        t('chat.designToolbox.prompt.visualPolish'),
      ].join('\n');
    case 'image-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.imageGen'),
      ].join('\n');
    case 'chart-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.chartGen'),
      ].join('\n');
    case 'logo-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.logoGen'),
      ].join('\n');
    case 'video-gen':
      return [
        ...base,
        t('chat.designToolbox.prompt.videoGen'),
      ].join('\n');
  }

  return [
    ...base,
    t('chat.designToolbox.prompt.autoMatchIntro'),
  ].join('\n');
}

export function designToolboxSkillPrompt({
  skill,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  skill: SkillSummary;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  return [
    designToolboxContextLine(workspaceItem, t),
    t('chat.designToolbox.prompt.useSkill', { skill: skill.name }),
    ...designToolboxResourceIndexLines(resourceIndex, t),
    designToolboxDraftLine(activeDraft, t),
    t('chat.designToolbox.prompt.skillInstruction'),
  ].filter(Boolean).join('\n');
}

export function designToolboxResourcePrompt({
  resource,
  workspaceItem,
  activeDraft,
  resourceIndex,
  t,
}: {
  resource: Exclude<DesignToolboxResource, { kind: 'skill' }>;
  workspaceItem: WorkspaceContextItem | null;
  activeDraft: string;
  resourceIndex: DesignToolboxResourceIndex;
  t: TranslateFn;
}): string {
  const base = [
    designToolboxContextLine(workspaceItem, t),
    t('chat.designToolbox.prompt.selectedResource', {
      kind: designToolboxResourceKindLabel(resource.kind, t),
      title: resource.title,
      id: resource.id,
    }),
    resource.subtitle ? t('chat.designToolbox.prompt.resourceDescription', { description: resource.subtitle }) : '',
    ...designToolboxResourceIndexLines(resourceIndex, t),
    designToolboxDraftLine(activeDraft, t),
  ].filter(Boolean);

  switch (resource.kind) {
    case 'plugin':
      return [
        ...base,
        t('chat.designToolbox.prompt.pluginResource'),
      ].join('\n');
    case 'mcp':
      return [
        ...base,
        t('chat.designToolbox.prompt.mcpResource'),
      ].join('\n');
    case 'mcp-template':
      return [
        ...base,
        t('chat.designToolbox.prompt.mcpTemplateResource'),
      ].join('\n');
    case 'connector':
      return [
        ...base,
        t('chat.designToolbox.prompt.connectorResource'),
      ].join('\n');
    case 'file':
      return [
        ...base,
        t('chat.designToolbox.prompt.fileResource'),
      ].join('\n');
  }
}

export function designToolboxResourceIndexLines(
  index: DesignToolboxResourceIndex,
  t: TranslateFn,
): string[] {
  const files = index.projectFiles
    .filter((file) => file.type !== 'dir')
    .map((file) => file.path ?? file.name);
  return [
    t('chat.designToolbox.prompt.resourceIndex', {
      skills: index.skills.length,
      plugins: index.plugins.length,
      mcpEnabled: index.mcpServers.length,
      mcpTemplates: index.mcpTemplates.length,
      connectors: index.connectors.length,
      files: files.length,
    }),
    designToolboxCompactLine(t('chat.designToolbox.prompt.searchableSkills'), index.skills.map((skill) => skill.name), 60, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.searchablePlugins'), index.plugins.map((plugin) => plugin.title), 40, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.availableMcp'), [
      ...index.mcpServers.map((server) => server.label || server.id),
      ...index.mcpTemplates.map((template) => t('chat.designToolbox.prompt.mcpTemplateName', { name: template.label })),
    ], 40, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.connectedConnectors'), index.connectors.map((connector) => connector.name), 30, t),
    designToolboxCompactLine(t('chat.designToolbox.prompt.referenceDesignFiles'), files, 40, t),
    t('chat.designToolbox.prompt.processRule'),
  ].filter(Boolean);
}

export function designToolboxCompactLine(
  label: string,
  values: string[],
  limit: number,
  t: TranslateFn,
): string {
  const clean = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (clean.length === 0) return '';
  const shown = clean.slice(0, limit);
  const suffix = clean.length > shown.length
    ? t('chat.designToolbox.prompt.moreSuffix', { count: clean.length - shown.length })
    : '';
  return t('chat.designToolbox.prompt.compactLine', {
    label,
    values: shown.join(', '),
    suffix,
  });
}

export function pluginSourceLabel(plugin: InstalledPluginRecord, t: TranslateFn): string {
  return plugin.sourceKind === 'bundled' ? t('chat.mentionPluginOfficial') : t('chat.mentionPluginMine');
}

export function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
