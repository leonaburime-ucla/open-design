/** @module defs/index
 * Public surface for the declarative per-CLI `RuntimeAgentDef` catalog: one file per
 * supported coding-agent CLI (Claude, Codex, Cursor, Aider, …), plus AMR/Vela model
 * probing helpers and Antigravity's model-lock file. Each def file depends only on
 * `core/` (via `shared.ts`, an intra-subdir helper never exported here) — defs never
 * reaches another subdirectory.
 */
export * from './aider.js';
export * from './amp.js';
export * from './amr.js';
export * from './antigravity.js';
export * from './claude.js';
export * from './codebuddy.js';
export * from './codex.js';
export * from './copilot.js';
export * from './cursor-agent.js';
export * from './deepseek.js';
export * from './devin.js';
export * from './grok-build.js';
export * from './hermes.js';
export * from './kilo.js';
export * from './kimi.js';
export * from './kiro.js';
export * from './mimo.js';
export * from './opencode.js';
export * from './pi.js';
export * from './qoder.js';
export * from './qwen.js';
export * from './reasonix.js';
export * from './trae-cli.js';
export * from './vibe.js';
