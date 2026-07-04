# Swarm Debate Command (/debate)

## Purpose
Shortcut for `/consensus debate` when the user clearly wants the debate mode of Swarm Consensus rather than the generic umbrella command.

## Debate Routing Guard

`/debate` always means Swarm Consensus debate with external peer LLM CLIs. Do not use platform subagents, current-LLM helper agents, or repo-persona consultation for this command unless the user explicitly asks for current-LLM subagents or repo-persona consultation instead of Swarm Consensus.

## Debate Problem-Framing Guard

Round 1 must be adversarial and solution-neutral. Frame the prompt as "what we need" and "how best to create it" before naming any candidate implementation. If a likely solution is included, present it as one option among alternatives and require peers to critique it, reject it if warranted, and surface failure modes. Do not write peer prompts that imply the Coordinator has already chosen the answer unless the user explicitly requested proposal validation.

## Usage
Provide optional controls and a question. Debate mode is implied, including round-level rationale reporting about why each model holds or changes its position. Before external peer dispatch, the Coordinator must show a concise Peer Dispatch Brief, link the exact peer-facing prompt/context file, and wait for the user to reply `run`.

## Arguments
- `[controls] [prompt]`
- `controls` (optional): `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and/or `codex_model=<id>`
- `prompt`: the detailed question or architectural problem to analyze

---

**Directive:**
Act as a Swarm Consensus Coordinator in `debate` mode.

1. Apply the Debate Routing Guard before any subagent or consultation action.
2. Treat `/debate $ARGUMENTS` as the exact equivalent of `/consensus debate $ARGUMENTS`.
3. Force `mode=debate` before parsing any remaining controls.
4. Parse optional controls anywhere in args: `max_rounds=<int>`, `min_confidence=<0.0-1.0>`, `swarm_timeout_seconds=<int>`, `claude_model=<id>`, `gemini_model=<id>`, and `codex_model=<id>`.
5. Remaining text is the prompt.
6. If omitted, default to: `max_rounds=2`, `min_confidence=0.90`, `swarm_timeout_seconds=300`.
7. Apply the Debate Problem-Framing Guard when creating the Round 1 prompt/context packet.
8. Then follow `<AI_DEV_SHOP_ROOT>/framework/slash-commands/consensus.md` exactly as if the user had invoked `/consensus debate ...`.
