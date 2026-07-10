// Pure rules for the chat-composer slice: workspace-context de-duplication and
// linked-dir tracking, the @-mention entity index, chat-attachment ordering, the
// design-toolbox resource index/matching/defaults, and the mention-token
// stripping helpers. No React, transport, or DOM — they transform `contracts`
// (and slice) data and test with zero doubles.
import type {
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  McpTemplate,
  WorkspaceContextItem,
} from '@open-design/contracts';
import type { ChatAttachment, ChatCommentAttachment, ProjectFile, SkillSummary } from '../../types';
import type { Locale } from '../../i18n/types';
import {
  inlineMentionToken,
  type InlineMentionEntity,
} from '../../utils/inlineMentions';
import { workspaceContextLinkedDir } from '../../components/workspace-context';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../../i18n/content';
import { localizePluginDescription, localizePluginTitle } from '../../components/plugins-home/localization';
import {
  findDesignToolboxSkill,
  skillMatchesQuery,
  type DesignToolboxAction,
} from '../../runtime/design-toolbox';
import type {
  DesignToolboxResource,
  DesignToolboxResourceIndex,
  DesignToolboxResourceKind,
  TrackedWorkspaceLinkedDir,
  TranslateFn,
} from './types';
import { designToolboxSkillBadge, designToolboxSkillIcon } from './formatters';

