/**
 * @module design
 *
 * Barrel for the design lifecycle modules: the one-shot synthesis of a
 * project's design intent into a `DESIGN.md` artifact (`finalize-design`),
 * the read-only handoff-prompt synthesis pipeline that reuses that
 * machinery (`handoff-design`), and the Claude `DESIGN.md` zip importer
 * (`claude-design-import`). Grouping these flat top-level files into
 * `design/` cuts daemon/src clutter; this is a structural move only, the
 * public export surface is unchanged. `handoff-design` depends on
 * `finalize-design` internally (shared BYOK/provider call machinery).
 */
export * from './finalize-design.js';
export * from './handoff-design.js';
export * from './claude-design-import.js';
