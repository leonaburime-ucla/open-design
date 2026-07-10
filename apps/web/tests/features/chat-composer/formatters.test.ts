import { describe, expect, it } from 'vitest';
import type {
  InstalledPluginRecord,
  LibraryAsset,
  LibraryElementMeta,
  ProjectFile,
  WorkspaceContextItem,
} from '@open-design/contracts';

import {
  designToolboxResourceKindLabel,
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
} from '../../../src/features/chat-composer/formatters';
import type { TranslateFn } from '../../../src/features/chat-composer/types';

// A fake translator that echoes the key (with vars appended) so label formatters
// are testable without an I18nProvider.
const t: TranslateFn = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

function workspace(over: Partial<WorkspaceContextItem> = {}): WorkspaceContextItem {
  return { id: 'w1', kind: 'file', label: 'File', ...over } as WorkspaceContextItem;
}

describe('prettySize', () => {
  it('formats bytes / KB / MB', () => {
    expect(prettySize(512)).toBe('512B');
    expect(prettySize(2048)).toBe('2.0KB');
    expect(prettySize(5 * 1024 * 1024)).toBe('5.0MB');
  });
});

describe('lastPathSegment', () => {
  it('returns the final path segment, tolerating trailing slashes and backslashes', () => {
    expect(lastPathSegment('a/b/c.tsx')).toBe('c.tsx');
    expect(lastPathSegment('a\\b\\c')).toBe('c');
    expect(lastPathSegment('a/b/')).toBe('b');
  });
});

describe('projectFileMention*', () => {
  it('title falls back to the last path segment when the file has no name', () => {
    expect(projectFileMentionTitle({ name: 'a.tsx' } as ProjectFile, 'src/a.tsx')).toBe('a.tsx');
    expect(projectFileMentionTitle({ name: '' } as ProjectFile, 'src/deep/z.tsx')).toBe('z.tsx');
  });

  it('description prefers the fallback path when it differs from the title', () => {
    const file = { name: 'a.tsx', kind: 'code', mime: 'text/tsx' } as ProjectFile;
    expect(projectFileMentionDescription(file, 'src/a.tsx')).toBe('src/a.tsx');
    // When fallback equals the title, it composes kind · mime instead.
    expect(projectFileMentionDescription(file, 'a.tsx')).toBe('code · text/tsx');
  });
});

describe('workspace context formatters', () => {
  it('icon maps kinds to glyphs', () => {
    expect(workspaceContextIcon(workspace({ kind: 'browser' }))).toBe('globe');
    expect(workspaceContextIcon(workspace({ kind: 'terminal' }))).toBe('terminal');
    expect(workspaceContextIcon(workspace({ kind: 'file' }))).toBe('file');
  });

  it('kind label is human readable and defaults to File', () => {
    expect(workspaceContextKindLabel('browser')).toBe('Browser');
    expect(workspaceContextKindLabel('design-system')).toBe('Design system');
    expect(workspaceContextKindLabel('file')).toBe('File');
  });

  it('description prefers the most specific field per kind', () => {
    expect(workspaceContextDescription(workspace({ kind: 'terminal', title: 'zsh' }))).toBe('zsh');
    expect(
      workspaceContextDescription(workspace({ kind: 'browser', url: 'https://x.dev' })),
    ).toBe('https://x.dev');
  });

  it('search text concatenates the searchable fields', () => {
    const text = workspaceContextSearchText(workspace({ label: 'Tab', url: 'https://x.dev' }));
    expect(text).toContain('Tab');
    expect(text).toContain('https://x.dev');
  });
});

describe('designToolboxResourceKindLabel', () => {
  it('routes each kind to its i18n key', () => {
    expect(designToolboxResourceKindLabel('skill', t)).toBe('chat.designToolbox.kind.skill');
    expect(designToolboxResourceKindLabel('mcp-template', t)).toBe('chat.designToolbox.kind.mcpTemplate');
    expect(designToolboxResourceKindLabel('file', t)).toBe('chat.designToolbox.kind.designFile');
  });
});

describe('pluginSourceLabel', () => {
  it('distinguishes bundled (official) from user plugins', () => {
    expect(pluginSourceLabel({ sourceKind: 'bundled' } as InstalledPluginRecord, t)).toBe('chat.mentionPluginOfficial');
    expect(pluginSourceLabel({ sourceKind: 'user' } as InstalledPluginRecord, t)).toBe('chat.mentionPluginMine');
  });
});

describe('formatElementHtmlBlock', () => {
  it('renders a descriptor line and a fenced html block', () => {
    const asset = { id: 'a1' } as LibraryAsset;
    const element = { selector: '.hero', width: 100, height: 40 } as LibraryElementMeta;
    const block = formatElementHtmlBlock(asset, element, '<div>hi</div>');
    expect(block).toContain('Captured element .hero · 100×40');
    expect(block).toContain('```html');
    expect(block).toContain('<div>hi</div>');
  });

  it('truncates very long markup with a comment marker', () => {
    const asset = { id: 'a1' } as LibraryAsset;
    const element = { selector: '.big' } as LibraryElementMeta;
    const block = formatElementHtmlBlock(asset, element, 'x'.repeat(9000));
    expect(block).toContain('…truncated');
  });
});
