import type { McpAuthMode, McpServerConfig, McpTransport } from '../../mcp/index.js';
import type { RuntimeAgentDef } from '../../runtimes/types.js';
import { sanitizeMcpConfig, sanitizeMcpServer } from '../../mcp/index.js';

/** @module run/tools/tool-bundle — MCP tool bundle parsing, validation, and external-MCP resolution for agent run startup. */

/** The resolved set of MCP server configurations attached to a run at startup. */
export interface RunToolBundle {
  mcpServers: McpServerConfig[];
}

/** Lightweight summary of a run's MCP tool bundle for inclusion in analytics and logging. */
export interface RunToolBundleSummary {
  mcpServers: Array<{
    id: string;
    label?: string;
    templateId?: string;
    transport: McpTransport;
    enabled: boolean;
    authMode?: McpAuthMode;
  }>;
}

/** Resolved MCP server selection merging persisted and run-scoped servers, with a set of ids that require persisted tokens. */
export interface ExternalMcpSelection {
  enabledServers: McpServerConfig[];
  persistedTokenServerIds: Set<string>;
}

/** Result of parsing a raw tool bundle from a run request; carries the validated bundle on success or an error message on failure. */
export type RunToolBundleParseResult =
  | { ok: true; bundle: RunToolBundle }
  | { ok: false; message: string };

/** Result of validating a tool bundle against a specific agent's injection capabilities. */
export type RunToolBundleValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/** Where the daemon will deliver the tool bundle's MCP servers for this run. */
export type RunToolBundleDeliveryTarget =
  | 'managed-project'
  | 'external-project'
  | 'none';

/** Options that control agent-specific validation rules applied to a tool bundle. */
export interface RunToolBundleValidationOptions {
  deliveryTarget?: RunToolBundleDeliveryTarget;
}

type RunToolBundleAgent = Pick<
  RuntimeAgentDef,
  'id' | 'name' | 'externalMcpInjection'
>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function agentLabel(agent: RunToolBundleAgent): string {
  return agent.name ? `${agent.name} (${agent.id})` : agent.id;
}

/**
 * Coerces an unknown value into a valid `RunToolBundle`, sanitizing each MCP server entry.
 * Returns an empty bundle when the input is not a plain object.
 * @param raw - Unvalidated value from the run's stored tool bundle field.
 * @returns A sanitized `RunToolBundle` safe to pass to downstream run startup.
 */
export function normalizeRunToolBundleForRun(raw: unknown): RunToolBundle {
  if (!isPlainObject(raw)) return { mcpServers: [] };
  return {
    mcpServers: sanitizeMcpConfig({ servers: raw.mcpServers }).servers,
  };
}

/**
 * Parses and validates a raw `toolBundle` field from an incoming run request body.
 * Rejects duplicate server ids and invalid server shapes with a descriptive error message.
 * @param raw - The `toolBundle` field from the HTTP request body.
 * @returns `{ ok: true, bundle }` on success, or `{ ok: false, message }` describing the first validation error.
 */
export function parseRunToolBundleForRequest(raw: unknown): RunToolBundleParseResult {
  if (raw == null) return { ok: true, bundle: { mcpServers: [] } };
  if (!isPlainObject(raw)) {
    return { ok: false, message: 'toolBundle must be an object' };
  }
  if (raw.mcpServers == null) return { ok: true, bundle: { mcpServers: [] } };
  if (!Array.isArray(raw.mcpServers)) {
    return { ok: false, message: 'toolBundle.mcpServers must be an array' };
  }

  const seen = new Set<string>();
  const servers: McpServerConfig[] = [];
  for (const [index, entry] of raw.mcpServers.entries()) {
    const server = sanitizeMcpServer(entry);
    if (!server) {
      return {
        ok: false,
        message: `toolBundle.mcpServers[${index}] is invalid`,
      };
    }
    if (seen.has(server.id)) {
      return {
        ok: false,
        message: `toolBundle.mcpServers[${index}] duplicates server id "${server.id}"`,
      };
    }
    seen.add(server.id);
    servers.push(server);
  }
  return { ok: true, bundle: { mcpServers: servers } };
}

/**
 * Produces a lightweight analytics-safe summary of a run's MCP tool bundle.
 * Omits server secrets and connection details; retains only identity and capability fields.
 * @param bundle - The resolved tool bundle for the run, or null/undefined if absent.
 * @returns A `RunToolBundleSummary` suitable for inclusion in analytics payloads.
 */
