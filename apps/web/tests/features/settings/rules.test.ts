// Pure-rules tests for the settings slice: no doubles, just `contracts`/app
// types (ADR 0002). Covers the provider-model cache keying/merging, the
// Composio credential-state derivation, and the Orbit automation section's
// business logic now homed in the slice.
import { describe, expect, it } from 'vitest';
import type { ConnectorDetail } from '@open-design/contracts';
import type { AppConfig, OrbitRunSummary, OrbitStatusResponse, ProviderModelOption, SkillSummary } from '../../../src/types';
import {
  deriveComposioCredentialState,
  mergeProviderModelOptions,
  providerModelsCacheKey,
} from '../../../src/features/settings';
import {
  agentModelSummary,
  buildCodexEnvToml,
  buildMcpClients,
  buildMcpStdioServerConfig,
  buildSharedMcpJson,
  commandPaletteShortcut,
  computeOrbitMeterSegments,
  configForManualOrbitRun,
  countConnectedConnectors,
  deriveEffectiveOrbitTemplateId,
  deriveMediaProviderRowState,
  deriveOrbitLastRun,
  filterAndSortOrbitTemplates,
  findOrbitTemplate,
  formatAmrWalletBalance,
  formatConnectionTestMessage,
  homeConfigPath,
  isOrbitRunDisabled,
  nextLegacyLastRunTemplateSkillId,
  orbitConfigGateCopyKeys,
  orbitLiveArtifactHref,
  orbitTriggerLabelKey,
  sanitizeMediaProviderDocsUrl,
  settingsShortcut,
  soundIdToTracking,
  sortAvailableMediaProviders,
  sortComingSoonMediaProviders,
  testNotificationStatusText,
  utf8Btoa,
} from '../../../src/features/settings/rules';
import type { MediaProvider } from '../../../src/media/models';
import type { AgentInfo, ConnectionTestResponse } from '../../../src/types';
import type { McpInstallInfo } from '../../../src/features/settings/types';

describe('providerModelsCacheKey', () => {
  it('fingerprints the API key instead of embedding the raw secret', () => {
    const key = providerModelsCacheKey(
      'anthropic',
      'https://api.anthropic.com/',
      'sk-secret-value',
    );
    expect(key).toContain('https://api.anthropic.com');
    expect(key).not.toContain('sk-secret-value');
  });

  it('normalizes a trailing slash on the base URL to a stable key', () => {
    expect(
      providerModelsCacheKey('anthropic', 'https://api.anthropic.com/', 'sk'),
    ).toBe(
      providerModelsCacheKey('anthropic', 'https://api.anthropic.com', 'sk'),
    );
  });

  it('differs when the secret differs', () => {
    expect(
      providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-a'),
    ).not.toBe(
      providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-b'),
    );
  });

  it('folds the Azure api-version into the key only for the azure protocol', () => {
    expect(
      providerModelsCacheKey('azure', 'https://x.azure.com', 'k', '2024-01'),
    ).not.toBe(
      providerModelsCacheKey('azure', 'https://x.azure.com', 'k', '2024-02'),
    );
    expect(
      providerModelsCacheKey('openai', 'https://x', 'k', '2024-01'),
    ).toBe(
      providerModelsCacheKey('openai', 'https://x', 'k', '2024-02'),
    );
  });
});

