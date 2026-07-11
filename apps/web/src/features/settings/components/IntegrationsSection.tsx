// The Integrations settings section: the MCP install snippet client picker
// (Claude Code, Codex, Cursor, VS Code, Antigravity, Zed, Windsurf), the
// per-client code block with copy-to-clipboard, and the Codex one-click
// install toggle. All interlocked client/picker/snippet state lives in the
// feature-local `useWiredIntegrations` hook; this component reads that
// controller and renders the exact markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import { useI18n } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { useWiredIntegrations } from '../hooks/useIntegrations.hooks';
import { CodexInstallToggle } from './CodexInstallToggle';

export function IntegrationsSection() {
  const { t } = useI18n();
  const {
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
  } = useWiredIntegrations();

  return (
    <section className="settings-section">
      <div className="mcp-client-body">
        {infoError ? (
          <div
            className="empty-card"
            style={{ marginBottom: 14, color: 'var(--danger-fg, #f88)' }}
          >
            {t('settings.mcpDaemonError', { error: infoError! })}
          </div>
        ) : null}

        {/* Group 1: what the MCP server does */}
        <div className="mcp-capabilities-card">
          <p className="mcp-capabilities-label">
            {t('settings.mcpCapabilitiesTitle')}
          </p>
          <ul className="mcp-capabilities-list">
            <li>{t('settings.mcpCapabilityRead')}</li>
            <li>{t('settings.mcpCapabilityPull')}</li>
            <li>{t('settings.mcpCapabilityDefault')}</li>
          </ul>
        </div>

        {/* Group 2: setup flow */}
        <div className="mcp-setup-card">
          <div
            className="ds-picker"
            ref={pickerRef}
          >
          <button
            type="button"
            className={`ds-picker-trigger${pickerOpen ? ' open' : ''}`}
            onClick={togglePicker}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
          >
            <span className="ds-picker-meta">
              <span className="ds-picker-title">{client.label}</span>
              <span className="ds-picker-sub">
                {info ? client.buildMethod(info) : ''}
              </span>
            </span>
            <Icon
              name="chevron-down"
              size={14}
              className="ds-picker-chevron"
              style={{ transform: pickerOpen ? 'rotate(180deg)' : undefined }}
            />
          </button>
          {pickerOpen ? (
            <div className="ds-picker-popover" role="listbox">
              <div className="ds-picker-list">
                {clients.map((c) => {
                  const active = c.id === clientId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`ds-picker-item${active ? ' active' : ''}`}
                      onClick={() => selectClient(c.id)}
                    >
                      <span className="ds-picker-item-text">
                        <span className="ds-picker-item-title">{c.label}</span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {info ? c.buildMethod(info) : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {info ? (
          <p style={{ margin: 0 }}>{client.buildInstruction(info)}</p>
        ) : null}

        {client.id === 'codex' ? <CodexInstallToggle /> : null}

        {client.buildDeeplink && info ? (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="primary"
              onClick={onDeeplinkClick}
              disabled={!info.cliExists || !info.nodeExists}
              style={{ padding: '6px 14px', fontSize: 13 }}
            >
              <Icon name="link" size={14} />
              <span style={{ marginLeft: 6 }}>{client.deeplinkLabel ? client.deeplinkLabel() : ''}</span>
            </button>
            <span
              style={{
                marginLeft: 10,
                fontSize: 12,
                color: 'var(--fg-2, #9aa0a6)',
              }}
            >
              {t('settings.mcpCursorApproval')}
            </span>
          </div>
        ) : null}

        <div style={{ position: 'relative' }}>
          <pre
            style={{
              background: 'var(--surface-2, #11141a)',
              color: 'var(--fg-1, #e6e6e6)',
              // Reserve top clearance for the absolutely-positioned
              // Copy button so the first line of the snippet does not
              // sit underneath it, and reserve right clearance so a
              // wrapped bash one-liner stops short of the button rather
              // than scrolling behind it. The right padding is sized
              // for the wider "Copied" post-click state (icon + text +
              // button padding + the 8px right offset) with a few px
              // of buffer for elevated font sizes / zoom. Issue #632.
              padding: '40px 104px 12px 14px',
              borderRadius: 8,
              overflowX: 'auto',
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.55,
              margin: 0,
              userSelect: 'text',
              whiteSpace: snippetLang === 'bash' ? 'pre-wrap' : 'pre',
              wordBreak: snippetLang === 'bash' ? 'break-all' : 'normal',
              minHeight: 60,
            }}
            data-lang={snippetLang}
          >
            <code
              style={{
                // Neutralize the global inline-`code` chip style (background,
                // padding, rounded corners, color, size) so it doesn't paint a
                // light rounded rectangle behind every wrapped segment of the
                // dark snippet block — which read as permanent selection
                // highlights on the wrapped `claude mcp add-json` one-liner.
                // Issue #4509.
                background: 'transparent',
                padding: 0,
                borderRadius: 0,
                color: 'inherit',
                fontFamily: 'inherit',
                fontSize: 'inherit',
              }}
            >
              {snippet ||
                (infoError
                  ? t('settings.mcpResolvingFailed')
                  : t('settings.mcpLoadingPaths'))}
            </code>
          </pre>
          <button
            type="button"
            className="ghost mcp-copy-btn"
            onClick={onCopy}
            disabled={!snippet}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              padding: '4px 10px',
              fontSize: 12,
            }}
            aria-label={t('settings.mcpCopyAria')}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
            <span style={{ marginLeft: 6 }}>{copied ? t('settings.mcpCopied') : t('settings.mcpCopy')}</span>
          </button>
        </div>

        {/* "Build the daemon first" lives here — next to the code
            block it explains — rather than at the top of the section
            before the user has seen anything. A dev-mode pre-condition
            warning at the very top reads as "something is broken"
            before the user has even picked their client. */}
        {info && (!info.cliExists || !info.nodeExists) ? (
          <div
            className="empty-card"
            style={{ borderLeft: '3px solid var(--warning-fg, #fbbf24)' }}
          >
            <strong>
              {!info.cliExists
                ? t('settings.mcpBuildDaemon')
                : t('settings.mcpNodeMissing')}
            </strong>{' '}
            {info.buildHint ?? t('settings.mcpBuildHint')}
          </div>
        ) : null}

        {/* Restart note is a "next step" after running the command,
            not an error — keep it right after the code block. */}
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--border-strong)',
            borderRadius: 6,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>{t('settings.mcpRestartNote')}</strong>{' '}
          <span style={{ color: 'var(--text-muted)' }}>
            {t('settings.mcpRestartDetail')}
          </span>
        </div>

          <p className="mcp-running-note">
            {t('settings.mcpRunningNote')}
          </p>
        </div>{/* end mcp-setup-card */}
      </div>
    </section>
  );
}
