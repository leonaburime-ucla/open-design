// @vitest-environment jsdom
//
// The Appearance hook: theme/accent derivation from config (with defaults),
// the setters driving `setCfg` (asserted via the updater passed to it,
// mirroring `useOrbit.test.tsx`'s `updateOrbit` coverage), and the
// live-preview document effect (`applyAppearanceToDocument` applies the CSS
// custom property + `data-theme` attribute so a Save isn't required to see
// the change — exercised via `rerender` with a new `cfg` prop, the same way
// a parent re-render would flow a persisted change back down).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../src/types';
import { useAppearance } from '../../../src/features/settings/hooks/useAppearance.hooks';
import type { AppearanceInput } from '../../../src/features/settings/hooks/useAppearance.hooks';
import { DEFAULT_ACCENT_COLOR } from '../../../src/state/appearance';

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

describe('useAppearance', () => {
  it('defaults to the system theme and the default accent color', () => {
    const setCfg = vi.fn();
    const { result } = renderHook(() => useAppearance({ cfg: baseConfig(), setCfg }));
    expect(result.current.theme).toBe('system');
    expect(result.current.accentColor).toBe(DEFAULT_ACCENT_COLOR);
  });

  it('reflects an explicit theme/accent from config', () => {
    const setCfg = vi.fn();
    const { result } = renderHook(() =>
      useAppearance({ cfg: baseConfig({ theme: 'dark', accentColor: '#ff0000' }), setCfg }));
    expect(result.current.theme).toBe('dark');
    expect(result.current.accentColor).toBe('#ff0000');
  });

  it('setTheme patches the config through setCfg', () => {
    const setCfg = vi.fn();
    const { result } = renderHook(() => useAppearance({ cfg: baseConfig(), setCfg }));

    act(() => result.current.setTheme('light'));

    expect(setCfg).toHaveBeenCalledTimes(1);
    const updater = setCfg.mock.calls[0]?.[0] as (c: AppConfig) => AppConfig;
    expect(updater(baseConfig()).theme).toBe('light');
  });

  it('setAccentColor normalizes the value and falls back to the current accent on an invalid one', () => {
    const setCfg = vi.fn();
    const { result } = renderHook(() => useAppearance({ cfg: baseConfig({ accentColor: '#00ff00' }), setCfg }));

    act(() => result.current.setAccentColor('not-a-color'));
    const invalidUpdater = setCfg.mock.calls[0]?.[0] as (c: AppConfig) => AppConfig;
    // An unparsable color falls back to the previous accent rather than
    // clobbering it with garbage.
    expect(invalidUpdater(baseConfig({ accentColor: '#00ff00' })).accentColor).toBe('#00ff00');

    act(() => result.current.setAccentColor('#0000ff'));
    const validUpdater = setCfg.mock.calls[1]?.[0] as (c: AppConfig) => AppConfig;
    expect(validUpdater(baseConfig({ accentColor: '#00ff00' })).accentColor).toBe('#0000ff');
  });

  it('applies the appearance to the document on mount and on every theme/accent prop change (live preview)', () => {
    const setCfg = vi.fn();
    const { rerender } = renderHook((props: AppearanceInput) => useAppearance(props), {
      initialProps: { cfg: baseConfig({ theme: 'dark', accentColor: '#123456' }), setCfg },
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#123456');

    rerender({ cfg: baseConfig({ theme: 'light', accentColor: '#123456' }), setCfg });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
