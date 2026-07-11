// The About settings section: app version/channel/runtime/platform/arch,
// the updater status/action row, the diagnostics-export row, and the
// reset-onboarding action. All update/toast state lives in the
// feature-local `useWiredAbout` hook, called once by the SettingsDialog
// orchestrator (not by this component) — the toast must survive the user
// switching away from the About section mid-action, mirroring the original
// placement of its `<Toast>` outside the section's conditional block. This
// component is a pure props-in/JSX-out view over that controller.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { AppVersionInfo } from '../../../types';
import { Button } from '@open-design/components';
import { useI18n } from '../../../i18n';
import { ExportDiagnosticsRow } from '../../../components/ExportDiagnosticsButton';
import type { AboutController } from '../hooks/useAbout.hooks';

export function AboutSection({
  appVersionInfo,
  about,
}: {
  appVersionInfo: AppVersionInfo | null;
  about: AboutController;
}) {
  const { t } = useI18n();
  const { updateControl, updaterModel, updateActionBusy, handleUpdateAction, handleOpenReleaseNotes, handleResetOnboarding } = about;

  return (
    <section className="settings-section">
      {appVersionInfo ? (
        <dl className="settings-about-list">
          <div className="settings-about-version-row">
            <div className="settings-about-version-copy">
              <div className="settings-about-version-left">
                <dt>{t('settings.appVersion')}</dt>
                <span className="settings-about-version-num">{appVersionInfo.version}</span>
                <dd
                  aria-live="polite"
                  className={`settings-about-update-status settings-about-update-status--${updateControl.statusTone}`}
                >
                  {t(updateControl.statusKey, updateControl.statusVars)}
                </dd>
              </div>
            </div>
            <div className="settings-about-update-actions">
              {updateControl.primaryLabelKey ? (
                <button
                  type="button"
                  className={`settings-about-update-button${
                    updateControl.primaryAction === 'download'
                      || updateControl.primaryAction === 'install'
                      || updateControl.primaryAction === 'quit'
                      ? ' settings-about-update-button--primary'
                      : ''
                  }`}
                  disabled={
                    updateActionBusy
                    || updaterModel.busy
                    || updateControl.primaryAction == null
                  }
                  onClick={handleUpdateAction}
                >
                  {updateActionBusy
                    ? t('common.loading')
                    : t(updateControl.primaryLabelKey)}
                </button>
              ) : null}
              {updateControl.showReleaseLink ? (
                <button
                  type="button"
                  className="settings-about-release-link"
                  onClick={handleOpenReleaseNotes}
                >
                  {t('settings.updateViewReleases')}
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <dt>{t('settings.appChannel')}</dt>
            <dd>{appVersionInfo.channel}</dd>
          </div>
          <div>
            <dt>{t('settings.appRuntime')}</dt>
            <dd>
              {appVersionInfo.packaged
                ? t('settings.runtimePackaged')
                : t('settings.runtimeDevelopment')}
            </dd>
          </div>
          <div>
            <dt>{t('settings.appPlatform')}</dt>
            <dd>{appVersionInfo.platform}</dd>
          </div>
          <div>
            <dt>{t('settings.appArchitecture')}</dt>
            <dd>{appVersionInfo.arch}</dd>
          </div>
        </dl>
      ) : (
        <div className="empty-card">{t('settings.versionUnavailable')}</div>
      )}
      <div className="settings-about-diagnostics">
        <div className="settings-about-diagnostics-text">
          <h4>{t('diagnostics.exportTitle')}</h4>
          <p className="hint">{t('diagnostics.exportHint')}</p>
        </div>
        <ExportDiagnosticsRow />
      </div>
      <div className="settings-about-diagnostics">
        <div className="settings-about-diagnostics-text">
          <h4>{t('settings.resetOnboarding')}</h4>
          <p className="hint">{t('settings.resetOnboardingDesc')}</p>
        </div>
        <Button onClick={handleResetOnboarding}>
          {t('settings.resetOnboardingButton')}
        </Button>
      </div>
    </section>
  );
}
