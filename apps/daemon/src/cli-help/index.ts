/**
 * @module cli-help
 *
 * Barrel for the pure `od` help-text surfaces. Each file here owns the usage
 * string and help-arg predicate for one command family, kept separate from
 * `cli.ts` (and the command implementations under `cli/`) so a unit test can
 * assert the advertised subcommands without spawning the CLI or stubbing
 * `process.exit` / `console.log`.
 *
 * These are static strings and trivial predicates only — no daemon calls, no
 * command dispatch. Command implementations live in the guarded `cli/` domain.
 */
export * from './brands-cli-help.js';
export * from './design-systems-cli-help.js';