describe('mergeProviderModelOptions', () => {
  const fetched: ProviderModelOption[] = [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: '' },
  ];

  it('lists fetched models first, then suggested ids not already present', () => {
    const merged = mergeProviderModelOptions(fetched, ['gpt-4o', 'o1']);
    expect(merged.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1']);
  });

  it('falls back to the id when a label is blank', () => {
    const merged = mergeProviderModelOptions(fetched, []);
    expect(merged.find((m) => m.id === 'gpt-4o-mini')?.label).toBe('gpt-4o-mini');
  });

  it('drops empty and duplicate ids', () => {
    const merged = mergeProviderModelOptions(
      [{ id: '  ', label: 'blank' }, { id: 'a', label: 'A' }],
      ['a', 'b'],
    );
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('deriveComposioCredentialState', () => {
  it('is empty with neither a saved key nor a draft', () => {
    expect(deriveComposioCredentialState(null)).toBe('empty');
    expect(deriveComposioCredentialState({})).toBe('empty');
  });

  it('is pending-new with only a typed draft', () => {
    expect(deriveComposioCredentialState({ apiKey: 'draft' })).toBe('pending-new');
  });

  it('is saved with only a configured key', () => {
    expect(deriveComposioCredentialState({ apiKeyConfigured: true })).toBe('saved');
  });

  it('is saved-pending with a saved key plus a fresh draft', () => {
    expect(
      deriveComposioCredentialState({ apiKey: 'draft', apiKeyConfigured: true }),
    ).toBe('saved-pending');
  });

  it('treats a whitespace-only draft as no draft', () => {
    expect(deriveComposioCredentialState({ apiKey: '   ' })).toBe('empty');
  });
});

function baseConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'api',
    apiKey: 'sk-test',
    apiProtocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: null,
    skillId: null,
    designSystemId: null,
    ...over,
  } as AppConfig;
}

function runSummary(over: Partial<OrbitRunSummary> = {}): OrbitRunSummary {
  return {
    completedAt: '2026-01-01T00:00:00.000Z',
    connectorsChecked: 3,
    connectorsSucceeded: 2,
    connectorsFailed: 1,
    connectorsSkipped: 0,
    markdown: 'summary',
    ...over,
  };
}

describe('configForManualOrbitRun', () => {
  it('coalesces a missing templateSkillId to the built-in default', () => {
    const result = configForManualOrbitRun(baseConfig({ orbit: { enabled: true, time: '08:00', templateSkillId: null } }));
    expect(result.orbit?.templateSkillId).toBe('orbit-general');
  });

  it('leaves an explicit templateSkillId untouched', () => {
    const result = configForManualOrbitRun(
      baseConfig({ orbit: { enabled: true, time: '08:00', templateSkillId: 'custom' } }),
    );
    expect(result.orbit?.templateSkillId).toBe('custom');
  });

  it('fills in the built-in default orbit config when the config has none at all', () => {
    const result = configForManualOrbitRun(baseConfig());
    expect(result.orbit).toEqual({ enabled: false, time: '08:00', templateSkillId: 'orbit-general' });
  });
});

describe('isOrbitRunDisabled', () => {
  it('is disabled while busy', () => {
    expect(isOrbitRunDisabled(true, 3)).toBe(true);
  });

  it('is disabled while the connector count is unknown (still loading)', () => {
    expect(isOrbitRunDisabled(false, null)).toBe(true);
  });

  it('is disabled with zero connected integrations', () => {
    expect(isOrbitRunDisabled(false, 0)).toBe(true);
  });

  it('is enabled once idle with at least one connected integration', () => {
    expect(isOrbitRunDisabled(false, 1)).toBe(false);
  });
});

describe('deriveEffectiveOrbitTemplateId', () => {
  it('prefers the saved id', () => {
    expect(deriveEffectiveOrbitTemplateId('custom', 'orbit-general')).toBe('custom');
  });

  it('falls back to the default when the saved id is null/empty', () => {
    expect(deriveEffectiveOrbitTemplateId(null, 'orbit-general')).toBe('orbit-general');
    expect(deriveEffectiveOrbitTemplateId('', 'orbit-general')).toBe('orbit-general');
  });

  it('is empty when neither is set', () => {
    expect(deriveEffectiveOrbitTemplateId(null, undefined)).toBe('');
  });
});

describe('filterAndSortOrbitTemplates', () => {
  const templates: SkillSummary[] = [
    { id: 'b', name: 'Beta', scenario: 'orbit', featured: 0 } as SkillSummary,
    { id: 'a', name: 'Alpha', scenario: 'orbit', featured: 1 } as SkillSummary,
    { id: 'c', name: 'Other', scenario: 'not-orbit' } as SkillSummary,
    { id: 'd', name: 'Delta', scenario: 'orbit' } as SkillSummary,
  ];

  it('filters to scenario === orbit and sorts featured-first, then by name', () => {
    const result = filterAndSortOrbitTemplates(templates);
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'd']);
  });
});