/** Drop duplicate workspace context items, keyed by `kind:id`, keeping order. */
export function dedupeWorkspaceContextItems(items: WorkspaceContextItem[]): WorkspaceContextItem[] {
  const out: WorkspaceContextItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Which staged workspace contexts auto-linked a folder present in `linkedDirs`,
 *  with the pre-add linked-dir snapshot to restore if the context is removed. */
export function trackedWorkspaceLinkedDirsForContexts(
  items: WorkspaceContextItem[],
  linkedDirs: string[],
): Record<string, TrackedWorkspaceLinkedDir> {
  const out: Record<string, TrackedWorkspaceLinkedDir> = {};
  for (const item of items) {
    const dir = workspaceContextLinkedDir(item) ?? '';
    if (!dir || !linkedDirs.includes(dir)) continue;
    out[item.id] = {
      dir,
      previousLinkedDirs: linkedDirs.filter((linkedDir) => linkedDir !== dir),
    };
  }
  return out;
}

/** Build the flat @-mention entity index the inline-mention decorator matches
 *  against: workspace contexts, plugins, skills, MCP servers, connectors, and
 *  files (project + staged), each with its display token. */
export function buildComposerMentionEntities({
  connectors,
  files,
  mcpServers,
  plugins,
  skills,
  staged,
  workspaceContexts,
}: {
  connectors: ConnectorDetail[];
  files: ProjectFile[];
  mcpServers: McpServerConfig[];
  plugins: InstalledPluginRecord[];
  skills: SkillSummary[];
  staged: ChatAttachment[];
  workspaceContexts: WorkspaceContextItem[];
}): InlineMentionEntity[] {
  const entities: InlineMentionEntity[] = [];
  const workspaceSeen = new Set<string>();
  for (const item of workspaceContexts) {
    if (!item.id || !item.label) continue;
    const key = `workspace:${item.id}`;
    if (workspaceSeen.has(key)) continue;
    workspaceSeen.add(key);
    entities.push({
      id: item.id,
      kind: 'workspace',
      label: item.label,
      token: inlineMentionToken(item.label),
      title: `Workspace: ${item.label}`,
    });
  }
  for (const plugin of plugins) {
    entities.push({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.title,
      token: inlineMentionToken(plugin.title),
      title: `Plugin: ${plugin.title}`,
    });
  }
  for (const skill of skills) {
    entities.push({
      id: skill.id,
      kind: 'skill',
      label: skill.name,
      token: inlineMentionToken(skill.name),
      title: `Skill: ${skill.name}`,
    });
    if (skill.id !== skill.name) {
      entities.push({
        id: skill.id,
        kind: 'skill',
        label: skill.id,
        token: inlineMentionToken(skill.id),
        title: `Skill: ${skill.name}`,
      });
    }
  }
  for (const server of mcpServers) {
    const label = server.label || server.id;
    entities.push({
      id: server.id,
      kind: 'mcp',
      label,
      token: inlineMentionToken(label),
      title: `MCP: ${label}`,
    });
    if (server.id !== label) {
      entities.push({
        id: server.id,
        kind: 'mcp',
        label: server.id,
        token: inlineMentionToken(server.id),
        title: `MCP: ${label}`,
      });
    }
  }
  for (const connector of connectors) {
    entities.push({
      id: connector.id,
      kind: 'connector',
      label: connector.name,
      token: inlineMentionToken(connector.name),
      title: `Connector: ${connector.name}`,
    });
    if (connector.id !== connector.name) {
      entities.push({
        id: connector.id,
        kind: 'connector',
        label: connector.id,
        token: inlineMentionToken(connector.id),
        title: `Connector: ${connector.name}`,
      });
    }
  }
  const filePaths = new Set<string>();
  for (const file of files) {
    const path = file.path ?? file.name;
    if (!path || filePaths.has(path)) continue;
    filePaths.add(path);
    entities.push({
      id: path,
      kind: 'file',
      label: path,
      token: inlineMentionToken(path),
      title: `File: ${path}`,
    });
  }
  for (const attachment of staged) {
    if (!attachment.path || filePaths.has(attachment.path)) continue;
    filePaths.add(attachment.path);
    entities.push({
      id: attachment.path,
      kind: 'file',
      label: attachment.path,
      token: inlineMentionToken(attachment.path),
      title: `File: ${attachment.path}`,
    });
  }
  return entities;
}

/** A finite, non-negative attachment sort order. */
export function isFiniteAttachmentOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Fill in a stable `order` for any attachment missing one, keeping list order. */
export function normalizeChatAttachmentOrders(attachments: ChatAttachment[]): ChatAttachment[] {
  let fallbackOrder = 0;
  return attachments.map((attachment) => {
    if (isFiniteAttachmentOrder(attachment.order)) {
      fallbackOrder = Math.max(fallbackOrder, Math.floor(attachment.order) + 1);
      return { ...attachment, order: Math.floor(attachment.order) };
    }
    const order = fallbackOrder;
    fallbackOrder += 1;
    return { ...attachment, order };
  });
}

/** Stamp a contiguous `order` run onto attachments starting at `orderStart`. */
export function assignChatAttachmentOrders(
  attachments: ChatAttachment[],
  orderStart: number,
): ChatAttachment[] {
  return attachments.map((attachment, index) => ({
    ...attachment,
    order: orderStart + index,
  }));
}

/** The next free order value for appending to an attachment list. */
export function nextChatAttachmentOrder(attachments: ChatAttachment[]): number {
  return attachments.reduce(
    (max, attachment, index) =>
      Math.max(max, isFiniteAttachmentOrder(attachment.order) ? Math.floor(attachment.order) + 1 : index + 1),
    0,
  );
}

/** Sort attachments by `order` (list index as a stable tiebreak/fallback). */
export function sortChatAttachmentsByOrder(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

/** Sort comment attachments by `order` (same rule as file attachments). */
export function sortChatCommentAttachmentsByOrder(attachments: ChatCommentAttachment[]): ChatCommentAttachment[] {
  return attachments
    .map((attachment, index) => ({ attachment, index }))
    .sort((a, b) => {
      const aOrder = isFiniteAttachmentOrder(a.attachment.order) ? a.attachment.order : a.index;
      const bOrder = isFiniteAttachmentOrder(b.attachment.order) ? b.attachment.order : b.index;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map((entry) => entry.attachment);
}

/** True if a plugin matches the free-text plugin-picker query (empty → all). */
export function pluginMatchesQuery(plugin: InstalledPluginRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    plugin.title,
    plugin.id,
    plugin.sourceKind,
    plugin.source,
    plugin.manifest?.description ?? '',
    ...(plugin.manifest?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Build the full, searchable design-toolbox resource pool from every source. */
export function buildDesignToolboxResources({
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  locale,
  t,
}: DesignToolboxResourceIndex & { locale: Locale; t: TranslateFn }): DesignToolboxResource[] {
  const resources: DesignToolboxResource[] = [];

  for (const skill of skills) {
    const title = localizeSkillName(locale, skill);
    const subtitle = localizeSkillDescription(locale, skill);
    resources.push({
      key: `skill:${skill.id}`,
      kind: 'skill',
      id: skill.id,
      title,
      subtitle,
      badge: designToolboxSkillBadge(skill, t),
      icon: designToolboxSkillIcon(skill),
      searchText: [
        'skill',
        skill.id,
        skill.name,
        title,
        subtitle,
        skill.mode,
        skill.surface ?? '',
        skill.category ?? '',
        ...skill.triggers,
      ].join(' '),
      skill,
    });
  }

  for (const plugin of plugins) {
    const subtitle = localizePluginDescription(locale, plugin) || plugin.id;
    resources.push({
      key: `plugin:${plugin.id}`,
      kind: 'plugin',
      id: plugin.id,
      title: localizePluginTitle(locale, plugin),
      subtitle,
      badge: plugin.manifest?.od?.kind ?? 'plugin',
      icon: 'sparkles',
      searchText: [
        'plugin',
        plugin.id,
        plugin.title,
        plugin.sourceKind,
        plugin.source,
        subtitle,
        ...(plugin.manifest?.tags ?? []),
        plugin.manifest?.od?.kind ?? '',
        plugin.manifest?.od?.scenario ?? '',
        plugin.manifest?.od?.mode ?? '',
      ].join(' '),
      plugin,
    });
  }

  for (const server of mcpServers) {
    const title = server.label || server.id;
    const subtitle = server.command || server.url || server.transport;
    resources.push({
      key: `mcp:${server.id}`,
      kind: 'mcp',
      id: server.id,
      title,
      subtitle,
      badge: 'MCP',
      icon: 'link',
      searchText: [
        'mcp',
        server.id,
        title,
        subtitle,
        server.transport,
        server.templateId ?? '',
      ].join(' '),
      server,
    });
  }

  for (const template of mcpTemplates) {
    resources.push({
      key: `mcp-template:${template.id}`,
      kind: 'mcp-template',
      id: template.id,
      title: template.label,
      subtitle: template.description,
      badge: template.category,
      icon: 'plus',
      searchText: [
        'mcp template',
        template.id,
        template.label,
        template.description,
        template.transport,
        template.category,
        template.homepage ?? '',
        template.example ?? '',
      ].join(' '),
      template,
    });
  }

  for (const connector of connectors) {
    const toolCount = connector.toolCount ?? connector.tools.length;
    resources.push({
      key: `connector:${connector.id}`,
      kind: 'connector',
      id: connector.id,
      title: connector.name,
      subtitle: [
        connector.description ?? connector.provider,
        toolCount > 0 ? `${toolCount} tools` : null,
        connector.accountLabel ?? null,
      ].filter(Boolean).join(' · '),
      badge: connector.category || 'connector',
      icon: 'link',
      searchText: [
        'connector',
        connector.id,
        connector.name,
        connector.provider,
        connector.category,
        connector.description ?? '',
        connector.accountLabel ?? '',
        ...(connector.featuredToolNames ?? []),
        ...(connector.allowedToolNames ?? []),
        ...connector.tools.slice(0, 20).flatMap((tool) => [tool.name, tool.title, tool.description ?? '']),
      ].join(' '),
      connector,
    });
  }

  const seenFiles = new Set<string>();
  for (const file of projectFiles) {
    if (file.type === 'dir') continue;
    const path = file.path ?? file.name;
    if (!path || seenFiles.has(path)) continue;
    seenFiles.add(path);
    resources.push({
      key: `file:${path}`,
      kind: 'file',
      id: path,
      title: path,
      subtitle: [file.kind, file.mime, file.artifactKind ?? ''].filter(Boolean).join(' · '),
      badge: file.artifactKind ?? file.kind,
      icon: looksLikeImage(path) ? 'image' : 'file',
      searchText: [
        'file',
        'design file',
        path,
        file.name,
        file.kind,
        file.mime,
        file.artifactKind ?? '',
      ].join(' '),
      file,
    });
  }

  return resources;
}

/** True if a resource matches the design-toolbox query (empty → all). */
export function designToolboxResourceMatchesQuery(
  resource: DesignToolboxResource,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return resource.searchText.toLowerCase().includes(q);
}

/** The default (no-query) design-toolbox resource shortlist: the creative
 *  director, each action's preferred skill, then a themed sampling, capped at 8. */
export function designToolboxDefaultResources(
  actions: DesignToolboxAction[],
  resources: DesignToolboxResource[],
): DesignToolboxResource[] {
  const out: DesignToolboxResource[] = [];
  const seen = new Set<string>();
  function add(resource: DesignToolboxResource | null | undefined) {
    if (!resource || seen.has(resource.key)) return;
    seen.add(resource.key);
    out.push(resource);
  }
  function addByKindId(kind: DesignToolboxResourceKind, id: string) {
    add(resources.find((resource) => resource.kind === kind && resource.id === id));
  }

  addByKindId('skill', 'creative-director');
  for (const action of actions) {
    const skill = resources.find((resource) =>
      resource.kind === 'skill'
      && action.preferredSkillIds.some((id) => resource.skill.id === id || resource.skill.name === id),
    );
    add(skill);
  }
  for (const term of ['design', 'image', 'video', 'motion', 'figma']) {
    for (const resource of resources) {
      if (out.length >= 8) return out;
      if (resource.kind !== 'skill' && designToolboxResourceMatchesQuery(resource, term)) {
        add(resource);
      }
    }
  }
  return out;
}

/** True if a design-toolbox resource is already staged into the current turn. */
export function designToolboxResourceIsActive(
  resource: DesignToolboxResource,
  active: {
    skillIds: Set<string>;
    pluginId: string | null;
    mcpServerIds: Set<string>;
    connectorIds: Set<string>;
    filePaths: Set<string>;
  },
): boolean {
  switch (resource.kind) {
    case 'skill':
      return active.skillIds.has(resource.skill.id);
    case 'plugin':
      return active.pluginId === resource.plugin.id;
    case 'mcp':
      return active.mcpServerIds.has(resource.server.id);
    case 'connector':
      return active.connectorIds.has(resource.connector.id);
    case 'file':
      return active.filePaths.has(resource.file.path ?? resource.file.name);
    case 'mcp-template':
      return false;
  }
}

/** True if a skill belongs in the design-toolbox surface (category or keyword). */
export function isDesignToolboxSkill(skill: SkillSummary): boolean {
  const category = skill.category ?? '';
  if (
    [
      'animation-motion',
      'creative-direction',
      'image-generation',
      'video-generation',
      'web-artifacts',
    ].includes(category)
  ) {
    return true;
  }
  return [
    'animation',
    'motion',
    'gsap',
    'polish',
    'critique',
    'taste',
    'anti slop',
    'anti ai',
    'image',
    'asset',
    'reference',
    'icon',
    'logo',
    'chart',
    'diagram',
    'echarts',
    'three',
    'spline',
    'rive',
    'lottie',
    'mapbox',
    'deck.gl',
    'video',
    'frontend',
    'beautify',
  ].some((term) => skillMatchesQuery(skill, term));
}

/** The default skill shortlist for the design-toolbox: each action's matched
 *  skill, then each action's preferred skills, de-duplicated. */
export function designToolboxDefaultSkills(
  actions: DesignToolboxAction[],
  skills: SkillSummary[],
): SkillSummary[] {
  const out: SkillSummary[] = [];
  const seen = new Set<string>();
  function add(skill: SkillSummary | null | undefined) {
    if (!skill || seen.has(skill.id)) return;
    seen.add(skill.id);
    out.push(skill);
  }
  for (const action of actions) {
    add(findDesignToolboxSkill(action, skills));
  }
  for (const action of actions) {
    for (const id of action.preferredSkillIds) {
      add(skills.find((skill) => skill.id === id || skill.name === id));
    }
  }
  return out;
}

/** Rank a skill for the @-mention list: 0 if id/name prefix-matches, else 1. */
export function skillMentionRank(skill: SkillSummary, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const id = skill.id.toLowerCase();
  const name = skill.name.toLowerCase();
  if (id.startsWith(q) || name.startsWith(q)) return 0;
  return 1;
}

/** True if an MCP server matches the free-text picker query (empty → all). */
export function mcpServerMatchesQuery(server: McpServerConfig, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    server.id,
    server.label ?? '',
    server.transport,
    server.url ?? '',
    server.command ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** True if an MCP template matches the free-text picker query (empty → all). */
export function mcpTemplateMatchesQuery(tpl: McpTemplate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    tpl.id,
    tpl.label,
    tpl.description,
    tpl.transport,
    tpl.category,
    tpl.homepage ?? '',
    tpl.example ?? '',
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/** Escape a string for safe interpolation into a `RegExp` source. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove a single inline-mention token (by label) from the draft text. */
export function stripInlineMentionToken(text: string, label: string): string {
  const token = inlineMentionToken(label);
  return text.replace(
    new RegExp(`(^|[\\s([{"'])${escapeRegExp(token)}(?=$|\\s|[.,;:!?)}\\]"'])([^\\S\\r\\n])?`, 'g'),
    '$1',
  );
}

/** Remove every inline-mention token (by label) from the draft text. */
export function stripInlineMentionLabels(text: string, labels: string[]): string {
  const uniqueLabels = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));
  return uniqueLabels.reduce(
    (current, label) => stripInlineMentionToken(current, label),
    text,
  );
}

/** True for filenames with a raster/vector image extension. */
export function looksLikeImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
}
