// Settings surface for the M1 Critique Theater rollout toggle. State
// (enabled flag + active project id) and the localStorage/daemon-metadata
// write live in the feature-local `useCritiqueTheaterSettings` hook; this
// component wraps the toggle with its analytics tracking call (mirroring
// `MediaProvidersSection`/`NotificationsSection`) and renders the exact
// markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import { useAnalytics } from '../../../analytics/provider';
import { trackSettingsDesignReviewClick } from '../../../analytics/events';
import { useI18n } from '../../../i18n';
import { useCritiqueTheaterSettings } from '../hooks/useCritiqueTheaterSettings.hooks';

export function CritiqueTheaterSection() {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const { enabled, activeProjectId, setEnabled } = useCritiqueTheaterSettings();

  return (
    <section className="settings-section">
      <div className="section-head">
        <div>
          <h3>{t('critiqueTheater.settingsNav')}</h3>
          <p className="hint">{t('critiqueTheater.settingsNavHint')}</p>
        </div>
      </div>
      <label className="field">
        <span className="field-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              trackSettingsDesignReviewClick(analytics.track, {
                page_name: 'settings',
                area: 'design_review',
                element: 'enable_toggle',
                status_before: enabled ? 'on' : 'off',
                status_after: next ? 'on' : 'off',
                has_active_project: activeProjectId !== null,
              });
              setEnabled(next);
            }}
          />
          {' '}
          {t('critiqueTheater.settingsEnabledLabel')}
        </span>
        <small className="hint">
          {t('critiqueTheater.settingsEnabledDescription')}
        </small>
        {activeProjectId !== null ? (
          <small className="hint">
            {t('critiqueTheater.settingsEnabledProjectHint')}
          </small>
        ) : (
          <small className="hint">
            {t('critiqueTheater.settingsEnabledNoProjectHint')}
          </small>
        )}
      </label>
    </section>
  );
}
