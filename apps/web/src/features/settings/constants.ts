// Pure data constants for the settings slice's execution-mode (BYOK/agent/AMR)
// cluster. No React, no transport, no DOM — split out from `rules.ts` so the
// large lookup tables (per-provider console links, per-agent CLI env fields,
// AMR profile keys) don't crowd the functions that consume them.
import type { ApiProtocol } from '../../types';

export const OPEN_DESIGN_RELEASES_URL = 'https://github.com/nexu-io/open-design/releases';

// When AMR sign-in completes, vela's live `models` catalog can lag the
// credential write by a beat (the link backend has to register the freshly
// authorized device). Re-detect a few times so a momentarily-empty catalog
// doesn't leave the model picker hidden — the symptom that previously needed
// an app restart / reinstall to clear.
export const AMR_SIGN_IN_RESCAN_ATTEMPTS = 4;
export const AMR_SIGN_IN_RESCAN_RETRY_MS = 1500;

// Providers whose live model fetch IS their full account catalogue, so the
// per-option "from your account" badge and the "Loaded N from your account"
// hint are noise — every option carries the same badge and distinguishes
// nothing. For these we drop the source label and show a plain count instead.
// Add a protocol here when the same applies to another provider.
export const ACCOUNT_MODEL_SOURCE_LABEL_HIDDEN = new Set<ApiProtocol>([
  'aihubmix',
  'bedrock',
]);

export const API_KEY_CONSOLE_LINKS: Record<ApiProtocol, { host: string; url: string }> = {
  anthropic: {
    host: 'console.anthropic.com',
    url: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    host: 'platform.openai.com',
    url: 'https://platform.openai.com/api-keys',
  },
  azure: {
    host: 'portal.azure.com',
    url: 'https://portal.azure.com/',
  },
  google: {
    host: 'aistudio.google.com',
    url: 'https://aistudio.google.com/apikey',
  },
  ollama: {
    host: 'ollama.com',
    url: 'https://ollama.com/settings/keys',
  },
  senseaudio: {
    host: 'docs.senseaudio.cn',
    url: 'https://docs.senseaudio.cn',
  },
  aihubmix: {
    host: 'aihubmix.com',
    url: 'https://aihubmix.com/?aff=JA1e',
  },
  bedrock: {
    host: 'aws.amazon.com',
    url: 'https://aws.amazon.com/bedrock/',
  },
};

export const AGENT_SHORT_DESCRIPTIONS: Record<string, string> = {
  claude: 'Anthropic official CLI',
  codex: 'OpenAI official CLI',
  'cursor-agent': 'Cursor command line',
  opencode: 'Open-source agent CLI',
  qwen: 'Qwen coding CLI',
  copilot: 'GitHub coding CLI',
  devin: 'Cognition terminal CLI',
  kimi: 'Moonshot Kimi CLI',
  qoder: 'Alibaba coding CLI',
  pi: 'Inflection chat CLI',
  kiro: 'Kiro agent CLI',
  kilo: 'Kilo Code CLI',
  vibe: 'Mistral open-source CLI',
  deepseek: 'DeepSeek terminal UI',
  hermes: 'ACP agent CLI',
  'grok-build': 'xAI coding CLI',
  reasonix: 'DeepSeek native coding CLI',
};

export const AGENT_CLI_ENV_FIELDS = [
  {
    agentId: 'claude',
    envKey: 'CLAUDE_CONFIG_DIR',
    labelKey: 'settings.cliEnvClaudeConfigDir',
    placeholder: '~/.claude-2',
  },
  {
    agentId: 'claude',
    envKey: 'ANTHROPIC_BASE_URL',
    labelKey: 'settings.cliEnvClaudeBaseUrl',
    placeholder: 'https://your-proxy.example.com',
  },
  {
    agentId: 'claude',
    envKey: 'ANTHROPIC_API_KEY',
    labelKey: 'settings.cliEnvClaudeApiKey',
    placeholder: 'Paste CLI API key',
    secret: true,
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_HOME',
    labelKey: 'settings.cliEnvCodexHome',
    placeholder: '~/.codex-alt',
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_BIN',
    labelKey: 'settings.cliEnvCodexBin',
    placeholder: '/absolute/path/to/codex',
  },
  {
    agentId: 'codex',
    envKey: 'OPENAI_BASE_URL',
    labelKey: 'settings.cliEnvCodexBaseUrl',
    placeholder: 'https://your-proxy.example.com/v1',
  },
  {
    agentId: 'codex',
    envKey: 'CODEX_API_KEY',
    labelKey: 'settings.cliEnvCodexApiKey',
    labelSuffix: 'CODEX_API_KEY',
    placeholder: 'Paste CODEX_API_KEY',
    secret: true,
  },
  {
    agentId: 'codex',
    envKey: 'OPENAI_API_KEY',
    labelKey: 'settings.cliEnvCodexApiKey',
    labelSuffix: 'OPENAI_API_KEY',
    placeholder: 'Paste OPENAI_API_KEY',
    secret: true,
  },
] as const;

export const AGENT_CLI_AUTH_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CODEX_API_KEY',
  'OPENAI_API_KEY',
]);
export const AGENT_CLI_BASE_URL_ENV_KEYS = new Set(['ANTHROPIC_BASE_URL', 'OPENAI_BASE_URL']);

export const AMR_PROFILE_AGENT_ID = 'amr';
export const AMR_PROFILE_ENV_KEY = 'OPEN_DESIGN_AMR_PROFILE';
