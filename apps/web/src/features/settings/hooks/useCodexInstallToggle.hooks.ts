// Feature-local hook backing the Codex one-click MCP install toggle: queries
// the daemon for whether `codex mcp get open-design` succeeds, and
// installs/uninstalls Open Design as a Codex MCP server on the user's behalf.
// Its transport is INJECTED as the slice's `IntegrationsPort`, so it holds no
// `fetch` import and is testable against a hand-written fake.
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import type { IntegrationsPort } from '../ports';
import { integrationsPort } from '../dependencies';
import type { CodexInstallMessage } from '../types';

/** Everything the Codex install toggle JSX reads off the controller. */
export interface CodexInstallToggleController {
  available: boolean | null;
  installed: boolean | null;
  busy: boolean;
  message: CodexInstallMessage | null;
  label: string;
  onClick: () => void;
}

export function useCodexInstallToggle(port: IntegrationsPort): CodexInstallToggleController {
  const { t } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<CodexInstallMessage | null>(null);

  const refresh = useCallback(async () => {
    const status = await port.fetchCodexStatus();
    setAvailable(status?.available ?? false);
    setInstalled(status?.installed ?? false);
  }, [port]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<void>, successKey: 'settings.mcpCodexInstallSuccess' | 'settings.mcpCodexUninstallSuccess') => {
      setBusy(true);
      setMessage(null);
      try {
        await action();
        setMessage({ kind: 'success', text: t(successKey) });
        await refresh();
      } catch (err) {
        setMessage({
          kind: 'error',
          text: t('settings.mcpCodexInstallError', { error: err instanceof Error ? err.message : String(err) }),
        });
      } finally {
        setBusy(false);
      }
    },
    [refresh, t],
  );

  const label = installed
    ? t('settings.mcpCodexOneClickUninstall')
    : t('settings.mcpCodexOneClickInstall');

  const onClick = () => {
    if (installed) {
      void run(() => port.uninstallCodex(), 'settings.mcpCodexUninstallSuccess');
    } else {
      void run(() => port.installCodex(), 'settings.mcpCodexInstallSuccess');
    }
  };

  return { available, installed, busy, message, label, onClick };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredCodexInstallToggle(): CodexInstallToggleController {
  return useCodexInstallToggle(integrationsPort);
}
