// Pure data constants for the settings slice's execution-mode (BYOK/agent/AMR)
// cluster. No React, no transport, no DOM — split out from `rules.ts` so the
// large lookup tables (per-provider console links, per-agent CLI env fields,
// AMR profile keys) don't crowd the functions that consume them.
import type { ApiProtocol } from '../../types';
import type { ByokProviderPreset } from './types';

export const OPEN_DESIGN_RELEASES_URL = 'https://github.com/nexu-io/open-design/releases';

// The first-party BYOK provider preset chips (protocol chip row). Excludes
// the always-present "Custom" entry, which is built from the live draft by
// `customByokProviderPreset` (needs `t()`/`cfg`, so it can't be a static
// constant) — see `buildByokProviderOptions` in `rules.ts`.
export const BYOK_PROVIDER_PRESETS: ReadonlyArray<ByokProviderPreset> = [
  {
    id: 'anthropic',
    title: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
  },
  {
    id: 'openai',
    title: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  {
    id: 'google-ai-studio',
    title: 'Google Gemini',
    protocol: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.5-flash',
  },
  {
    id: 'ollama',
    title: 'Ollama Cloud',
    protocol: 'ollama',
    baseUrl: 'https://ollama.com',
    model: 'gpt-oss:120b',
  },
  {
    id: 'azure',
    title: 'Azure OpenAI',
    protocol: 'azure',
    baseUrl: '',
    model: '',
  },
  {
    id: 'siliconflow',
    title: '硅基流动',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3.1',
  },
  {
    id: 'ppio',
    title: 'PPIO',
    protocol: 'openai',
    baseUrl: 'https://api.ppinfra.com/v3/openai',
    model: 'deepseek/deepseek-v3.1',
  },
  {
    id: 'nvidia',
    title: 'NVIDIA',
    protocol: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'openai/gpt-oss-120b',
  },
  {
    id: 'stepfun',
    title: 'StepFun',
    protocol: 'openai',
    baseUrl: 'https://api.stepfun.ai/v1',
    model: 'step-2-mini',
  },
  {
    id: 'deepseek',
    title: 'DeepSeek',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.7-sonnet',
  },
  {
    id: 'mistral',
    title: 'Mistral AI',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
  },
  {
    id: 'xai',
    title: 'xAI',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4',
  },
  {
    id: 'together',
    title: 'Together AI',
    protocol: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  },
  {
    id: 'huggingface',
    title: 'Hugging Face',
    protocol: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'openai/gpt-oss-120b',
  },
  {
    id: 'qwen',
    title: '千问',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  {
    id: 'volcengine',
    title: '火山引擎',
    protocol: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1-6',
  },
  {
    id: 'qianfan',
    title: '百度千帆',
    protocol: 'openai',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    model: 'ernie-4.5-turbo-128k',
  },
  {
    id: 'vllm',
    title: 'vLLM',
    protocol: 'openai',
    baseUrl: 'http://127.0.0.1:8000/v1',
    model: 'model',
  },
  {
    id: 'mimo',
    title: '小米 MiMo',
    protocol: 'openai',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
  },
  {
    id: 'minimax',
    title: 'MiniMax',
    protocol: 'anthropic',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    model: 'MiniMax-M2.7-highspeed',
  },
  {
    id: 'moonshot',
    title: 'Moonshot',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0711-preview',
  },
  {
    id: 'zhipu',
    title: '智谱',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.6',
  },
];

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
