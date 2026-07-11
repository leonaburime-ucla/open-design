// Web client for the daemon's MCP one-click-install surface: the
// `/api/mcp/install-info` snippet payload consumed by the Settings →
// Integrations panel's per-client code block, and the Codex one-click
// `install/uninstall` actions layered on top of the same payload.

/** Wire shape of `GET /api/mcp/install-info`. */
export interface McpInstallInfoResponse {
  command: string;
  args: string[];
  env?: Record<string, string>;
  daemonUrl: string;
  platform: 'darwin' | 'linux' | 'win32' | string;
  cliExists: boolean;
  nodeExists: boolean;
  buildHint: string | null;
}

/**
 * Fetch the absolute command/args/env the running daemon would use to launch
 * `od mcp`, so client snippets work even when `od` isn't on PATH. Throws on a
 * non-2xx response or transport failure so the caller can surface the error
 * next to the code block instead of silently leaving it blank.
 */
export async function fetchMcpInstallInfo(): Promise<McpInstallInfoResponse> {
  const res = await fetch('/api/mcp/install-info');
  if (!res.ok) throw new Error(`daemon ${res.status}`);
  return (await res.json()) as McpInstallInfoResponse;
}

/** Wire shape of `GET /api/mcp/install/codex/status`. */
export interface McpCodexInstallStatusResponse {
  available: boolean;
  installed: boolean;
}

/**
 * Probe whether the Codex CLI is available and whether Open Design is already
 * registered as one of its MCP servers. Resolves `null` on any failure (daemon
 * unreachable, endpoint missing) so the caller hides the one-click toggle
 * entirely rather than showing a permanent error.
 */
export async function fetchCodexInstallStatus(): Promise<McpCodexInstallStatusResponse | null> {
  try {
    const res = await fetch('/api/mcp/install/codex/status');
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as { available: boolean; installed: boolean };
    return { available: Boolean(data.available), installed: Boolean(data.installed) };
  } catch {
    return null;
  }
}

async function throwOnFailedCodexInstallAction(res: Response): Promise<void> {
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  throw new Error(body?.error?.message || `HTTP ${res.status}`);
}

/** `POST /api/mcp/install/codex` — runs `codex mcp add` on the user's behalf. Throws on failure. */
export async function installCodexMcp(): Promise<void> {
  const res = await fetch('/api/mcp/install/codex', { method: 'POST' });
  await throwOnFailedCodexInstallAction(res);
}

/** `DELETE /api/mcp/install/codex` — runs `codex mcp remove` on the user's behalf. Throws on failure. */
export async function uninstallCodexMcp(): Promise<void> {
  const res = await fetch('/api/mcp/install/codex', { method: 'DELETE' });
  await throwOnFailedCodexInstallAction(res);
}
