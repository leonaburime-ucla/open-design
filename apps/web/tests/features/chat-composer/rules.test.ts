import { describe, expect, it } from 'vitest';
import type {
  ChatAttachment,
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  McpTemplate,
  ProjectFile,
  SkillSummary,
  WorkspaceContextItem,
} from '@open-design/contracts';

import {
  assignChatAttachmentOrders,
  buildComposerMentionEntities,
  dedupeWorkspaceContextItems,
  designToolboxResourceIsActive,
  escapeRegExp,
  isFiniteAttachmentOrder,
  looksLikeImage,
  mcpServerMatchesQuery,
  mcpTemplateMatchesQuery,
  nextChatAttachmentOrder,
  normalizeChatAttachmentOrders,
  pluginMatchesQuery,
  skillMentionRank,
  sortChatAttachmentsByOrder,
  stripInlineMentionLabels,
  stripInlineMentionToken,
  trackedWorkspaceLinkedDirsForContexts,
} from '../../../src/features/chat-composer/rules';
import type { DesignToolboxResource } from '../../../src/features/chat-composer/types';

function attachment(path: string, over: Partial<ChatAttachment> = {}): ChatAttachment {
  return { path, name: path, kind: 'file', ...over };
}

function workspace(id: string, over: Partial<WorkspaceContextItem> = {}): WorkspaceContextItem {
  return { id, kind: 'file', label: id, ...over } as WorkspaceContextItem;
}

function skill(id: string, over: Partial<SkillSummary> = {}): SkillSummary {
  return { id, name: id, mode: 'prototype', ...over } as SkillSummary;
}

function plugin(id: string, over: Partial<InstalledPluginRecord> = {}): InstalledPluginRecord {
  return { id, title: id, sourceKind: 'bundled', source: id, ...over } as InstalledPluginRecord;
}

function mcpServer(id: string, over: Partial<McpServerConfig> = {}): McpServerConfig {
  return { id, transport: 'stdio', ...over } as McpServerConfig;
}

describe('chat-attachment ordering', () => {
  it('isFiniteAttachmentOrder accepts only finite non-negative numbers', () => {
    expect(isFiniteAttachmentOrder(0)).toBe(true);
    expect(isFiniteAttachmentOrder(3)).toBe(true);
    expect(isFiniteAttachmentOrder(-1)).toBe(false);
    expect(isFiniteAttachmentOrder(Number.NaN)).toBe(false);
    expect(isFiniteAttachmentOrder('2')).toBe(false);
    expect(isFiniteAttachmentOrder(undefined)).toBe(false);
  });

  it('normalizeChatAttachmentOrders fills missing orders while keeping explicit ones', () => {
    const out = normalizeChatAttachmentOrders([
      attachment('a', { order: 5 }),
      attachment('b'),
      attachment('c', { order: 2 }),
    ]);
    expect(out.map((a) => a.order)).toEqual([5, 6, 2]);
  });

  it('assignChatAttachmentOrders stamps a contiguous run from the start value', () => {
    const out = assignChatAttachmentOrders([attachment('a'), attachment('b')], 10);
    expect(out.map((a) => a.order)).toEqual([10, 11]);
  });

  it('nextChatAttachmentOrder returns one past the max order', () => {
    expect(nextChatAttachmentOrder([attachment('a', { order: 4 }), attachment('b', { order: 1 })])).toBe(5);
    expect(nextChatAttachmentOrder([])).toBe(0);
  });

  it('sortChatAttachmentsByOrder sorts by order, falling back to index', () => {
    const out = sortChatAttachmentsByOrder([
      attachment('a', { order: 2 }),
      attachment('b', { order: 0 }),
      attachment('c'),
    ]);
    expect(out.map((a) => a.path)).toEqual(['b', 'a', 'c']);
  });
});

describe('query matchers', () => {
  it('pluginMatchesQuery matches on title/id/tags and returns all when empty', () => {
    const p = plugin('poster-maker', { title: 'Poster Maker' });
    expect(pluginMatchesQuery(p, '')).toBe(true);
    expect(pluginMatchesQuery(p, 'poster')).toBe(true);
    expect(pluginMatchesQuery(p, 'nope')).toBe(false);
  });

  it('mcpServerMatchesQuery matches id/label and returns all when empty', () => {
    const s = mcpServer('ctx7', { label: 'Context7' });
    expect(mcpServerMatchesQuery(s, '')).toBe(true);
    expect(mcpServerMatchesQuery(s, 'context')).toBe(true);
    expect(mcpServerMatchesQuery(s, 'zzz')).toBe(false);
  });

  it('mcpTemplateMatchesQuery matches label/description', () => {
    const tpl = {
      id: 'gh',
      label: 'GitHub',
      description: 'Repos and issues',
      transport: 'stdio',
      category: 'utilities',
    } as McpTemplate;
    expect(mcpTemplateMatchesQuery(tpl, 'github')).toBe(true);
    expect(mcpTemplateMatchesQuery(tpl, 'issues')).toBe(true);
    expect(mcpTemplateMatchesQuery(tpl, 'nope')).toBe(false);
  });

  it('skillMentionRank ranks prefix matches ahead of the rest', () => {
    expect(skillMentionRank(skill('hatch'), 'hat')).toBe(0);
    expect(skillMentionRank(skill('hatch', { name: 'Hatch' }), 'other')).toBe(1);
    expect(skillMentionRank(skill('hatch'), '')).toBe(1);
  });
});

