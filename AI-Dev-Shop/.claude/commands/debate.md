# Swarm Debate Command (/debate)

## Purpose
Shortcut for `/consensus debate` when the user clearly wants the debate mode of Swarm Consensus rather than the generic umbrella command.

## Usage
Provide optional controls and a question. Debate mode is implied, including round-level rationale reporting about why each model holds or changes its position.

## Arguments
- `[controls] [prompt]`
- `controls` (optional): `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and/or `codex_model=<id>`
- `prompt`: the detailed question or architectural problem to analyze

---

**Directive:**
Act as a Swarm Consensus Coordinator in `debate` mode.

1. Treat `/debate $ARGUMENTS` as the exact equivalent of `/consensus debate $ARGUMENTS`.
2. Force `mode=debate` before parsing any remaining controls.
3. Parse optional controls anywhere in args: `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and `codex_model=<id>`.
4. Remaining text is the prompt.
5. If omitted, default to: `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300`.
6. Then follow `<AI_DEV_SHOP_ROOT>/framework/slash-commands/consensus.md` exactly as if the user had invoked `/consensus debate ...`.
