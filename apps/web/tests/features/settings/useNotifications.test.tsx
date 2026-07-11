// @vitest-environment jsdom
//
// The Notifications hook against a mocked `utils/notifications` module (its
// business logic reaches the browser Notification/Web Audio APIs directly —
// see the hook's header comment — so this is a module mock rather than a
// fake port, mirroring how a transport-light hook with no injected port is
// tested elsewhere in this slice). Pins: the master sound toggle (with the
// immediate feedback sound), the per-outcome sound pickers, the desktop
// permission flow (already-on -> off, granted, denied), and the
// send-test-notification status mapping.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import type { AppConfig } from '../../../src/types';
import { useNotifications } from '../../../src/features/settings/hooks/useNotifications.hooks';
import {
  notificationPermission,
  playSound,
  requestNotificationPermission,
  showCompletionNotification,
} from '../../../src/utils/notifications';

vi.mock('../../../src/utils/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/utils/notifications')>();
  return {
    ...actual,
    notificationPermission: vi.fn(() => 'default' as NotificationPermission | 'unsupported'),
    requestNotificationPermission: vi.fn(async () => 'granted' as NotificationPermission | 'unsupported'),
    showCompletionNotification: vi.fn(async () => 'shown' as const),
    playSound: vi.fn(),
  };
});

function baseConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    mode: 'api',
    apiKey: 'sk-test',
    apiProtocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: null,
    skillId: null,
    designSystemId: null,
    notifications: { soundEnabled: false, successSoundId: 'ding', failureSoundId: 'buzz', desktopEnabled: false },
    ...over,
  } as AppConfig;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderNotifications(initial: AppConfig) {
  let cfg = initial;
  const setCfg = vi.fn((updater: AppConfig | ((c: AppConfig) => AppConfig)) => {
    cfg = typeof updater === 'function' ? (updater as (c: AppConfig) => AppConfig)(cfg) : updater;
  });
  const view = renderHook(() => useNotifications({ cfg, setCfg }), { wrapper });
  return { setCfg, ...view };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useNotifications', () => {
  it('seeds the permission state from notificationPermission() on mount', () => {
    const { result } = renderNotifications(baseConfig());
    expect(notificationPermission).toHaveBeenCalled();
    expect(result.current.permission).toBe('default');
  });

  it('flips the master sound switch on and plays the success sound as feedback', async () => {
    const { result, setCfg } = renderNotifications(baseConfig());

    let returned: boolean | undefined;
    act(() => {
      returned = result.current.toggleSound();
    });

    expect(returned).toBe(true);
    expect(playSound).toHaveBeenCalledWith('ding');
    expect(setCfg).toHaveBeenCalledTimes(1);
  });

  it('flips the master sound switch off without playing a sound', async () => {
    const { result } = renderNotifications(baseConfig({ notifications: { soundEnabled: true, successSoundId: 'ding', failureSoundId: 'buzz', desktopEnabled: false } }));

    let returned: boolean | undefined;
    act(() => {
      returned = result.current.toggleSound();
    });

    expect(returned).toBe(false);
    expect(playSound).not.toHaveBeenCalled();
  });

  it('selects a success/failure sound and plays it', () => {
    const { result } = renderNotifications(baseConfig());

    act(() => result.current.selectSuccessSound('chime'));
    expect(playSound).toHaveBeenCalledWith('chime');

    act(() => result.current.selectFailureSound('thud'));
    expect(playSound).toHaveBeenCalledWith('thud');
  });

  it('toggling desktop off when already enabled resolves off without a permission request', async () => {
    const { result } = renderNotifications(baseConfig({ notifications: { soundEnabled: false, successSoundId: 'ding', failureSoundId: 'buzz', desktopEnabled: true } }));

    let status: 'on' | 'off' | undefined;
    await act(async () => {
      status = await result.current.toggleDesktop();
    });

    expect(status).toBe('off');
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('toggling desktop on requests permission and resolves on when granted', async () => {
    vi.mocked(requestNotificationPermission).mockResolvedValueOnce('granted');
    const { result } = renderNotifications(baseConfig());

    let status: 'on' | 'off' | undefined;
    await act(async () => {
      status = await result.current.toggleDesktop();
    });

    expect(status).toBe('on');
    await waitFor(() => expect(result.current.permission).toBe('granted'));
  });

  it('toggling desktop on resolves off when permission is denied', async () => {
    vi.mocked(requestNotificationPermission).mockResolvedValueOnce('denied');
    const { result } = renderNotifications(baseConfig());

    let status: 'on' | 'off' | undefined;
    await act(async () => {
      status = await result.current.toggleDesktop();
    });

    expect(status).toBe('off');
    await waitFor(() => expect(result.current.permission).toBe('denied'));
  });

  it('sending a test notification maps the result to the status i18n key', async () => {
    vi.mocked(showCompletionNotification).mockResolvedValueOnce('shown');
    const { result } = renderNotifications(baseConfig());

    await act(async () => {
      await result.current.sendTestNotification();
    });

    expect(result.current.testStatus).toBe('settings.notifyTestSent');
  });

  it('surfaces a blocked/unsupported/failed test-notification result', async () => {
    vi.mocked(showCompletionNotification).mockResolvedValueOnce('permission-denied');
    const { result } = renderNotifications(baseConfig());

    await act(async () => {
      await result.current.sendTestNotification();
    });

    expect(result.current.testStatus).toBe('settings.notifyDesktopBlocked');
  });
});
