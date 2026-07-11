// The media-providers settings section: the reload row, the "available"
// provider catalogue (editable key/base-url/model cards), and the collapsed
// "coming soon" roadmap list. All interlocked reload/visibility/catalogue
// state lives in the feature-local `useWiredMediaProviders` hook; this
// component reads that controller and renders the exact markup the dialog
// mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { Dispatch, SetStateAction } from 'react';
import { VisuallyHidden } from '@open-design/components';
import { useAnalytics } from '../../../analytics/provider';
import { trackSettingsMediaProvidersClick } from '../../../analytics/events';
import { useI18n } from '../../../i18n';
import { Icon } from '../../../components/Icon';
import { XaiOAuthControl } from '../../../components/XaiOAuthControl';
import type { AppConfig, ProviderModelOption } from '../../../types';
import { useWiredMediaProviders } from '../hooks/useMediaProviders.hooks';
import { deriveMediaProviderRowState, sanitizeMediaProviderDocsUrl } from '../rules';

export function MediaProvidersSection({
  cfg,
  setCfg,
  mediaProvidersNotice,
  onReloadMediaProviders,
  providerModelsCache: sharedProviderModelsCache,
  onProviderModelsCacheChange,
  pendingLocalProviderIds,
  onChange,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  mediaProvidersNotice?: string | null;
  onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
  providerModelsCache?: Record<string, ProviderModelOption[]>;
  onProviderModelsCacheChange?: Dispatch<SetStateAction<Record<string, ProviderModelOption[]>>>;
  pendingLocalProviderIds: ReadonlySet<string>;
  onChange: (providerId: string) => void;
}) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const {
    availableProviders,
    comingSoonProviders,
    reloadRunning,
    reloadNotice,
    visibleApiKeys,
    updateProvider,
    handleReload,
    toggleApiKeyVisibility,
  } = useWiredMediaProviders({
    cfg,
    setCfg,
    onReloadMediaProviders,
    pendingLocalProviderIds,
    onChange,
    t,
  });

  return (
    <section className="settings-section">
      {mediaProvidersNotice ? (
        <p className="hint" role="alert">{mediaProvidersNotice}</p>
      ) : null}
      {reloadNotice && reloadNotice.kind === 'error' ? (
        // Errors only — successful reload feedback now rides on the
        // button (see is-success-flash above) and clears itself after
        // 2s, so the section header doesn't get colonised by a
        // permanent "yes I did the thing" paragraph.
        <p className="hint" role="alert">{reloadNotice.message}</p>
      ) : null}
      {reloadNotice && reloadNotice.kind === 'success' ? (
        // Off-screen announcement so assistive tech still hears the
        // success state even though the visible feedback collapses
        // into a transient button label change.
        <VisuallyHidden role="status">
          {reloadNotice.message}
        </VisuallyHidden>
      ) : null}
      {onReloadMediaProviders ? (
        <div className="media-provider-reload-row">
          <button
            type="button"
            className={`ghost media-provider-reload-btn${
              reloadNotice?.kind === 'success' ? ' is-success-flash' : ''
            }`}
            onClick={() => {
              trackSettingsMediaProvidersClick(analytics.track, {
                page_name: 'settings',
                area: 'media_providers',
                element: 'reload',
              });
              handleReload();
            }}
            disabled={reloadRunning}
            aria-live="polite"
          >
            {reloadRunning ? (
              t('common.loading')
            ) : reloadNotice?.kind === 'success' ? (
              <>
                <Icon name="check" size={13} />
                <span style={{ marginLeft: 4 }}>Reloaded</span>
              </>
            ) : (
              <>
                <Icon name="refresh" size={13} />
                <span style={{ marginLeft: 4 }}>{t('settings.mediaProviderReload')}</span>
              </>
            )}
          </button>
        </div>
      ) : null}
      <div className="media-provider-list">
        {availableProviders.map((provider) => {
          const entry = cfg.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
          const { hasPendingEdit, isSavedState, tail, clearable } = deriveMediaProviderRowState(entry);
          // Every provider rendered in the main list is integrated by
          // construction (see availableProviders filter), so the inputs
          // are always editable here. Non-integrated entries live in
          // the "Coming soon" <details> below.
          const disabled = false;
          const supportsCustomModel = provider.supportsCustomModel === true;
          const requiresCredentials = provider.credentialsRequired !== false;
          const apiKeyVisible = visibleApiKeys.has(provider.id);
          return (
            <div key={provider.id} className="media-provider-row">
              <div className="media-provider-head">
                <div className="media-provider-meta">
                  {/*
                    Provider name + "Saved" badge sit on a single row.
                    The badge used to render below the name with a green
                    success-pill treatment, which clashed with the green
                    "Integrated" badge on the right of the same row and
                    pushed the model hint two lines down. Inline + a
                    neutral muted treatment keeps the row scannable: green
                    means "we support this", blue means "you configured
                    it", gray means "your key is persisted" — three
                    distinct hues, three distinct meanings.
                  */}
                  <div className="media-provider-name-row">
                    <span className="media-provider-name">{provider.label}</span>
                    {isSavedState ? (
                      <span
                        className="field-status-badge field-status-badge--inline"
                        title={t('settings.connectorsSavedTitle')}
                      >
                        {tail
                          ? t('settings.connectorsSavedWithTail', { tail })
                          : t('settings.connectorsSaved')}
                      </span>
                    ) : null}
                  </div>
                  <span className="media-provider-hint">{provider.hint}</span>
                </div>
                {/*
                  Right-side badges deliberately omitted now: every row
                  in this list is "Integrated" by definition and the
                  "Configured" pill duplicated the inline "Saved" chip
                  next to the provider name. Three pills per row read
                  as warnings; one chip reads as status.
                */}
              </div>
              {provider.id === 'grok' ? <XaiOAuthControl /> : null}
              {requiresCredentials ? (
                <div className="media-provider-body">
                  <div className="media-provider-secret-field">
                    <input
                      type={apiKeyVisible ? 'text' : 'password'}
                      value={entry.apiKey}
                      placeholder={isSavedState ? t('settings.connectorsReplaceKeyPlaceholder') : t('settings.mediaProviderPlaceholder')}
                      aria-label={`${provider.label} ${t('settings.mediaProviderApiKey')}`}
                      disabled={disabled}
                      onFocus={() => {
                        trackSettingsMediaProvidersClick(analytics.track, {
                          page_name: 'settings',
                          area: 'media_providers',
                          element: 'key_input',
                          providers_id: provider.id,
                          is_configured: clearable,
                        });
                      }}
                      onChange={(e) => updateProvider(provider, { apiKey: e.target.value })}
                    />
                    <button
                      type="button"
                      className="secret-visibility-button"
                      disabled={disabled}
                      aria-label={
                        apiKeyVisible
                          ? `${provider.label} ${t('settings.hideKey')}`
                          : `${provider.label} ${t('settings.showKey')}`
                      }
                      aria-pressed={apiKeyVisible}
                      onClick={() => toggleApiKeyVisibility(provider.id)}
                    >
                        <Icon name={apiKeyVisible ? 'eye' : 'eye-off'} size={15} />
                      </button>
                    </div>
                  <input
                    value={entry.baseUrl}
                    placeholder={provider.defaultBaseUrl || t('settings.mediaProviderBaseUrlPlaceholder')}
                    aria-label={`${provider.label} ${t('settings.mediaProviderBaseUrl')}`}
                    disabled={disabled}
                    onFocus={() => {
                      trackSettingsMediaProvidersClick(analytics.track, {
                        page_name: 'settings',
                        area: 'media_providers',
                        element: 'url_input',
                        providers_id: provider.id,
                        is_configured: clearable,
                      });
                    }}
                    onChange={(e) => updateProvider(provider, { baseUrl: e.target.value })}
                  />
                  {supportsCustomModel ? (
                    <input
                      value={entry.model ?? ''}
                      placeholder="gemini-3.1-flash-image-preview"
                      aria-label={`${provider.label} model`}
                      disabled={disabled}
                      onChange={(e) => updateProvider(provider, { model: e.target.value })}
                    />
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    disabled={!clearable}
                    onClick={() => {
                      trackSettingsMediaProvidersClick(analytics.track, {
                        page_name: 'settings',
                        area: 'media_providers',
                        element: 'clear',
                        providers_id: provider.id,
                        // The click reports the state at the moment the
                        // user pressed Clear; the actual clear only lands
                        // after they confirm the dialog below, but the
                        // dashboard cares about the intent signal.
                        is_configured: clearable,
                      });
                      // Match the existing window.confirm guard the rest of
                      // the app uses for destructive actions (conversation
                      // delete, design delete, file delete in FileWorkspace).
                      // Without this a stray click on the row's Clear button
                      // wipes the saved key with no recovery. Issue #737.
                      if (
                        !confirm(
                          t('settings.mediaProviderClearConfirm', {
                            name: provider.label,
                          }),
                        )
                      ) {
                        return;
                      }
                      updateProvider(provider, {
                        apiKey: '',
                        baseUrl: '',
                        model: '',
                        apiKeyConfigured: false,
                        apiKeyTail: '',
                      });
                    }}
                  >
                    {t('settings.mediaProviderClear')}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {comingSoonProviders.length > 0 ? (
        // Roadmap drawer. We still want to advertise that we know
        // these providers exist (so users don't ask "where is Fal?"),
        // but disabled placeholder cards in the main list were noise.
        // Closed by default — opens to a compact name + hint + docs
        // link list, no inputs because there's nothing to wire up yet.
        // TODO(i18n): inline English placeholders; promote to locale
        // keys when we touch this section again.
        <details className="library-group media-provider-coming-soon">
          <summary className="memory-details-summary">
            <span className="memory-details-title">
              {t('tasks.comingSoon')}
            </span>
            <span className="filter-pill-count">
              {comingSoonProviders.length}
            </span>
          </summary>
          <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
            {t('settings.mediaProviderComingSoonHint')}
          </p>
          <ul className="media-provider-coming-soon-list">
            {comingSoonProviders.map((provider) => {
              const docsHref = sanitizeMediaProviderDocsUrl(provider.docsUrl);
              return (
                <li
                  key={provider.id}
                  className="media-provider-coming-soon-item"
                >
                  <div className="media-provider-coming-soon-meta">
                    <span className="media-provider-name">
                      {provider.label}
                    </span>
                    <span className="media-provider-hint">
                      {provider.hint}
                    </span>
                  </div>
                  {docsHref ? (
                    <a
                      href={docsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ghost-link"
                    >
                      {t('settings.agentInstall.docs')}
                      <Icon name="external-link" size={11} />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
