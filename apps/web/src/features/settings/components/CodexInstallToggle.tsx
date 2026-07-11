// One-click install toggle for Codex: queries the daemon for whether
// `codex mcp get open-design` succeeds, and POSTs/DELETEs the install
// endpoint to call `codex mcp add/remove` on the user's behalf. The
// copy-snippet path still works for users who prefer to paste manually or
// whose Codex CLI is not on PATH (button shows a disabled hint in that case).
//
// Consumed by `IntegrationsSection` when the selected client is Codex (ADR 0002).
import { useI18n } from '../../../i18n';
import { useWiredCodexInstallToggle } from '../hooks/useCodexInstallToggle.hooks';

export function CodexInstallToggle(): JSX.Element | null {
  const { t } = useI18n();
  const { available, installed, busy, message, label, onClick } = useWiredCodexInstallToggle();

  if (available === null) return null;

  if (!available) {
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          disabled
          style={{ padding: '6px 14px', fontSize: 13, opacity: 0.6 }}
        >
          {t('settings.mcpCodexOneClickInstall')}
        </button>
        <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--fg-2, #9aa0a6)' }}>
          {t('settings.mcpCodexOneClickUnavailable')}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        className={installed ? '' : 'primary'}
        disabled={busy}
        onClick={onClick}
        style={{ padding: '6px 14px', fontSize: 13 }}
      >
        {busy ? t('settings.mcpCodexBusy') : label}
      </button>
      {message ? (
        <span
          style={{
            marginLeft: 10,
            fontSize: 12,
            color: message.kind === 'error' ? 'var(--danger, #ff6b6b)' : 'var(--fg-2, #9aa0a6)',
          }}
        >
          {message.text}
        </span>
      ) : null}
    </div>
  );
}
