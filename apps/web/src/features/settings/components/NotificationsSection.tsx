// The Notifications settings section: the completion sound master switch +
// per-outcome sound pickers, the desktop notification permission toggle, and
// the "send test notification" action. All interlocked permission/test-status
// state and the browser Notification/Web Audio calls live in the
// feature-local `useNotifications` hook; this component wraps each action
// with its analytics tracking call (mirroring `MediaProvidersSection`) and
// renders the exact markup the dialog mounts.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { Button } from '@open-design/components';
import { useAnalytics } from '../../../analytics/provider';
import { trackSettingsNotificationsClick } from '../../../analytics/events';
import { useI18n } from '../../../i18n';
import { FAILURE_SOUNDS, SUCCESS_SOUNDS } from '../../../utils/notifications';
import type { AppConfig } from '../../../types';
import { useNotifications } from '../hooks/useNotifications.hooks';
import { soundIdToTracking } from '../rules';

export function NotificationsSection({
  cfg,
  setCfg,
}: {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}) {
  const { t } = useI18n();
  const analytics = useAnalytics();
  const {
    notif,
    permission,
    testStatus,
    toggleSound,
    selectSuccessSound,
    selectFailureSound,
    toggleDesktop,
    sendTestNotification,
  } = useNotifications({ cfg, setCfg });

  const onToggleSound = () => {
    const next = toggleSound();
    // P1 ui_click area=notifications element=completion_sound — the toggle
    // emits the post-click state on `completion_sound_status` so a single
    // event captures intent + outcome.
    trackSettingsNotificationsClick(analytics.track, {
      page_name: 'settings',
      area: 'notifications',
      element: 'completion_sound',
      completion_sound_status: next ? 'on' : 'off',
    });
  };

  const onToggleDesktop = () => {
    void (async () => {
      const status = await toggleDesktop();
      trackSettingsNotificationsClick(analytics.track, {
        page_name: 'settings',
        area: 'notifications',
        element: 'desktop_notification',
        desktop_notification_status: status,
      });
    })();
  };

  return (
    <section className="settings-section">
      <div className="settings-subsection">
        <div className="settings-notify-card">
          <div className="settings-notify-card-header">
            <h4>{t('settings.notifyCompletionSound')}</h4>
            <div className="section-head-actions">
              <div className="seg-control" role="group" aria-label={t('settings.notifyCompletionSound')} style={{ '--seg-cols': 1 } as CSSProperties}>
                <button
                  type="button"
                  className={'seg-btn' + (notif.soundEnabled ? ' active' : '')}
                  aria-pressed={notif.soundEnabled}
                  onClick={onToggleSound}
                >
                  <span className="seg-title">{notif.soundEnabled ? t('common.active') : t('common.offline')}</span>
                </button>
              </div>
            </div>
          </div>
          <p className="hint settings-notify-card-hint">{t('settings.notifyCompletionSoundHint')}</p>
        </div>

        {notif.soundEnabled ? (
          <>
            <div className="settings-field">
              <label>{t('settings.notifySuccessSound')}</label>
              <div className="seg-control" role="group" aria-label={t('settings.notifySuccessSound')} style={{ '--seg-cols': SUCCESS_SOUNDS.length } as CSSProperties}>
                {SUCCESS_SOUNDS.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    className={'seg-btn' + (notif.successSoundId === sound.id ? ' active' : '')}
                    aria-pressed={notif.successSoundId === sound.id}
                    onClick={() => {
                      const trackingSoundId = soundIdToTracking(sound.id);
                      trackSettingsNotificationsClick(analytics.track, {
                        page_name: 'settings',
                        area: 'notifications',
                        element: 'success_sound',
                        ...(trackingSoundId ? { sound_id: trackingSoundId } : {}),
                      });
                      selectSuccessSound(sound.id);
                    }}
                  >
                    <span className="seg-title">{t(sound.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-field">
              <label>{t('settings.notifyFailureSound')}</label>
              <div className="seg-control" role="group" aria-label={t('settings.notifyFailureSound')} style={{ '--seg-cols': FAILURE_SOUNDS.length } as CSSProperties}>
                {FAILURE_SOUNDS.map((sound) => (
                  <button
                    key={sound.id}
                    type="button"
                    className={'seg-btn' + (notif.failureSoundId === sound.id ? ' active' : '')}
                    aria-pressed={notif.failureSoundId === sound.id}
                    onClick={() => {
                      const trackingSoundId = soundIdToTracking(sound.id);
                      trackSettingsNotificationsClick(analytics.track, {
                        page_name: 'settings',
                        area: 'notifications',
                        element: 'failure_sound',
                        ...(trackingSoundId ? { sound_id: trackingSoundId } : {}),
                      });
                      selectFailureSound(sound.id);
                    }}
                  >
                    <span className="seg-title">{t(sound.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="settings-subsection">
        <div className="settings-notify-card">
          <div className="settings-notify-card-header">
            <h4>{t('settings.notifyDesktop')}</h4>
            <div className="section-head-actions">
              <div className="seg-control" role="group" aria-label={t('settings.notifyDesktop')} style={{ '--seg-cols': 1 } as CSSProperties}>
                <button
                  type="button"
                  className={'seg-btn' + (notif.desktopEnabled ? ' active' : '')}
                  aria-pressed={notif.desktopEnabled}
                  disabled={permission === 'unsupported'}
                  onClick={onToggleDesktop}
                >
                  <span className="seg-title">{notif.desktopEnabled ? t('common.active') : t('common.offline')}</span>
                </button>
              </div>
            </div>
          </div>
          <p className="hint settings-notify-card-hint">{t('settings.notifyDesktopHint')}</p>
        </div>
        {permission === 'unsupported' ? (
          <p className="hint">{t('settings.notifyDesktopUnsupported')}</p>
        ) : null}
        {permission === 'denied' ? (
          <p className="hint">{t('settings.notifyDesktopBlocked')}</p>
        ) : null}
        {notif.desktopEnabled && permission === 'granted' ? (
          <>
            <Button variant="ghost" onClick={() => {
              trackSettingsNotificationsClick(analytics.track, {
                page_name: 'settings',
                area: 'notifications',
                element: 'send_test',
              });
              void sendTestNotification();
            }}>
              {t('settings.notifyTest')}
            </Button>
            {testStatus ? <p className="hint" role="status">{t(testStatus)}</p> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
