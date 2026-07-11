// @vitest-environment jsdom
//
// The Integrations (MCP install snippet) hook against a hand-written fake
// `IntegrationsPort` — no module mocks for transport, no global `fetch`
// stub. Pins: load-on-mount install info (success + error), client
// selection resetting the "Copied" flash, the copy-to-clipboard flow, the
// picker-dismiss subscription only firing while open, and the Cursor
// deeplink action.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import { useIntegrations } from '../../../src/features/settings/hooks/useIntegrations.hooks';
import type { IntegrationsPort } from '../../../src/features/settings/ports';
import type { McpInstallInfo } from '../../../src/features/settings/types';

function mcpInfo(over: Partial<McpInstallInfo> = {}): McpInstallInfo {
  return {
    command: '/usr/bin/node',
    args: ['/opt/open-design/cli.js', 'mcp'],
    daemonUrl: 'http://127.0.0.1:7456',
    platform: 'darwin',
    cliExists: true,
    nodeExists: true,
    buildHint: null,
    ...over,
  };
}

function makePort(over: Partial<IntegrationsPort> = {}): IntegrationsPort {
  return {
    fetchInstallInfo: vi.fn(async () => mcpInfo()),
    fetchCodexStatus: vi.fn(async () => ({ available: false, installed: false })),
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

const originalClipboard = globalThis.navigator.clipboard;

describe('useIntegrations', () => {
  it('loads the install info on mount and derives the default (Claude) snippet', async () => {
    const port = makePort({ fetchInstallInfo: vi.fn(async () => mcpInfo()) });
    const { result } = renderHook(() => useIntegrations(port), { wrapper });

    await waitFor(() => expect(result.current.info).not.toBeNull());
    expect(result.current.clientId).toBe('claude');
    expect(result.current.infoError).toBeNull();
    expect(result.current.snippet).toContain('claude mcp add-json --scope user open-design');
    expect(result.current.snippetLang).toBe('bash');
  });

  it('surfaces the transport error message when install-info fails', async () => {
    const port = makePort({
      fetchInstallInfo: vi.fn(async () => {
        throw new Error('daemon 500');
      }),
    });
    const { result } = renderHook(() => useIntegrations(port), { wrapper });

    await waitFor(() => expect(result.current.infoError).toBe('daemon 500'));
    expect(result.current.info).toBeNull();
  });

  it('selecting a client closes the picker and resets the Copied flash', async () => {
    const port = makePort();
    const { result } = renderHook(() => useIntegrations(port), { wrapper });
    await waitFor(() => expect(result.current.info).not.toBeNull());

    act(() => result.current.togglePicker());
    expect(result.current.pickerOpen).toBe(true);

    act(() => result.current.selectClient('vscode'));
    expect(result.current.clientId).toBe('vscode');
    expect(result.current.pickerOpen).toBe(false);
    expect(result.current.snippetLang).toBe('json');
  });

  it('subscribes to picker-dismiss only while the picker is open', async () => {
    const unsubscribe = vi.fn();
    const port = makePort({ subscribePickerDismiss: vi.fn(() => unsubscribe) });
    const { result } = renderHook(() => useIntegrations(port), { wrapper });
    await waitFor(() => expect(result.current.info).not.toBeNull());

    expect(port.subscribePickerDismiss).not.toHaveBeenCalled();
    act(() => result.current.togglePicker());
    expect(port.subscribePickerDismiss).toHaveBeenCalledTimes(1);

    act(() => result.current.togglePicker());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('copies the snippet to the clipboard and schedules the Copied reset', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const scheduleCopyResetTimeout = vi.fn(() => () => {});
    const port = makePort({ scheduleCopyResetTimeout });
    const { result } = renderHook(() => useIntegrations(port), { wrapper });
    await waitFor(() => expect(result.current.info).not.toBeNull());

    await act(async () => {
      result.current.onCopy();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith(result.current.snippet);
    expect(result.current.copied).toBe(true);
    expect(scheduleCopyResetTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);

    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
  });

  it('opens the Cursor deeplink through the port once selected', async () => {
    const openDeeplink = vi.fn();
    const port = makePort({ openDeeplink });
    const { result } = renderHook(() => useIntegrations(port), { wrapper });
    await waitFor(() => expect(result.current.info).not.toBeNull());

    act(() => result.current.selectClient('cursor'));
    act(() => result.current.onDeeplinkClick());

    expect(openDeeplink).toHaveBeenCalledTimes(1);
    expect(openDeeplink).toHaveBeenCalledWith(expect.stringMatching(/^cursor:\/\//));
  });

  it('a deeplink click is a no-op for a client with no deeplink support', async () => {
    const openDeeplink = vi.fn();
    const port = makePort({ openDeeplink });
    const { result } = renderHook(() => useIntegrations(port), { wrapper });
    await waitFor(() => expect(result.current.info).not.toBeNull());

    act(() => result.current.onDeeplinkClick());
    expect(openDeeplink).not.toHaveBeenCalled();
  });
});