describe('findOrbitTemplate', () => {
  const templates: SkillSummary[] = [{ id: 'a', name: 'Alpha' } as SkillSummary];

  it('finds the matching template', () => {
    expect(findOrbitTemplate(templates, 'a')?.name).toBe('Alpha');
  });

  it('is null when the templates list is still loading', () => {
    expect(findOrbitTemplate(null, 'a')).toBeNull();
  });

  it('is null when the id is empty or unmatched', () => {
    expect(findOrbitTemplate(templates, '')).toBeNull();
    expect(findOrbitTemplate(templates, 'missing')).toBeNull();
  });
});

describe('countConnectedConnectors', () => {
  it('counts only status === connected', () => {
    const connectors = [
      { status: 'connected' },
      { status: 'connected' },
      { status: 'disconnected' },
    ] as ConnectorDetail[];
    expect(countConnectedConnectors(connectors)).toBe(2);
  });

  it('is zero for an empty list', () => {
    expect(countConnectedConnectors([])).toBe(0);
  });
});

describe('nextLegacyLastRunTemplateSkillId', () => {
  it('is null when the daemon already supports template-scoped history', () => {
    const status: OrbitStatusResponse = {
      lastRun: runSummary({ templateSkillId: null }),
      lastRunsByTemplate: { 'orbit-general': runSummary() },
    };
    expect(nextLegacyLastRunTemplateSkillId(status, 'orbit-general', null)).toBeNull();
  });

  it('is null when the last run is already template-scoped', () => {
    const status: OrbitStatusResponse = { lastRun: runSummary({ templateSkillId: 'orbit-general' }) };
    expect(nextLegacyLastRunTemplateSkillId(status, 'orbit-general', null)).toBeNull();
  });

  it('locks onto the effective template id for a legacy unscoped run', () => {
    const status: OrbitStatusResponse = { lastRun: runSummary({ templateSkillId: null }) };
    expect(nextLegacyLastRunTemplateSkillId(status, 'orbit-general', null)).toBe('orbit-general');
  });

  it('holds the current value once locked instead of re-deriving it', () => {
    const status: OrbitStatusResponse = { lastRun: runSummary({ templateSkillId: null }) };
    expect(nextLegacyLastRunTemplateSkillId(status, 'orbit-general', 'already-locked')).toBe('already-locked');
  });
});

describe('deriveOrbitLastRun', () => {
  it('falls back to the bare last run when the daemon has no template-scoped history support', () => {
    const status: OrbitStatusResponse = { lastRun: runSummary() };
    expect(deriveOrbitLastRun(status, 'orbit-general', null)).toBe(status.lastRun);
  });

  it('prefers the template-scoped run when the daemon supports it', () => {
    const scoped = runSummary({ markdown: 'scoped' });
    const status: OrbitStatusResponse = {
      lastRun: runSummary({ markdown: 'unscoped' }),
      lastRunsByTemplate: { 'orbit-general': scoped },
    };
    expect(deriveOrbitLastRun(status, 'orbit-general', null)).toBe(scoped);
  });

  it('falls back to a matching legacy unscoped run when no scoped entry exists yet', () => {
    const legacy = runSummary({ templateSkillId: null });
    const status: OrbitStatusResponse = { lastRun: legacy, lastRunsByTemplate: {} };
    expect(deriveOrbitLastRun(status, 'orbit-general', 'orbit-general')).toBe(legacy);
  });

  it('is null with template-scoped support but no matching run at all', () => {
    const status: OrbitStatusResponse = { lastRunsByTemplate: {} };
    expect(deriveOrbitLastRun(status, 'orbit-general', null)).toBeNull();
  });
});

