// @vitest-environment jsdom
//
// The media-providers hook against a hand-written fake `MediaProvidersPort`
// (only the reload-notice timer bridge; the reload transport itself is an
// injected caller callback, mirroring ConnectorSection's `onPersistComposioKey`).
// Pins: catalogue split off the real MEDIA_PROVIDERS constant, API-key
// visibility toggling, row update/clear-to-empty, and the reload flow
// (success, daemon-null error, already-running no-op).
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider, useT } from '../../../src/i18n';
import { useMediaProviders } from '../../../src/features/settings/hooks/useMediaProviders.hooks';
import type { MediaProvidersInput } from '../../../src/features/settings/hooks/useMediaProviders.hooks';
import type { MediaProvidersPort } from '../../../src/features/settings/ports';
import type { AppConfig } from '../../../src/types';
import { MEDIA_PROVIDERS } from '../../../src/media/models';

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

function makePort(over: Partial<MediaProvidersPort> = {}): MediaProvidersPort {
  return {
    scheduleReloadNoticeTimeout: vi.fn(() => () => {}),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

function renderMediaProviders(port: MediaProvidersPort, over: Partial<MediaProvidersInput> = {}) {
  const setCfg = vi.fn();
  const onChange = vi.fn();
  const cfg = over.cfg ?? baseConfig();
  return {
    setCfg,
    onChange,
    ...renderHook(
      () => {
        const t = useT();
        return useMediaProviders(port, {
          cfg,
          setCfg,
          pendingLocalProviderIds: new Set(),
          onChange,
          t,
          ...over,
        });
      },
      { wrapper },
    ),
  };
}

describe('useMediaProviders', () => {
  it('splits the real catalogue into integrated (available) and non-integrated (coming soon)', () => {
    const { result } = renderMediaProviders(makePort());
    const visibleIds = new Set(
      MEDIA_PROVIDERS.filter((p) => p.settingsVisible !== false).map((p) => p.id),
    );
    expect(result.current.availableProviders.every((p) => p.integrated)).toBe(true);
    expect(result.current.comingSoonProviders.every((p) => !p.integrated)).toBe(true);
    expect(
      new Set([...result.current.availableProviders, ...result.current.comingSoonProviders].map((p) => p.id)),
    ).toEqual(visibleIds);
  });

  it('toggles a provider id in and out of the visible-API-key set', () => {
    const { result } = renderMediaProviders(makePort());
    const id = result.current.availableProviders[0]!.id;
    expect(result.current.visibleApiKeys.has(id)).toBe(false);

    act(() => result.current.toggleApiKeyVisibility(id));
    expect(result.current.visibleApiKeys.has(id)).toBe(true);

    act(() => result.current.toggleApiKeyVisibility(id));
    expect(result.current.visibleApiKeys.has(id)).toBe(false);
  });

  it('updateProvider writes a patch through setCfg and reports the change via onChange', () => {
    const { result, setCfg, onChange } = renderMediaProviders(makePort());
    const provider = result.current.availableProviders[0]!;

    act(() => result.current.updateProvider(provider, { apiKey: 'sk-new' }));

    expect(onChange).toHaveBeenCalledWith(provider.id);
    const updater = setCfg.mock.calls[0]?.[0] as (c: AppConfig) => AppConfig;
    expect(updater(baseConfig()).mediaProviders?.[provider.id]?.apiKey).toBe('sk-new');
  });

  it('updateProvider clearing every field removes the stored entry entirely', () => {
    const { result, setCfg } = renderMediaProviders(makePort());
    const provider = result.current.availableProviders[0]!;

    act(() => result.current.updateProvider(provider, {
      apiKey: '',
      baseUrl: '',
      model: '',
      apiKeyConfigured: false,
      apiKeyTail: '',
    }));

    const updater = setCfg.mock.calls[0]?.[0] as (c: AppConfig) => AppConfig;
    const configured = baseConfig({ mediaProviders: { [provider.id]: { apiKey: 'sk', baseUrl: '', apiKeyConfigured: true } } });
    expect(updater(configured).mediaProviders?.[provider.id]).toBeUndefined();
  });

  it('reload success merges the daemon result and schedules the notice auto-dismiss', async () => {
    const scheduleReloadNoticeTimeout = vi.fn(() => () => {});
    const onReloadMediaProviders = vi.fn(async () => ({ openai: { apiKey: 'sk', baseUrl: '', apiKeyConfigured: true } }));
    const { result, setCfg } = renderMediaProviders(
      makePort({ scheduleReloadNoticeTimeout }),
      { onReloadMediaProviders },
    );

    act(() => result.current.handleReload());
    await waitFor(() => expect(result.current.reloadNotice?.kind).toBe('success'));
    expect(setCfg).toHaveBeenCalled();
    expect(result.current.reloadRunning).toBe(false);
  });

  it('reload surfaces an error notice when the daemon call resolves null', async () => {
    const onReloadMediaProviders = vi.fn(async () => null);
    const { result } = renderMediaProviders(makePort(), { onReloadMediaProviders });

    act(() => result.current.handleReload());
    await waitFor(() => expect(result.current.reloadNotice?.kind).toBe('error'));
    expect(result.current.reloadRunning).toBe(false);
  });

  it('is a no-op to reload again while already running', async () => {
    let resolveReload: ((v: AppConfig['mediaProviders'] | null) => void) | undefined;
    const onReloadMediaProviders = vi.fn(
      () => new Promise<AppConfig['mediaProviders'] | null>((resolve) => {
        resolveReload = resolve;
      }),
    );
    const { result } = renderMediaProviders(makePort(), { onReloadMediaProviders });

    act(() => result.current.handleReload());
    await waitFor(() => expect(result.current.reloadRunning).toBe(true));
    act(() => result.current.handleReload());
    expect(onReloadMediaProviders).toHaveBeenCalledTimes(1);

    resolveReload?.({});
    await waitFor(() => expect(result.current.reloadRunning).toBe(false));
  });

  it('does nothing when no reload callback is provided', () => {
    const { result } = renderMediaProviders(makePort(), { onReloadMediaProviders: undefined });
    expect(() => act(() => result.current.handleReload())).not.toThrow();
    expect(result.current.reloadRunning).toBe(false);
  });
});