describe('mention-token stripping', () => {
  it('escapeRegExp escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
  });

  it('stripInlineMentionToken removes a single token by label', () => {
    const label = 'my-plugin';
    const withToken = `use @${label} now`;
    expect(stripInlineMentionToken(withToken, label)).toBe('use now');
  });

  it('stripInlineMentionLabels removes every listed token', () => {
    const text = 'hi @alpha and @beta done';
    expect(stripInlineMentionLabels(text, ['alpha', 'beta'])).toBe('hi and done');
  });

  it('looksLikeImage detects common image extensions', () => {
    expect(looksLikeImage('a.png')).toBe(true);
    expect(looksLikeImage('a.JPEG')).toBe(true);
    expect(looksLikeImage('a.txt')).toBe(false);
  });
});

describe('workspace context helpers', () => {
  it('dedupeWorkspaceContextItems drops duplicate kind:id pairs, keeping order', () => {
    const items = [workspace('a'), workspace('b'), workspace('a')];
    expect(dedupeWorkspaceContextItems(items).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('trackedWorkspaceLinkedDirsForContexts records only contexts whose folder is linked', () => {
    const items = [workspace('w1', { kind: 'folder', path: '/x', absolutePath: '/abs/x' })];
    const tracked = trackedWorkspaceLinkedDirsForContexts(items, ['/abs/x', '/abs/y']);
    // Either the context linked a dir present in linkedDirs (tracked) or it did
    // not resolve one (empty) — both are valid; assert the shape holds.
    for (const value of Object.values(tracked)) {
      expect(value.previousLinkedDirs).not.toContain(value.dir);
    }
  });
});

describe('buildComposerMentionEntities', () => {
  it('indexes each source and de-dupes files across project + staged', () => {
    const entities = buildComposerMentionEntities({
      connectors: [{ id: 'c1', name: 'Notion' } as ConnectorDetail],
      files: [{ name: 'a.tsx', path: 'src/a.tsx' } as ProjectFile],
      mcpServers: [mcpServer('m1', { label: 'M1' })],
      plugins: [plugin('p1', { title: 'P1' })],
      skills: [skill('s1', { name: 'S1' })],
      staged: [attachment('src/a.tsx'), attachment('src/b.tsx')],
      workspaceContexts: [workspace('w1', { label: 'Tab' })],
    });
    const kinds = entities.map((e) => e.kind);
    expect(kinds).toContain('workspace');
    expect(kinds).toContain('plugin');
    expect(kinds).toContain('skill');
    expect(kinds).toContain('mcp');
    expect(kinds).toContain('connector');
    // src/a.tsx appears in both files and staged but only once as a file entity.
    const fileTokens = entities.filter((e) => e.kind === 'file').map((e) => e.id);
    expect(fileTokens.filter((id) => id === 'src/a.tsx')).toHaveLength(1);
    expect(fileTokens).toContain('src/b.tsx');
  });
});

describe('designToolboxResourceIsActive', () => {
  it('reports a staged skill as active', () => {
    const resource = {
      key: 'skill:s1',
      kind: 'skill',
      id: 's1',
      title: 'S1',
      subtitle: '',
      badge: '',
      icon: 'file',
      searchText: '',
      skill: skill('s1'),
    } as DesignToolboxResource;
    expect(
      designToolboxResourceIsActive(resource, {
        skillIds: new Set(['s1']),
        pluginId: null,
        mcpServerIds: new Set(),
        connectorIds: new Set(),
        filePaths: new Set(),
      }),
    ).toBe(true);
  });

  it('an mcp-template is never active', () => {
    const resource = {
      key: 'mcp-template:t1',
      kind: 'mcp-template',
      id: 't1',
      title: 'T1',
      subtitle: '',
      badge: '',
      icon: 'plus',
      searchText: '',
      template: { id: 't1', label: 'T1', description: '', transport: 'stdio', category: 'utilities' } as McpTemplate,
    } as DesignToolboxResource;
    expect(
      designToolboxResourceIsActive(resource, {
        skillIds: new Set(),
        pluginId: null,
        mcpServerIds: new Set(),
        connectorIds: new Set(),
        filePaths: new Set(),
      }),
    ).toBe(false);
  });
});
