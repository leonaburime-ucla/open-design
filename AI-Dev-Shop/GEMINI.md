# AI Dev Shop (speckit) — Gemini CLI Entry Point

`<AI_DEV_SHOP_ROOT>` means the path to this toolkit folder (typically `AI-Dev-Shop/`).

**CRITICAL INSTRUCTION:** Read `<AI_DEV_SHOP_ROOT>/AGENTS.md` on startup for full operating instructions: all agent definitions, pipeline stages, routing rules, convergence policy, dispatch protocol, slash commands, and human checkpoints.

## Gemini CLI: Spawning Agents

Use your available tools to dispatch each specialized agent. Include their `<AI_DEV_SHOP_ROOT>/agents/<name>/skills.md`, the relevant `<AI_DEV_SHOP_ROOT>/skills/*/SKILL.md` files listed in their Skills section, the active spec with hash, and the specific task directive.

## Gemini CLI: Command Usage

Slash commands are not natively supported in Gemini CLI. Use Option B from `<AI_DEV_SHOP_ROOT>/AGENTS.md`: open `<AI_DEV_SHOP_ROOT>/framework/slash-commands/<command>.md`, paste the contents as your prompt, and replace `$ARGUMENTS`.
