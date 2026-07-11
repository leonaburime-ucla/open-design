// @vitest-environment jsdom
//
// Render coverage for the About section view: a hand-built `AboutController`
// (no hook wiring — the orchestrator owns `useWiredAbout`, see the
// component's header comment) drives the version/status row, the primary
// update button, the release-notes link, and the reset-onboarding button.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppVersionInfo } from '../../../src/types';
import { AboutSection } from '../../../src/features/settings';
import type { AboutController } from '../../../src/features/settings';
import { I18nProvider } from '../../../src/i18n';

const baseAppVersionInfo: AppVersionInfo = {
  version: '1.2.3',
  channel: 'stable',
  packaged: true,
  platform: 'darwin',
  arch: 'arm64',
} as AppVersionInfo;

function makeAbout(over: Partial<AboutController> = {}): AboutController {
  return {
    updateControl: {
      primaryAction: 'check',
      primaryLabelKey: 'settings.updateCheck',
      showReleaseLink: true,
      statusKey: 'settings.updateStatusNotChecked',
      statusTone: 'neutral',
    },
    updaterModel: { busy: false } as AboutController['updaterModel'],
    updateActionBusy: false,
    toast: null,
    dismissToast: vi.fn(),
    handleUpdateAction: vi.fn(async () => {}),
    handleOpenReleaseNotes: vi.fn(),
    handleResetOnboarding: vi.fn(),
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AboutSection', () => {
  it('renders the app version and channel', () => {
    render(
      <I18nProvider initial="en">
        <AboutSection appVersionInfo={baseAppVersionInfo} about={makeAbout()} />
      </I18nProvider>,
    );
    expect(screen.getByText('1.2.3')).toBeInTheDocument();
    expect(screen.getByText('stable')).toBeInTheDocument();
  });

  it('clicking the primary update button calls handleUpdateAction', () => {
    const about = makeAbout();
    render(
      <I18nProvider initial="en">
        <AboutSection appVersionInfo={baseAppVersionInfo} about={about} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('Check for updates'));
    expect(about.handleUpdateAction).toHaveBeenCalledTimes(1);
  });

  it('the primary button is disabled while an action is busy', () => {
    const about = makeAbout({ updateActionBusy: true });
    render(
      <I18nProvider initial="en">
        <AboutSection appVersionInfo={baseAppVersionInfo} about={about} />
      </I18nProvider>,
    );
    expect(screen.getByText('Loading…').closest('button')).toBeDisabled();
  });

  it('clicking View release notes calls handleOpenReleaseNotes', () => {
    const about = makeAbout();
    render(
      <I18nProvider initial="en">
        <AboutSection appVersionInfo={baseAppVersionInfo} about={about} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('View release notes'));
    expect(about.handleOpenReleaseNotes).toHaveBeenCalledTimes(1);
  });

  it('clicking the reset-onboarding button calls handleResetOnboarding', () => {
    const about = makeAbout();
    render(
      <I18nProvider initial="en">
        <AboutSection appVersionInfo={baseAppVersionInfo} about={about} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('Reset'));
    expect(about.handleResetOnboarding).toHaveBeenCalledTimes(1);
  });

  it('renders the unavailable-version empty state when appVersionInfo is null', () => {
    render(
      <I18nProvider initial="en">
        <AboutSection appVersionInfo={null} about={makeAbout()} />
      </I18nProvider>,
    );
    expect(
      screen.getByText('Version details are unavailable while the daemon is offline.'),
    ).toBeInTheDocument();
  });
});
