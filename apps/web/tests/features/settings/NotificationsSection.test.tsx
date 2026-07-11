// @vitest-environment jsdom
//
// Render coverage for the Notifications section: the completion sound
// toggle revealing the success/failure sound pickers, the desktop
// notification toggle (permission granted -> the "Send test" action
// appears), and the unsupported-environment hint. Renders through the real
// `useNotifications` hook (mirroring OrbitSection.test.tsx), with
// `utils/notifications`'s browser-facing calls mocked so Notification
// permission/Web Audio never actually engage in jsdom. `useAnalytics()` is
// unmounted-provider safe (no-op stub), so no AnalyticsProvider wrapper is
// needed.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { NotificationsSection } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';
import {
  notificationPermission,
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

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

function Harness({ initial }: { initial: AppConfig }) {
  const [cfg, setCfg] = useState(initial);
  return (
    <I18nProvider initial="en">
      <NotificationsSection cfg={cfg} setCfg={setCfg} />
    </I18nProvider>
  );
}

/** Scope queries to the subsection whose <h4> matches `heading`, so the
 *  completion-sound and desktop-notification toggles (both rendering an
 *  identically-labeled "offline"/"active" button) never collide. */
function subsection(heading: string): HTMLElement {
  const h4 = screen.getByText(heading);
  const card = h4.closest('.settings-notify-card-header');
  return (card?.parentElement ?? h4.closest('.settings-subsection'))!;
}

beforeEach(() => {
  // Re-pin each mock's return value every test: `vi.clearAllMocks()` below
  // only resets call history, not a `mockReturnValue`/`mockResolvedValue`
  // override left by a prior test.
  vi.mocked(notificationPermission).mockReturnValue('default');
  vi.mocked(requestNotificationPermission).mockResolvedValue('granted');
  vi.mocked(showCompletionNotification).mockResolvedValue('shown');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NotificationsSection', () => {
  it('hides the sound pickers until the master switch is on', () => {
    render(<Harness initial={baseConfig} />);
    expect(screen.queryByText('Success sound')).not.toBeInTheDocument();

    fireEvent.click(within(subsection('Completion sound')).getByRole('button', { name: 'offline' }));
    expect(screen.getByText('Success sound')).toBeInTheDocument();
    expect(screen.getByText('Failure sound')).toBeInTheDocument();
  });

  it('picking a success sound marks it active', () => {
    render(<Harness initial={{ ...baseConfig, notifications: { soundEnabled: true, successSoundId: 'ding', failureSoundId: 'buzz', desktopEnabled: false } }} />);

    const chime = screen.getByRole('button', { name: 'Chime' });
    fireEvent.click(chime);
    expect(chime).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the unsupported hint and disables the desktop toggle when unsupported', () => {
    vi.mocked(notificationPermission).mockReturnValue('unsupported');
    render(<Harness initial={baseConfig} />);

    expect(screen.getByText('Desktop notifications unavailable in this environment.')).toBeInTheDocument();
    const desktopToggle = within(subsection('Desktop notification')).getByRole('button', { name: 'offline' });
    expect(desktopToggle).toBeDisabled();
  });

  it('enabling desktop notifications requests permission and reveals the test action once granted', async () => {
    render(<Harness initial={baseConfig} />);

    fireEvent.click(within(subsection('Desktop notification')).getByRole('button', { name: 'offline' }));
    await waitFor(() => expect(requestNotificationPermission).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Send test' });
  });

  it('sending a test notification surfaces the sent status', async () => {
    // The hook seeds `permission` from `notificationPermission()` once on
    // mount, so it must already resolve 'granted' before rendering for the
    // "Send test" action to appear without a click.
    vi.mocked(notificationPermission).mockReturnValue('granted');
    render(
      <Harness
        initial={{ ...baseConfig, notifications: { soundEnabled: false, successSoundId: 'ding', failureSoundId: 'buzz', desktopEnabled: true } }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Send test' }));

    await waitFor(() => expect(showCompletionNotification).toHaveBeenCalled());
    await screen.findByText(/Test notification sent/);
  });
});
