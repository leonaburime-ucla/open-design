// The connectors settings section: a Composio API-key credential form (with a
// two-stage destructive "Clear" confirmation) above the connector catalogue
// browser. All of the interlocked save/clear state lives in the feature-local
// `useComposioKeyForm` hook; this component reads that controller and renders
// the exact markup the dialog and the standalone Integrations view both mount.
//
// Consumed by the SettingsDialog orchestrator and by IntegrationsView through
// the slice barrel (ADR 0002). The Composio persistence transport is injected
// as `onPersistComposioKey`, so this file holds no `fetch` of its own.
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../../i18n';
import type { AppConfig } from '../../../types';
import { Icon } from '../../../components/Icon';
import { ConnectorsBrowser } from '../../../components/ConnectorsBrowser';
import { useComposioKeyForm } from '../hooks/useComposioKeyForm.hooks';

export function ConnectorSection({
  cfg,
  setCfg,
  composioConfigLoading = false,
  onPersistComposioKey,
  onConnectorsTabClick,
  onConnectorAuthResult,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  /** True while the daemon-backed Composio config is still hydrating on
   *  first paint. The credentials surface renders a skeleton over the
   *  input + buttons so the user does not mistake the temporarily empty
   *  input for "no saved key", and so accidental Save/Clear clicks
   *  cannot overwrite the saved state with `''` before hydration lands. */
  composioConfigLoading?: boolean;
  /** Persist the freshly typed Composio API key to the daemon. Returns
   *  once both localStorage and the daemon have caught up so the
   *  section-local Save button can flip from "Saving…" back to idle. */
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
  /** Optional analytics hook for the integrations surface. The parent
   *  (IntegrationsView) wires this so connectors-tab clicks emit on
   *  `page_name: 'integrations'`; when omitted (SettingsDialog uses the
   *  settings page family instead), no event is fired. */
  onConnectorsTabClick?: (
    element:
      | 'api_key_input'
      | 'save_key'
      | 'clear'
      | 'get_api_key'
      | 'gate_card'
      | 'provider_chip'
      | 'search_connectors',
  ) => void;
  /** Analytics hook for the per-connector authorization result. Wired
   *  by the parent so settings_connector_auth_result events fire on
   *  the settings page family. */
  onConnectorAuthResult?: (params: {
    connectorId: string;
    action: 'connect' | 'disconnect' | 'refresh';
    result: 'success' | 'failed' | 'cancelled';
    errorCode?: string;
  }) => void;
}) {
  const { t } = useI18n();
  const {
    apiKey,
    hasSavedKey,
    hasPendingEdit,
    apiKeyConfigured,
    savedApiKeyConfigured,
    tail,
    keySaveStatus,
    catalogRefreshNonce,
    clearStage,
    clearArmed,
    saveDisabled,
    clearDisabled,
    finalConfirmButtonRef,
    updateComposio,
    handleSaveKey,
    handleClearRequest,
    handleClearAbort,
    handleClearContinue,
    handleClearCommit,
  } = useComposioKeyForm({ cfg, setCfg, composioConfigLoading, onPersistComposioKey });

  return (
    <section className="settings-section settings-section-connectors">

      <label
        className={`field settings-section-connectors-credentials${composioConfigLoading ? ' is-loading' : ''}`}
        aria-busy={composioConfigLoading || undefined}
      >
        <span className="field-label-row">
          <span className="field-label-group">
            <span className="field-label">{t('settings.connectorsComposioApiKey')}</span>
            {composioConfigLoading ? (
              // Skeleton chip stands in for the "Saved · ••••XXXX" badge
              // while we wait for the daemon. Same footprint as the real
              // chip so the row geometry doesn't jump on resolve.
              <span
                className="field-status-badge field-status-badge-skeleton"
                aria-hidden="true"
              />
            ) : hasSavedKey ? (
              <span
                className="field-status-badge"
                title={t('settings.connectorsSavedTitle')}
              >
                {tail
                  ? t('settings.connectorsSavedWithTail', { tail })
                  : t('settings.connectorsSaved')}
              </span>
            ) : null}
          </span>
          <a
            className="field-label-link"
            href="https://app.composio.dev"
            target="_blank"
            rel="noreferrer"
            onClick={() => onConnectorsTabClick?.('get_api_key')}
          >
            {t('settings.connectorsGetApiKey')}
            <Icon name="external-link" size={11} />
          </a>
        </span>
        <div className="field-row">
          {/* Wrap the password input so the shimmer overlay can sit on
              top of it without affecting layout. The input itself stays
              mounted (rather than swapped for a placeholder div) so the
              browser keeps any in-progress autofill, focus, and
              accessibility tree intact when hydration completes. */}
          <span className="field-input-skeleton-wrap">
            <input
              type="password"
              value={apiKey}
              placeholder={
                composioConfigLoading
                  ? t('settings.connectorsLoadingSavedKey')
                  : hasSavedKey
                    ? t('settings.connectorsReplaceKeyPlaceholder')
                    : t('settings.connectorsApiKeyPlaceholder')
              }
              onFocus={() => onConnectorsTabClick?.('api_key_input')}
              onChange={(e) => updateComposio({ apiKey: e.target.value })}
              onKeyDown={(e) => {
                // Enter from the password field commits the key — the
                // most common save gesture for credential fields, and
                // it removes the need to mouse over to the button.
                if (
                  e.key === 'Enter'
                  && hasPendingEdit
                  && keySaveStatus !== 'saving'
                  && !composioConfigLoading
                ) {
                  e.preventDefault();
                  void handleSaveKey();
                }
              }}
              disabled={composioConfigLoading}
              aria-describedby="composio-api-key-help"
            />
            {composioConfigLoading ? (
              <span className="field-input-skeleton-shimmer" aria-hidden="true" />
            ) : null}
          </span>
          <button
            type="button"
            className={'primary settings-connectors-save' + (keySaveStatus === 'saving' ? ' is-busy' : '')}
            disabled={saveDisabled}
            onClick={() => {
              onConnectorsTabClick?.('save_key');
              void handleSaveKey();
            }}
            title={
              composioConfigLoading
                ? t('settings.connectorsLoadingSavedKey')
                : t('settings.connectorsSaveKeyTitle')
            }
          >
            {keySaveStatus === 'saving' ? (
              <>
                <Icon name="spinner" size={12} className="icon-spin" />
                <span>{t('settings.connectorsKeySaving')}</span>
              </>
            ) : keySaveStatus === 'saved' ? (
              <>
                <Icon name="check" size={12} />
                <span>{t('settings.connectorsKeySaved')}</span>
              </>
            ) : (
              t('settings.connectorsSaveKey')
            )}
          </button>
          <button
            type="button"
            className={
              'ghost settings-connectors-clear'
              + (clearStage !== 'idle' ? ' is-arming' : '')
            }
            disabled={clearDisabled}
            title={
              composioConfigLoading
                ? t('settings.connectorsLoadingSavedKey')
                : undefined
            }
            aria-expanded={clearStage !== 'idle'}
            aria-controls="composio-clear-confirm"
            onClick={() => {
              onConnectorsTabClick?.('clear');
              handleClearRequest();
            }}
          >
            {t('settings.connectorsClear')}
          </button>
        </div>
        {/* Two-stage destructive confirmation panel. Lives inside the
            credentials field so it visually grows out of the row that
            owns the action, instead of floating disconnected at the
            bottom of the section. The panel is destructive-styled
            (red border + soft red bg) and uses an alertdialog role so
            screen readers treat it as a modal blocker for the field. */}
        {clearStage !== 'idle' ? (
          <div
            id="composio-clear-confirm"
            className={
              'settings-connectors-clear-confirm is-' + clearStage
              + (clearStage === 'final' && clearArmed ? ' is-armed' : '')
            }
            role="alertdialog"
            aria-modal="false"
            aria-labelledby="composio-clear-confirm-title"
            aria-describedby="composio-clear-confirm-body"
          >
            <div className="settings-connectors-clear-confirm-icon" aria-hidden="true">
              <span className="settings-connectors-clear-confirm-glyph">!</span>
            </div>
            <div className="settings-connectors-clear-confirm-copy">
              <strong id="composio-clear-confirm-title">
                {clearStage === 'final'
                  ? t('settings.connectorsClearFinalTitle')
                  : t('settings.connectorsClearConfirmTitle')}
              </strong>
              <span id="composio-clear-confirm-body">
                {clearStage === 'final'
                  ? t('settings.connectorsClearFinalBody')
                  : t('settings.connectorsClearConfirmBody')}
              </span>
            </div>
            <div className="settings-connectors-clear-confirm-actions">
              <button
                type="button"
                className="ghost"
                onClick={handleClearAbort}
              >
                {t('settings.connectorsClearCancel')}
              </button>
              {clearStage === 'confirm' ? (
                <button
                  type="button"
                  className="settings-connectors-clear-step"
                  onClick={handleClearContinue}
                >
                  {t('settings.connectorsClearConfirmContinue')}
                  <Icon name="chevron-right" size={12} />
                </button>
              ) : (
                <button
                  ref={finalConfirmButtonRef}
                  type="button"
                  className={
                    'settings-connectors-clear-commit'
                    + (clearArmed ? ' is-armed' : '')
                  }
                  onClick={handleClearCommit}
                  disabled={!clearArmed}
                  aria-disabled={!clearArmed}
                >
                  <span className="settings-connectors-clear-commit-arm" aria-hidden="true" />
                  <span className="settings-connectors-clear-commit-label">
                    {clearArmed ? (
                      t('settings.connectorsClearFinalConfirm')
                    ) : (
                      <>
                        <Icon name="spinner" size={12} className="icon-spin" />
                        {t('settings.connectorsClearArming')}
                      </>
                    )}
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : null}
        <span
          id="composio-api-key-help"
          className={`hint${composioConfigLoading ? ' field-hint-loading' : ''}`}
          role={composioConfigLoading ? 'status' : undefined}
          aria-live={composioConfigLoading ? 'polite' : undefined}
        >
          {composioConfigLoading ? (
            <>
              <Icon name="spinner" size={11} className="icon-spin" />
              <span>{t('settings.connectorsLoadingSavedKey')}</span>
            </>
          ) : keySaveStatus === 'error'
            ? t('settings.connectorsKeyError')
            : hasSavedKey
              ? t('settings.connectorsHelpSaved')
              : apiKeyConfigured
                ? t('settings.connectorsHelpUnsaved')
                : t('settings.connectorsHelpEmpty')}
        </span>
      </label>

      <ConnectorsBrowser
        composioConfigured={savedApiKeyConfigured}
        catalogRefreshKey={`${savedApiKeyConfigured ? 'configured' : 'empty'}:${tail ?? ''}:${catalogRefreshNonce}`}
        {...(onConnectorsTabClick ? { onConnectorsTabClick } : {})}
        {...(onConnectorAuthResult ? { onConnectorAuthResult } : {})}
      />
    </section>
  );
}
