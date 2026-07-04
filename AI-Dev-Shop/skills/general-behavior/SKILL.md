---
name: general-behavior
version: 0.1.0
last_updated: 2026-06-28
description: Thin universal dispatcher for cross-cutting agent behavior. Load a reference before acting when you need to find or understand anything in a codebase — read the code, find where X is, who calls Y, what does Z call, trace the call chain, impact of changing something, understand the architecture, explore the codebase, find the feature that does X, is this used anywhere, find references to a symbol.
---

# Skill: General Behavior

The single umbrella for behaviors that apply to **every** agent. A thin
**dispatcher**: it holds no behavior, only pointers to the `references/` file to
load when a matching need arises. When your task matches a row below, **read that
reference before acting**, then follow it. Load references just-in-time.

| When you need to... | Load this reference |
|---|---|
| find or understand anything in a codebase (callers, callees, impact, architecture, "where is X", "is this used", "find references") | `references/code-navigation.md` |

## Maintainer note (do not remove)

Keep this `SKILL.md` minimal (≤ 20 lines). It is injected into **every** agent, so
each line is a fixed per-agent cost. Add a behavior by creating an independent
skill under `skills/` plus a thin pointer under `references/`, then a one-line row
above. **Never** inline routing tables, commands, or examples here.
