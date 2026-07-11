// Feature-local hook for the Notifications settings section: the completion
// sound toggle + per-outcome sound pickers, the desktop notification
// permission flow, and the "send test notification" action. Its business
// logic reaches the browser Notification/Web Audio APIs through
// `../../../utils/notifications` directly — mirroring how `useOrbit` imports
// `navigate` directly (a synchronous browser call, not the transport/DOM
// subscription the guard's port-binding rule targets; only `providers/`
// imports are restricted to `dependencies.ts`). Analytics tracking is a
// cross-cutting concern the CALLER (the section component) layers on top,
// mirroring `MediaProvidersSection`.
import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../../i18n';
import { DEFAULT_NOTIFICATIONS } from '../../../state/config';
import {
  notificationPermission,
  playSound,
  requestNotificationPermission,
  showCompletionNotification,
} from '../../../utils/notifications';
import type { AppConfig } from '../../../types';
import type { NotificationTestStatusKey } from '../types';
import { testNotificationStatusText } from '../rules';

/** Inputs the notifications section needs from its caller. */
export interface NotificationsInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

/** Everything the Notifications section JSX reads off the controller. */
export interface NotificationsController {
  notif: NonNullable<AppConfig['notifications']>;
  permission: NotificationPermission | 'unsupported';
  testStatus: NotificationTestStatusKey | null;
  /** Flip the master sound switch; returns the new enabled state so the
   *  caller can track the post-click outcome. Plays the success sound as
   *  immediate feedback when turning on. */
  toggleSound: () => boolean;
  selectSuccessSound: (soundId: string) => void;
  selectFailureSound: (soundId: string) => void;
  /** Toggle desktop notifications; resolves 'on'/'off' (the post-toggle
   *  state) so the caller can track the outcome once the permission
   *  request (if any) settles. */
  toggleDesktop: () => Promise<'on' | 'off'>;
  sendTestNotification: () => Promise<void>;
}

export function useNotifications(input: NotificationsInput): NotificationsController {
  const { cfg, setCfg } = input;
  const { t } = useI18n();
  const notif = cfg.notifications ?? DEFAULT_NOTIFICATIONS;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    () => notificationPermission(),
  );
  const [testStatus, setTestStatus] = useState<NotificationTestStatusKey | null>(null);

  const updateNotif = (patch: Partial<NonNullable<AppConfig['notifications']>>) => {
    setCfg((c) => ({
      ...c,
      notifications: { ...DEFAULT_NOTIFICATIONS, ...(c.notifications ?? {}), ...patch },
    }));
  };

  const toggleSound = (): boolean => {
    const next = !notif.soundEnabled;
    updateNotif({ soundEnabled: next });
    // Give the user immediate audible feedback when turning the master
    // switch on so they know which sound they're signing up for. Resuming
    // the AudioContext also bakes in their gesture for later auto-plays.
    if (next) playSound(notif.successSoundId);
    return next;
  };

  const selectSuccessSound = (soundId: string) => {
    updateNotif({ successSoundId: soundId });
    playSound(soundId);
  };

  const selectFailureSound = (soundId: string) => {
    updateNotif({ failureSoundId: soundId });
    playSound(soundId);
  };

  const toggleDesktop = async (): Promise<'on' | 'off'> => {
    if (notif.desktopEnabled) {
      updateNotif({ desktopEnabled: false });
      return 'off';
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    const enabled = result === 'granted';
    updateNotif({ desktopEnabled: enabled });
    return enabled ? 'on' : 'off';
  };

  const sendTestNotification = async () => {
    const result = await showCompletionNotification({
      status: 'succeeded',
      title: t('notify.successTitle'),
      body: t('notify.successBody'),
    });
    setPermission(notificationPermission());
    setTestStatus(testNotificationStatusText(result));
  };

  return {
    notif,
    permission,
    testStatus,
    toggleSound,
    selectSuccessSound,
    selectFailureSound,
    toggleDesktop,
    sendTestNotification,
  };
}
