// @vitest-environment jsdom
//
// The Codex one-click install toggle hook against a hand-written fake
// `IntegrationsPort`. Pins: the availability probe on mount (available/
// unavailable, and the all-false fallback when the probe resolves null),
// the install and uninstall actions (success message + refreshed status,
// error message on a thrown failure), and the busy flag around the action.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import { useCodexInstallToggle } from '../../../src/features/settings/hooks/useCodexInstallToggle.hooks';
import type { IntegrationsPort } from '../../../src/features/settings/ports';

function makePort(over: Partial<IntegrationsPort> = {}): IntegrationsPort {
  return {
    fetchInstallInfo: vi.fn(async () => {
      throw new Error('not used');
    }),
    fetchCodexStatus: vi.fn(async () => ({ available: true, installed: false })),
    installCodex: vi.fn(async () => {}),
    uninstallCodex: vi.fn(async () => {}),
    scheduleCopyResetTimeout: vi.fn(() => () => {}),
    subscribePickerDismiss: vi.fn(() => () => {}),
    openDeeplink: vi.fn(),
    ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nProvider initial="en">{children}</I18nProvider>
);

describe('useCodexInstallToggle', () => {
  it('probes availability/installed state on mount', async () => {
    const port = makePort({ fetchCodexStatus: vi.fn(async () => ({ available: true, installed: true })) });
    const { result } = renderHook(() => useCodexInstallToggle(port), { wrapper });

    await waitFor(() => expect(result.current.available).toBe(true));
    expect(result.current.installed).toBe(true);
  });

  it('treats a failed probe (null) as unavailable rather than leaving state unresolved', async () => {
    const port = makePort({ fetchCodexStatus: vi.fn(async () => null) });
    const { result } = renderHook(() => useCodexInstallToggle(port), { wrapper });

    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.installed).toBe(false);
  });

  it('installs, shows a success message, and refreshes status', async () => {
    const fetchCodexStatus = vi.fn()
      .mockResolvedValueOnce({ available: true, installed: false })
      .mockResolvedValueOnce({ available: true, installed: true });
    const installCodex = vi.fn(async () => {});
    const port = makePort({ fetchCodexStatus, installCodex });
    const { result } = renderHook(() => useCodexInstallToggle(port), { wrapper });
    await waitFor(() => expect(result.current.installed).toBe(false));

    await act(async () => {
      result.current.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(installCodex).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.installed).toBe(true));
    expect(result.current.message?.kind).toBe('success');
    expect(result.current.busy).toBe(false);
  });

  it('surfaces a thrown install failure as an error message and clears busy', async () => {
    const installCodex = vi.fn(async () => {
      throw new Error('codex mcp add failed');
    });
    const port = makePort({ installCodex });
    const { result } = renderHook(() => useCodexInstallToggle(port), { wrapper });
    await waitFor(() => expect(result.current.installed).toBe(false));

    await act(async () => {
      result.current.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.message?.kind).toBe('error');
    expect(result.current.message?.text).toContain('codex mcp add failed');
    expect(result.current.busy).toBe(false);
  });

  it('uninstalls when already installed', async () => {
    const uninstallCodex = vi.fn(async () => {});
    const port = makePort({
      fetchCodexStatus: vi.fn(async () => ({ available: true, installed: true })),
      uninstallCodex,
    });
    const { result } = renderHook(() => useCodexInstallToggle(port), { wrapper });
    await waitFor(() => expect(result.current.installed).toBe(true));

    await act(async () => {
      result.current.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(uninstallCodex).toHaveBeenCalledTimes(1);
  });
});