describe('computeOrbitMeterSegments', () => {
  it('is all-zero with no last run', () => {
    expect(computeOrbitMeterSegments(null)).toEqual({ succeeded: 0, skipped: 0, failed: 0 });
  });

  it('floors a non-zero segment to a visible sliver', () => {
    const segments = computeOrbitMeterSegments(
      runSummary({ connectorsSucceeded: 99, connectorsSkipped: 1, connectorsFailed: 0 }),
    );
    expect(segments.succeeded).toBeCloseTo(99);
    expect(segments.skipped).toBe(3);
    expect(segments.failed).toBe(0);
  });
});

describe('orbitLiveArtifactHref', () => {
  it('builds the preview href when both ids are present', () => {
    const href = orbitLiveArtifactHref(runSummary({ artifactId: 'art', artifactProjectId: 'proj' }));
    expect(href).toBe('/api/live-artifacts/art/preview?projectId=proj');
  });

  it('is null for a legacy run without artifact ids', () => {
    expect(orbitLiveArtifactHref(runSummary())).toBeNull();
    expect(orbitLiveArtifactHref(null)).toBeNull();
  });
});

describe('orbitTriggerLabelKey', () => {
  it('is the manual key for a manual trigger', () => {
    expect(orbitTriggerLabelKey(runSummary({ trigger: 'manual' }))).toBe('settings.orbit.triggerManual');
  });

  it('is the scheduled key otherwise (including no last run)', () => {
    expect(orbitTriggerLabelKey(runSummary({ trigger: 'scheduled' }))).toBe('settings.orbit.triggerScheduled');
    expect(orbitTriggerLabelKey(null)).toBe('settings.orbit.triggerScheduled');
  });
});

describe('orbitConfigGateCopyKeys', () => {
  it('points at the with-key copy when a Composio key is already saved', () => {
    expect(orbitConfigGateCopyKeys(true)).toEqual({
      bodyKey: 'settings.orbit.gateBody',
      actionKey: 'settings.orbit.gateAction',
    });
  });

  it('points at the no-key copy otherwise', () => {
    expect(orbitConfigGateCopyKeys(false)).toEqual({
      bodyKey: 'settings.orbit.gateBodyNoKey',
      actionKey: 'settings.orbit.gateActionNoKey',
    });
  });
});

function mediaProvider(over: Partial<Omit<MediaProvider, 'id'>> & { id?: string } = {}): MediaProvider {
  return { id: 'openai', label: 'OpenAI', hint: '', integrated: true, ...over } as MediaProvider;
}