export function summarizeRunToolBundle(bundle: RunToolBundle | null | undefined): RunToolBundleSummary {
  const servers = Array.isArray(bundle?.mcpServers) ? bundle.mcpServers : [];
  return {
    mcpServers: servers.map((server) => ({
      id: server.id,
      ...(server.label ? { label: server.label } : {}),
      ...(server.templateId ? { templateId: server.templateId } : {}),
      transport: server.transport,
      enabled: server.enabled,
      ...(server.authMode ? { authMode: server.authMode } : {}),
    })),
  };
}

/**
 * Validates that a run's tool bundle is compatible with the target agent's MCP injection mechanism.
 * Checks transport constraints and project-type requirements specific to each `externalMcpInjection` mode.
 * @param bundle - The tool bundle to validate, or null/undefined if the run carries none.
 * @param agent - The agent definition for the run; null/undefined triggers an error when enabled servers are present.
 * @param options - Optional delivery-target context that tightens project-type constraints for some agents.
 * @returns `{ ok: true }` when compatible, or `{ ok: false, message }` with a user-facing rejection reason.
 */
export function validateRunToolBundleForAgent(
  bundle: RunToolBundle | null | undefined,
  agent: RunToolBundleAgent | null | undefined,
  options: RunToolBundleValidationOptions = {},
): RunToolBundleValidationResult {
  const servers = Array.isArray(bundle?.mcpServers) ? bundle.mcpServers : [];
  const enabledServers = servers.filter((server) => server.enabled);
  if (enabledServers.length === 0) return { ok: true };
  if (!agent) {
    return {
      ok: false,
      message: 'toolBundle requires a supported agentId',
    };
  }

  if (agent.externalMcpInjection === 'claude-mcp-json') {
    if (options.deliveryTarget && options.deliveryTarget !== 'managed-project') {
      return {
        ok: false,
        message:
          `${agentLabel(agent)} receives run-scoped MCP tool bundles through project .mcp.json, ` +
          'so toolBundle requires a daemon-managed project',
      };
    }
    return { ok: true };
  }

  if (agent.externalMcpInjection === 'opencode-env-content' || agent.externalMcpInjection === 'mimo-env-content') {
    return { ok: true };
  }

  if (agent.externalMcpInjection === 'acp-merge') {
    const unsupported = servers.findIndex(
      (server) => server.enabled && server.transport !== 'stdio',
    );
    if (unsupported === -1) return { ok: true };
    return {
      ok: false,
      message:
        `toolBundle.mcpServers[${unsupported}] uses ${servers[unsupported]?.transport} transport, ` +
        `but ${agentLabel(agent)} only supports stdio run-scoped MCP servers`,
    };
  }

  return {
    ok: false,
    message: `${agentLabel(agent)} does not support run-scoped MCP tool bundles`,
  };
}

/**
 * Merges persisted and run-scoped MCP servers into the final enabled server list for a run.
 * Run-scoped entries override persisted entries with the same id; persisted servers are excluded entirely in sandbox mode.
 * @param persistedServers - Project-level MCP servers from daemon storage.
 * @param runScopedServers - Per-run MCP servers from the request's tool bundle.
 * @param sandboxMode - When `true`, persisted servers are suppressed to isolate the run.
 * @returns An `ExternalMcpSelection` with the merged enabled server list and the set of ids needing persisted tokens.
 */
export function resolveExternalMcpServersForRun({
  persistedServers,
  runScopedServers,
  sandboxMode,
}: {
  persistedServers: McpServerConfig[];
  runScopedServers: McpServerConfig[];
  sandboxMode: boolean;
}): ExternalMcpSelection {
  const runScopedIds = new Set(runScopedServers.map((server) => server.id));
  const persistedForRun = sandboxMode ? [] : persistedServers;
  const byId = new Map<string, McpServerConfig>();

  for (const server of persistedForRun) byId.set(server.id, server);
  for (const server of runScopedServers) byId.set(server.id, server);

  const persistedTokenServerIds = new Set<string>();
  for (const server of persistedForRun) {
    if (!server.enabled) continue;
    if (runScopedIds.has(server.id)) continue;
    persistedTokenServerIds.add(server.id);
  }

  return {
    enabledServers: Array.from(byId.values()).filter((server) => server.enabled),
    persistedTokenServerIds,
  };
}
