# Harness Hooks

This folder is reserved for future harness hook integrations.

Hooks are host- or harness-level lifecycle integration points that let the coding environment run extra logic automatically when specific events happen.

Examples:

- before or after tool execution
- before completion or handoff
- on approval waits or other attention-needed states
- on session startup, resume, or shutdown

Why hooks matter:

- they can enforce checks earlier than CI
- they can surface build, lint, or type failures before an agent declares success
- they can attach extra context at the moment a tool or workflow event occurs
- they can notify maintainers when an agent needs attention or finishes work

Why this folder exists now:

- some hosts support hook-like lifecycle integrations today
- other hosts do not, or do not expose a reliable local probe yet
- host capabilities can change over time, so this repo should be ready to document and add hook support without pretending it already exists

Current status in this repo:

- this repo does **not** currently implement harness hooks as an active feature
- `harness-engineering/` currently relies on validators, CI enforcement, scheduled maintenance, and capability verification instead
- hook support should only be described as enabled when it is verified on the current host and wired into the framework

Implementation rule:

- do not claim hook support based on memory, vendor reputation, or another host's behavior
- follow `harness-engineering/runtime/capability-verification.md`
- add host-specific hook support only when there is a concrete integration point, a local or official verification path, and clear user-facing behavior

Possible future contents of this folder:

- host-specific setup notes
- example hook scripts
- notification or attention-routing helpers
- pre-completion or pre-handoff enforcement hooks
- a hook capability matrix if support expands across hosts