describe('sortAvailableMediaProviders', () => {
  const providers: MediaProvider[] = [
    mediaProvider({ id: 'zeta', label: 'Zeta' }),
    mediaProvider({ id: 'alpha', label: 'Alpha' }),
    mediaProvider({ id: 'beta', label: 'Beta' }),
    mediaProvider({ id: 'gamma', label: 'Gamma', integrated: false }),
  ];

  it('excludes non-integrated providers and sorts alphabetically with no configured entries', () => {
    const result = sortAvailableMediaProviders(providers, undefined);
    expect(result.map((p) => p.id)).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('sorts configured providers first, then alphabetically within each group', () => {
    const result = sortAvailableMediaProviders(providers, {
      zeta: { apiKey: 'sk', baseUrl: '', apiKeyConfigured: true },
    });
    expect(result.map((p) => p.id)).toEqual(['zeta', 'alpha', 'beta']);
  });
});

describe('sortComingSoonMediaProviders', () => {
  it('keeps only non-integrated providers, sorted alphabetically', () => {
    const providers: MediaProvider[] = [
      mediaProvider({ id: 'a', label: 'Zed Provider', integrated: false }),
      mediaProvider({ id: 'b', label: 'Alpha Provider', integrated: false }),
      mediaProvider({ id: 'c', label: 'Integrated', integrated: true }),
    ];
    expect(sortComingSoonMediaProviders(providers).map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('sanitizeMediaProviderDocsUrl', () => {
  it('keeps a well-formed https URL', () => {
    expect(sanitizeMediaProviderDocsUrl('https://example.com/docs')).toBe('https://example.com/docs');
  });

  it('rejects a non-https URL', () => {
    expect(sanitizeMediaProviderDocsUrl('http://example.com')).toBeUndefined();
  });

  it('rejects an unparsable URL and a missing one', () => {
    expect(sanitizeMediaProviderDocsUrl('not a url')).toBeUndefined();
    expect(sanitizeMediaProviderDocsUrl(undefined)).toBeUndefined();
  });
});

describe('deriveMediaProviderRowState', () => {
  it('is empty (no pending edit, not saved, not clearable) for a blank entry', () => {
    expect(deriveMediaProviderRowState({ apiKey: '', baseUrl: '' })).toEqual({
      hasPendingEdit: false,
      isSavedState: false,
      tail: undefined,
      clearable: false,
    });
  });

  it('is a pending edit while the user is typing a new/replacement key', () => {
    const state = deriveMediaProviderRowState({ apiKey: 'sk-new', baseUrl: '' });
    expect(state.hasPendingEdit).toBe(true);
    expect(state.isSavedState).toBe(false);
  });

  it('is saved once configured with no unsaved draft over it, tail included', () => {
    const state = deriveMediaProviderRowState({
      apiKey: '',
      baseUrl: '',
      apiKeyConfigured: true,
      apiKeyTail: '••••1234',
    });
    expect(state.isSavedState).toBe(true);
    expect(state.tail).toBe('••••1234');
    expect(state.clearable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integrations (MCP install snippet) section
// ---------------------------------------------------------------------------

function mcpInfo(over: Partial<McpInstallInfo> = {}): McpInstallInfo {
  return {
    command: '/usr/bin/node',
    args: ['/opt/open-design/cli.js', 'mcp'],
    daemonUrl: 'http://127.0.0.1:7456',
    platform: 'darwin',
    cliExists: true,
    nodeExists: true,
    buildHint: null,
    ...over,
  };
}

const fakeT = (key: string, vars?: Record<string, string | number>): string =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

describe('homeConfigPath', () => {
  it('picks the windows path on win32', () => {
    expect(homeConfigPath('win32', '~/.codex/config.toml', '%USERPROFILE%\\.codex\\config.toml'))
      .toBe('%USERPROFILE%\\.codex\\config.toml');
  });

  it('picks the posix path otherwise', () => {
    expect(homeConfigPath('darwin', '~/.codex/config.toml', '%USERPROFILE%\\.codex\\config.toml'))
      .toBe('~/.codex/config.toml');
    expect(homeConfigPath('linux', '~/.codex/config.toml', '%USERPROFILE%\\.codex\\config.toml'))
      .toBe('~/.codex/config.toml');
  });
});

describe('commandPaletteShortcut', () => {
  it('is the Mac chord on darwin, Ctrl elsewhere', () => {
    expect(commandPaletteShortcut('darwin')).toBe('⌘⇧P');
    expect(commandPaletteShortcut('win32')).toBe('Ctrl+Shift+P');
    expect(commandPaletteShortcut('linux')).toBe('Ctrl+Shift+P');
  });
});

describe('settingsShortcut', () => {
  it('is the Mac chord on darwin, Ctrl elsewhere', () => {
    expect(settingsShortcut('darwin')).toBe('⌘,');
    expect(settingsShortcut('win32')).toBe('Ctrl+,');
  });
});

describe('utf8Btoa', () => {
  it('base64-encodes plain ASCII', () => {
    expect(utf8Btoa('hello')).toBe(btoa('hello'));
  });

  it('encodes a non-Latin-1 path without throwing', () => {
    expect(() => utf8Btoa('/Users/Émile/.fnm/node')).not.toThrow();
    expect(typeof utf8Btoa('/Users/Émile/.fnm/node')).toBe('string');
  });
});

describe('buildMcpStdioServerConfig', () => {
  it('omits the env field when there are no env entries', () => {
    const config = buildMcpStdioServerConfig(mcpInfo({ env: {} }));
    expect(config).toEqual({ command: '/usr/bin/node', args: ['/opt/open-design/cli.js', 'mcp'] });
  });

  it('includes env when non-empty', () => {
    const config = buildMcpStdioServerConfig(mcpInfo({ env: { OD_DATA_DIR: '/data' } }));
    expect(config.env).toEqual({ OD_DATA_DIR: '/data' });
  });
});

describe('buildCodexEnvToml', () => {
  it('is empty with no env entries', () => {
    expect(buildCodexEnvToml(mcpInfo())).toBe('');
  });

  it('renders a mcp_servers.open-design.env TOML table', () => {
    const toml = buildCodexEnvToml(mcpInfo({ env: { OD_DATA_DIR: '/data' } }));
    expect(toml).toContain('[mcp_servers.open-design.env]');
    expect(toml).toContain('OD_DATA_DIR = "/data"');
  });
});

describe('buildSharedMcpJson', () => {
  it('nests the stdio config under mcpServers["open-design"]', () => {
    const json = buildSharedMcpJson(mcpInfo());
    const parsed = JSON.parse(json);
    expect(parsed.mcpServers['open-design']).toEqual({
      command: '/usr/bin/node',
      args: ['/opt/open-design/cli.js', 'mcp'],
    });
  });
});

describe('buildMcpClients', () => {
  it('builds one row per supported client', () => {
    const clients = buildMcpClients(fakeT);
    expect(clients.map((c) => c.id)).toEqual([
      'claude',
      'codex',
      'cursor',
      'vscode',
      'antigravity',
      'zed',
      'windsurf',
    ]);
  });

  it('the Claude row emits a claude mcp add-json one-liner in bash', () => {
    const claude = buildMcpClients(fakeT).find((c) => c.id === 'claude')!;
    const info = mcpInfo();
    expect(claude.buildSnippetLang(info)).toBe('bash');
    expect(claude.buildSnippet(info)).toContain('claude mcp add-json --scope user open-design');
  });

  it('the Codex row emits a TOML snippet including any env table', () => {
    const codex = buildMcpClients(fakeT).find((c) => c.id === 'codex')!;
    const info = mcpInfo({ env: { OD_DATA_DIR: '/data' } });
    expect(codex.buildSnippetLang(info)).toBe('toml');
    expect(codex.buildSnippet(info)).toContain('[mcp_servers.open-design]');
    expect(codex.buildSnippet(info)).toContain('[mcp_servers.open-design.env]');
  });

  it('the Cursor row supports a deeplink built from the utf8-safe base64 config', () => {
    const cursor = buildMcpClients(fakeT).find((c) => c.id === 'cursor')!;
    const info = mcpInfo();
    const deeplink = cursor.buildDeeplink!(info);
    expect(deeplink).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=open-design&config=/);
  });

  it('only Cursor offers a deeplink', () => {
    const clients = buildMcpClients(fakeT);
    const withDeeplink = clients.filter((c) => c.buildDeeplink);
    expect(withDeeplink.map((c) => c.id)).toEqual(['cursor']);
  });
});

// ---------------------------------------------------------------------------
// Notifications section
// ---------------------------------------------------------------------------

describe('soundIdToTracking', () => {
  it('maps every known sound id to its underscored tracking enum', () => {
    expect(soundIdToTracking('ding')).toBe('ding');
    expect(soundIdToTracking('chime')).toBe('chime');
    expect(soundIdToTracking('two-tone-up')).toBe('two_tone_up');
    expect(soundIdToTracking('pluck')).toBe('pluck');
    expect(soundIdToTracking('buzz')).toBe('buzz');
    expect(soundIdToTracking('two-tone-down')).toBe('two_tone_down');
    expect(soundIdToTracking('thud')).toBe('thud');
  });

  it('is undefined for an unrecognized sound id', () => {
    expect(soundIdToTracking('unknown')).toBeUndefined();
  });
});

describe('testNotificationStatusText', () => {
  it('maps each completion-notification result to its i18n key', () => {
    expect(testNotificationStatusText('shown')).toBe('settings.notifyTestSent');
    expect(testNotificationStatusText('permission-denied')).toBe('settings.notifyDesktopBlocked');
    expect(testNotificationStatusText('unsupported')).toBe('settings.notifyDesktopUnsupported');
    expect(testNotificationStatusText('failed')).toBe('settings.notifyTestFailed');
  });
});

// ---------------------------------------------------------------------------
// Execution mode: AMR account (vela sign-in / wallet)
// ---------------------------------------------------------------------------

describe('formatAmrWalletBalance', () => {
  it('returns null for an absent or empty balance', () => {
    expect(formatAmrWalletBalance('en', null)).toBeNull();
    expect(formatAmrWalletBalance('en', undefined)).toBeNull();
    expect(formatAmrWalletBalance('en', '')).toBeNull();
  });

  it('formats a parseable balance as locale currency', () => {
    expect(formatAmrWalletBalance('en', '12.3')).toBe('$12.30');
  });

  it('falls back to a raw dollar-prefixed string for an unparseable balance', () => {
    expect(formatAmrWalletBalance('en', 'not-a-number')).toBe('$not-a-number');
  });
});

// ---------------------------------------------------------------------------
// Execution mode: Local CLI agent grid
// ---------------------------------------------------------------------------

function agentInfo(over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    ...over,
  } as AgentInfo;
}

describe('agentModelSummary', () => {
  it('returns null when the agent has no model list', () => {
    expect(agentModelSummary(agentInfo({ models: undefined }), {}, fakeT)).toBeNull();
  });

  it('falls back to the custom-model copy when the sole known model has no id', () => {
    const agent = agentInfo({ models: [{ id: '', label: 'Custom' }] });
    expect(agentModelSummary(agent, {}, fakeT)).toBe('settings.modelCustom');
  });

  it('labels the configured model, falling back to the first known model', () => {
    const agent = agentInfo({ models: [{ id: 'sonnet', label: 'Latest' }] });
    expect(agentModelSummary(agent, {}, fakeT)).toBe('Latest (sonnet)');
    expect(agentModelSummary(agent, { claude: { model: 'sonnet' } }, fakeT)).toBe('Latest (sonnet)');
  });
});

function connectionTestResult(over: Partial<ConnectionTestResponse> = {}): ConnectionTestResponse {
  return { ok: true, latencyMs: 42, model: 'sonnet', ...over } as ConnectionTestResponse;
}

describe('formatConnectionTestMessage', () => {
  const context = { model: 'sonnet', agentId: 'claude', locale: 'en' as const, t: fakeT };

  it('renders the API success copy for an ok result', () => {
    const message = formatConnectionTestMessage(connectionTestResult({ sample: 'hi' }), 'api', context);
    expect(message).toBe('settings.testSuccessApi:{"ms":42,"sample":"hi"}');
  });

  it('renders the CLI success copy for an ok result', () => {
    const message = formatConnectionTestMessage(
      connectionTestResult({ agentName: 'Claude Code', sample: 'hi' }),
      'cli',
      context,
    );
    expect(message).toBe('settings.testSuccessCli:{"agentName":"Claude Code","ms":42,"sample":"hi"}');
  });

  it('appends the raw detail to a success message when present', () => {
    const message = formatConnectionTestMessage(
      connectionTestResult({ sample: '', detail: 'note' }),
      'api',
      context,
    );
    expect(message).toBe('settings.testSuccessApi:{"ms":42,"sample":""} note');
  });

  it('maps a failure kind to its i18n key', () => {
    const message = formatConnectionTestMessage(
      connectionTestResult({ ok: false, kind: 'auth_failed' }),
      'api',
      context,
    );
    expect(message).toBe('settings.testAuthFailed');
  });

  it('falls back to the context model for not_found_model', () => {
    const message = formatConnectionTestMessage(
      connectionTestResult({ ok: false, kind: 'not_found_model', model: undefined }),
      'api',
      context,
    );
    expect(message).toBe('settings.testNotFoundModel:{"model":"sonnet"}');
  });

  it('surfaces the Codex configured-path guidance for a codex CLI success', () => {
    const message = formatConnectionTestMessage(
      connectionTestResult({
        usedExecutableSource: 'configured',
        configuredExecutablePath: '/usr/local/bin/codex',
      }),
      'cli',
      { ...context, agentId: 'codex' },
    );
    expect(message).toContain('/usr/local/bin/codex');
  });
});
