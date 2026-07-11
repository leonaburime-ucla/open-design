// UI-only types for the settings slice. Wire DTOs live in
// `@open-design/contracts` (re-exported through the web `../../types` barrel);
// these are the view-model shapes the slice's rules, hooks, and components pass
// around. Per ADR 0002 they are never redeclared wire DTOs — they compose the
// app's existing types into slice-local view models.
import type { ProviderModelOption } from '../../types';

/**
 * Hand-rolled per-provider model cache: a fingerprint key (protocol + base URL +
 * hashed secret) mapped to the model options discovered for that provider. The
 * settings/BYOK surfaces and the inline model switchers ride this same cache so
 * a discovery fetch is shared across them; the ADR keeps it hand-rolled (no
 * TanStack/SWR) and behavior-preserving.
 */
export type ProviderModelsCache = Record<string, ProviderModelOption[]>;

/**
 * The Composio credential lifecycle the connector credentials surface renders.
 * Splitting "saved key plus draft" (`saved-pending`) out from a bare `saved`
 * keeps the configured badge anchored while the hint text differentiates an
 * unsaved replacement from a fully-saved value (issue #741).
 */
export type ComposioCredentialState =
  | 'empty'
  | 'pending-new'
  | 'saved'
  | 'saved-pending';

/** A transient run notice shown by the Orbit section (success/error banner). */
export interface OrbitNotice {
  kind: 'success' | 'error';
  message: string;
}

/**
 * Proportional widths (0-100) for the Orbit run-result meter's three
 * segments. Each non-zero segment is floored to a small sliver so it stays
 * visible even when its share rounds to 0%.
 */
export interface OrbitMeterSegments {
  succeeded: number;
  skipped: number;
  failed: number;
}

/** The Composio-gate copy/CTA i18n keys, branched on saved-key presence. */
export interface OrbitConfigGateCopyKeys {
  bodyKey: 'settings.orbit.gateBody' | 'settings.orbit.gateBodyNoKey';
  actionKey: 'settings.orbit.gateAction' | 'settings.orbit.gateActionNoKey';
}

/** A transient reload notice shown by the media-providers section. */
export interface MediaProvidersReloadNotice {
  kind: 'error' | 'success';
  message: string;
}

/** Per-row derived display state for one media-provider card. */
export interface MediaProviderRowState {
  /** True when the user has typed an unsaved key over the row. */
  hasPendingEdit: boolean;
  /** True when a key is saved on the daemon side with no unsaved draft over it. */
  isSavedState: boolean;
  /** The last-4 tail of the saved key for the status badge, if any. */
  tail: string | undefined;
  /** True when the row has any persisted credential to clear. */
  clearable: boolean;
}

// ---------------------------------------------------------------------------
// Integrations (MCP install snippet) section
// ---------------------------------------------------------------------------

/** The agent CLIs/IDEs the Integrations panel can render an install snippet for. */
export type McpClientId =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'vscode'
  | 'zed'
  | 'windsurf'
  | 'antigravity';

/**
 * View-model shape of `GET /api/mcp/install-info`'s payload. This is the
 * `IntegrationsPort`'s result type, defined in-slice per ADR 0002 rather than
 * imported from `providers/mcp/install` — the guard's provider-import rule is
 * AST-level and would flag even an `import type` reaching past `dependencies.ts`.
 */
export interface McpInstallInfo {
  command: string;
  args: string[];
  env?: Record<string, string>;
  daemonUrl: string;
  platform: 'darwin' | 'linux' | 'win32' | string;
  cliExists: boolean;
  nodeExists: boolean;
  buildHint: string | null;
}

/** The `mcpServers`/`context_servers` stdio entry every client snippet builds around. */
export interface McpStdioServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** One row of the Integrations client picker: how to render its method/instruction/snippet. */
export interface McpClient {
  id: McpClientId;
  label: string;
  /** Function so the dropdown can show different methods per OS (Claude Code
   *  uses CLI on POSIX but JSON edit on Windows because the bash/PowerShell/
   *  cmd.exe quoting is too fragile to reliably emit a single command that
   *  works in every shell). */
  buildMethod: (info: McpInstallInfo) => string;
  /** Function so per-OS path hints (~/.cursor on POSIX vs %USERPROFILE%\.cursor
   *  on Windows) and shortcut differences (⌘⇧P vs Ctrl+Shift+P) render correctly. */
  buildInstruction: (info: McpInstallInfo) => string;
  buildSnippet: (info: McpInstallInfo) => string;
  buildSnippetLang: (info: McpInstallInfo) => 'bash' | 'json' | 'toml';
  /** Optional one-click install action. Currently only Cursor supports deeplinks of this shape. */
  buildDeeplink?: (info: McpInstallInfo) => string;
  deeplinkLabel?: () => string;
}

/** Result of the Codex one-click-install probe. */
export interface CodexInstallStatus {
  available: boolean;
  installed: boolean;
}

/** A transient success/error message shown by the Codex one-click install toggle. */
export interface CodexInstallMessage {
  kind: 'success' | 'error';
  text: string;
}

// ---------------------------------------------------------------------------
// Notifications section
// ---------------------------------------------------------------------------

/** The analytics-tracking id for a notification sound, `undefined` for an
 *  unrecognized sound id (a `settings.notify*Sound` config value the
 *  tracking schema doesn't enumerate). */
export type NotificationSoundTrackingId =
  | 'ding'
  | 'chime'
  | 'two_tone_up'
  | 'pluck'
  | 'buzz'
  | 'two_tone_down'
  | 'thud'
  | undefined;

/** i18n key for the "send test notification" status line. */
export type NotificationTestStatusKey =
  | 'settings.notifyTestSent'
  | 'settings.notifyDesktopBlocked'
  | 'settings.notifyDesktopUnsupported'
  | 'settings.notifyTestFailed';
