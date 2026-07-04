/**
 * @module observability/core/constants
 *
 * Byte/size limits, retention windows, fetch defaults and the Langfuse US base
 * URL shared across the observability domain. These are the numeric vocabulary
 * of the trace pipeline: the payload builders cap field sizes with them, the
 * report senders bound batch sizes and fetch timeouts with them, and the config
 * readers use them as env-override fallbacks. Kept in the foundation kernel so
 * every sibling (`payload`, `report`, `manifest`) leans on one source of truth.
 */

export const DEFAULT_BASE_URL = 'https://us.cloud.langfuse.com';

export const INPUT_MAX_BYTES = 64 * 1024;
export const OUTPUT_MAX_BYTES = 64 * 1024;
export const TOOL_INPUT_MAX_BYTES = 8 * 1024;
export const TOOL_OUTPUT_MAX_BYTES = 8 * 1024;
export const ARTIFACTS_MAX_ITEMS = 50;
export const SESSION_ID_MAX = 200; // Langfuse drops sessionIds longer than this.
export const HARD_BATCH_MAX_BYTES = 1024 * 1024;
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
export const DEFAULT_FETCH_RETRIES = 1;
export const PROMPT_STACK_BLAME_MAX_SECTIONS = 8;
