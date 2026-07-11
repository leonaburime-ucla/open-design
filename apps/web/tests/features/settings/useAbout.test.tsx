// @vitest-environment jsdom
//
// The About section hook against a hand-written fake `AboutPort` plus a
// mocked `lib/updater` module (the updater subscription/actions reach that
// host-bridge module directly — see the hook's header comment; only the
// release-notes external-URL open is injected via the port). Pins: mount
// subscribes and reads the initial updater status, the update action drives
// check/download/install/quit, the release-notes button calls the port, and
// reset-onboarding flips `onboardingCompleted` + persists + navigates home.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, AppVersionInfo } from '../../../src/types';
import { I18nProvider } from '../../../src/i18n';
import { useAbout } from '../../../src/features/settings/hooks/useAbout.hooks';
import type { AboutPort } from '../../../src/features/settings/ports';
import type { UpdaterActionResult, UpdaterModel } from '../../../src/lib/updater';

const navigateMock = vi.fn();
vi.mock('../../../src/router', () => ({
  navigate: (...args: unknown[]) => navigateMock(...args),
}));

const saveConfigMock = vi.fn();
const syncConfigToDaemonMock = vi.fn();
vi.mock('../../../src/state/config', async () => {
  const actual = await vi.importActual<typeof import('../../../src/state/config')>(
    '../../../src/state/config',
  );
  return {
    ...actual,
    saveConfig: (...args: unknown[]) => saveConfigMock(...args),
    syncConfigToDaemon: (...args: unknown[]) => syncConfigToDaemonMock(...args),
  };
});

function idleModel(over: Partial<UpdaterModel> = {}): UpdaterModel {
  return {
    environment: 'desktop',
    enabled: true,
    supported: true,
    busy: false,
    status: { state: 'not-available' },
    ...over,
  } as UpdaterModel;
}

function okResult(over: Partial<UpdaterModel> = {}): UpdaterActionResult {
  return { ok: true, model: idleModel(over), status: {} } as UpdaterActionResult;
}

const subscribeToUpdaterStatusMock = vi.fn(() => () => {});
const readUpdaterStatusMock = vi.fn(async () => okResult());
const checkForUpdaterUpdateMock = vi.fn(async () => okResult());
const downloadUpdaterUpdateMock = vi.fn(async () => okResult());
const openUpdaterInstallerMock = vi.fn(async () => okResult());
const quitAfterUpdaterInstallerOpenMock = vi.fn(async () => ({ ok: true }));

vi.mock('../../../src/lib/updater', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lib/updater')>(
    '../../../src/lib/updater',
  );
  return {
    ...actual,
    subscribeToUpdaterStatus: () => subscribeToUpdaterStatusMock(),
    readUpdaterStatus: () => readUpdaterStatusMock(),
    checkForUpdaterUpdate: () => checkForUpdaterUpdateMock(),
    downloadUpdaterUpdate: () => downloadUpdaterUpdateMock(),
    openUpdaterInstaller: () => openUpdaterInstallerMock(),
    quitAfterUpdaterInstallerOpen: () => quitAfterUpdaterInstallerOpenMock(),
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
    ...over,
  } as AppConfig;
}

const baseAppVersionInfo = {
  version: '1.2.3',
  channel: 'stable',
  packaged: true,
  platform: 'darwin',
  arch: 'arm64',
} as AppVersionInfo;

function makePort(over: Partial<AboutPort> = {}): AboutPort {
  return {
    openExternalUrl: vi.fn(),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderAbout(port: AboutPort, over: { cfg?: AppConfig } = {}) {
  const setCfg = vi.fn();
  const onClose = vi.fn();
  const cfg = over.cfg ?? baseConfig();
  return {
    setCfg,
    onClose,
    cfg,
    ...renderHook(
      () => useAbout(port, { cfg, setCfg, appVersionInfo: baseAppVersionInfo, onClose }),
      { wrapper },
    ),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAbout', () => {
  it('subscribes to updater status and reads the initial status on mount', async () => {
    const port = makePort();
    renderAbout(port);
    expect(subscribeToUpdaterStatusMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(readUpdaterStatusMock).toHaveBeenCalledTimes(1));
  });

  it('the update action calls check when the control reports a checkable state', async () => {
    checkForUpdaterUpdateMock.mockResolvedValueOnce(
      okResult({ status: { state: 'idle' } as UpdaterModel['status'] }),
    );
    const port = makePort();
    const { result } = renderAbout(port);
    await waitFor(() => expect(result.current.updateControl.primaryAction).toBe('check'));
    await act(async () => {
      await result.current.handleUpdateAction();
    });
    expect(checkForUpdaterUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('a failed action result surfaces the update-failed toast', async () => {
    checkForUpdaterUpdateMock.mockResolvedValueOnce({ ok: false } as UpdaterActionResult);
    const port = makePort();
    const { result } = renderAbout(port);
    await waitFor(() => expect(result.current.updateControl.primaryAction).toBe('check'));
    await act(async () => {
      await result.current.handleUpdateAction();
    });
    expect(result.current.toast).toBe('Could not complete the update action.');
    act(() => result.current.dismissToast());
    expect(result.current.toast).toBeNull();
  });

  it('opening release notes calls the injected port with the releases URL', async () => {
    const port = makePort();
    const { result } = renderAbout(port);
    act(() => result.current.handleOpenReleaseNotes());
    expect(port.openExternalUrl).toHaveBeenCalledWith(
      'https://github.com/nexu-io/open-design/releases',
    );
  });

  it('reset-onboarding flips onboardingCompleted, persists, and navigates home', async () => {
    const port = makePort();
    const { result, setCfg, onClose, cfg } = renderAbout(port, {
      cfg: baseConfig({ onboardingCompleted: true }),
    });
    act(() => result.current.handleResetOnboarding());
    expect(setCfg).toHaveBeenCalledWith({ ...cfg, onboardingCompleted: false });
    expect(saveConfigMock).toHaveBeenCalledWith({ ...cfg, onboardingCompleted: false });
    expect(syncConfigToDaemonMock).toHaveBeenCalledWith({ ...cfg, onboardingCompleted: false });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith({ kind: 'home', view: 'onboarding' });
  });
});
