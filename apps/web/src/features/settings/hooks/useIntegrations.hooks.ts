// Feature-local hook for the Integrations settings section: the per-client
// MCP install snippet (Claude Code, Codex, Cursor, VS Code, Antigravity, Zed,
// Windsurf), its client picker, and the "Copied" clipboard flash. Its
// transport + browser-subscription dependencies are INJECTED as the slice's
// `IntegrationsPort`, so it holds no `fetch`/`document` import and is testable
// against a hand-written fake.
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useI18n } from '../../../i18n';
import type { IntegrationsPort } from '../ports';
import { integrationsPort } from '../dependencies';
import type { McpClient, McpClientId, McpInstallInfo } from '../types';
import { buildMcpClients } from '../rules';

/** Everything the Integrations section JSX reads off the controller. */
export interface IntegrationsController {
  clients: McpClient[];
  clientId: McpClientId;
  client: McpClient;
  pickerOpen: boolean;
  pickerRef: RefObject<HTMLDivElement>;
  info: McpInstallInfo | null;
  infoError: string | null;
  copied: boolean;
  snippet: string;
  snippetLang: 'bash' | 'json' | 'toml';
  selectClient: (id: McpClientId) => void;
  togglePicker: () => void;
  onCopy: () => void;
  onDeeplinkClick: () => void;
}

export function useIntegrations(port: IntegrationsPort): IntegrationsController {
  const { t } = useI18n();
  const clients = buildMcpClients(t);

  const [clientId, setClientId] = useState<McpClientId>('claude');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<McpInstallInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  // The reset is wired through a ref-driven cancel rather than effect
  // cleanup so re-clicks during the 2s window restart the countdown.
  const copyCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      copyCancelRef.current?.();
    };
  }, []);

  // Close the dropdown on outside click or Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    return port.subscribePickerDismiss(() => pickerRef.current, () => setPickerOpen(false));
  }, [pickerOpen, port]);

  // Pull the absolute paths to node + cli.js from the running daemon so
  // snippets work even when `od` isn't on PATH (the realistic case for
  // source clones, plus macOS/Linux ship a /usr/bin/od that shadows any
  // global install). Fetched on mount; if the daemon is unreachable we
  // surface a clear error instead of a half-built snippet that would
  // silently fail when pasted.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await port.fetchInstallInfo();
        if (cancelled) return;
        setInfo(data);
        setInfoError(null);
      } catch (err) {
        if (cancelled) return;
        setInfoError(String(err && (err as Error).message ? (err as Error).message : err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [port]);

  const client = clients.find((c) => c.id === clientId) ?? clients[0]!;
  const snippet = info ? client.buildSnippet(info) : '';
  const snippetLang: 'bash' | 'json' | 'toml' = info
    ? client.buildSnippetLang(info)
    : 'json';

  // Reset the "Copied" badge when the user flips to a different client;
  // otherwise the green check sits there next to a snippet they haven't
  // actually copied.
  useEffect(() => {
    setCopied(false);
    copyCancelRef.current?.();
    copyCancelRef.current = null;
  }, [clientId]);

  const selectClient = (id: McpClientId) => {
    setClientId(id);
    setPickerOpen(false);
  };

  const togglePicker = () => setPickerOpen((v) => !v);

  const onCopy = () => {
    if (!snippet) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(snippet);
        setCopied(true);
        copyCancelRef.current?.();
        copyCancelRef.current = port.scheduleCopyResetTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard API can fail under non-secure contexts; the snippet is
        // selectable so the user can still copy manually.
        setCopied(false);
      }
    })();
  };

  const onDeeplinkClick = () => {
    if (!client.buildDeeplink || !info) return;
    port.openDeeplink(client.buildDeeplink(info));
  };

  return {
    clients,
    clientId,
    client,
    pickerOpen,
    pickerRef,
    info,
    infoError,
    copied,
    snippet,
    snippetLang,
    selectClient,
    togglePicker,
    onCopy,
    onDeeplinkClick,
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredIntegrations(): IntegrationsController {
  return useIntegrations(integrationsPort);
}
